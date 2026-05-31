'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Spinner } from '@/components/ui';
import { PUBLIC_LOCATION_ROOM_DEFAULT_PAGE_SIZE, usePublicLocationRoom } from '@/hooks/usePublicLocationRoom';
import { CurrentBeatPanel } from './CurrentBeatPanel';
import { EncounterStatusSidebar } from './EncounterStatusSidebar';
import { EncounterTranscript } from './EncounterTranscript';
import {
  deriveCurrentBeatSummary,
  formatCount,
  formatLiveFreshnessLabel,
  formatStatusLabel,
  getLatestPublicSequence,
} from './locationRoomPresentation';

interface LocationRoomWatchPageProps {
  locationId: string;
}

export function LocationRoomWatchPage({ locationId }: LocationRoomWatchPageProps) {
  const [followLatest, setFollowLatest] = useState(true);
  const [lastSeenSequence, setLastSeenSequence] = useState<number | null>(null);
  const [pendingLatestSequence, setPendingLatestSequence] = useState<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const { roomData, isLoading, error, lastFetchedAt, refetch } = usePublicLocationRoom({
    locationId,
    pageSize: PUBLIC_LOCATION_ROOM_DEFAULT_PAGE_SIZE,
    passiveRefresh: true,
  });

  const latestSequence = getLatestPublicSequence(roomData);
  const currentBeat = useMemo(() => (roomData ? deriveCurrentBeatSummary(roomData) : null), [roomData]);
  const hasPendingActivity =
    pendingLatestSequence != null &&
    lastSeenSequence != null &&
    pendingLatestSequence > lastSeenSequence;

  const scrollToLatest = useCallback(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  const handleJumpToLatest = useCallback(() => {
    setFollowLatest(true);
    setPendingLatestSequence(null);
    setLastSeenSequence(latestSequence);
    scrollToLatest();
  }, [latestSequence, scrollToLatest]);

  useEffect(() => {
    if (latestSequence == null) return;

    setLastSeenSequence((current) => {
      if (current == null) {
        setPendingLatestSequence(null);
        return latestSequence;
      }

      if (latestSequence <= current) return current;

      if (followLatest) {
        setPendingLatestSequence(null);
        return latestSequence;
      }

      setPendingLatestSequence((pending) => (pending != null && pending >= latestSequence ? pending : latestSequence));
      return current;
    });

    if (followLatest) scrollToLatest();
  }, [followLatest, latestSequence, scrollToLatest]);

  if (isLoading && !roomData) {
    return (
      <main className="min-h-screen bg-soul-950 px-4 py-10 text-neutral-100">
        <div className="mx-auto flex max-w-3xl items-center justify-center gap-3 rounded-2xl border border-neutral-800 bg-black/40 p-8">
          <Spinner size="sm" />
          <span className="font-eskapade text-lg text-neutral-400">Loading room transcript…</span>
        </div>
      </main>
    );
  }

  if (error && !roomData) {
    return (
      <main className="min-h-screen bg-soul-950 px-4 py-10 text-neutral-100">
        <div className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-neutral-800 bg-black/40 p-8">
          <a href="/map" className="font-eskapade text-sm text-soul-accent hover:text-neutral-100">← Back to map</a>
          <Alert variant="default" className="border-neutral-800 bg-neutral-950/70">
            <div className="space-y-3">
              <p>{error}</p>
              <Button type="button" variant="secondary" size="sm" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          </Alert>
        </div>
      </main>
    );
  }

  if (!roomData) {
    return (
      <main className="min-h-screen bg-soul-950 px-4 py-10 text-neutral-100">
        <div className="mx-auto max-w-3xl rounded-2xl border border-neutral-800 bg-black/40 p-8 text-center">
          <p className="font-display text-3xl lowercase text-neutral-100">room unavailable</p>
          <p className="mt-2 font-eskapade text-neutral-500">No public room data is available for this location yet.</p>
          <a href="/map" className="mt-5 inline-flex border border-soul-accent/40 px-5 py-2 font-eskapade text-sm text-soul-accent">
            Back to map
          </a>
        </div>
      </main>
    );
  }

  const locationName = roomData.identity?.canonicalLocationName ?? roomData.room.locationName;
  const canonicalLocationId = roomData.identity?.canonicalLocationId ?? roomData.room.locationId;
  const requestedLocationId = roomData.identity?.requestedLocationId ?? locationId;
  const followButtonLabel = hasPendingActivity
    ? 'New activity — jump to latest'
    : followLatest
      ? 'Following latest'
      : 'Follow latest';
  const railFacts = [
    formatCount('participant', roomData.participants.length),
    `${formatCount('message', roomData.activity?.messageCount ?? roomData.messages.length)} · latest #${latestSequence ?? '—'}`,
    roomData.ttrpg
      ? `Phase ${formatStatusLabel(roomData.ttrpg.phase)} · Readiness ${formatStatusLabel(roomData.ttrpg.combatReadiness)}`
      : null,
    roomData.gameplay?.encounter
      ? `Encounter ${formatStatusLabel(roomData.gameplay.encounter.status)} · Round ${roomData.gameplay.encounter.round}`
      : null,
    formatLiveFreshnessLabel(roomData, lastFetchedAt),
  ].filter(Boolean) as string[];

  return (
    <main className="min-h-screen bg-soul-950 text-neutral-100">
      <section className="border-b border-neutral-800 bg-[radial-gradient(circle_at_top_left,rgba(180,130,255,0.14),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.82),rgba(16,12,28,0.92))]">
        <div className="mx-auto max-w-7xl px-4 py-4 md:py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <a href="/map" className="font-eskapade text-sm text-soul-accent transition-colors hover:text-neutral-100">
              ← Back to map
            </a>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => void refetch({ silent: true })}>
                Refresh
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (followLatest && !hasPendingActivity) {
                    setFollowLatest(false);
                    return;
                  }
                  handleJumpToLatest();
                }}
              >
                {followButtonLabel}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr),auto] lg:items-end">
            <div className="min-w-0">
              <p className="font-eskapade text-xs uppercase tracking-[0.3em] text-soul-accent/80">Location watch room</p>
              <h1 className="mt-1 font-display text-4xl lowercase text-neutral-50 md:text-6xl">
                {locationName}
              </h1>
              <p className="mt-2 max-w-3xl font-eskapade text-sm leading-relaxed text-neutral-400 md:text-base">
                A read-only live room feed for leaving open while gameplay unfolds. Use the map for staking and manual trigger actions.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 font-eskapade text-xs text-neutral-400 lg:justify-end">
              <span className="rounded-full border border-neutral-700 bg-black/35 px-3 py-1">
                Canonical {canonicalLocationId}
              </span>
              {roomData.identity?.isAlias && (
                <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-amber-100">
                  Requested {requestedLocationId} aliases to {canonicalLocationId}
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 font-eskapade text-xs text-neutral-300">
            {railFacts.map((fact) => (
              <span key={fact} className="rounded-full border border-neutral-800 bg-black/35 px-3 py-1.5">
                {fact}
              </span>
            ))}
            {error && (
              <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-amber-100">
                Passive refresh failed
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr),23rem] lg:items-start lg:py-6">
        <div className="space-y-4">
          {error && (
            <Alert variant="default" className="border-amber-500/30 bg-amber-500/10 text-amber-100">
              Passive refresh failed: {error}
            </Alert>
          )}
          <CurrentBeatPanel beat={currentBeat} hasPendingActivity={hasPendingActivity} onJumpToLatest={handleJumpToLatest} />
          <EncounterTranscript
            roomData={roomData}
            endRef={transcriptEndRef}
            lastSeenSequence={lastSeenSequence}
            pendingLatestSequence={pendingLatestSequence}
            onJumpToLatest={handleJumpToLatest}
          />
        </div>

        <div>
          <EncounterStatusSidebar roomData={roomData} lastFetchedAt={lastFetchedAt} />
        </div>
      </div>
    </main>
  );
}
