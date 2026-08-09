import React from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { AuthProvider } from '@/contexts/AuthContext'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'

const mockSignMessageAsync = jest.fn()
const mockDisconnectAsync = jest.fn()
const mockOpenConnectModal = jest.fn()
const mockConnectWallet = jest.fn()

let mockAddress: `0x${string}` | undefined = '0x1234567890123456789012345678901234567890'
let mockIsConnected = true

jest.mock('wagmi', () => ({
  useAccount: () => ({
    address: mockAddress,
    isConnected: mockIsConnected,
    isConnecting: false,
  }),
  useDisconnect: () => ({ disconnectAsync: mockDisconnectAsync }),
  useConnect: () => ({ connect: mockConnectWallet, connectors: [] }),
  useSignMessage: () => ({ signMessageAsync: mockSignMessageAsync }),
}))

jest.mock('@rainbow-me/rainbowkit', () => ({
  useConnectModal: () => ({ openConnectModal: mockOpenConnectModal }),
}))

jest.mock('siwe', () => ({
  SiweMessage: jest.fn().mockImplementation(({ nonce, address }) => ({
    prepareMessage: () => `Sign in to WAGDIE
Address: ${address}
Nonce: ${nonce}`,
  })),
}))

jest.mock('@/lib/api', () => ({
  api: {
    auth: {
      getSession: jest.fn(),
      getNonce: jest.fn(),
      verify: jest.fn(),
      logout: jest.fn(),
    },
  },
}))

const authApi = api.auth as jest.Mocked<typeof api.auth>

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

