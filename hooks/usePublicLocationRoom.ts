'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { readApiRaw } from '@/lib/api/client-response';
import type { PublicLocationRoomRead } from '@/lib/eliza/locationRooms/types';

export interface UsePublicLocationRoomRefetchOptions {
  silent?: boolean;
}

export interface UsePublicLocationRoomInput {
  locationId?: string | null;
  isActive?: boolean;
  pageSize?: number;
  passiveRefresh?: boolean;
  passiveRefreshIntervalMs?: number;
}

export interface UsePublicLocationRoomResult {
  roomData: PublicLocationRoomRead | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: Date | null;
  refetch: (options?: UsePublicLocationRoomRefetchOptions) => Promise<PublicLocationRoomRead | null>;
}

export const PUBLIC_LOCATION_ROOM_DEFAULT_PAGE_SIZE = 50;
const DEFAULT_PASSIVE_REFRESH_INTERVAL_MS = 10_000;

function isDocumentVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

export function usePublicLocationRoom(input: UsePublicLocationRoomInput): UsePublicLocationRoomResult {
  const {
    locationId,
    isActive = true,
    pageSize = PUBLIC_LOCATION_ROOM_DEFAULT_PAGE_SIZE,
    passiveRefresh = false,
    passiveRefreshIntervalMs = DEFAULT_PASSIVE_REFRESH_INTERVAL_MS,
  } = input;
  const [roomData, setRoomData] = useState<PublicLocationRoomRead | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestNonceRef = useRef(0);

  const refetch = useCallback(async (options: UsePublicLocationRoomRefetchOptions = {}) => {
    if (!locationId || !isActive) {
      setRoomData(null);
      setError(null);
      setLastFetchedAt(null);
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
      const params = new URLSearchParams({ pageSize: String(pageSize) });
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
      setLastFetchedAt(new Date());
      return data;
    } catch (err) {
      if (controller.signal.aborted) return null;
      if (requestNonceRef.current !== nonce) return null;

      const message = err instanceof Error ? err.message : 'Failed to load room transcript';
      setError(message);
      return null;
    } finally {
      if (requestNonceRef.current === nonce) {
        setIsLoading(false);
      }
    }
  }, [isActive, locationId, pageSize]);

  useEffect(() => {
    if (!isActive || !locationId) {
      abortRef.current?.abort();
      requestNonceRef.current += 1;
      setRoomData(null);
      setIsLoading(false);
      setError(null);
      setLastFetchedAt(null);
      return;
    }

    void refetch();

    return () => {
      abortRef.current?.abort();
    };
  }, [isActive, locationId, refetch]);

  useEffect(() => {
    if (!passiveRefresh || !isActive || !locationId) return;

    const intervalId = window.setInterval(() => {
      if (!isDocumentVisible()) return;
      void refetch({ silent: true });
    }, passiveRefreshIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isActive, locationId, passiveRefresh, passiveRefreshIntervalMs, refetch]);

  return {
    roomData,
    isLoading,
    error,
    lastFetchedAt,
    refetch,
  };
}
