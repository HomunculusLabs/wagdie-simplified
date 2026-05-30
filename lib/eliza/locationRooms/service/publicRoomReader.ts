import { elizaConfig } from '@/lib/eliza/config'
import type {
  LocationRoomMessage,
  LocationRoomMessageDomain,
  LocationRoomMessageKind,
  LocationRoomParticipant,
  LocationRoomTtrpgPhase,
  PublicGameplayStatusBand,
  PublicLocationRoomGameplayMessageKind,
  PublicLocationRoomGameplaySummary,
  PublicLocationRoomMessage,
  PublicLocationRoomParticipant,
  PublicLocationRoomRead,
  PublicLocationRoomTtrpgSummary,
} from '../types'
import {
  LOCATION_ROOM_MESSAGE_DOMAINS,
  LOCATION_ROOM_MESSAGE_KINDS,
  LOCATION_ROOM_TTRPG_PHASES,
} from '../types'
import type { LocationRoomRepository } from '../repository'
import type { LocationRoomMembershipRepository } from '../membership'
import type { LocationRoomNarrativeRepository } from '../narrativeRepository'
import { normalizeNarrativeTtrpgMetadata } from '../narrativeTypes'
import type { LocationRoomGameplayRepository } from '../gameplay/repository'
import type { GameplayCharacterState, GameplayEncounter, GameplayRoomState } from '../gameplay/types'
import { parseGameplayMonsters, parseGameplayRewardPlan } from '../gameplay/rules'
import { sanitizePublicGameplayRolls } from '../gameplay/publicRolls'
import { projectFeaturedPublicLocationRoomAdventure } from '../publicAdventure'
import { isLocationRoomGameplayEnabledForLocation } from './configGuards'
import { LocationRoomNotFoundError } from './errors'
import { isCanonicalLocationAlias, resolveCanonicalLocationRoomId } from './identity'

function normalizePage(value: string | null): number {
  const page = value ? Number(value) : 1
  return Number.isInteger(page) && page >= 1 ? page : 1
}

function normalizePageSize(value: string | null): number {
  const pageSize = value ? Number(value) : 20
  if (!Number.isInteger(pageSize)) return 20
  return Math.min(50, Math.max(1, pageSize))
}

function toPublicParticipant(participant: LocationRoomParticipant): PublicLocationRoomParticipant {
  return {
    tokenId: participant.tokenId,
    name: participant.name,
    imageUrl: participant.imageUrl,
    characterClass: participant.characterClass ?? null,
    level: participant.level ?? null,
    coreStats: participant.coreStats ?? null,
    maxHp: participant.maxHp ?? null,
    ac: participant.ac ?? null,
    speed: participant.speed ?? null,
  }
}

const PUBLIC_GAMEPLAY_MESSAGE_KINDS: readonly PublicLocationRoomGameplayMessageKind[] = [
  'gm_setup',
  'character_action',
  'roll_card',
  'gm_outcome',
]

function hasPublicStringValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number])
}

function toPublicGameplayMessageKind(metadata: Record<string, unknown>): PublicLocationRoomGameplayMessageKind | undefined {
  const value = metadata.gameplayMessageKind
  return hasPublicStringValue(PUBLIC_GAMEPLAY_MESSAGE_KINDS, value)
    ? value
    : undefined
}

function toPublicMessageDomain(
  message: LocationRoomMessage,
  gameplayMessageKind: PublicLocationRoomGameplayMessageKind | undefined
): LocationRoomMessageDomain | undefined {
  const value = message.metadata.messageDomain
  if (hasPublicStringValue(LOCATION_ROOM_MESSAGE_DOMAINS, value)) return value
  if (gameplayMessageKind) return 'combat'
  if (message.authorKind === 'game_master' || message.authorKind === 'agent') return 'narrative'
  return undefined
}

function toPublicMessageKind(
  message: LocationRoomMessage,
  gameplayMessageKind: PublicLocationRoomGameplayMessageKind | undefined
): LocationRoomMessageKind | undefined {
  const value = message.metadata.messageKind
  if (hasPublicStringValue(LOCATION_ROOM_MESSAGE_KINDS, value)) return value
  if (gameplayMessageKind) return gameplayMessageKind
  if (message.authorKind === 'game_master') return 'gm_beat'
  if (message.authorKind === 'agent') return 'character_reaction'
  return undefined
}

