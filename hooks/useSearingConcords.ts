'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readApiRaw } from '@/lib/api/client-response';
import type { ConcordSearingMap } from '@/lib/domain/searing/concord-searing-map';
import type { SearingConcordBalance } from '@/lib/services/blockchain/searing';

export const BLOCKED_SEARING_CONCORD_IDS = new Set([12, 15, 25, 27]);
const CONCORD_IMAGE_BASE_URL = 'https://storage.googleapis.com/concord-images';

type GetConcordBalances = (concordIds: number[]) => Promise<SearingConcordBalance[]>;

export interface OwnedSearableConcord {
  concordId: number;
  tokenId: string;
  name: string;
  location: string;
  newTrait: string;
  makesBald: boolean;
  amount: bigint;
  imageUrl: string;
  map: ConcordSearingMap;
  balance: SearingConcordBalance;
}

interface SearingMapApiResponse {
  searingMap?: ConcordSearingMap[];
  entries?: ConcordSearingMap[];
  data?: ConcordSearingMap[];
}

interface OwnedConcordBalancesApiResponse {
  balances?: Array<{
    concordId: number;
    tokenId: string;
    balance: string;
    isOwned: boolean;
    contractAddress: `0x${string}`;
  }>;
  error?: string;
}

export interface UseSearingConcordsOptions {
  enabled?: boolean;
  walletAddress?: string | null;
  getConcordBalances?: GetConcordBalances;
}

