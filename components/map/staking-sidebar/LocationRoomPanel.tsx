'use client';

import { Badge, Button, Spinner, Alert } from '@/components/ui';
import type { PublicLocationRoomRead } from '@/lib/eliza/locationRooms/types';

interface LocationRoomPanelProps {
  roomData: PublicLocationRoomRead | null;
  isLoading: boolean;
  error: string | null;
  canTriggerAsOwner: boolean;
  isTriggering: boolean;
  triggerState: 'idle' | 'queued' | 'error';
  triggerError: string | null;
  onTrigger: () => Promise<void>;
  onRetry: () => Promise<PublicLocationRoomRead | null>;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type PublicRoomMessage = PublicLocationRoomRead['messages'][number];
type GameplaySummary = NonNullable<PublicLocationRoomRead['gameplay']>;
type GameplayCharacter = GameplaySummary['characters'][number];
type GameplayMonster = GameplaySummary['monsters'][number];

function getMessageCardClassName(message: PublicRoomMessage): string {
  if (message.gameplayMessageKind === 'gm_setup') {
    return 'rounded-lg border border-soul-accent/40 bg-soul-accent/10 p-3 space-y-2 shadow-[0_0_18px_rgba(180,130,255,0.10)]';
  }

  if (message.gameplayMessageKind === 'character_action') {
    return 'rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2 shadow-[0_0_18px_rgba(245,158,11,0.08)]';
  }

  if (message.gameplayMessageKind === 'gm_outcome') {
    return 'rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 space-y-2 shadow-[0_0_18px_rgba(244,63,94,0.08)]';
  }

  if (message.authorKind === 'game_master') {
    return 'rounded-lg border border-soul-accent/30 bg-soul-accent/10 p-3 space-y-2 shadow-[0_0_18px_rgba(180,130,255,0.08)]';
  }

  return 'rounded-lg border border-neutral-800/60 bg-neutral-900/30 p-3 space-y-2';
}

function formatStatusLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getCharacterStatusClassName(character: GameplayCharacter): string {
  if (character.status === 'dead') return 'border-red-500/30 bg-red-500/10 text-red-200';
  if (character.status === 'downed' || character.hpBand === 'down' || character.hpBand === 'critical') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  }
  if (character.status === 'fled') return 'border-neutral-700 bg-neutral-900/50 text-neutral-400';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
}

function getMonsterStatusClassName(monster: GameplayMonster): string {
  if (monster.status === 'dead' || monster.hpBand === 'dead') {
    return 'border-neutral-700 bg-neutral-900/60 text-neutral-500';
  }
  if (monster.hpBand === 'critical' || monster.hpBand === 'injured') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-100';
  }
  return 'border-red-500/30 bg-red-500/10 text-red-100';
}

function getGameplayMessageLabel(message: PublicRoomMessage): string | null {
  if (message.gameplayMessageKind === 'gm_setup') return 'GM setup';
  if (message.gameplayMessageKind === 'character_action') return 'Character action';
  if (message.gameplayMessageKind === 'gm_outcome') return 'GM outcome';
  if (message.authorKind === 'game_master') return 'Story beat';
  return null;
}

function hasGameplayRewards(gameplay: GameplaySummary): boolean {
  const rewards = gameplay.pendingRewardSummary;
  return Boolean(
    rewards?.victoryText ||
    rewards?.temporaryBoons.length ||
    rewards?.narrativeRewards.length
  );
}

