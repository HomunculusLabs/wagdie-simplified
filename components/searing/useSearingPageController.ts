'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { useAuth } from '@/hooks/useAuth'
import { useOwnedCharacters } from '@/hooks/useOwnedCharacters'
import { useSearing } from '@/hooks/useSearing'
import { useSearingConcords, type OwnedSearableConcord } from '@/hooks/useSearingConcords'
import {
  readSearingSyncResponse,
  syncStateFromResponse,
  type SearingSyncState,
} from '@/components/characters/searing'
import { getCharacterImageDisclosure } from '@/lib/utils/image'
import { TransactionStatus, type ContractError, type TransactionHash } from '@/types/blockchain'
import type { Character } from '@/types/character'
import type { SearingApprovalStatus } from '@/lib/services/blockchain/searing'

interface SearingPageControllerResult {
  wallet: {
    address: `0x${string}` | undefined
    isConnected: boolean
    connect: () => void
    isAuthenticating: boolean
    isHydrating: boolean
  }
  characters: {
    items: Character[]
    selectedId: number | null
    selected: Character | null
    isLoading: boolean
    error: Error | null
    optimisticSearedImagesByTokenId: Record<number, string>
    refetch: () => Promise<void>
    onSelect: (character: Character) => void
  }
  concords: {
    items: OwnedSearableConcord[]
    selected: OwnedSearableConcord | null
    isLoading: boolean
    error: Error | null
    refetch: () => Promise<void>
    onSelect: (concord: OwnedSearableConcord) => void
  }
  approval: {
    status: SearingApprovalStatus | null
    isApproving: boolean
    onApprove: () => Promise<void>
  }
  transaction: {
    isSearing: boolean
    status: TransactionStatus
    activeHash: TransactionHash | undefined
    error: ContractError | null
  }
  sync: {
    state: SearingSyncState
    isSyncing: boolean
    onRetry: () => Promise<void>
    isCompletedImageHiddenByInfection: boolean
  }
  canSear: boolean
  onSear: () => Promise<void>
}