export interface UseSearingConcordsResult {
  concords: OwnedSearableConcord[];
  allSearableConcords: ConcordSearingMap[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function getConcordImageUrl(concordId: number): string {
  return `${CONCORD_IMAGE_BASE_URL}/${concordId}.gif`;
}

export function isBlockedSearingConcord(concordId: number): boolean {
  return BLOCKED_SEARING_CONCORD_IDS.has(concordId);
}

function getConcordEntries(payload: SearingMapApiResponse): ConcordSearingMap[] {
  if (Array.isArray(payload.searingMap)) return payload.searingMap;
  if (Array.isArray(payload.entries)) return payload.entries;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function getEntryConcordId(entry: ConcordSearingMap): number {
  return Number.isInteger(entry.concordTokenId)
    ? entry.concordTokenId
    : Number(entry.tokenId);
}

function normalizeSearableMapEntries(entries: ConcordSearingMap[]): ConcordSearingMap[] {
  const seen = new Set<number>();
  const normalized: ConcordSearingMap[] = [];

  for (const entry of entries) {
    const concordId = getEntryConcordId(entry);
    if (!Number.isInteger(concordId) || concordId <= 0) continue;
    if (isBlockedSearingConcord(concordId)) continue;
    if (seen.has(concordId)) continue;

    seen.add(concordId);
    normalized.push({
      ...entry,
      tokenId: entry.tokenId || String(concordId),
      concordTokenId: concordId,
    });
  }

  return normalized;
}

export function buildOwnedSearableConcords(
  mapEntries: ConcordSearingMap[],
  balances: SearingConcordBalance[]
): OwnedSearableConcord[] {
  const balanceByConcordId = new Map(
    balances.map((balance) => [balance.concordId, balance])
  );

  return normalizeSearableMapEntries(mapEntries)
    .map((map) => {
      const balance = balanceByConcordId.get(map.concordTokenId);
      if (!balance || !balance.isOwned || balance.balance <= 0n) return null;

      return {
        concordId: map.concordTokenId,
        tokenId: map.tokenId,
        name: map.token_name,
        location: map.location,
        newTrait: map.new_trait,
        makesBald: map.makesBald,
        amount: balance.balance,
        imageUrl: getConcordImageUrl(map.concordTokenId),
        map,
        balance,
      } satisfies OwnedSearableConcord;
    })
    .filter((concord): concord is OwnedSearableConcord => concord !== null)
    .sort((a, b) => {
      if (a.amount !== b.amount) return a.amount > b.amount ? -1 : 1;
      return a.concordId - b.concordId;
    });
}

async function fetchIndexedConcordBalances(
  walletAddress: string,
  concordIds: number[],
  signal?: AbortSignal
): Promise<SearingConcordBalance[]> {
  if (concordIds.length === 0) return [];

  const params = new URLSearchParams({
    wallet: walletAddress,
    token_ids: concordIds.join(','),
  });
  const response = await fetch(`/api/concords/owned?${params.toString()}`, {
    cache: 'no-store',
    signal,
  });
  const payload = await readApiRaw<OwnedConcordBalancesApiResponse>(
    response,
    'Failed to fetch owned Concord balances'
  );

  return (payload.balances ?? []).map((balance) => ({
    concordId: balance.concordId,
    tokenId: BigInt(balance.tokenId || balance.concordId),
    balance: BigInt(balance.balance),
    isOwned: balance.isOwned,
    contractAddress: balance.contractAddress,
  }));
}

export function useSearingConcords({
  enabled = true,
  walletAddress,
  getConcordBalances,
}: UseSearingConcordsOptions): UseSearingConcordsResult {
  const getConcordBalancesRef = useRef(getConcordBalances);
  const normalizedWalletAddress = walletAddress?.trim().toLowerCase() || null;
  const hasBalanceProvider = Boolean(getConcordBalances);
  const currentRequestKey = enabled
    ? normalizedWalletAddress ?? (hasBalanceProvider ? 'provider' : null)
    : null;
  const latestRequestKeyRef = useRef(currentRequestKey);
  const requestGenerationRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [dataRequestKey, setDataRequestKey] = useState<string | null>(null);
  const [concords, setConcords] = useState<OwnedSearableConcord[]>([]);
  const [allSearableConcords, setAllSearableConcords] = useState<ConcordSearingMap[]>([]);
  const [loadingRequestKey, setLoadingRequestKey] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  latestRequestKeyRef.current = currentRequestKey;

  useEffect(() => {
    getConcordBalancesRef.current = getConcordBalances;
  }, [getConcordBalances]);

  const refetch = useCallback(async () => {
    const requestedWalletAddress = walletAddress?.trim().toLowerCase() || null;
    const requestedKey = enabled
      ? requestedWalletAddress
        ?? (hasBalanceProvider && getConcordBalancesRef.current ? 'provider' : null)
      : null;
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;

    abortControllerRef.current?.abort();

    if (!enabled || !requestedKey) {
      abortControllerRef.current = null;
      setDataRequestKey(null);
      setConcords([]);
      setAllSearableConcords([]);
      setLoadingRequestKey(null);
      setError(null);
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setLoadingRequestKey(requestedKey);
    setError(null);
    setDataRequestKey(requestedKey);
    setConcords([]);
    setAllSearableConcords([]);

    const isCurrentRequest = () => (
      requestGenerationRef.current === requestGeneration
      && latestRequestKeyRef.current === requestedKey
      && !abortController.signal.aborted
    );

    try {
      const response = await fetch('/api/concords/searing-map?limit=2000', {
        cache: 'no-store',
        signal: abortController.signal,
      });

      const payload = await readApiRaw<SearingMapApiResponse>(
        response,
        'Failed to fetch Concord searing map'
      );
      if (!isCurrentRequest()) return;

      const searingMap = normalizeSearableMapEntries(getConcordEntries(payload));
      const concordIds = searingMap.map((entry) => entry.concordTokenId);
      const balances = requestedWalletAddress
        ? await fetchIndexedConcordBalances(
          requestedWalletAddress,
          concordIds,
          abortController.signal
        )
        : getConcordBalancesRef.current
          ? await getConcordBalancesRef.current(concordIds)
          : [];

      if (!isCurrentRequest()) return;

      setDataRequestKey(requestedKey);
      setAllSearableConcords(searingMap);
      setConcords(buildOwnedSearableConcords(searingMap, balances));
    } catch (err) {
      if (abortController.signal.aborted || !isCurrentRequest()) return;

      const nextError = err instanceof Error ? err : new Error('Failed to load searable Concords');
      setDataRequestKey(requestedKey);
      setError(nextError);
      setConcords([]);
      setAllSearableConcords([]);
    } finally {
      if (isCurrentRequest()) {
        setLoadingRequestKey(null);
        abortControllerRef.current = null;
      }
    }
  }, [enabled, hasBalanceProvider, walletAddress]);

  useEffect(() => {
    void refetch();

    return () => {
      requestGenerationRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [refetch]);

  const isCurrentSnapshot = dataRequestKey === currentRequestKey;

  return useMemo(() => ({
    concords: isCurrentSnapshot ? concords : [],
    allSearableConcords: isCurrentSnapshot ? allSearableConcords : [],
    isLoading: Boolean(
      currentRequestKey
      && (dataRequestKey !== currentRequestKey || loadingRequestKey === currentRequestKey)
    ),
    error: isCurrentSnapshot ? error : null,
    refetch,
  }), [
    allSearableConcords,
    concords,
    currentRequestKey,
    dataRequestKey,
    error,
    isCurrentSnapshot,
    loadingRequestKey,
    refetch,
  ]);
}