export function LocationRoomPanel({
  roomData,
  isLoading,
  error,
  canTriggerAsOwner,
  isTriggering,
  triggerState,
  triggerError,
  onTrigger,
  onRetry,
}: LocationRoomPanelProps) {
  const participants = roomData?.participants ?? [];
  const messages = roomData?.messages ?? [];
  const gameplay = roomData?.gameplay;
  const isGameplayEnabled = gameplay?.mode === 'enabled';
  const livingGameplayCharacters = gameplay?.characters.filter((character) => character.status !== 'dead') ?? [];
  const deadGameplayCharacters = gameplay?.characters.filter((character) => character.status === 'dead') ?? [];
  const triggerButtonLabel = isGameplayEnabled ? 'Advance Gameplay' : 'Stir the Room';
  const canQueueTick = Boolean(
    roomData?.room.tickEnabled && participants.length >= 2 && canTriggerAsOwner
  );

  if (isLoading && !roomData) {
    return (
      <div className="flex items-center justify-center gap-3 py-8">
        <Spinner size="sm" />
        <span className="text-base text-neutral-500 font-eskapade">Loading room transcript…</span>
      </div>
    );
  }

  if (error && !roomData) {
    return (
      <Alert variant="default" className="bg-neutral-900/30 border-neutral-800">
        <div className="space-y-3">
          <p>{error}</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => void onRetry()}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-800/60 bg-neutral-950/50 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-eskapade text-lg text-neutral-200">
              {isGameplayEnabled ? 'Location Encounter' : 'Location Story'}
            </h3>
            <p className="text-sm text-neutral-500 font-eskapade">
              {isGameplayEnabled
                ? 'Public gameplay turns from the eligible characters staked at this location.'
                : 'Public story activity from the eligible characters staked at this location.'}
            </p>
          </div>
          <Badge variant={roomData?.room.tickEnabled ? 'accent' : 'outline'}>
            {roomData?.room.tickEnabled ? 'Active' : 'Dormant'}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-eskapade text-neutral-500">
          <span>{participants.length} participant{participants.length === 1 ? '' : 's'}</span>
          <span>•</span>
          <span>{roomData?.room.tickCount ?? 0} turn{roomData?.room.tickCount === 1 ? '' : 's'}</span>
          {roomData?.room.lastTickAt && (
            <>
              <span>•</span>
              <span>Last stirred {formatTimestamp(roomData.room.lastTickAt)}</span>
            </>
          )}
        </div>

        {participants.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {participants.slice(0, 6).map((participant) => (
              <Badge key={participant.tokenId} variant="outline" className="normal-case tracking-normal">
                {participant.name}
              </Badge>
            ))}
            {participants.length > 6 && (
              <Badge variant="outline">+{participants.length - 6} more</Badge>
            )}
          </div>
        )}

        {gameplay && (
          <div className="rounded-lg border border-neutral-800/60 bg-neutral-900/40 p-3 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-eskapade text-sm text-neutral-200">Gameplay status</p>
                <p className="text-xs text-neutral-500 font-eskapade">
                  {gameplay.encounter?.publicTitle ?? 'No active encounter'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={isGameplayEnabled ? 'accent' : 'outline'}>
                  {isGameplayEnabled ? 'Gameplay enabled' : 'Gameplay disabled'}
                </Badge>
                <Badge variant="outline">{formatStatusLabel(gameplay.status)}</Badge>
                {gameplay.encounter && (
                  <Badge variant="outline">Encounter {formatStatusLabel(gameplay.encounter.status)}</Badge>
                )}
                {gameplay.encounter && (
                  <Badge variant="outline">Round {gameplay.encounter.round}</Badge>
                )}
              </div>
            </div>

            {gameplay.encounter?.publicSummary && (
              <p className="text-sm text-neutral-400 font-eskapade leading-relaxed">
                {gameplay.encounter.publicSummary}
              </p>
            )}

            {gameplay.characters.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-widest text-neutral-500 font-eskapade">Characters</p>
                  <p className="text-xs text-neutral-600 font-eskapade">
                    {livingGameplayCharacters.length} living · {deadGameplayCharacters.length} dead
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {gameplay.characters.map((character) => (
                    <div
                      key={character.tokenId}
                      className={`rounded-md border px-2.5 py-2 ${getCharacterStatusClassName(character)}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-eskapade">
                          {character.name ?? `#${character.tokenId}`}
                        </span>
                        <span className="shrink-0 text-xs font-eskapade">#{character.tokenId}</span>
                      </div>
                      <p className="mt-1 text-xs font-eskapade opacity-80">
                        {formatStatusLabel(character.status)} · {formatStatusLabel(character.hpBand)}
                      </p>
                      {character.status === 'dead' && (
                        <p className="mt-1 text-xs font-eskapade text-red-200/80">
                          Gameplay death — not canonical/token-final.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {gameplay.monsters.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-neutral-500 font-eskapade">Monsters</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {gameplay.monsters.map((monster) => (
                    <div
                      key={monster.id}
                      className={`rounded-md border px-2.5 py-2 ${getMonsterStatusClassName(monster)}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-eskapade">{monster.name}</span>
                        <span className="shrink-0 text-xs font-eskapade">{formatStatusLabel(monster.status)}</span>
                      </div>
                      <p className="mt-1 text-xs font-eskapade opacity-80">
                        {monster.archetype} · {formatStatusLabel(monster.hpBand)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasGameplayRewards(gameplay) && gameplay.pendingRewardSummary && (
              <div className="rounded-md border border-soul-accent/25 bg-soul-accent/10 p-2.5 space-y-2">
                <p className="text-xs uppercase tracking-widest text-soul-accent/80 font-eskapade">Rewards</p>
                {gameplay.pendingRewardSummary.victoryText && (
                  <p className="text-sm text-neutral-300 font-eskapade leading-relaxed">
                    {gameplay.pendingRewardSummary.victoryText}
                  </p>
                )}
                {gameplay.pendingRewardSummary.temporaryBoons.length > 0 && (
                  <p className="text-xs text-neutral-400 font-eskapade">
                    Boons: {gameplay.pendingRewardSummary.temporaryBoons.join(', ')}
                  </p>
                )}
                {gameplay.pendingRewardSummary.narrativeRewards.length > 0 && (
                  <p className="text-xs text-neutral-400 font-eskapade">
                    Narrative: {gameplay.pendingRewardSummary.narrativeRewards.join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {canTriggerAsOwner && (
          <div className="pt-1 space-y-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void onTrigger()}
              disabled={!canQueueTick || isTriggering}
              isLoading={isTriggering}
            >
              {triggerButtonLabel}
            </Button>
            {!roomData?.room.tickEnabled && (
              <p className="text-xs text-neutral-600 font-eskapade">
                {isGameplayEnabled
                  ? 'Manual gameplay turns are currently disabled.'
                  : 'Manual room activity is currently disabled.'}
              </p>
            )}
            {participants.length < 2 && (
              <p className="text-xs text-neutral-600 font-eskapade">At least two eligible staked participants are required.</p>
            )}
          </div>
        )}

        {triggerState === 'queued' && (
          <p className="text-sm text-soul-accent/80 font-eskapade">
            {isGameplayEnabled
              ? 'Gameplay turn queued. The transcript will refresh when the action resolves.'
              : 'Activity queued. The transcript will refresh if a new message lands.'}
          </p>
        )}
        {triggerError && (
          <Alert variant="destructive">{triggerError}</Alert>
        )}
      </div>

      {error && roomData && (
        <Alert variant="default" className="bg-neutral-900/30 border-neutral-800">
          {error}
        </Alert>
      )}

      <div className="space-y-3 max-h-[calc(100vh-360px)] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-neutral-800/60 bg-neutral-900/30 p-5 text-center">
            <p className="text-base text-neutral-500 font-eskapade">No public story activity yet.</p>
            <p className="text-sm text-neutral-600 font-eskapade mt-1">
              Stake eligible characters here to make future room activity possible.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const isGameMasterMessage = message.authorKind === 'game_master';
            const gameplayMessageLabel = getGameplayMessageLabel(message);

            return (
              <article
                key={message.id}
                className={getMessageCardClassName(message)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className={isGameMasterMessage
                      ? 'truncate font-eskapade text-soul-accent'
                      : 'truncate font-eskapade text-neutral-200'}
                    >
                      {isGameMasterMessage ? 'Game Master' : message.authorName}
                    </p>
                    {message.tokenId != null && !isGameMasterMessage && (
                      <p className="text-xs text-neutral-600 font-eskapade">#{message.tokenId}</p>
                    )}
                    {gameplayMessageLabel && (
                      <p className={message.gameplayMessageKind === 'character_action'
                        ? 'text-xs text-amber-200/80 font-eskapade'
                        : message.gameplayMessageKind === 'gm_outcome'
                          ? 'text-xs text-rose-200/80 font-eskapade'
                          : 'text-xs text-soul-accent/70 font-eskapade'}>
                        {gameplayMessageLabel}
                      </p>
                    )}
                  </div>
                  <time className="shrink-0 text-xs text-neutral-600 font-eskapade" dateTime={message.createdAt}>
                    {formatTimestamp(message.createdAt)}
                  </time>
                </div>
                <p className={isGameMasterMessage
                  ? 'text-sm leading-relaxed text-neutral-300 whitespace-pre-wrap italic'
                  : 'text-sm leading-relaxed text-neutral-400 whitespace-pre-wrap'}
                >
                  {message.content}
                </p>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
