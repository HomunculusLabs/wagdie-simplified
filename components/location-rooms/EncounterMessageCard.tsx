import type { PublicLocationRoomRead } from '@/lib/eliza/locationRooms/types';
import { StructuredRollPanel } from './StructuredRollPanel';
import {
  findGameplayCharacter,
  findParticipantForMessage,
  formatDateTime,
  formatStatusLabel,
  getGameplayMessageLabel,
  getMessageToneClassName,
  getPublicRoomMessageDomain,
  getPublicRoomMessagePhase,
  getStatusToneClassName,
  type PublicRoomMessage,
} from './locationRoomPresentation';

interface EncounterMessageCardProps {
  message: PublicRoomMessage;
  roomData: PublicLocationRoomRead;
  isLatest?: boolean;
}

function avatarInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'W';
}

function splitLegacyRolls(content: string): { narration: string; legacyRolls: string | null } {
  const match = content.match(/\n\s*Rolls:\s*/i);
  if (match?.index != null) {
    return {
      narration: content.slice(0, match.index).trimEnd(),
      legacyRolls: content.slice(match.index).trim(),
    };
  }

  const inlineIndex = content.search(/Rolls:\s*/i);
  if (inlineIndex > 0) {
    return {
      narration: content.slice(0, inlineIndex).trimEnd(),
      legacyRolls: content.slice(inlineIndex).trim(),
    };
  }

  return { narration: content, legacyRolls: null };
}

export function EncounterMessageCard({ message, roomData, isLatest = false }: EncounterMessageCardProps) {
  const participant = findParticipantForMessage(roomData.participants, message);
  const gameplayCharacter = findGameplayCharacter(roomData.gameplay, message.tokenId);
  const isGameMaster = message.authorKind === 'game_master';
  const displayName = isGameMaster ? 'Game Master' : participant?.name ?? message.authorName;
  const label = getGameplayMessageLabel(message);
  const domain = getPublicRoomMessageDomain(message);
  const phase = getPublicRoomMessagePhase(message);
  const statusCopy = gameplayCharacter
    ? `${formatStatusLabel(gameplayCharacter.status)} · ${formatStatusLabel(gameplayCharacter.hpBand)}`
    : null;
  const { narration, legacyRolls } = splitLegacyRolls(message.content);

  return (
    <article className={`rounded-2xl border p-4 md:p-5 ${isLatest ? 'ring-1 ring-soul-accent/45' : ''} ${getMessageToneClassName(message)}`}>
      <div className="grid gap-4 md:grid-cols-[10rem,minmax(0,1fr)] md:gap-5">
        <aside className="flex gap-3 md:block md:space-y-3">
          {isGameMaster ? (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-soul-accent/40 bg-soul-accent/15 font-display text-2xl lowercase text-soul-accent md:h-16 md:w-16">
              gm
            </div>
          ) : participant?.imageUrl ? (
            <img
              src={participant.imageUrl}
              alt={`${displayName} avatar`}
              className="h-14 w-14 shrink-0 rounded-xl border border-neutral-700 object-cover md:h-20 md:w-20"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900 font-display text-2xl lowercase text-neutral-300 md:h-20 md:w-20">
              {avatarInitial(displayName)}
            </div>
          )}

          <div className="min-w-0">
            <p className={isGameMaster ? 'font-display text-xl lowercase text-soul-accent' : 'truncate font-eskapade text-lg text-neutral-100'}>
              {displayName}
            </p>
            {message.tokenId != null && !isGameMaster && (
              <p className="font-eskapade text-xs text-neutral-500">Token #{message.tokenId}</p>
            )}
            {statusCopy && (
              <p className={`mt-2 inline-flex rounded-full border px-2.5 py-1 font-eskapade text-xs ${getStatusToneClassName(gameplayCharacter?.status, gameplayCharacter?.hpBand)}`}>
                {statusCopy}
              </p>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800/70 pb-3">
            <div className="flex flex-wrap items-center gap-2 font-eskapade text-xs uppercase tracking-[0.18em] text-neutral-500">
              <span>#{message.sequence}</span>
              {isLatest && <span className="text-soul-accent">Latest</span>}
              {domain && (
                <span className={domain === 'combat' ? 'text-rose-300' : 'text-sky-300'}>
                  {formatStatusLabel(domain)}
                </span>
              )}
              {label && <span className="text-soul-accent/80">{label}</span>}
              {phase && <span className="text-neutral-400">{formatStatusLabel(phase)}</span>}
            </div>
            <time className="font-eskapade text-xs text-neutral-500" dateTime={message.createdAt}>
              {formatDateTime(message.createdAt)}
            </time>
          </header>

          <p className={isGameMaster
            ? 'whitespace-pre-wrap font-serif text-xl leading-[1.65] text-neutral-200 md:text-[1.65rem] md:leading-[1.55]'
            : 'whitespace-pre-wrap font-serif text-lg leading-[1.65] text-neutral-300 md:text-xl'}
          >
            {narration}
          </p>


          {legacyRolls && !message.gameplayRolls && (
            <div className="rounded-lg border border-neutral-800 bg-black/25 p-3 font-eskapade text-sm leading-relaxed text-neutral-500">
              <p className="mb-1 text-[10px] uppercase tracking-[0.22em] text-neutral-600">Legacy roll text</p>
              <p className="whitespace-pre-wrap">{legacyRolls}</p>
            </div>
          )}

          {message.gameplayRolls && (
            <StructuredRollPanel rolls={message.gameplayRolls} variant="roomy" />
          )}
        </div>
      </div>
    </article>
  );
}