describe('useAuth shared provider', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAddress = '0x1234567890123456789012345678901234567890'
    mockIsConnected = true
    mockSignMessageAsync.mockResolvedValue('0xsignature')
    mockDisconnectAsync.mockResolvedValue(undefined)
    authApi.logout.mockResolvedValue({ success: true })
  })

  it('hydrates a valid matching session without requesting a signature', async () => {
    authApi.getSession.mockResolvedValue({
      address: mockAddress!,
      expires: Date.now() + 60_000,
      selectedCharacter: null,
    } as any)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    expect(authApi.getSession).toHaveBeenCalledTimes(1)
    expect(authApi.getNonce).not.toHaveBeenCalled()
    expect(mockSignMessageAsync).not.toHaveBeenCalled()
  })

  it('restores a valid signed session even before the wallet connector reconnects', async () => {
    const disconnectedSessionAddress = '0x2222222222222222222222222222222222222222'
    mockAddress = undefined
    mockIsConnected = false
    authApi.getSession.mockResolvedValue({
      address: disconnectedSessionAddress,
      expires: Date.now() + 60_000,
      selectedCharacter: null,
    } as any)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    expect(result.current.isConnected).toBe(false)
    expect(result.current.session?.address).toBe(disconnectedSessionAddress)
    expect(authApi.getNonce).not.toHaveBeenCalled()
    expect(mockSignMessageAsync).not.toHaveBeenCalled()
  })

  it('performs only one SIWE flow for multiple consumers with no session', async () => {
    authApi.getSession
      .mockRejectedValueOnce({ status: 401, message: 'Not authenticated' })
      .mockResolvedValue({
        address: mockAddress!,
        expires: Date.now() + 60_000,
        selectedCharacter: null,
      } as any)
    authApi.getNonce.mockResolvedValue({ nonce: 'mocknonce123' })
    authApi.verify.mockResolvedValue({ success: true })

    const { result } = renderHook(() => [useAuth(), useAuth()] as const, { wrapper })

    await waitFor(() => expect(result.current[0].isAuthenticated).toBe(true))
    expect(result.current[1].isAuthenticated).toBe(true)
    expect(authApi.getNonce).toHaveBeenCalledTimes(1)
    expect(mockSignMessageAsync).toHaveBeenCalledTimes(1)
    expect(authApi.verify).toHaveBeenCalledTimes(1)
  })

  it('does not trust a session for a different address', async () => {
    authApi.getSession
      .mockResolvedValueOnce({
        address: '0x9999999999999999999999999999999999999999',
        expires: Date.now() + 60_000,
        selectedCharacter: null,
      } as any)
      .mockResolvedValue({
        address: mockAddress!,
        expires: Date.now() + 60_000,
        selectedCharacter: null,
      } as any)
    authApi.getNonce.mockResolvedValue({ nonce: 'mocknonce123' })
    authApi.verify.mockResolvedValue({ success: true })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
    expect(authApi.getNonce).toHaveBeenCalledTimes(1)
    expect(mockSignMessageAsync).toHaveBeenCalledTimes(1)
  })

  it('does not auto-retry after a rejected signature', async () => {
    authApi.getSession.mockRejectedValue({ status: 401, message: 'Not authenticated' })
    authApi.getNonce.mockResolvedValue({ nonce: 'mocknonce123' })
    mockSignMessageAsync.mockRejectedValue({ code: 'ACTION_REJECTED', message: 'User rejected' })

    const { result, rerender } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.error?.message).toBe('Signature rejected'))
    expect(mockSignMessageAsync).toHaveBeenCalledTimes(1)

    rerender()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockSignMessageAsync).toHaveBeenCalledTimes(1)
  })


  it('clears authenticated state while hydrating after an account switch', async () => {
    authApi.getSession
      .mockResolvedValueOnce({
        address: '0x1234567890123456789012345678901234567890',
        expires: Date.now() + 60_000,
        selectedCharacter: null,
      } as any)
      .mockResolvedValueOnce({
        address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        expires: Date.now() + 60_000,
        selectedCharacter: null,
      } as any)

    const { result, rerender } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    mockAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    rerender()

    await waitFor(() => expect(result.current.session?.address).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'))
    expect(result.current.isAuthenticated).toBe(true)
    expect(authApi.getNonce).not.toHaveBeenCalled()
    expect(mockSignMessageAsync).not.toHaveBeenCalled()
  })

  it('ignores an in-flight auth attempt after the wallet address changes', async () => {
    let resolveNonce: (value: { nonce: string }) => void = () => {}
    authApi.getSession
      .mockRejectedValueOnce({ status: 401, message: 'Not authenticated' })
      .mockResolvedValueOnce({
        address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        expires: Date.now() + 60_000,
        selectedCharacter: null,
      } as any)
    authApi.getNonce.mockReturnValue(new Promise((resolve) => {
      resolveNonce = resolve
    }))

    const { result, rerender } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(authApi.getNonce).toHaveBeenCalledTimes(1))

    mockAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    rerender()

    await act(async () => {
      resolveNonce({ nonce: 'staleNonce123' })
    })

    await waitFor(() => expect(result.current.session?.address).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'))
    expect(mockSignMessageAsync).not.toHaveBeenCalled()
    expect(authApi.verify).not.toHaveBeenCalled()
  })

  it('does not auto-sign again after an explicit retry fails post-verification', async () => {
    authApi.getSession
      .mockRejectedValueOnce({ status: 401, message: 'Not authenticated' })
      .mockRejectedValueOnce({ status: 500, message: 'Session failed' })
    authApi.getNonce.mockResolvedValue({ nonce: 'mocknonce123' })
    mockSignMessageAsync
      .mockRejectedValueOnce({ code: 'ACTION_REJECTED', message: 'User rejected' })
      .mockResolvedValueOnce('0xsignature')
    authApi.verify.mockResolvedValue({ success: true })

    const { result, rerender } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.error?.message).toBe('Signature rejected'))

    await act(async () => {
      await result.current.authenticate({ force: true })
    })

    await waitFor(() => {
      expect(result.current.error?.message).toContain('session could not be loaded')
    })

    rerender()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockSignMessageAsync).toHaveBeenCalledTimes(2)
  })

  it('allows explicit retry after rejection', async () => {
    authApi.getSession
      .mockRejectedValueOnce({ status: 401, message: 'Not authenticated' })
      .mockResolvedValue({
        address: mockAddress!,
        expires: Date.now() + 60_000,
        selectedCharacter: null,
      } as any)
    authApi.getNonce.mockResolvedValue({ nonce: 'mocknonce123' })
    mockSignMessageAsync
      .mockRejectedValueOnce({ code: 'ACTION_REJECTED', message: 'User rejected' })
      .mockResolvedValueOnce('0xsignature')
    authApi.verify.mockResolvedValue({ success: true })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.error?.message).toBe('Signature rejected'))

    await act(async () => {
      await result.current.authenticate({ force: true })
    })

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
    expect(mockSignMessageAsync).toHaveBeenCalledTimes(2)
  })
})
