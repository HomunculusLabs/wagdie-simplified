/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/sync/staking/route'
import { syncStakingState } from '@/lib/services/sync/staking-state-sync'

jest.mock('@/lib/services/sync/staking-state-sync', () => ({
  syncStakingState: jest.fn(),
}))

const SYNC_SECRET = 'test-sync-secret'
const originalSyncSecret = process.env.SYNC_SECRET_KEY

type RequestOptions = {
  secret?: string
  authHeader?: string
}

function createJsonRequest(body: unknown, options: RequestOptions = {}) {
  const url = new URL('http://localhost/api/sync/staking')
  if (options.secret) {
    url.searchParams.set('secret', options.secret)
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.authHeader) {
    headers.Authorization = options.authHeader
  }

  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function createRawRequest(body: string, options: RequestOptions = {}) {
  const url = new URL('http://localhost/api/sync/staking')
  if (options.secret) {
    url.searchParams.set('secret', options.secret)
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.authHeader) {
    headers.Authorization = options.authHeader
  }

  return new NextRequest(url, {
    method: 'POST',
    headers,
    body,
  })
}

describe('Sync staking API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.SYNC_SECRET_KEY = SYNC_SECRET
  })

  afterAll(() => {
    process.env.SYNC_SECRET_KEY = originalSyncSecret
  })

  it('returns no-store unauthorized response and does not call sync service', async () => {
    const response = await POST(createJsonRequest({ tokenIds: [1] }))

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      results: [],
      error: 'Unauthorized',
    })
    expect(syncStakingState).not.toHaveBeenCalled()
  })

  it('does not parse the body or call sync service when unauthorized', async () => {
    const response = await POST(createRawRequest('{'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      results: [],
      error: 'Unauthorized',
    })
    expect(syncStakingState).not.toHaveBeenCalled()
  })

  it('returns no-store invalid JSON response with existing body shape', async () => {
    const response = await POST(createRawRequest('{', { authHeader: `Bearer ${SYNC_SECRET}` }))

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      results: [],
      error: 'Invalid JSON body',
    })
  })

  it('returns no-store invalid tokenIds response with existing body shape', async () => {
    const response = await POST(createJsonRequest(
      { tokenIds: [1, '2'] },
      { authHeader: `Bearer ${SYNC_SECRET}` }
    ))

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      results: [],
      error: 'tokenIds must be an array of positive integers',
    })
  })

  it('returns no-store empty tokenIds response with existing body shape', async () => {
    const response = await POST(createJsonRequest(
      { tokenIds: [] },
      { authHeader: `Bearer ${SYNC_SECRET}` }
    ))

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      results: [],
      error: 'tokenIds must not be empty',
    })
  })

  it('returns no-store too-many-tokenIds response with existing body shape', async () => {
    const tokenIds = Array.from({ length: 51 }, (_, index) => index + 1)
    const response = await POST(createJsonRequest(
      { tokenIds },
      { authHeader: `Bearer ${SYNC_SECRET}` }
    ))

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      results: [],
      error: 'Maximum 50 tokenIds per request',
    })
  })

  it('deduplicates tokenIds and returns sync results for an authorized bearer secret', async () => {
    ;(syncStakingState as jest.Mock).mockResolvedValueOnce({
      results: [
        {
          tokenId: 1,
          success: true,
          locationId: '7',
          chainLocationId: '7',
        },
        {
          tokenId: 2,
          success: false,
          locationId: null,
          chainLocationId: '',
          error: 'No location mapping for chain_location_id',
        },
      ],
    })

    const response = await POST(createJsonRequest(
      { tokenIds: [1, 1, 2] },
      { authHeader: `Bearer ${SYNC_SECRET}` }
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          tokenId: 1,
          success: true,
          locationId: '7',
          chainLocationId: '7',
        },
        {
          tokenId: 2,
          success: false,
          locationId: null,
          chainLocationId: '',
          error: 'No location mapping for chain_location_id',
        },
      ],
    })
    expect(syncStakingState).toHaveBeenCalledWith({ tokenIds: [1, 2] })
  })

  it('returns sync results for an authorized query secret', async () => {
    ;(syncStakingState as jest.Mock).mockResolvedValueOnce({
      results: [
        {
          tokenId: 3,
          success: true,
          locationId: '9',
          chainLocationId: '9',
        },
      ],
    })

    const response = await POST(createJsonRequest(
      { tokenIds: [3] },
      { secret: SYNC_SECRET }
    ))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          tokenId: 3,
          success: true,
          locationId: '9',
          chainLocationId: '9',
        },
      ],
    })
    expect(syncStakingState).toHaveBeenCalledWith({ tokenIds: [3] })
  })
})