function toPublicMessagePhase(
  metadata: Record<string, unknown>,
  messageDomain: LocationRoomMessageDomain | undefined
): LocationRoomTtrpgPhase | undefined {
  if (hasPublicStringValue(LOCATION_ROOM_TTRPG_PHASES, metadata.ttrpgPhase)) return metadata.ttrpgPhase
  if (messageDomain === 'combat') return 'combat'
  if (messageDomain === 'narrative') return 'story'
  return undefined
}

function toPublicTtrpgSummary(metadata: Record<string, unknown> | null | undefined): PublicLocationRoomTtrpgSummary {
  const ttrpg = normalizeNarrativeTtrpgMetadata(metadata)
  return {
    phase: ttrpg.ttrpgPhase,
    combatReadiness: ttrpg.combatReadiness,
    threatLevel: ttrpg.threatLevel,
  }
}

function toPublicMessage(message: LocationRoomMessage): PublicLocationRoomMessage {
  const gameplayMessageKind = toPublicGameplayMessageKind(message.metadata)
  const messageDomain = toPublicMessageDomain(message, gameplayMessageKind)
  const messageKind = toPublicMessageKind(message, gameplayMessageKind)
  const ttrpgPhase = toPublicMessagePhase(message.metadata, messageDomain)
  const gameplayRolls = sanitizePublicGameplayRolls(message.metadata.publicRolls)
  const adventure = projectFeaturedPublicLocationRoomAdventure(message.metadata)

  return {
    id: message.id,
    sequence: message.sequence,
    authorKind: message.authorKind,
    tokenId: message.tokenId,
    authorName: message.authorName,
    content: message.content,
    createdAt: message.createdAt,
    ...(messageDomain ? { messageDomain } : {}),
    ...(messageKind ? { messageKind } : {}),
    ...(ttrpgPhase ? { ttrpgPhase } : {}),
    ...(gameplayMessageKind ? { gameplayMessageKind } : {}),
    ...(gameplayRolls ? { gameplayRolls } : {}),
    ...(adventure ? { adventure } : {}),
  }
}

function toStatusBand(hp: number | null | undefined, maxHp: number | null | undefined, status?: string | null): PublicGameplayStatusBand {
  if (status === 'dead') return 'dead'
  if (status === 'fled') return 'fled'
  if (status === 'downed') return 'down'
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || !maxHp) return 'unknown'
  if ((hp ?? 0) <= 0) return 'down'

  const ratio = (hp ?? 0) / Math.max(1, maxHp ?? 1)
  if (ratio <= 0.25) return 'critical'
  if (ratio <= 0.65) return 'injured'
  return 'healthy'
}

async function toPublicGameplaySummary(params: {
  locationId: string
  participants: LocationRoomParticipant[]
  state: GameplayRoomState | null
  encounter: GameplayEncounter | null
}): Promise<PublicLocationRoomGameplaySummary | undefined> {
  const enabled = isLocationRoomGameplayEnabledForLocation(params.locationId)
  if (!enabled) return undefined

  const state = params.state
  const encounter = params.encounter
  const monsters = encounter ? parseGameplayMonsters(encounter.monsterState) : []
  const rewardPlan = encounter ? parseGameplayRewardPlan(encounter.rewardPlan) : null
  const characters = params.participants.map((participant) => {
    const character = state?.characters[String(participant.tokenId)] as GameplayCharacterState | undefined
    const status = character?.status ?? 'alive'

    return {
      tokenId: participant.tokenId,
      name: character?.name ?? participant.name ?? null,
      status,
      hpBand: toStatusBand(character?.hp, character?.maxHp, character?.status),
    }
  })

  return {
    mode: enabled ? 'enabled' : 'disabled',
    status: state?.status ?? 'idle',
    encounter: encounter ? {
      publicTitle: encounter.publicTitle,
      publicSummary: encounter.publicSummary,
      status: encounter.status,
      round: encounter.roundNumber,
    } : null,
    characters,
    monsters: monsters.map((monster) => ({
      id: monster.id,
      name: monster.name,
      archetype: monster.archetype,
      status: monster.status,
      hpBand: toStatusBand(monster.hp, monster.maxHp, monster.status),
    })),
    pendingRewardSummary: rewardPlan ? {
      victoryText: rewardPlan.victoryText,
      temporaryBoons: rewardPlan.temporaryBoons,
      narrativeRewards: rewardPlan.narrativeRewards,
    } : null,
  }
}