export function useSearingPageController(): SearingPageControllerResult {
  const { address, isConnected } = useAccount()
  const { connect, isAuthenticating, isHydrating } = useAuth()
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null)
  const [selectedConcord, setSelectedConcord] = useState<OwnedSearableConcord | null>(null)
  const [syncState, setSyncState] = useState<SearingSyncState>({ status: 'idle' })
  const [lastSearingHash, setLastSearingHash] = useState<TransactionHash | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [optimisticSearedImagesByTokenId, setOptimisticSearedImagesByTokenId] = useState<Record<number, string>>({})

  const {
    isSearing,
    isApproving,
    error,
    txHash,
    txStatus,
    approvalStatus,
    searConcords,
    checkApprovalStatus,
    approveForSearing,
  } = useSearing()

  const {
    characters,
    isLoading: isLoadingCharacters,
    error: charactersError,
    refetch: refetchCharacters,
  } = useOwnedCharacters(address, {
    enabled: Boolean(address),
    perPage: 200,
    sort: 'asc',
  })

  const {
    concords,
    isLoading: isLoadingConcords,
    error: concordsError,
    refetch: refetchConcords,
  } = useSearingConcords({
    enabled: Boolean(address),
    walletAddress: address,
  })

  const checkApprovalStatusRef = useRef(checkApprovalStatus)

  useEffect(() => {
    checkApprovalStatusRef.current = checkApprovalStatus
  }, [checkApprovalStatus])

  useEffect(() => {
    if (!address) return
    void checkApprovalStatusRef.current()
  }, [address])

  useEffect(() => {
    if (characters.length === 0) {
      setSelectedCharacterId(null)
      return
    }

    setSelectedCharacterId((current) => {
      if (current && characters.some((character) => character.token_id === current)) return current
      return characters[0].token_id
    })
  }, [characters])

  useEffect(() => {
    if (concords.length === 0) {
      setSelectedConcord(null)
      return
    }

    setSelectedConcord((current) => {
      if (current && concords.some((concord) => concord.concordId === current.concordId)) return current
      return concords[0]
    })
  }, [concords])

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.token_id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId]
  )
  const selectedCharacterDisclosure = useMemo(
    () => selectedCharacter
      ? getCharacterImageDisclosure(selectedCharacter.token_id, selectedCharacter.metadata, selectedCharacter.image_url, {
        infectionStatus: selectedCharacter.infection_status,
        isInfected: selectedCharacter.infected,
      })
      : null,
    [selectedCharacter]
  )
  const isCompletedImageHiddenByInfection = Boolean(
    syncState.status === 'completed' &&
    selectedCharacterDisclosure?.isCurrentlyInfected &&
    selectedCharacterDisclosure.primaryUrl !== syncState.imageUrl
  )

  const activeTxHash = txHash ?? lastSearingHash ?? undefined
  const canSear = Boolean(
    selectedCharacter &&
    selectedConcord &&
    approvalStatus?.isFullyApproved &&
    !isSearing &&
    !isApproving &&
    !isSyncing
  )

  const handleSelectCharacter = (character: Character) => {
    setSelectedCharacterId(character.token_id)
    setSyncState({ status: 'idle' })
    setLastSearingHash(null)
  }

  const handleSelectConcord = (concord: OwnedSearableConcord) => {
    setSelectedConcord(concord)
    setSyncState({ status: 'idle' })
    setLastSearingHash(null)
  }

  const handleApprove = async () => {
    await approveForSearing()
    await checkApprovalStatus()
  }

  const syncSearingMaterialization = useCallback(async (hash: TransactionHash) => {
    if (!selectedCharacter) return

    setIsSyncing(true)
    setSyncState({
      status: 'syncing',
      message: 'The chain transaction succeeded. Syncing seared artwork and metadata now.',
    })

    try {
      const response = await fetch(`/api/characters/${selectedCharacter.token_id}/searing/sync`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transactionHash: hash, retryFailed: true, repairCompleted: true }),
      })
      const payload = await readSearingSyncResponse(response)
      const nextState = syncStateFromResponse({
        ...payload,
        error: response.ok ? payload.error : payload.error || 'Failed to sync searing materialization',
      }, { responseOk: response.ok })

      setSyncState(nextState)
      if (nextState.status === 'completed') {
        setOptimisticSearedImagesByTokenId((current) => ({
          ...current,
          [selectedCharacter.token_id]: nextState.imageUrl,
        }))
      }
      await Promise.all([refetchConcords(), refetchCharacters()])
    } catch (err) {
      setSyncState({
        status: 'failed',
        message: err instanceof Error ? err.message : 'Failed to sync searing materialization',
      })
      await Promise.all([refetchConcords(), refetchCharacters()])
    } finally {
      setIsSyncing(false)
    }
  }, [refetchCharacters, refetchConcords, selectedCharacter])

  const handleSear = async () => {
    if (!selectedCharacter || !selectedConcord || !approvalStatus?.isFullyApproved) return

    setSyncState({ status: 'idle' })
    const result = await searConcords(selectedCharacter.token_id, selectedConcord.concordId)
    if (!result.success) return

    if (!result.hash) {
      setSyncState({
        status: 'pending',
        message: 'The searing transaction succeeded but no hash was returned for off-chain sync.',
      })
      return
    }

    setLastSearingHash(result.hash)
    await syncSearingMaterialization(result.hash)
  }

  const handleRetrySync = async () => {
    const hash = lastSearingHash ?? txHash
    if (!hash) {
      setSyncState({
        status: 'pending',
        message: 'No transaction hash is available for retrying off-chain sync yet.',
      })
      return
    }

    await syncSearingMaterialization(hash)
  }

  return {
    wallet: {
      address,
      isConnected,
      connect,
      isAuthenticating,
      isHydrating,
    },
    characters: {
      items: characters,
      selectedId: selectedCharacterId,
      selected: selectedCharacter,
      isLoading: isLoadingCharacters,
      error: charactersError,
      optimisticSearedImagesByTokenId,
      refetch: refetchCharacters,
      onSelect: handleSelectCharacter,
    },
    concords: {
      items: concords,
      selected: selectedConcord,
      isLoading: isLoadingConcords,
      error: concordsError,
      refetch: refetchConcords,
      onSelect: handleSelectConcord,
    },
    approval: {
      status: approvalStatus,
      isApproving,
      onApprove: handleApprove,
    },
    transaction: {
      isSearing,
      status: txStatus,
      activeHash: activeTxHash,
      error,
    },
    sync: {
      state: syncState,
      isSyncing,
      onRetry: handleRetrySync,
      isCompletedImageHiddenByInfection,
    },
    canSear,
    onSear: handleSear,
  }
}
