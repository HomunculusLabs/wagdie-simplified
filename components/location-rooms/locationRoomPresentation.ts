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

export function getPublicRoomMessageDomain(message: PublicRoomMessage): PublicRoomMessage['messageDomain'] | undefined {
  if (message.messageDomain) return message.messageDomain;
  if (message.gameplayMessageKind) return 'combat';
  if (message.authorKind === 'game_master' || message.authorKind === 'agent') return 'narrative';
  return undefined;
}

export function getPublicRoomMessageKind(message: PublicRoomMessage): PublicRoomMessage['messageKind'] | undefined {
  if (message.messageKind) return message.messageKind;
  if (message.gameplayMessageKind) return message.gameplayMessageKind;
  if (message.authorKind === 'game_master') return 'gm_beat';
  if (message.authorKind === 'agent') return 'character_reaction';
  return undefined;
}

export function getPublicRoomMessagePhase(message: PublicRoomMessage): PublicRoomMessage['ttrpgPhase'] | undefined {
  if (message.ttrpgPhase) return message.ttrpgPhase;
  const domain = getPublicRoomMessageDomain(message);
  if (domain === 'combat') return 'combat';
  if (domain === 'narrative') return 'story';
  return undefined;
}

export function getGameplayMessageLabel(message: PublicRoomMessage): string | null {
  const domain = getPublicRoomMessageDomain(message);
  const kind = getPublicRoomMessageKind(message);

  if (domain === 'combat' && kind === 'gm_setup') return 'Combat setup';
  if (domain === 'combat' && kind === 'character_action') return 'Combat action';
  if (domain === 'combat' && kind === 'roll_card') return 'Roll/check result';
  if (domain === 'combat' && kind === 'gm_outcome') return 'Combat outcome';
  if (domain === 'narrative' && kind === 'gm_beat') return 'Story beat';
  if (domain === 'narrative' && kind === 'character_reaction') return 'Character reaction';
  if (domain === 'narrative' && kind === 'character_action') return 'Scene action';
  if (domain === 'narrative' && kind === 'roll_card') return 'Scene check';
  if (domain === 'narrative' && kind === 'gm_outcome') return 'Scene outcome';
  if (kind === 'gm_setup') return 'GM setup';
  if (kind === 'character_action') return 'Character action';
  if (kind === 'roll_card') return 'Roll/check result';
  if (kind === 'gm_outcome') return 'GM outcome';
  if (kind === 'gm_beat') return 'Story beat';
  return null;
}

export function getMessageToneClassName(message: PublicRoomMessage): string {
  const domain = getPublicRoomMessageDomain(message);
  const kind = getPublicRoomMessageKind(message);

  if (domain === 'combat' && kind === 'gm_setup') {
    return 'border-soul-accent/40 bg-soul-accent/10 shadow-[0_0_30px_rgba(180,130,255,0.10)]';
  }

  if (domain === 'combat' && kind === 'character_action') {
    return 'border-amber-500/35 bg-amber-500/10 shadow-[0_0_30px_rgba(245,158,11,0.08)]';
  }

  if (domain === 'combat' && kind === 'roll_card') {
    return 'border-cyan-400/35 bg-cyan-500/10 shadow-[0_0_30px_rgba(34,211,238,0.08)]';
  }

  if (domain === 'combat' && kind === 'gm_outcome') {
    return 'border-rose-500/35 bg-rose-500/10 shadow-[0_0_30px_rgba(244,63,94,0.08)]';
  }

  if (domain === 'narrative' && kind === 'gm_beat') {
    return 'border-soul-accent/30 bg-soul-accent/10';
  }

  if (domain === 'narrative' && kind === 'character_reaction') {
    return 'border-sky-500/25 bg-sky-500/10 shadow-[0_0_30px_rgba(14,165,233,0.06)]';
  }

  if (domain === 'narrative' && kind === 'character_action') {
    return 'border-sky-500/30 bg-sky-500/10 shadow-[0_0_30px_rgba(14,165,233,0.06)]';
  }

  if (domain === 'narrative' && kind === 'roll_card') {
    return 'border-teal-400/35 bg-teal-500/10 shadow-[0_0_30px_rgba(45,212,191,0.08)]';
  }

  if (domain === 'narrative' && kind === 'gm_outcome') {
    return 'border-soul-accent/35 bg-soul-accent/10 shadow-[0_0_30px_rgba(180,130,255,0.08)]';
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

export type CurrentBeatSummary = {
  message: PublicRoomMessage;
  sequence: number;
  speakerName: string;
  isGameMaster: boolean;
  label: string | null;
  domain: string | null;
  phase: string | null;
  timeLabel: string;
  contentPreview: string;
  rollSummary: string | null;
};

export type TranscriptDisplayItem =
  | {
      type: 'message';
      key: string;
      message: PublicRoomMessage;
      isLatest: boolean;
      isContinuation: boolean;
    }
  | {
      type: 'new-activity-marker';
      key: string;
      beforeSequence: number;
      pendingLatestSequence: number;
      label: string;
    };

export interface TranscriptDisplayOptions {
  latestSequence: number | null;
  lastSeenSequence: number | null;
  pendingLatestSequence: number | null;
}

const CONTINUATION_WINDOW_MS = 5 * 60 * 1000;
const CURRENT_BEAT_PREVIEW_LENGTH = 220;

function publicSpeakerKey(message: PublicRoomMessage): string {
  if (message.authorKind === 'game_master') return 'game_master';
  if (message.tokenId != null) return `token:${message.tokenId}`;
  return `author:${message.authorKind}:${message.authorName}`;
}

function publicSpeakerName(roomData: PublicLocationRoomRead, message: PublicRoomMessage): string {
  if (message.authorKind === 'game_master') return 'Game Master';
  const participant = findParticipantForMessage(roomData.participants, message);
  return participant?.name ?? message.authorName;
}

function trimContentPreview(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= CURRENT_BEAT_PREVIEW_LENGTH) return normalized;
  return `${normalized.slice(0, CURRENT_BEAT_PREVIEW_LENGTH - 1).trimEnd()}…`;
}

function formatRelativeTime(value?: string | Date | null, now: Date = new Date()): string | null {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const diffMs = now.getTime() - date.getTime();
  const absoluteMs = Math.abs(diffMs);
  const suffix = diffMs >= 0 ? 'ago' : 'from now';
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absoluteMs < minute) return 'just now';
  if (absoluteMs < hour) return `${Math.round(absoluteMs / minute)}m ${suffix}`;
  if (absoluteMs < day) return `${Math.round(absoluteMs / hour)}h ${suffix}`;
  return formatDateTime(date.toISOString());
}

