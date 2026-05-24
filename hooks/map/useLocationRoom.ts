'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readApiRaw } from '@/lib/api/client-response';
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
  const [roomData, setRoomData] = useState<PublicLocationRoomRead | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerState, setTriggerState] = useState<LocationRoomTriggerState>('idle');
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestNonceRef = useRef(0);

  const canTriggerAsOwner = useMemo(() => {
    const normalizedWallet = normalizeAddress(walletAddress);
    if (!isConnected || !normalizedWallet) return false;
    if (isAdmin(normalizedWallet)) return true;

    return stakedHere.some((row) =>
      isEligibleClientParticipant(row) && getEffectiveOwner(row) === normalizedWallet
    );
  }, [isConnected, stakedHere, walletAddress]);

  const fetchRoom = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!locationId) {
      setRoomData(null);
      setError(null);
      return null;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const nonce = ++requestNonceRef.current;

    if (!options.silent) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({ pageSize: String(ROOM_PAGE_SIZE) });
      const response = await fetch(
        `/api/eliza/location-rooms/${encodeURIComponent(locationId)}?${params.toString()}`,
        { cache: 'no-store', signal: controller.signal }
      );

      const data = await readApiRaw<PublicLocationRoomRead>(
        response,
        'Failed to load room transcript'
      );
      if (requestNonceRef.current !== nonce) return data;

      setRoomData(data);
      return data;
    } catch (err) {
      if (controller.signal.aborted) return null;
      const message = err instanceof Error ? err.message : 'Failed to load room transcript';
      setError(message);
      return null;
    } finally {
      if (requestNonceRef.current === nonce) {
        setIsLoading(false);
      }
    }
  }, [locationId]);

  const refetch = useCallback(() => fetchRoom(), [fetchRoom]);

  useEffect(() => {
    if (!isActive || !locationId) {
      abortRef.current?.abort();
      requestNonceRef.current += 1;
      setRoomData(null);
      setIsLoading(false);
      setError(null);
      setTriggerState('idle');
      setTriggerError(null);
      return;
    }

    void fetchRoom();

    return () => {
      abortRef.current?.abort();
    };
  }, [fetchRoom, isActive, locationId]);

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
        const nextData = await fetchRoom({ silent: true });
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
  }, [canTriggerAsOwner, fetchRoom, isTriggering, locationId, roomData]);

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
