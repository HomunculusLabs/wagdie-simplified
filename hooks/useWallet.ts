/**
 * useWallet Hook
 * Application layer - Wallet connection abstraction
 * Wraps wagmi hooks to decouple components from wallet library
 */

'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import type { Address } from '@/types/wallet'

/**
 * Wallet status type
 */
export type WalletStatus = 'disconnected' | 'connecting' | 'connected'

/**
 * Wallet hook return type
 */
export interface UseWalletReturn {
  address: Address | undefined
  isConnected: boolean
  isConnecting: boolean
  status: WalletStatus
  chainId: number
  connect: () => void
  disconnect: () => Promise<void>
}

/**
 * Custom hook for wallet connection
 * Abstracts wagmi implementation details
 */
export function useWallet(): UseWalletReturn {
  const { address, isConnected, isConnecting } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { connect: connectWallet, connectors } = useConnect()
  const { disconnectAsync } = useDisconnect()

  const status: WalletStatus = isConnecting
    ? 'connecting'
    : isConnected
    ? 'connected'
    : 'disconnected'

  const connect = () => {
    if (openConnectModal) {
      openConnectModal()
      return
    }

    const connector = connectors.find((candidate) => candidate.id === 'injected') ?? connectors[0]
    if (connector) {
      connectWallet({ connector })
    }
  }

  const disconnect = async () => {
    await disconnectAsync()
  }

  return {
    address: address as Address | undefined,
    isConnected,
    isConnecting,
    status,
    chainId: 1, // Ethereum Mainnet
    connect,
    disconnect,
  }
}
