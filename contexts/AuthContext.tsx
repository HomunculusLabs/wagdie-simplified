'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useSignMessage } from 'wagmi'
import { SiweMessage } from 'siwe'
import { api } from '@/lib/api'
import { useWallet } from '@/hooks/useWallet'
import type { UserSession, WalletAuthError, SIWEStep } from '@/types/wallet'

type HydrationStatus = 'idle' | 'hydrating' | 'matched' | 'none' | 'mismatch' | 'error'

type AuthSession = Pick<UserSession, 'address' | 'expires' | 'selectedCharacter'>

type AuthenticateOptions = {
  force?: boolean
  auto?: boolean
}

export interface AuthContextValue {
  address: string | undefined
  isConnected: boolean
  isConnecting: boolean
  isAuthenticated: boolean
  isAuthenticating: boolean
  isHydrating: boolean
  hasHydrated: boolean
  hydrationStatus: HydrationStatus
  siweStep: SIWEStep
  session: AuthSession | null
  error: WalletAuthError | null
  connect: () => void
  disconnect: () => Promise<void>
  authenticate: (options?: AuthenticateOptions) => Promise<void>
  refreshSession: () => Promise<AuthSession | null>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

type ActiveRequest<T> = {
  address: string | null
  requestId: number
  promise: Promise<T>
}

const normalizeAddress = (address: string | undefined | null) => address?.toLowerCase() ?? null

const isUserRejectedSignature = (error: any) => (
  error?.code === 'ACTION_REJECTED'
  || error?.code === 4001
  || error?.message?.includes('User rejected')
  || error?.message?.includes('User denied')
)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet()
  const { signMessageAsync } = useSignMessage()

  const [session, setSession] = useState<AuthSession | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [isHydrating, setIsHydrating] = useState(false)
  const [hasHydrated, setHasHydrated] = useState(false)
  const [hydrationStatus, setHydrationStatus] = useState<HydrationStatus>('idle')
  const [siweStep, setSiweStep] = useState<SIWEStep>('idle')
  const [error, setError] = useState<WalletAuthError | null>(null)

  const hydrationRequestIdRef = useRef(0)
  const activeHydrationRef = useRef<ActiveRequest<AuthSession | null> | null>(null)
  const activeAuthenticationRef = useRef<ActiveRequest<boolean> | null>(null)
  const rejectedAddressesRef = useRef<Set<string>>(new Set())
  const autoAttemptedAddressesRef = useRef<Set<string>>(new Set())
  const latestAddressRef = useRef<string | null>(null)

  const currentNormalizedAddress = normalizeAddress(wallet.address)

  const clearVolatileAuthState = useCallback(() => {
    hydrationRequestIdRef.current += 1
    activeHydrationRef.current = null
    activeAuthenticationRef.current = null
    setSession(null)
    setIsAuthenticated(false)
    setIsAuthenticating(false)
    setIsHydrating(false)
    setHasHydrated(false)
    setHydrationStatus('idle')
    setSiweStep('idle')
    setError(null)
  }, [])

  const refreshSession = useCallback(async (): Promise<AuthSession | null> => {
    const normalizedAddress = normalizeAddress(wallet.address)
    const activeHydration = activeHydrationRef.current

    if (activeHydration?.address === normalizedAddress) {
      return activeHydration.promise
    }

    const requestId = hydrationRequestIdRef.current + 1
    hydrationRequestIdRef.current = requestId

    setIsHydrating(true)
    setHasHydrated(false)
    setHydrationStatus('hydrating')

    const promise = (async () => {
      try {
        const nextSession = await api.auth.getSession()
        const sessionAddress = normalizeAddress(nextSession.address)

        if (hydrationRequestIdRef.current !== requestId || latestAddressRef.current !== normalizedAddress) {
          return null
        }

        setHasHydrated(true)

        if (!normalizedAddress || sessionAddress === normalizedAddress) {
          const hydratedSession: AuthSession = {
            address: nextSession.address,
            expires: nextSession.expires,
            selectedCharacter: nextSession.selectedCharacter,
          }
          setSession(hydratedSession)
          setIsAuthenticated(true)
          setError(null)
          setHydrationStatus('matched')
          return hydratedSession
        }

        setSession(null)
        setIsAuthenticated(false)
        setHydrationStatus(sessionAddress ? 'mismatch' : 'none')
        return null
      } catch (err: any) {
        if (hydrationRequestIdRef.current !== requestId || latestAddressRef.current !== normalizedAddress) {
          return null
        }

        setSession(null)
        setIsAuthenticated(false)
        setHasHydrated(true)

        if (err?.status === 401) {
          setHydrationStatus('none')
          return null
        }

        setHydrationStatus('error')
        setError({
          message: err?.message || 'Unable to check wallet session. Please try again.',
          step: 'verifying',
        })
        return null
      } finally {
        if (hydrationRequestIdRef.current === requestId) {
          setIsHydrating(false)
        }
        if (activeHydrationRef.current?.requestId === requestId) {
          activeHydrationRef.current = null
        }
      }
    })()

    activeHydrationRef.current = { address: normalizedAddress, requestId, promise }
    return promise
  }, [wallet.address])

  useEffect(() => {
    if (latestAddressRef.current !== currentNormalizedAddress) {
      latestAddressRef.current = currentNormalizedAddress
      clearVolatileAuthState()
    }
  }, [clearVolatileAuthState, currentNormalizedAddress])

  useEffect(() => {
    latestAddressRef.current = currentNormalizedAddress
    refreshSession()
  }, [currentNormalizedAddress, refreshSession])