function latestMessageFromPage(messages: LocationRoomMessage[], page: number): LocationRoomMessage | null {
  return page === 1 && messages.length > 0 ? messages[messages.length - 1] : null
}

export class LocationRoomPublicRoomReader {
  constructor(
    private readonly repository: LocationRoomRepository,
    private readonly membership: LocationRoomMembershipRepository,
    private readonly gameplayRepository: LocationRoomGameplayRepository,
    private readonly narrativeRepository: LocationRoomNarrativeRepository
  ) {}

  async getPublicRoom(locationId: string, params: { page?: string | null; pageSize?: string | null } = {}): Promise<PublicLocationRoomRead> {
    const canonicalLocationId = resolveCanonicalLocationRoomId(locationId)
    const location = await this.repository.getLocation(canonicalLocationId)
    if (!location) {
      throw new LocationRoomNotFoundError(canonicalLocationId)
    }

    const room = await this.repository.ensureRoomForLocation(canonicalLocationId)
    const participants = await this.membership.listEligibleParticipantsByLocation(canonicalLocationId)
    const page = normalizePage(params.page ?? null)
    const pageSize = normalizePageSize(params.pageSize ?? null)
    const messages = await this.repository.listPublicMessages({ roomId: room.id, page, pageSize })
    const messageStats = await this.repository.getPublicMessageStats(room.id)
    const latestPageMessage = latestMessageFromPage(messages.messages, page)
    const gameplayEnabled = isLocationRoomGameplayEnabledForLocation(canonicalLocationId)
    const activeRun = gameplayEnabled
      ? await this.gameplayRepository.findActiveRunByRoomId(room.id)
      : null
    const gameplayState = gameplayEnabled
      ? await this.gameplayRepository.findStateByRoomId(room.id)
      : null
    const gameplayEncounter = gameplayEnabled
      ? gameplayState?.activeEncounterId
        ? await this.gameplayRepository.findEncounterById(gameplayState.activeEncounterId)
        : await this.gameplayRepository.findActiveEncounterByRoomId(room.id)
      : null
    const gameplay = await toPublicGameplaySummary({
      locationId: canonicalLocationId,
      participants,
      state: gameplayState,
      encounter: gameplayEncounter,
    })
    const narrativeState = elizaConfig.locationRooms.narrative.enabled
      ? await this.narrativeRepository.findStateByRoomId(room.id)
      : null
    const ttrpg = narrativeState ? toPublicTtrpgSummary(narrativeState.metadata) : undefined

    return {
      room: {
        id: room.id,
        locationId: room.locationId,
        locationName: location.name,
        tickEnabled: room.tickEnabled,
        lastTickAt: room.lastTickAt,
        nextTickAt: room.nextTickAt,
        tickCount: room.tickCount,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      },
      identity: {
        requestedLocationId: locationId,
        canonicalLocationId,
        canonicalLocationName: location.name,
        isAlias: isCanonicalLocationAlias(locationId, canonicalLocationId),
      },
      activity: {
        generatedAt: new Date().toISOString(),
        messageCount: Math.max(messages.total, messageStats.messageCount),
        latestSequence: messageStats.latestSequence ?? latestPageMessage?.sequence ?? null,
        latestMessageCreatedAt: messageStats.latestCreatedAt ?? latestPageMessage?.createdAt ?? null,
        lastTickAt: room.lastTickAt,
        tickCount: room.tickCount,
        ...(activeRun ? {
          completedTurnCount: activeRun.completedTurns,
          targetTurnCount: activeRun.targetCompletedTurns,
        } : {}),
      },
      participants: participants.map(toPublicParticipant),
      messages: messages.messages.map(toPublicMessage),
      ...(ttrpg ? { ttrpg } : {}),
      ...(gameplay ? { gameplay } : {}),
      pagination: {
        page: messages.page,
        pageSize: messages.pageSize,
        total: messages.total,
        hasMore: messages.hasMore,
      },
    }
  }
}
