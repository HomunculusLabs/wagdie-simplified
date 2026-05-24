import type { PublicLocationRoomRead } from '@/lib/eliza/locationRooms/types';

export type PublicRoomMessage = PublicLocationRoomRead['messages'][number];
export type PublicRoomParticipant = PublicLocationRoomRead['participants'][number];
export type PublicRoomGameplay = NonNullable<PublicLocationRoomRead['gameplay']>;
export type PublicRoomGameplayCharacter = PublicRoomGameplay['characters'][number];
export type PublicRoomGameplayMonster = PublicRoomGameplay['monsters'][number];

export function formatDateTime(value?: string | null): string {
  if (!value) return 'Unavailable';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(value?: string | null): string {
  if (!value) return 'Unavailable';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatStatusLabel(value?: string | null): string {
  if (!value) return 'Unknown';

  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatCount(noun: string, count: number): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function getGameplayMessageLabel(message: PublicRoomMessage): string | null {
  if (message.gameplayMessageKind === 'gm_setup') return 'GM setup';
  if (message.gameplayMessageKind === 'character_action') return 'Character action';
  if (message.gameplayMessageKind === 'gm_outcome') return 'GM outcome';
  if (message.authorKind === 'game_master') return 'Story beat';
  return null;
}

export function getMessageToneClassName(message: PublicRoomMessage): string {
  if (message.gameplayMessageKind === 'gm_setup') {
    return 'border-soul-accent/40 bg-soul-accent/10 shadow-[0_0_30px_rgba(180,130,255,0.10)]';
  }

  if (message.gameplayMessageKind === 'character_action') {
    return 'border-amber-500/35 bg-amber-500/10 shadow-[0_0_30px_rgba(245,158,11,0.08)]';
  }

  if (message.gameplayMessageKind === 'gm_outcome') {
    return 'border-rose-500/35 bg-rose-500/10 shadow-[0_0_30px_rgba(244,63,94,0.08)]';
  }

  if (message.authorKind === 'game_master') {
    return 'border-soul-accent/30 bg-soul-accent/10';
  }

  return 'border-neutral-800/70 bg-neutral-950/70';
}

export function getStatusToneClassName(status?: string | null, hpBand?: string | null): string {
  if (status === 'dead' || hpBand === 'dead') return 'border-red-500/35 bg-red-500/10 text-red-100';
  if (status === 'downed' || hpBand === 'down' || hpBand === 'critical') return 'border-amber-500/35 bg-amber-500/10 text-amber-100';
  if (status === 'fled' || hpBand === 'fled') return 'border-neutral-700 bg-neutral-900/70 text-neutral-400';
  if (hpBand === 'injured') return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-100';
  if (status === 'alive' || hpBand === 'healthy') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
  return 'border-neutral-800 bg-neutral-900/70 text-neutral-300';
}

export function getMonsterToneClassName(monster: PublicRoomGameplayMonster): string {
  if (monster.status === 'dead' || monster.hpBand === 'dead') {
    return 'border-neutral-700 bg-neutral-900/70 text-neutral-500';
  }

  if (monster.hpBand === 'critical' || monster.hpBand === 'injured') {
    return 'border-rose-500/35 bg-rose-500/10 text-rose-100';
  }

  return 'border-red-500/35 bg-red-500/10 text-red-100';
}

export function sortMessagesChronologically(messages: PublicRoomMessage[]): PublicRoomMessage[] {
  return [...messages].sort((a, b) => {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function findParticipantForMessage(
  participants: PublicRoomParticipant[],
  message: PublicRoomMessage
): PublicRoomParticipant | undefined {
  if (message.tokenId == null) return undefined;
  return participants.find((participant) => participant.tokenId === message.tokenId);
}

export function findGameplayCharacter(
  gameplay: PublicLocationRoomRead['gameplay'] | undefined,
  tokenId?: number | null
): PublicRoomGameplayCharacter | undefined {
  if (tokenId == null) return undefined;
  return gameplay?.characters.find((character) => character.tokenId === tokenId);
}

export function hasStaticStats(participant: PublicRoomParticipant): boolean {
  return Boolean(
    participant.characterClass ||
    participant.level != null ||
    participant.maxHp != null ||
    participant.ac != null ||
    participant.speed != null ||
    Object.values(participant.coreStats ?? {}).some((value) => value != null)
  );
}

export function hasGameplayRewards(gameplay?: PublicLocationRoomRead['gameplay']): boolean {
  const rewards = gameplay?.pendingRewardSummary;
  return Boolean(
    rewards?.victoryText ||
    rewards?.temporaryBoons.length ||
    rewards?.narrativeRewards.length
  );
}
