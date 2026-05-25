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

type AdventureSignal = NonNullable<PublicRoomMessage['adventure']>;

function hasAdventureSignals(adventure?: AdventureSignal): adventure is AdventureSignal {
  return Boolean(
    adventure && (
      adventure.stakes ||
      adventure.activeDecision ||
      adventure.declaredAction ||
      adventure.consequence ||
      adventure.clocks?.length
    )
  );
}

function AdventureSignalPanel({ adventure }: { adventure?: AdventureSignal }) {
  if (!hasAdventureSignals(adventure)) return null;

  return (
    <section
      aria-label="Adventure signals"
      className="space-y-3 rounded-xl border border-soul-accent/25 bg-black/25 p-3 font-eskapade text-sm text-neutral-300 md:p-4"
    >
      <p className="text-[10px] uppercase tracking-[0.22em] text-soul-accent/80">Adventure signals</p>

      {adventure.stakes && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Stakes</p>
          <p className="leading-relaxed text-neutral-200">{adventure.stakes}</p>
        </div>
      )}

      {adventure.activeDecision && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Decision options</p>
          <p className="leading-relaxed text-neutral-200">{adventure.activeDecision.prompt}</p>
          <ul className="grid gap-2">
            {adventure.activeDecision.options.map((option) => {
              const isSelected = option.id === adventure.activeDecision?.selectedOptionId;
              return (
                <li
                  key={option.id}
                  className={`rounded-lg border px-3 py-2 ${isSelected
                    ? 'border-soul-accent/50 bg-soul-accent/15 text-neutral-100'
                    : 'border-neutral-800 bg-neutral-950/50 text-neutral-300'}`}
                >
                  <span className="font-semibold text-neutral-100">{option.label}</span>
                  {isSelected && <span className="ml-2 text-xs uppercase tracking-[0.16em] text-soul-accent/80">chosen</span>}
                  {option.summary && <p className="mt-1 leading-relaxed text-neutral-400">{option.summary}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {adventure.declaredAction && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Declared action</p>
          <p className="leading-relaxed text-neutral-200">{adventure.declaredAction.summary}</p>
          {adventure.declaredAction.chosenOptionLabel && (
            <p className="text-xs text-soul-accent/80">Choice: {adventure.declaredAction.chosenOptionLabel}</p>
          )}
          {adventure.declaredAction.actionIntent && (
            <p className="text-xs text-neutral-500">Intent: {formatStatusLabel(adventure.declaredAction.actionIntent)}</p>
          )}
        </div>
      )}

      {adventure.consequence && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Consequence</p>
          <p className="leading-relaxed text-neutral-200">{adventure.consequence.summary}</p>
          {(adventure.consequence.status || adventure.consequence.tier) && (
            <p className="text-xs text-neutral-500">
              {[adventure.consequence.status, adventure.consequence.tier].filter(Boolean).map((value) => formatStatusLabel(value)).join(' · ')}
            </p>
          )}
        </div>
      )}

      {adventure.clocks && adventure.clocks.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Clock pressure</p>
          <ul className="grid gap-2">
            {adventure.clocks.map((clock) => (
              <li key={clock.id} className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-neutral-100">{clock.label}</span>
                  <span className="text-xs text-soul-accent/80">{clock.value} / {clock.max}</span>
                </div>
                <p className="mt-1 leading-relaxed text-neutral-400">{clock.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
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

          <AdventureSignalPanel adventure={message.adventure} />

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
