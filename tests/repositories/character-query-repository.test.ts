/**
 * @jest-environment node
 */

import { CHARACTERS_TABLE } from '@/lib/db/tables'
import type { CharacterFilters } from '@/types/character'

var mockFrom: jest.Mock
var mockSelect: jest.Mock
var mockNot: jest.Mock
var mockOr: jest.Mock
var mockOrder: jest.Mock
var mockRange: jest.Mock
var mockQuery: {
  not: jest.Mock
  or: jest.Mock
  order: jest.Mock
  range: jest.Mock
}

jest.mock('@/lib/supabase', () => {
  mockNot = jest.fn()
  mockOr = jest.fn()
  mockOrder = jest.fn()
  mockRange = jest.fn()
  mockQuery = {
    not: mockNot,
    or: mockOr,
    order: mockOrder,
    range: mockRange,
  }
  mockSelect = jest.fn(() => mockQuery)
  mockFrom = jest.fn(() => ({ select: mockSelect }))

  return {
    supabase: { from: mockFrom },
    getSupabaseAdmin: jest.fn(),
  }
})

import { CharacterQueryRepository } from '@/lib/repositories/character/character-query-repository'

const baseFilters: CharacterFilters = {
  tab: 'all',
  sort: 'asc',
  page: 1,
  perPage: 20,
}

describe('CharacterQueryRepository hasSheet filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockNot.mockReturnValue(mockQuery)
    mockOr.mockReturnValue(mockQuery)
    mockOrder.mockReturnValue(mockQuery)
    mockRange.mockResolvedValue({ data: [], error: null, count: 0 })
    mockSelect.mockReturnValue(mockQuery)
  })

  it('filters hasSheet by the imported metadata.sheet marker', async () => {
    const repository = new CharacterQueryRepository()

    await expect(repository.findMany({
      ...baseFilters,
      hasSheet: true,
    })).resolves.toEqual({
      characters: [],
      hasMore: false,
      totalCount: 0,
    })

    expect(mockFrom).toHaveBeenCalledWith(CHARACTERS_TABLE)
    expect(mockSelect).toHaveBeenCalledWith('*', { count: 'exact' })
    expect(mockNot).toHaveBeenCalledWith('metadata->sheet', 'is', null)
    expect(mockOr).not.toHaveBeenCalled()
    expect(mockOrder).toHaveBeenCalledWith('token_id', { ascending: true })
    expect(mockRange).toHaveBeenCalledWith(0, 19)
  })

  it('does not apply a sheet predicate when hasSheet is absent', async () => {
    const repository = new CharacterQueryRepository()

    await expect(repository.findMany(baseFilters)).resolves.toEqual({
      characters: [],
      hasMore: false,
      totalCount: 0,
    })

    expect(mockNot).not.toHaveBeenCalled()
    expect(mockOr).not.toHaveBeenCalled()
    expect(mockOrder).toHaveBeenCalledWith('token_id', { ascending: true })
    expect(mockRange).toHaveBeenCalledWith(0, 19)
  })

  it('queries owned custody as owner address OR current staker address', async () => {
    const repository = new CharacterQueryRepository()

    await expect(repository.findMany({
      ...baseFilters,
      tab: 'owned',
      wallet: '0xAbC123',
      page: 2,
    })).resolves.toEqual({
      characters: [],
      hasMore: false,
      totalCount: 0,
    })

    expect(mockOr).toHaveBeenCalledWith('owner_address.eq.0xabc123,staker_address.eq.0xabc123')
    expect(mockRange).toHaveBeenCalledWith(20, 39)
  })
})
