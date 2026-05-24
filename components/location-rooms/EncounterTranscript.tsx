import type { RefObject } from 'react';
import type { PublicLocationRoomRead } from '@/lib/eliza/locationRooms/types';
import { EncounterMessageCard } from './EncounterMessageCard';
import { sortMessagesChronologically } from './locationRoomPresentation';

interface EncounterTranscriptProps {
  roomData: PublicLocationRoomRead;
  endRef?: RefObject<HTMLDivElement>;
}

export function EncounterTranscript({ roomData, endRef }: EncounterTranscriptProps) {
  const messages = sortMessagesChronologically(roomData.messages);

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

  return (
    <section aria-label="Encounter transcript" className="space-y-5">
      {messages.map((message) => (
        <EncounterMessageCard key={message.id} message={message} roomData={roomData} />
      ))}
      <div ref={endRef} aria-hidden="true" />
    </section>
  );
}
