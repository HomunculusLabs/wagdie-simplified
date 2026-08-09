import { act, renderHook, waitFor } from '@testing-library/react'
import {
  buildOwnedSearableConcords,
  getConcordImageUrl,
  isBlockedSearingConcord,
  useSearingConcords,
} from '@/hooks/useSearingConcords'
import type { ConcordSearingMap } from '@/lib/domain/searing/concord-searing-map'
import type { SearingConcordBalance } from '@/lib/services/blockchain/searing'

function searingMap(concordTokenId: number, tokenName = `Concord ${concordTokenId}`): ConcordSearingMap {
  return {
    token_name: tokenName,
    location: 'body',
    new_trait: `trait-${concordTokenId}`,
    makesBald: false,
    tokenId: String(concordTokenId),
    concordTokenId,
  }
}

function balance(concordId: number, value: bigint): SearingConcordBalance {
  return {
    concordId,
    tokenId: BigInt(concordId),
    balance: value,
    isOwned: value > 0n,
    contractAddress: '0x0000000000000000000000000000000000000000',
  }
}

describe('useSearingConcords helpers', () => {
  it('filters blocked and unowned Concords, then sorts owned Concords by amount', () => {
    const result = buildOwnedSearableConcords(
      [searingMap(1), searingMap(12), searingMap(2), searingMap(3)],
      [balance(1, 1n), balance(12, 5n), balance(2, 0n), balance(3, 4n)]
    )

    expect(result.map((concord) => concord.concordId)).toEqual([3, 1])
    expect(result[0]).toMatchObject({
      name: 'Concord 3',
      amount: 4n,
      imageUrl: getConcordImageUrl(3),
    })
  })

  it('keeps legacy blocked Concord IDs out of searing selection', () => {
    expect(isBlockedSearingConcord(12)).toBe(true)
    expect(isBlockedSearingConcord(15)).toBe(true)
    expect(isBlockedSearingConcord(25)).toBe(true)
    expect(isBlockedSearingConcord(27)).toBe(true)
    expect(isBlockedSearingConcord(1)).toBe(false)
  })
})

const originalFetch = global.fetch

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('useSearingConcords wallet request guards', () => {
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('preserves the injected balance provider mode when no wallet address is supplied', async () => {
    const getConcordBalances = jest.fn().mockResolvedValue([balance(1, 4n)])
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({ searingMap: [searingMap(1)] })
    ) as typeof fetch

    const { result } = renderHook(() => useSearingConcords({
      enabled: true,
      getConcordBalances,
    }))

    await waitFor(() => expect(result.current.concords[0]?.amount).toBe(4n))

    expect(getConcordBalances).toHaveBeenCalledWith([1])
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/concords/searing-map?limit=2000',
      expect.objectContaining({ cache: 'no-store' })
    )
  })

  it('aborts the previous wallet fetch and ignores its late completion', async () => {
    const oldMapRequest = deferred<Response>()
    const mockFetch = jest.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      const mapRequestCount = mockFetch.mock.calls.filter(([request]) => (
        String(request).includes('/api/concords/searing-map')
      )).length

      if (url.includes('/api/concords/searing-map')) {
        if (mapRequestCount === 1) return oldMapRequest.promise
        return Promise.resolve(jsonResponse({ searingMap: [searingMap(2)] }))
      }

      if (url.includes('/api/concords/owned')) {
        return Promise.resolve(jsonResponse({
          balances: [{
            concordId: 2,
            tokenId: '2',
            balance: '7',
            isOwned: true,
            contractAddress: '0x0000000000000000000000000000000000000000',
          }],
        }))
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    global.fetch = mockFetch as typeof fetch

    const { result, rerender } = renderHook(
      ({ wallet }) => useSearingConcords({ enabled: true, walletAddress: wallet }),
      { initialProps: { wallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    const oldSignal = (mockFetch.mock.calls[0][1] as RequestInit).signal

    rerender({ wallet: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' })

    expect(oldSignal?.aborted).toBe(true)
    await waitFor(() => expect(result.current.concords[0]?.amount).toBe(7n))

    await act(async () => {
      oldMapRequest.resolve(jsonResponse({ searingMap: [searingMap(1)] }))
      await oldMapRequest.promise
    })

    expect(result.current.concords.map((concord) => concord.concordId)).toEqual([2])
    const ownedRequests = mockFetch.mock.calls
      .map(([request]) => String(request))
      .filter((url) => url.includes('/api/concords/owned'))
    expect(ownedRequests).toHaveLength(1)
    expect(ownedRequests[0]).toContain('wallet=0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
  })

  it('aborts an indexed-balance request when the wallet changes after the map loads', async () => {
    const oldOwnedRequest = deferred<Response>()
    const mockFetch = jest.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/api/concords/searing-map')) {
        const mapId = mockFetch.mock.calls.filter(([request]) => (
          String(request).includes('/api/concords/searing-map')
        )).length
        return Promise.resolve(jsonResponse({ searingMap: [searingMap(mapId)] }))
      }

      if (url.includes('wallet=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')) {
        return oldOwnedRequest.promise
      }

      if (url.includes('wallet=0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')) {
        return Promise.resolve(jsonResponse({
          balances: [{
            concordId: 2,
            tokenId: '2',
            balance: '5',
            isOwned: true,
            contractAddress: '0x0000000000000000000000000000000000000000',
          }],
        }))
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    global.fetch = mockFetch as typeof fetch

    const { result, rerender } = renderHook(
      ({ wallet }) => useSearingConcords({ enabled: true, walletAddress: wallet }),
      { initialProps: { wallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    const oldOwnedSignal = (mockFetch.mock.calls[1][1] as RequestInit).signal

    rerender({ wallet: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' })

    expect(oldOwnedSignal?.aborted).toBe(true)
    await waitFor(() => expect(result.current.concords[0]?.concordId).toBe(2))

    await act(async () => {
      oldOwnedRequest.resolve(jsonResponse({
        balances: [{
          concordId: 1,
          tokenId: '1',
          balance: '99',
          isOwned: true,
          contractAddress: '0x0000000000000000000000000000000000000000',
        }],
      }))
      await oldOwnedRequest.promise
    })

    expect(result.current.concords.map((concord) => concord.concordId)).toEqual([2])
  })
})
