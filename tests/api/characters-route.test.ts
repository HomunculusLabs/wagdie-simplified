/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { GET as GET_PLURAL } from '@/app/api/characters/route'
import { GET as GET_SINGULAR } from '@/app/api/character/route'
import { getCharacters } from '@/lib/services/character-service'

jest.mock('@/lib/services/character-service', () => ({
  getCharacters: jest.fn(),
}))

function createRequest(query = '', route = '/api/characters') {
  return new NextRequest(`http://localhost${route}${query}`)
}

describe('Characters API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the existing invalid pagination response shape', async () => {
    const response = await GET_PLURAL(createRequest('?page=0'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid pagination parameters',
    })
  })

  it('returns the existing invalid tab response shape', async () => {
    const response = await GET_PLURAL(createRequest('?tab=unknown'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid tab parameter',
    })
  })

  it('keeps whitespace-padded tab values invalid', async () => {
    const response = await GET_PLURAL(createRequest('?tab=%20owned%20'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid tab parameter',
    })
  })

  it('returns the existing invalid sort response shape', async () => {
    const response = await GET_PLURAL(createRequest('?sort=random'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid sort parameter',
    })
  })

  it('keeps whitespace sort values invalid', async () => {
    const response = await GET_PLURAL(createRequest('?sort=%20'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid sort parameter',
    })
  })

  it('returns an empty raw response for owned tab without wallet', async () => {
    const response = await GET_PLURAL(createRequest('?tab=owned'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      characters: [],
      hasMore: false,
      totalCount: 0,
    })
    expect(getCharacters).not.toHaveBeenCalled()
  })

  it('returns the character service response without success/data wrapping', async () => {
    const result = {
      characters: [{ token_id: 1, name: 'One' }],
      hasMore: false,
      totalCount: 1,
    }
    ;(getCharacters as jest.Mock).mockResolvedValueOnce(result)

    const response = await GET_PLURAL(createRequest('?page=2&perPage=25&sort=asc'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(result)
    expect(getCharacters).toHaveBeenCalledWith(expect.objectContaining({
      tab: 'all',
      sort: 'asc',
      page: 2,
      perPage: 25,
    }))
  })

  it('preserves owner-or-staker custody records through the owned API response', async () => {
    const wallet = '0x1234567890123456789012345678901234567890'
    const result = {
      characters: [{
        token_id: 7,
        owner_address: '0x9999999999999999999999999999999999999999',
        staker_address: wallet,
      }],
      hasMore: false,
      totalCount: 1,
    }
    ;(getCharacters as jest.Mock).mockResolvedValueOnce(result)

    const response = await GET_PLURAL(createRequest(`?tab=owned&wallet=${wallet}`))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(result)
    expect(getCharacters).toHaveBeenCalledWith(expect.objectContaining({
      tab: 'owned',
      wallet,
    }))
  })

  it('forwards the ElizaOS profile filter to the character service', async () => {
    const result = {
      characters: [],
      hasMore: false,
      totalCount: 0,
    }
    ;(getCharacters as jest.Mock).mockResolvedValueOnce(result)

    const response = await GET_PLURAL(createRequest('?hasElizaProfile=true'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(result)
    expect(getCharacters).toHaveBeenCalledWith(expect.objectContaining({
      hasElizaProfile: true,
    }))
  })

  it('forwards the has sheet filter to the character service', async () => {
    const result = {
      characters: [],
      hasMore: false,
      totalCount: 0,
    }
    ;(getCharacters as jest.Mock).mockResolvedValueOnce(result)

    const response = await GET_PLURAL(createRequest('?hasSheet=true'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(result)
    expect(getCharacters).toHaveBeenCalledWith(expect.objectContaining({
      hasSheet: true,
    }))
  })

  it('returns an empty raw response for singular owned tab without wallet', async () => {
    const response = await GET_SINGULAR(createRequest('?tab=owned', '/api/character'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      characters: [],
      hasMore: false,
      totalCount: 0,
    })
    expect(getCharacters).not.toHaveBeenCalled()
  })

  it('forwards singular equipment filters to the character service', async () => {
    const result = {
      characters: [],
      hasMore: false,
      totalCount: 0,
    }
    ;(getCharacters as jest.Mock).mockResolvedValueOnce(result)

    const response = await GET_SINGULAR(
      createRequest('?armor=plate&back=cape&mask=skull', '/api/character')
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(result)
    expect(getCharacters).toHaveBeenCalledWith(expect.objectContaining({
      armor: 'plate',
      back: 'cape',
      mask: 'skull',
    }))
  })

  it('accepts perPage 200 on the singular alias', async () => {
    const result = {
      characters: [],
      hasMore: false,
      totalCount: 0,
    }
    ;(getCharacters as jest.Mock).mockResolvedValueOnce(result)

    const response = await GET_SINGULAR(createRequest('?perPage=200', '/api/character'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(result)
    expect(getCharacters).toHaveBeenCalledWith(expect.objectContaining({
      perPage: 200,
    }))
  })

  it('rejects perPage above 200 on the singular alias', async () => {
    const response = await GET_SINGULAR(createRequest('?perPage=201', '/api/character'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid pagination parameters',
    })
    expect(getCharacters).not.toHaveBeenCalled()
  })

  it('keeps whitespace-padded singular tab and sort values invalid', async () => {
    const tabResponse = await GET_SINGULAR(createRequest('?tab=%20owned%20', '/api/character'))
    const sortResponse = await GET_SINGULAR(createRequest('?sort=%20', '/api/character'))

    expect(tabResponse.status).toBe(400)
    await expect(tabResponse.json()).resolves.toEqual({
      error: 'Invalid tab parameter',
    })
    expect(sortResponse.status).toBe(400)
    await expect(sortResponse.json()).resolves.toEqual({
      error: 'Invalid sort parameter',
    })
    expect(getCharacters).not.toHaveBeenCalled()
  })
})