function rollSummary(message: PublicRoomMessage): string | null {
  const rolls = message.gameplayRolls;
  if (!rolls) return null;

  const label = rolls.action.checkLabel?.trim()
    || (rolls.action.checkType ? formatStatusLabel(rolls.action.checkType) : '')
    || formatStatusLabel(rolls.action.actionType);
  const total = rolls.action.total ?? rolls.action.roll?.total;
  const tier = rolls.action.tier ? formatStatusLabel(rolls.action.tier) : null;
  const parts = [label];

  if (total != null) parts.push(`total ${total}`);
  if (rolls.action.dc != null) parts.push(`DC ${rolls.action.dc}`);
  if (tier) parts.push(tier);

  return parts.filter(Boolean).join(' · ');
}

function isContinuationMessage(previous: PublicRoomMessage | null, message: PublicRoomMessage): boolean {
  if (!previous) return false;
  if (previous.gameplayRolls || message.gameplayRolls) return false;
  if (publicSpeakerKey(previous) !== publicSpeakerKey(message)) return false;
  if (getPublicRoomMessageDomain(previous) !== getPublicRoomMessageDomain(message)) return false;
  if (getPublicRoomMessagePhase(previous) !== getPublicRoomMessagePhase(message)) return false;

  const previousTime = new Date(previous.createdAt).getTime();
  const currentTime = new Date(message.createdAt).getTime();
  if (Number.isNaN(previousTime) || Number.isNaN(currentTime)) return false;

  return Math.abs(currentTime - previousTime) <= CONTINUATION_WINDOW_MS;
}

export function getLatestPublicSequence(roomData?: PublicLocationRoomRead | null): number | null {
  if (!roomData) return null;
  const messages = sortMessagesChronologically(roomData.messages);
  return roomData.activity?.latestSequence ?? messages.at(-1)?.sequence ?? null;
}

export function deriveCurrentBeatSummary(roomData: PublicLocationRoomRead): CurrentBeatSummary | null {
  const messages = sortMessagesChronologically(roomData.messages);
  if (messages.length === 0) return null;

  const latestSequence = getLatestPublicSequence(roomData);
  const message = messages.find((item) => latestSequence != null && item.sequence === latestSequence) ?? messages.at(-1);
  if (!message) return null;

  const domain = getPublicRoomMessageDomain(message) ?? null;
  const phase = getPublicRoomMessagePhase(message) ?? null;

  return {
    message,
    sequence: message.sequence,
    speakerName: publicSpeakerName(roomData, message),
    isGameMaster: message.authorKind === 'game_master',
    label: getGameplayMessageLabel(message),
    domain: domain ? formatStatusLabel(domain) : null,
    phase: phase ? formatStatusLabel(phase) : null,
    timeLabel: formatTime(message.createdAt),
    contentPreview: trimContentPreview(message.content),
    rollSummary: rollSummary(message),
  };
}

export function buildTranscriptDisplayItems(
  roomData: PublicLocationRoomRead,
  options: TranscriptDisplayOptions
): TranscriptDisplayItem[] {
  const messages = sortMessagesChronologically(roomData.messages);
  const items: TranscriptDisplayItem[] = [];
  const latestSequence = options.latestSequence;
  const lastSeenSequence = options.lastSeenSequence;
  const pendingLatestSequence = options.pendingLatestSequence;
  const shouldShowMarker =
    lastSeenSequence != null &&
    pendingLatestSequence != null &&
    pendingLatestSequence > lastSeenSequence;
  let markerInserted = false;
  let previousMessage: PublicRoomMessage | null = null;

  for (const message of messages) {
    if (shouldShowMarker && !markerInserted && message.sequence > lastSeenSequence) {
      items.push({
        type: 'new-activity-marker',
        key: `new-activity:${message.sequence}`,
        beforeSequence: message.sequence,
        pendingLatestSequence,
        label: 'New activity — jump to latest',
      });
      markerInserted = true;
    }

    items.push({
      type: 'message',
      key: `message:${message.id || message.sequence}`,
      message,
      isLatest: latestSequence != null && message.sequence === latestSequence,
      isContinuation: isContinuationMessage(previousMessage, message),
    });
    previousMessage = message;
  }

  return items;
}

export function formatLiveFreshnessLabel(
  roomData: PublicLocationRoomRead,
  lastFetchedAt: Date | null,
  now: Date = new Date()
): string {
  const latestMessage = formatRelativeTime(roomData.activity?.latestMessageCreatedAt, now);
  if (latestMessage) return `Updated ${latestMessage}`;

  const fetched = formatRelativeTime(lastFetchedAt, now);
  if (fetched) return `Fetched ${fetched}`;

  const generated = formatRelativeTime(roomData.activity?.generatedAt, now);
  if (generated) return `Generated ${generated}`;

  return 'Freshness pending';
}
