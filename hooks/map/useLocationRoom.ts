'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { readApiRaw } from '@/lib/api/client-response';
import { usePublicLocationRoom } from '@/hooks/usePublicLocationRoom';
import { isAdmin } from '@/lib/auth/admin';
import type { CharacterWithLocation } from '@/lib/repositories/character-repository';
import type { PublicLocationRoomRead } from '@/lib/eliza/locationRooms/types';

export type LocationRoomTriggerState = 'idle' | 'queued' | 'error';

export interface UseLocationRoomInput {
  locationId?: string | null;
  isActive: boolean;
  stakedHere: CharacterWithLocation[];
  walletAddress?: string;
  isConnected: boolean;
}

export interface UseLocationRoomResult {
  roomData: PublicLocationRoomRead | null;
  isLoading: boolean;
  error: string | null;
  canTriggerAsOwner: boolean;
  isTriggering: boolean;
  triggerState: LocationRoomTriggerState;
  triggerError: string | null;
  refetch: () => Promise<PublicLocationRoomRead | null>;
  triggerTick: () => Promise<void>;
}

const ROOM_PAGE_SIZE = 30;
const POST_TRIGGER_POLL_INTERVAL_MS = 2_000;
const POST_TRIGGER_POLL_ATTEMPTS = 6;

function normalizeAddress(value?: string | null): string | null {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized || null;
}

function getEffectiveOwner(row: CharacterWithLocation): string | null {
  return normalizeAddress(row.staker_address ?? row.owner_address ?? null);
}

function isEligibleClientParticipant(row: CharacterWithLocation): boolean {
  if (typeof row.token_id !== 'number' || !Number.isInteger(row.token_id)) return false;
  if (!row.location_id) return false;
  if (row.burned) return false;
  return Boolean(getEffectiveOwner(row));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useLocationRoom(input: UseLocationRoomInput): UseLocationRoomResult {
  const { locationId, isActive, stakedHere, walletAddress, isConnected } = input;
  const {
    roomData,
    isLoading,
    error,
    refetch,
  } = usePublicLocationRoom({
    locationId,
    isActive,
    pageSize: ROOM_PAGE_SIZE,
  });
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerState, setTriggerState] = useState<LocationRoomTriggerState>('idle');
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const canTriggerAsOwner = useMemo(() => {
    const normalizedWallet = normalizeAddress(walletAddress);
    if (!isConnected || !normalizedWallet) return false;
    if (isAdmin(normalizedWallet)) return true;

    return stakedHere.some((row) =>
      isEligibleClientParticipant(row) && getEffectiveOwner(row) === normalizedWallet
    );
  }, [isConnected, stakedHere, walletAddress]);

  useEffect(() => {
    if (!isActive || !locationId) {
      setTriggerState('idle');
      setTriggerError(null);
    }
  }, [isActive, locationId]);

  const triggerTick = useCallback(async () => {
    if (!locationId || !canTriggerAsOwner || isTriggering) return;

    const previousLatestSequence = Math.max(
      0,
      ...(roomData?.messages.map((message) => message.sequence) ?? [])
    );

    setIsTriggering(true);
    setTriggerState('idle');
    setTriggerError(null);

    try {
      const response = await fetch(`/api/eliza/location-rooms/${encodeURIComponent(locationId)}/tick`, {
        method: 'POST',
        cache: 'no-store',
      });

      await readApiRaw<{ success: boolean; queued: boolean }>(
        response,
        'Failed to trigger room activity'
      );

      setTriggerState('queued');

      for (let attempt = 0; attempt < POST_TRIGGER_POLL_ATTEMPTS; attempt += 1) {
        await delay(POST_TRIGGER_POLL_INTERVAL_MS);
        const nextData = await refetch({ silent: true });
        const latestSequence = Math.max(
          0,
          ...(nextData?.messages.map((message) => message.sequence) ?? [])
        );
        if (latestSequence > previousLatestSequence) break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to trigger room activity';
      setTriggerState('error');
      setTriggerError(message);
    } finally {
      setIsTriggering(false);
    }
  }, [canTriggerAsOwner, isTriggering, locationId, refetch, roomData]);

  return {
    roomData,
    isLoading,
    error,
    canTriggerAsOwner,
    isTriggering,
    triggerState,
    triggerError,
    refetch,
    triggerTick,
  };
}
