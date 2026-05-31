import type { RefObject } from 'react';
import type { PublicLocationRoomRead } from '@/lib/eliza/locationRooms/types';
import { Button } from '@/components/ui';
import { EncounterMessageCard } from './EncounterMessageCard';
import { buildTranscriptDisplayItems, getLatestPublicSequence, sortMessagesChronologically } from './locationRoomPresentation';

interface EncounterTranscriptProps {
  roomData: PublicLocationRoomRead;
  endRef?: RefObject<HTMLDivElement>;
  lastSeenSequence?: number | null;
  pendingLatestSequence?: number | null;
  onJumpToLatest?: () => void;
}

export function EncounterTranscript({
  roomData,
  endRef,
  lastSeenSequence = null,
  pendingLatestSequence = null,
  onJumpToLatest,
}: EncounterTranscriptProps) {
  const messages = sortMessagesChronologically(roomData.messages);
  const latestSequence = getLatestPublicSequence(roomData);

  if (messages.length === 0) {
    return (
      <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-8 text-center shadow-2xl">
        <p className="font-display text-3xl lowercase text-neutral-200">no public story activity yet</p>
        <p className="mx-auto mt-3 max-w-xl font-eskapade text-base leading-relaxed text-neutral-500">
          This room exists, but no public transcript messages have landed. Use the map to manage staking or manual room actions.
        </p>
        <a
          href="/map"
          className="mt-6 inline-flex border border-soul-accent/40 bg-soul-900 px-5 py-2 font-eskapade text-sm text-soul-accent transition-colors hover:border-soul-accent hover:bg-soul-accent/10"
        >
          Back to map
        </a>
      </section>
    );
  }

  const items = buildTranscriptDisplayItems(roomData, {
    latestSequence,
    lastSeenSequence,
    pendingLatestSequence,
  });

  return (
    <section aria-label="Location room transcript" className="space-y-4">
      {items.map((item) => {
        if (item.type === 'new-activity-marker') {
          return (
            <div
              key={item.key}
              className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-soul-accent/35 bg-soul-950/95 px-4 py-3 shadow-xl backdrop-blur"
            >
              <p className="font-eskapade text-sm text-soul-accent">
                {item.label}
                <span className="ml-2 text-xs text-neutral-500">through #{item.pendingLatestSequence}</span>
              </p>
              {onJumpToLatest && (
                <Button type="button" variant="secondary" size="sm" onClick={onJumpToLatest}>
                  Jump to latest
                </Button>
              )}
            </div>
          );
        }

        return (
          <EncounterMessageCard
            key={item.key}
            message={item.message}
            roomData={roomData}
            isLatest={item.isLatest}
            isContinuation={item.isContinuation}
          />
        );
      })}
      <div ref={endRef} aria-hidden="true" />
    </section>
  );
}
