'use client'

// useTokenBalances Hook
// React hook for fetching ERC1155 token balances

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { ContractError, ContractErrorType, TokenBalance } from '@/types/blockchain'
import { BalancesService, TokenType } from '@/lib/services/blockchain/balances'
import { logError } from '@/lib/utils/errors'

interface TokenBalances {
  concord: TokenBalance | null
  corpse: TokenBalance | null
  mushroom: TokenBalance | null
}

interface UseTokenBalancesResult {
  balances: TokenBalances
  isLoading: boolean
  error: ContractError | null
  refetch: () => Promise<void>
}

const EMPTY_BALANCES: TokenBalances = {
  concord: null,
  corpse: null,
  mushroom: null,
}

function normalizeAddress(address: string | undefined): string | null {
  return address?.toLowerCase() ?? null
}

export function useTokenBalances(): UseTokenBalancesResult {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const currentAddress = normalizeAddress(address)
  const latestAddressRef = useRef(currentAddress)
  const requestGenerationRef = useRef(0)

  latestAddressRef.current = currentAddress

  const [snapshot, setSnapshot] = useState<{
    address: string | null
    balances: TokenBalances
    error: ContractError | null
  }>({
    address: null,
    balances: EMPTY_BALANCES,
    error: null,
  })
  const [loadingAddress, setLoadingAddress] = useState<string | null>(null)

  const fetchBalances = useCallback(async () => {
    const requestedAddress = normalizeAddress(address)
    const requestGeneration = requestGenerationRef.current + 1
    requestGenerationRef.current = requestGeneration

    if (!address || !requestedAddress || !publicClient) {
      setSnapshot({ address: requestedAddress, balances: EMPTY_BALANCES, error: null })
      setLoadingAddress(null)
      return
    }

    setSnapshot((current) => current.address === requestedAddress
      ? { ...current, error: null }
      : { address: requestedAddress, balances: EMPTY_BALANCES, error: null })
    setLoadingAddress(requestedAddress)

    const isCurrentRequest = () => (
      requestGenerationRef.current === requestGeneration
      && latestAddressRef.current === requestedAddress
    )

    try {
      const service = new BalancesService({ publicClient, walletClient })
      await service.initialize()

      if (!isCurrentRequest()) return

      const result = await service.getAllBalances(address)

      if (!isCurrentRequest()) return

      if (result.error) {
        setSnapshot({ address: requestedAddress, balances: EMPTY_BALANCES, error: result.error })
      } else if (result.data) {
        setSnapshot({
          address: requestedAddress,
          balances: {
            concord: result.data.concord,
            corpse: result.data.corpse,
            mushroom: result.data.mushroom,
          },
          error: null,
        })
      }
    } catch (err) {
      if (!isCurrentRequest()) return

      const nextError: ContractError = {
        type: ContractErrorType.UNKNOWN,
        message: 'Failed to fetch token balances',
        originalError: err instanceof Error ? err : undefined,
      }
      setSnapshot({ address: requestedAddress, balances: EMPTY_BALANCES, error: nextError })
      logError(err, 'useTokenBalances')
    } finally {
      if (isCurrentRequest()) {
        setLoadingAddress(null)
      }
    }
  }, [address, publicClient, walletClient])

  useEffect(() => {
    void fetchBalances()

    return () => {
      requestGenerationRef.current += 1
    }
  }, [fetchBalances])

  const isCurrentSnapshot = snapshot.address === currentAddress

  return {
    balances: isCurrentSnapshot ? snapshot.balances : EMPTY_BALANCES,
    isLoading: Boolean(
      currentAddress
      && (snapshot.address !== currentAddress || loadingAddress === currentAddress)
    ),
    error: isCurrentSnapshot ? snapshot.error : null,
    refetch: fetchBalances,
  }
}

// Hook for fetching a single token balance
export function useSingleTokenBalance(tokenType: TokenType | null) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const currentAddress = normalizeAddress(address)
  const latestAddressRef = useRef(currentAddress)
  const requestGenerationRef = useRef(0)

  latestAddressRef.current = currentAddress

  const [snapshot, setSnapshot] = useState<{
    address: string | null
    tokenType: TokenType | null
    balance: TokenBalance | null
    error: ContractError | null
  }>({ address: null, tokenType: null, balance: null, error: null })
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const currentKey = currentAddress && tokenType ? `${currentAddress}:${tokenType}` : null

  const fetchBalance = useCallback(async () => {
    const requestedAddress = normalizeAddress(address)
    const requestedKey = requestedAddress && tokenType ? `${requestedAddress}:${tokenType}` : null
    const requestGeneration = requestGenerationRef.current + 1
    requestGenerationRef.current = requestGeneration

    if (!address || !requestedAddress || !publicClient || !tokenType || !requestedKey) {
      setSnapshot({ address: requestedAddress, tokenType, balance: null, error: null })
      setLoadingKey(null)
      return
    }

    setSnapshot((current) => (
      current.address === requestedAddress && current.tokenType === tokenType
        ? { ...current, error: null }
        : { address: requestedAddress, tokenType, balance: null, error: null }
    ))
    setLoadingKey(requestedKey)

    const isCurrentRequest = () => (
      requestGenerationRef.current === requestGeneration
      && latestAddressRef.current === requestedAddress
    )

    try {
      const service = new BalancesService({ publicClient, walletClient })
      await service.initialize()

      if (!isCurrentRequest()) return

      const result = await service.getTokenBalance(tokenType, address)

      if (!isCurrentRequest()) return

      if (result.error) {
        setSnapshot({ address: requestedAddress, tokenType, balance: null, error: result.error })
      } else if (result.data) {
        setSnapshot({ address: requestedAddress, tokenType, balance: result.data, error: null })
      }
    } catch (err) {
      if (!isCurrentRequest()) return

      const nextError: ContractError = {
        type: ContractErrorType.UNKNOWN,
        message: 'Failed to fetch token balance',
        originalError: err instanceof Error ? err : undefined,
      }
      setSnapshot({ address: requestedAddress, tokenType, balance: null, error: nextError })
      logError(err, 'useSingleTokenBalance')
    } finally {
      if (isCurrentRequest()) {
        setLoadingKey(null)
      }
    }
  }, [address, publicClient, walletClient, tokenType])

  useEffect(() => {
    void fetchBalance()

    return () => {
      requestGenerationRef.current += 1
    }
  }, [fetchBalance])

  const isCurrentSnapshot = snapshot.address === currentAddress && snapshot.tokenType === tokenType

  return {
    balance: isCurrentSnapshot ? snapshot.balance : null,
    isLoading: Boolean(
      currentKey
      && (
        !isCurrentSnapshot
        || loadingKey === currentKey
      )
    ),
    error: isCurrentSnapshot ? snapshot.error : null,
    refetch: fetchBalance,
  }
}
