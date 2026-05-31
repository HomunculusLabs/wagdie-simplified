import type { PublicLocationRoomRead } from '@/lib/eliza/locationRooms/types';
import {
  findGameplayCharacter,
  formatDateTime,
  formatStatusLabel,
  getMonsterToneClassName,
  getStatusToneClassName,
  hasGameplayRewards,
  hasStaticStats,
  type PublicRoomParticipant,
} from './locationRoomPresentation';

interface EncounterStatusSidebarProps {
  roomData: PublicLocationRoomRead;
  lastFetchedAt: Date | null;
}

const CORE_STAT_LABELS: Array<[keyof NonNullable<PublicRoomParticipant['coreStats']>, string]> = [
  ['strength', 'STR'],
  ['dexterity', 'DEX'],
  ['constitution', 'CON'],
  ['intelligence', 'INT'],
  ['wisdom', 'WIS'],
  ['charisma', 'CHA'],
];

function hasCoreStats(participant: PublicRoomParticipant): boolean {
  return Object.values(participant.coreStats ?? {}).some((value) => value != null);
}

function CharacterStatusCard({ participant, roomData }: { participant: PublicRoomParticipant; roomData: PublicLocationRoomRead }) {
  const gameplayCharacter = findGameplayCharacter(roomData.gameplay, participant.tokenId);
  const statsAvailable = hasStaticStats(participant);

  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-2.5">
      <div className="flex gap-2.5">
        {participant.imageUrl ? (
          <img
            src={participant.imageUrl}
            alt={`${participant.name} portrait`}
            className="h-11 w-11 shrink-0 rounded-lg border border-neutral-700 object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 font-display text-lg lowercase text-neutral-400">
            {participant.name.charAt(0).toUpperCase() || '#'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-eskapade text-sm text-neutral-100">{participant.name}</p>
              <p className="font-eskapade text-[11px] text-neutral-500">#{participant.tokenId}</p>
            </div>
            {gameplayCharacter && (
              <span className={`shrink-0 rounded-full border px-2 py-0.5 font-eskapade text-[11px] ${getStatusToneClassName(gameplayCharacter.status, gameplayCharacter.hpBand)}`}>
                {formatStatusLabel(gameplayCharacter.hpBand)}
              </span>
            )}
          </div>
          {participant.characterClass || participant.level != null ? (
            <p className="mt-1 font-eskapade text-xs text-neutral-400">
              {[participant.characterClass, participant.level != null ? `Level ${participant.level}` : null].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>
      </div>

      {gameplayCharacter && (
        <p className="mt-2 font-eskapade text-[11px] text-neutral-500">
          Gameplay: {formatStatusLabel(gameplayCharacter.status)} · {formatStatusLabel(gameplayCharacter.hpBand)}
        </p>
      )}

      {statsAvailable ? (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-3 gap-1.5 font-eskapade text-[11px]">
            <div className="rounded-md border border-neutral-800 bg-black/25 p-1.5">
              <p className="text-neutral-600">Max HP</p>
              <p className="text-neutral-200">{participant.maxHp ?? '—'}</p>
            </div>
            <div className="rounded-md border border-neutral-800 bg-black/25 p-1.5">
              <p className="text-neutral-600">AC</p>
              <p className="text-neutral-200">{participant.ac ?? '—'}</p>
            </div>
            <div className="rounded-md border border-neutral-800 bg-black/25 p-1.5">
              <p className="text-neutral-600">Speed</p>
              <p className="text-neutral-200">{participant.speed ?? '—'}</p>
            </div>
          </div>

          {hasCoreStats(participant) && (
            <div className="grid grid-cols-6 gap-1 font-eskapade text-[10px]">
              {CORE_STAT_LABELS.map(([key, label]) => (
                <div key={key} className="rounded border border-neutral-800 bg-black/20 px-1.5 py-1 text-center">
                  <p className="text-neutral-600">{label}</p>
                  <p className="text-neutral-300">{participant.coreStats?.[key] ?? '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-neutral-800 bg-black/20 p-2 font-eskapade text-xs text-neutral-500">
          Stats unavailable for this participant.
        </p>
      )}
    </article>
  );
}

export function EncounterStatusSidebar({ roomData, lastFetchedAt }: EncounterStatusSidebarProps) {
  const gameplay = roomData.gameplay;
  const activity = roomData.activity;
  const rewards = gameplay?.pendingRewardSummary;
  const ttrpg = roomData.ttrpg;

  return (
    <aside className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
      <section className="rounded-2xl border border-neutral-800 bg-black/45 p-3.5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-eskapade text-xs uppercase tracking-[0.22em] text-neutral-500">Room details</p>
            <h2 className="mt-1 font-display text-2xl lowercase text-neutral-100">
              {gameplay?.encounter?.publicTitle ?? (gameplay?.mode === 'enabled' ? 'encounter watch' : 'story watch')}
            </h2>
          </div>
          <span className="rounded-full border border-soul-accent/40 bg-soul-accent/10 px-3 py-1 font-eskapade text-xs text-soul-accent">
            {roomData.room.tickEnabled ? 'Active' : 'Dormant'}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5 font-eskapade text-xs text-neutral-400">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5">
            <p className="text-neutral-600">Participants</p>
            <p className="text-neutral-200">{roomData.participants.length}</p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5">
            <p className="text-neutral-600">Messages</p>
            <p className="text-neutral-200">{activity?.messageCount ?? roomData.messages.length}</p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5">
            <p className="text-neutral-600">Latest seq.</p>
            <p className="text-neutral-200">{activity?.latestSequence ?? '—'}</p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5">
            <p className="text-neutral-600">Ticks</p>
            <p className="text-neutral-200">{activity?.tickCount ?? roomData.room.tickCount}</p>
          </div>
          {ttrpg && (
            <>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5">
                <p className="text-neutral-600">Phase</p>
                <p className="text-neutral-200">{formatStatusLabel(ttrpg.phase)}</p>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5">
                <p className="text-neutral-600">Readiness</p>
                <p className="text-neutral-200">{formatStatusLabel(ttrpg.combatReadiness)}</p>
              </div>
            </>
          )}
        </div>

        {ttrpg?.threatLevel != null && (
          <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 font-eskapade text-xs text-amber-100">
            Threat level {ttrpg.threatLevel} / 5
          </p>
        )}

        {gameplay?.encounter?.publicSummary && (
          <p className="mt-4 font-eskapade text-sm leading-relaxed text-neutral-400">
            {gameplay.encounter.publicSummary}
          </p>
        )}

        <div className="mt-4 space-y-1.5 font-eskapade text-xs text-neutral-500">
          <p>Latest message: {formatDateTime(activity?.latestMessageCreatedAt)}</p>
          <p>Server generated: {formatDateTime(activity?.generatedAt)}</p>
          <p>Fetched here: {lastFetchedAt ? formatDateTime(lastFetchedAt.toISOString()) : 'Pending'}</p>
          {activity?.lastTickAt && <p>Last tick: {formatDateTime(activity.lastTickAt)}</p>}
          {activity?.completedTurnCount != null && activity?.targetTurnCount != null && (
            <p>Turns: {activity.completedTurnCount} / {activity.targetTurnCount}</p>
          )}
        </div>

        {!activity?.latestMessageCreatedAt && (
          <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 font-eskapade text-xs text-neutral-500">
            No public messages have landed yet. The room may be waiting for enough eligible staked characters or the next tick.
          </p>
        )}
      </section>

      {gameplay && (
        <section className="rounded-2xl border border-neutral-800 bg-black/45 p-3.5 shadow-2xl">
          <p className="font-eskapade text-xs uppercase tracking-[0.22em] text-neutral-500">Encounter</p>
          <div className="mt-3 flex flex-wrap gap-2 font-eskapade text-xs">
            <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-neutral-300">
              {formatStatusLabel(gameplay.status)}
            </span>
            <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-neutral-300">
              {gameplay.mode === 'enabled' ? 'Gameplay enabled' : 'Gameplay disabled'}
            </span>
            {gameplay.encounter && (
              <>
                <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-neutral-300">
                  {formatStatusLabel(gameplay.encounter.status)}
                </span>
                <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-neutral-300">
                  Round {gameplay.encounter.round}
                </span>
              </>
            )}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl lowercase text-neutral-100">characters</h2>
          <span className="font-eskapade text-xs text-neutral-500">{roomData.participants.length}</span>
        </div>
        {roomData.participants.length > 0 ? (
          roomData.participants.map((participant) => (
            <CharacterStatusCard key={participant.tokenId} participant={participant} roomData={roomData} />
          ))
        ) : (
          <p className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4 font-eskapade text-sm text-neutral-500">
            No public participants are currently eligible for this room.
          </p>
        )}
      </section>

      {gameplay?.monsters.length ? (
        <section className="space-y-3">
          <h2 className="font-display text-2xl lowercase text-neutral-100">monsters</h2>
          {gameplay.monsters.map((monster) => (
            <article key={monster.id} className={`rounded-xl border p-3 font-eskapade ${getMonsterToneClassName(monster)}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm">{monster.name}</p>
                <p className="text-xs">{formatStatusLabel(monster.status)}</p>
              </div>
              <p className="mt-1 text-xs opacity-80">
                {monster.archetype} · {formatStatusLabel(monster.hpBand)}
              </p>
            </article>
          ))}
        </section>
      ) : null}

      {hasGameplayRewards(gameplay) && rewards && (
        <section className="rounded-2xl border border-soul-accent/30 bg-soul-accent/10 p-4 shadow-2xl">
          <p className="font-eskapade text-xs uppercase tracking-[0.22em] text-soul-accent/80">Rewards</p>
          {rewards.victoryText && (
            <p className="mt-2 font-eskapade text-sm leading-relaxed text-neutral-300">{rewards.victoryText}</p>
          )}
          {rewards.temporaryBoons.length > 0 && (
            <p className="mt-2 font-eskapade text-xs text-neutral-400">Boons: {rewards.temporaryBoons.join(', ')}</p>
          )}
          {rewards.narrativeRewards.length > 0 && (
            <p className="mt-2 font-eskapade text-xs text-neutral-400">Narrative: {rewards.narrativeRewards.join(', ')}</p>
          )}
        </section>
      )}
    </aside>
  );
}
