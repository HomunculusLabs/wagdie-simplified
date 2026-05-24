'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Spinner } from '@/components/ui';
import { PUBLIC_LOCATION_ROOM_DEFAULT_PAGE_SIZE, usePublicLocationRoom } from '@/hooks/usePublicLocationRoom';
import { EncounterStatusSidebar } from './EncounterStatusSidebar';
import { EncounterTranscript } from './EncounterTranscript';
import { formatCount, formatDateTime, formatStatusLabel } from './locationRoomPresentation';

interface LocationRoomWatchPageProps {
  locationId: string;
}

export function LocationRoomWatchPage({ locationId }: LocationRoomWatchPageProps) {
  const [followLatest, setFollowLatest] = useState(true);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const { roomData, isLoading, error, lastFetchedAt, refetch } = usePublicLocationRoom({
    locationId,
    pageSize: PUBLIC_LOCATION_ROOM_DEFAULT_PAGE_SIZE,
    passiveRefresh: true,
  });

  const latestSequence = roomData?.activity?.latestSequence ?? roomData?.messages.at(-1)?.sequence ?? null;

  useEffect(() => {
    if (!followLatest || !latestSequence) return;
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [followLatest, latestSequence]);

  const headerFacts = useMemo(() => {
    if (!roomData) return [];

    const facts = [
      formatCount('participant', roomData.participants.length),
      formatCount('message', roomData.activity?.messageCount ?? roomData.messages.length),
      `Latest sequence ${roomData.activity?.latestSequence ?? '—'}`,
      `Latest message ${formatDateTime(roomData.activity?.latestMessageCreatedAt)}`,
      `Generated ${formatDateTime(roomData.activity?.generatedAt)}`,
      `Fetched ${lastFetchedAt ? formatDateTime(lastFetchedAt.toISOString()) : 'pending'}`,
    ];

    if (roomData.activity?.tickCount != null) facts.push(`${roomData.activity.tickCount} ticks`);
    if (roomData.activity?.completedTurnCount != null) facts.push(`${roomData.activity.completedTurnCount} completed turns`);
    if (roomData.activity?.targetTurnCount != null) facts.push(`${roomData.activity.targetTurnCount} target turns`);

    return facts;
  }, [lastFetchedAt, roomData]);

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

  return (
    <main className="min-h-screen bg-soul-950 text-neutral-100">
      <section className="border-b border-neutral-800 bg-[radial-gradient(circle_at_top_left,rgba(180,130,255,0.16),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.75),rgba(16,12,28,0.9))]">
        <div className="mx-auto max-w-7xl px-4 py-8 md:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <a href="/map" className="font-eskapade text-sm text-soul-accent transition-colors hover:text-neutral-100">
              ← Back to map
            </a>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => void refetch({ silent: true })}>
                Refresh
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setFollowLatest((value) => !value)}>
                {followLatest ? 'Following latest' : 'Follow latest'}
              </Button>
            </div>
          </div>

          <div className="mt-8 max-w-4xl">
            <p className="font-eskapade text-xs uppercase tracking-[0.3em] text-soul-accent/80">Location encounter watch</p>
            <h1 className="mt-2 font-display text-5xl lowercase text-neutral-50 md:text-7xl">
              {locationName}
            </h1>
            <p className="mt-4 max-w-3xl font-eskapade text-base leading-relaxed text-neutral-400 md:text-lg">
              A read-only room transcript built for leaving open while gameplay unfolds. Use the map for staking and manual trigger actions.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 font-eskapade text-xs text-neutral-400">
            <span className="rounded-full border border-neutral-700 bg-black/35 px-3 py-1">
              Canonical {canonicalLocationId}
            </span>
            {roomData.identity?.isAlias && (
              <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-amber-100">
                Requested {requestedLocationId} aliases to {canonicalLocationId}
              </span>
            )}
            {roomData.gameplay?.encounter && (
              <span className="rounded-full border border-neutral-700 bg-black/35 px-3 py-1">
                Encounter {formatStatusLabel(roomData.gameplay.encounter.status)} · Round {roomData.gameplay.encounter.round}
              </span>
            )}
          </div>

          <dl className="mt-6 grid gap-2 font-eskapade text-xs text-neutral-400 sm:grid-cols-2 lg:grid-cols-4">
            {headerFacts.map((fact) => (
              <div key={fact} className="rounded-lg border border-neutral-800 bg-black/35 px-3 py-2">
                {fact}
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr),24rem] lg:items-start lg:py-10">
        <div className="lg:order-2">
          <EncounterStatusSidebar roomData={roomData} lastFetchedAt={lastFetchedAt} />
        </div>

        <div className="space-y-4 lg:order-1">
          {error && (
            <Alert variant="default" className="border-neutral-800 bg-neutral-950/70">
              Passive refresh failed: {error}
            </Alert>
          )}
          <EncounterTranscript roomData={roomData} endRef={transcriptEndRef} />
        </div>
      </div>
    </main>
  );
}