  const authenticate = useCallback(async (options: AuthenticateOptions = {}) => {
    if (!wallet.address) {
      setError({ message: 'No wallet address found', step: 'wallet' })
      return
    }

    const normalizedAddress = normalizeAddress(wallet.address)!

    if (options.force) {
      rejectedAddressesRef.current.delete(normalizedAddress)
      autoAttemptedAddressesRef.current.delete(normalizedAddress)
    }

    if (!options.force) {
      if (!hasHydrated || isHydrating) {
        return
      }
      if (isAuthenticated) {
        return
      }
      if (hydrationStatus !== 'none' && hydrationStatus !== 'mismatch') {
        return
      }
      if (rejectedAddressesRef.current.has(normalizedAddress)) {
        return
      }
      if (options.auto && autoAttemptedAddressesRef.current.has(normalizedAddress)) {
        return
      }
    }

    const activeAuthentication = activeAuthenticationRef.current
    if (activeAuthentication?.address === normalizedAddress) {
      await activeAuthentication.promise
      return
    }

    autoAttemptedAddressesRef.current.add(normalizedAddress)

    const requestId = Date.now()
    setIsAuthenticating(true)
    setSiweStep('nonce')
    setError(null)

    const promise = (async () => {
      try {
        const nonceResponse = await api.auth.getNonce(wallet.address!)
        const { nonce } = nonceResponse

        if (latestAddressRef.current !== normalizedAddress) {
          return false
        }

        const message = new SiweMessage({
          domain: nonceResponse.domain ?? (typeof window !== 'undefined' ? window.location.host : 'localhost'),
          address: wallet.address!,
          statement: 'Sign in to WAGDIE',
          uri: nonceResponse.uri ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'),
          version: '1',
          chainId: nonceResponse.chainId ?? 1,
          nonce,
        })

        const preparedMessage = message.prepareMessage()
        if (latestAddressRef.current !== normalizedAddress) {
          return false
        }

        setSiweStep('signing')
        const signature = await signMessageAsync({ message: preparedMessage })

        if (latestAddressRef.current !== normalizedAddress) {
          return false
        }

        setSiweStep('verifying')
        const { success } = await api.auth.verify({
          address: wallet.address!,
          signature,
          message: preparedMessage,
        })

        if (!success) {
          setError({ message: 'Authentication failed. Please try again.', step: 'verifying' })
          setSiweStep('error')
          return false
        }

        if (latestAddressRef.current !== normalizedAddress) {
          return false
        }

        const refreshedSession = await refreshSession()
        if (normalizeAddress(refreshedSession?.address) !== normalizedAddress) {
          setError({
            message: 'Signed message verified, but the wallet session could not be loaded. Please try again.',
            step: 'verifying',
          })
          return false
        }

        setSiweStep('complete')
        return true
      } catch (err: any) {
        if (latestAddressRef.current !== normalizedAddress) {
          return false
        }

        if (isUserRejectedSignature(err)) {
          rejectedAddressesRef.current.add(normalizedAddress)
          setError({ message: 'Signature rejected', step: 'signing' })
        } else {
          console.error('SIWE authentication error:', err)
          setError({
            message: err?.message || 'Authentication failed. Please try again.',
            step: 'verifying',
          })
        }
        setSiweStep('error')
        return false
      } finally {
        if (activeAuthenticationRef.current?.requestId === requestId) {
          activeAuthenticationRef.current = null
          if (latestAddressRef.current === normalizedAddress) {
            setIsAuthenticating(false)
          }
        }
      }
    })()

    activeAuthenticationRef.current = { address: normalizedAddress, requestId, promise }
    await promise
  }, [hasHydrated, hydrationStatus, isAuthenticated, isHydrating, refreshSession, signMessageAsync, wallet.address])

  useEffect(() => {
    if (!wallet.address || !hasHydrated || isHydrating || isAuthenticated || isAuthenticating) {
      return
    }

    const normalizedAddress = normalizeAddress(wallet.address)!
    const canAutoSign = (hydrationStatus === 'none' || hydrationStatus === 'mismatch')
      && !rejectedAddressesRef.current.has(normalizedAddress)
      && !autoAttemptedAddressesRef.current.has(normalizedAddress)

    if (canAutoSign) {
      authenticate({ auto: true })
    }
  }, [authenticate, hasHydrated, hydrationStatus, isAuthenticated, isAuthenticating, isHydrating, wallet.address])

  const disconnect = useCallback(async () => {
    const normalizedAddress = normalizeAddress(wallet.address)

    try {
      await api.auth.logout()
      await wallet.disconnect()
    } catch (err) {
      console.error('Disconnect error:', err)
    } finally {
      if (normalizedAddress) {
        rejectedAddressesRef.current.delete(normalizedAddress)
        autoAttemptedAddressesRef.current.delete(normalizedAddress)
      }
      clearVolatileAuthState()
    }
  }, [clearVolatileAuthState, wallet])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    address: wallet.address,
    isConnected: wallet.isConnected,
    isConnecting: wallet.isConnecting,
    isAuthenticated,
    isAuthenticating,
    isHydrating,
    hasHydrated,
    hydrationStatus,
    siweStep,
    session,
    error,
    connect: wallet.connect,
    disconnect,
    authenticate,
    refreshSession,
    clearError,
  }), [
    authenticate,
    clearError,
    disconnect,
    error,
    hasHydrated,
    hydrationStatus,
    isAuthenticated,
    isAuthenticating,
    isHydrating,
    refreshSession,
    session,
    siweStep,
    wallet.address,
    wallet.connect,
    wallet.isConnected,
    wallet.isConnecting,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
