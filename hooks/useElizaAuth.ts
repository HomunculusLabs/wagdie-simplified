/**
 * useElizaAuth Hook
 * Manages Eliza authentication state and token lifecycle.
 * Orchestrates the full SIWE flow: GET cached token, or POST nonce + sign + POST verify.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { ApiError, readApiRaw } from '@/lib/api/client-response'
import type { TokenResponse, ElizaAuthNonceResponse } from '@/types/eliza'

interface UseElizaAuthReturn {
  /** Current access token (if authenticated) */
  accessToken: string | null
  /** Whether we have a valid token */
  isAuthenticated: boolean
  /** Whether authentication is in progress */
  isAuthenticating: boolean
  /** Current step in auth flow */
  authStep: 'idle' | 'checking' | 'nonce' | 'signing' | 'verifying' | 'complete' | 'error'
  /** Check for an existing access token without starting the signature flow */
  checkToken: () => Promise<boolean>
  /** Get or refresh the access token */
  getToken: () => Promise<string | null>
  /** Clear authentication state */
  clearAuth: () => void
  /** Error message if authentication failed */
  error: string | null
}

// Token refresh buffer (5 minutes before expiry)
const REFRESH_BUFFER_MS = 5 * 60 * 1000

function getErrorCode(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('error' in data)) {
    return undefined
  }

  const code = (data as { error?: unknown }).error
  return typeof code === 'string' ? code : undefined
}

export function useElizaAuth(): UseElizaAuthReturn {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authStep, setAuthStep] = useState<UseElizaAuthReturn['authStep']>('idle')
  const [error, setError] = useState<string | null>(null)
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Clear state when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      setAccessToken(null)
      setExpiresAt(null)
      setError(null)
      setAuthStep('idle')
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
        refreshTimeoutRef.current = null
      }
    }
  }, [isConnected])

  // Schedule token refresh
  const scheduleRefresh = useCallback(
    (expiry: number, getTokenFn: () => Promise<string | null>) => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }

      const refreshTime = expiry - Date.now() - REFRESH_BUFFER_MS
      if (refreshTime > 0) {
        refreshTimeoutRef.current = setTimeout(async () => {
          try {
            // Try to get a fresh token
            await getTokenFn()
          } catch (err) {
            console.error('[useElizaAuth] Token refresh failed:', err)
          }
        }, refreshTime)
      }
    },
    []
  )

  const applyTokenResponse = useCallback((data: TokenResponse) => {
    setAccessToken(data.accessToken)
    const newExpiry = new Date(data.expiresAt).getTime()
    setExpiresAt(newExpiry)
    setAuthStep('complete')
    return { accessToken: data.accessToken, expiresAt: newExpiry }
  }, [])

  const checkToken = useCallback(async (): Promise<boolean> => {
    if (accessToken && expiresAt && expiresAt > Date.now() + 60000) {
      return true
    }

    if (!isConnected || !address) {
      setError('Wallet not connected')
      return false
    }

    setIsAuthenticating(true)
    setError(null)
    setAuthStep('checking')

    try {
      const statusResponse = await fetch('/api/eliza/auth', {
        method: 'GET',
        credentials: 'include',
      })

      const data = await readApiRaw<TokenResponse>(statusResponse, 'Authentication failed')
      applyTokenResponse(data)
      return true
    } catch (err) {
      const code = err instanceof ApiError ? getErrorCode(err.data) : undefined
      if (err instanceof ApiError && err.status === 401 && ['NO_TOKEN', 'TOKEN_EXPIRED'].includes(code ?? '')) {
        setAuthStep('idle')
        setError(null)
        return false
      }

      if (err instanceof ApiError && err.status === 401 && code === 'UNAUTHORIZED') {
        setAuthStep('error')
        setError('Wallet session expired. Reconnect your wallet to authorize chat.')
        return false
      }

      const message = err instanceof Error ? err.message : 'Authentication failed'
      setError(message)
      setAuthStep('error')
      console.error('[useElizaAuth] Token status check failed:', err)
      return false
    } finally {
      setIsAuthenticating(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, expiresAt, isConnected, address, applyTokenResponse, scheduleRefresh])

  // Get or refresh token
  const getToken = useCallback(async (): Promise<string | null> => {
    // Return cached token if still valid
    if (accessToken && expiresAt && expiresAt > Date.now() + 60000) {
      return accessToken
    }

    // Need to authenticate
    if (!isConnected || !address) {
      setError('Wallet not connected')
      return null
    }

    setIsAuthenticating(true)
    setError(null)
    setAuthStep('checking')

    try {
      // Step 1: Check for existing valid token via GET
      const statusResponse = await fetch('/api/eliza/auth', {
        method: 'GET',
        credentials: 'include',
      })

      try {
        // Token exists and is valid
        const data = await readApiRaw<TokenResponse>(statusResponse, 'Authentication failed')
        const applied = applyTokenResponse(data)
        scheduleRefresh(applied.expiresAt, getToken)
        return applied.accessToken
      } catch (statusError) {
        const shouldStartSiwe = statusError instanceof ApiError
          && statusError.status === 401
          && ['NO_TOKEN', 'TOKEN_EXPIRED'].includes(getErrorCode(statusError.data) ?? '')

        if (!shouldStartSiwe) {
          throw statusError
        }
      }

      // Token missing or expired - need to do full SIWE flow
      // If token exists but expired or no token, proceed with SIWE
      // Step 2: Request nonce from Eliza
      setAuthStep('nonce')
      const nonceResponse = await fetch('/api/eliza/auth/nonce', {
        method: 'POST',
        credentials: 'include',
      })

      const nonceData = await readApiRaw<ElizaAuthNonceResponse>(
        nonceResponse,
        'Failed to get nonce from Eliza'
      )

      // Step 3: Sign the SIWE message with wallet
      setAuthStep('signing')
      let signature: string
      try {
        signature = await signMessageAsync({ message: nonceData.message })
      } catch (signError) {
        // Handle user rejection or wallet errors explicitly
        if (signError instanceof Error) {
          if (
            signError.message.includes('rejected') ||
            signError.message.includes('denied') ||
            signError.message.includes('cancelled')
          ) {
            throw new Error('Signature request was rejected by user')
          }
          throw new Error(`Wallet signing failed: ${signError.message}`)
        }
        throw new Error('Wallet signing failed')
      }

      // Step 4: Verify signature with Eliza
      setAuthStep('verifying')
      const verifyResponse = await fetch('/api/eliza/auth/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature }),
      })

      const verifyData = await readApiRaw<TokenResponse>(
        verifyResponse,
        'Eliza verification failed'
      )
      const applied = applyTokenResponse(verifyData)
      scheduleRefresh(applied.expiresAt, getToken)
      return applied.accessToken
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed'
      setError(message)
      setAuthStep('error')
      console.error('[useElizaAuth] Authentication failed:', err)
      return null
    } finally {
      setIsAuthenticating(false)
    }
  }, [accessToken, expiresAt, isConnected, address, signMessageAsync, scheduleRefresh, applyTokenResponse])

  // Clear authentication
  const clearAuth = useCallback(() => {
    setAccessToken(null)
    setExpiresAt(null)
    setError(null)
    setAuthStep('idle')
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
      refreshTimeoutRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [])

  const isAuthenticated = Boolean(accessToken && expiresAt && expiresAt > Date.now())

  return {
    accessToken,
    isAuthenticated,
    isAuthenticating,
    authStep,
    checkToken,
    getToken,
    clearAuth,
    error,
  }
}
