'use client'

import React from 'react';
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'

/**
 * WalletButton Component
 *
 * Displays wallet connection status and provides connect/disconnect functionality.
 */
interface WalletButtonProps {
  className?: string;
}

export function WalletButton({ className = '' }: WalletButtonProps) {
  const { address, isConnected, isAuthenticating, isHydrating, connect, disconnect } = useAuth()

  const truncateAddress = (addr: string): string => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  if (isConnected && address) {
    return (
      <Button
        variant="secondary"
        onClick={disconnect}
        title="Click to disconnect"
        className={className}
      >
        {truncateAddress(address)}
      </Button>
    )
  }

  return (
    <Button
      variant="primary"
      onClick={connect}
      isLoading={isAuthenticating || isHydrating}
      className={className}
    >
      Connect Wallet
    </Button>
  )
}
