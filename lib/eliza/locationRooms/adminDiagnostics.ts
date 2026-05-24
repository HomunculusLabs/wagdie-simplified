import { elizaConfig } from '@/lib/eliza/config'
import {
  gameMasterAgentService,
  type GameMasterAgentResolution,
} from '@/lib/eliza/gameMasterAgent/service'
import {
  locationRoomRepository,
  type LocationRoomRepository,
} from './repository'
import {
  locationRoomMembershipRepository,
  type LocationRoomMembershipRepository,
} from './membership'
import {
  locationRoomNarrativeRepository,
  type LocationRoomNarrativeRepository,
} from './narrativeRepository'
import {
  locationRoomGameplayRepository,
  type LocationRoomGameplayRepository,
} from './gameplay/repository'
import type {
  LocationRoom,
  LocationRoomLocationDetails,
  LocationRoomParticipant,
  LocationRoomTick,
} from './types'
import type { GameplayRun } from './gameplay/types'

export type LocationRoomRecommendedNextAction =
  | 'healthy'
  | 'location_not_found'
  | 'use_canonical_location_11'
  | 'enable_location_rooms'
  | 'configure_official_elizaos'
  | 'configure_game_master'
  | 'stake_or_sync_participants'
  | 'enable_room_ticks'
  | 'trigger_location_room_tick'
  | 'run_location_room_worker'
  | 'inspect_failed_tick'
  | 'wait_for_next_tick'

export type LocationRoomHealthDiagnostics = {
  generatedAt: string
  location: {
    id: string
    name: string | null
    chainLocationId: string | null
    active: boolean | null
    exists: boolean
  }
  canonical: {
    requestedLocationId: string
    canonicalLocationId: string | null
    isCanonical: boolean
    hints: string[]
  }
  config: {
    locationRoomsEnabled: boolean
    officialElizaOsConfigured: boolean
    narrativeEnabled: boolean
    gameplayEnabledForLocation: boolean
    tickIntervalMinutes: number
    maxTicksPerRun: number
  }
  gmReadiness: {
    required: boolean
    ready: boolean
    source: GameMasterAgentResolution['source']
    officialAgentId: string | null
    safeError: string | null
  }
  participants: {
    count: number
    minimumRequired: number
    sample: Array<{ tokenId: number; name: string }>
  }
  room: {
    exists: boolean
    id: string | null
    tickEnabled: boolean | null
    lastTickAt: string | null
    nextTickAt: string | null
    tickCount: number | null
    lastError: string | null
    createdAt: string | null
    updatedAt: string | null
  }
  ticks: {
    active: LocationRoomHealthTickSummary[]
    recent: LocationRoomHealthTickSummary[]
  }
  publicTranscript: {
    messageCount: number
    latestSequence: number | null
    latestCreatedAt: string | null
  }
  narrative: {
    enabled: boolean
    link: string | null
    stateExists: boolean
    stateUpdatedAt: string | null
    currentObjective: string | null
    latestBeat: {
      status: string
      selectedTokenId: number | null
      completedAt: string | null
      lastError: string | null
    } | null
  }
  gameplay: {
    enabled: boolean
    link: string | null
    stateStatus: string | null
    activeEncounterStatus: string | null
    recentTurnCount: number
    latestTurnStatus: string | null
    rewardClaimCount: number
    activeRun: LocationRoomHealthGameplayRunSummary | null
    recentRuns: LocationRoomHealthGameplayRunSummary[]
  }
  recommendedNextAction: LocationRoomRecommendedNextAction
}

type LocationRoomHealthGameplayRunSummary = {
  id: string
  status: GameplayRun['status']
  targetCompletedTurns: number
  completedTurns: number
  remainingTurns: number
  startedByActor: GameplayRun['startedByActor']
  startedByTokenId: number | null
  lastTickId: string | null
  lastAdvancedAt: string | null
  completedAt: string | null
  stopReason: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

type LocationRoomHealthTickSummary = {
  id: string
  status: LocationRoomTick['status']
  attempts: number
  triggerType: LocationRoomTick['triggerType']
  selectedTokenId: number | null
  nextAttemptAt: string
  startedAt: string | null
  completedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

type GameMasterResolver = Pick<typeof gameMasterAgentService, 'resolveActiveGameMasterAgent'>

export type LocationRoomAdminDiagnosticsDeps = {
  roomRepository?: LocationRoomRepository
  membershipRepository?: LocationRoomMembershipRepository
  narrativeRepository?: LocationRoomNarrativeRepository
  gameplayRepository?: LocationRoomGameplayRepository
  gameMasterResolver?: GameMasterResolver
  now?: () => Date
}

const MINIMUM_PARTICIPANTS = 2
const ACTIVE_TICK_LIMIT = 25
const RECENT_TICK_LIMIT = 10
const SAFE_ROOM_ERROR = 'Location room operation failed. Check server logs for details.'
const SAFE_TICK_ERROR = 'Location room tick failed. Check server logs for details.'
const SAFE_NARRATIVE_ERROR = 'Narrative beat failed. Check server logs for details.'
const SAFE_GAMEPLAY_ERROR = 'Gameplay operation failed. Check server logs for details.'
const CROWS_DEN_ALIAS_ID = 'crows_den'
const CROWS_DEN_CANONICAL_ID = '11'

function sanitizeStoredError(value: string | null | undefined, fallback: string): string | null {
  return value && value.trim() ? fallback : null
}

function serializeRun(run: GameplayRun): LocationRoomHealthGameplayRunSummary {
  return {
    id: run.id,
    status: run.status,
    targetCompletedTurns: run.targetCompletedTurns,
    completedTurns: run.completedTurns,
    remainingTurns: Math.max(0, run.targetCompletedTurns - run.completedTurns),
    startedByActor: run.startedByActor,
    startedByTokenId: run.startedByTokenId,
    lastTickId: run.lastTickId,
    lastAdvancedAt: run.lastAdvancedAt,
    completedAt: run.completedAt,
    stopReason: run.stopReason,
    lastError: sanitizeStoredError(run.lastError, SAFE_GAMEPLAY_ERROR),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

function serializeTick(tick: LocationRoomTick): LocationRoomHealthTickSummary {
  return {
    id: tick.id,
    status: tick.status,
    attempts: tick.attempts,
    triggerType: tick.triggerType,
    selectedTokenId: tick.selectedTokenId,
    nextAttemptAt: tick.nextAttemptAt,
    startedAt: tick.startedAt,
    completedAt: tick.completedAt,
    lastError: sanitizeStoredError(tick.lastError, SAFE_TICK_ERROR),
    createdAt: tick.createdAt,
    updatedAt: tick.updatedAt,
  }
}

function isDue(tick: Pick<LocationRoomTick, 'nextAttemptAt'>, now: Date): boolean {
  return new Date(tick.nextAttemptAt).getTime() <= now.getTime()
}

function isGameplayEnabledForLocation(locationId: string): boolean {
  const gameplay = elizaConfig.locationRooms.gameplay
  if (!gameplay.enabled) return false

  const normalizedLocationId = locationId.trim().toLowerCase()
  return gameplay.locationAllowlist.some((allowedLocationId) =>
    allowedLocationId.trim().toLowerCase() === normalizedLocationId
  )
}

function sampleParticipants(participants: LocationRoomParticipant[]) {
  return participants.slice(0, 5).map((participant) => ({
    tokenId: participant.tokenId,
    name: participant.name,
  }))
}

function buildCanonicalHints(
  requestedLocationId: string,
  location: LocationRoomLocationDetails | null,
  relatedLocations: LocationRoomLocationDetails[]
) {
  const normalizedRequested = requestedLocationId.trim().toLowerCase()
  const canonical = relatedLocations.find((candidate) => candidate.id === CROWS_DEN_CANONICAL_ID) ?? null
  const hints: string[] = []
  let canonicalLocationId: string | null = null

  if (normalizedRequested === CROWS_DEN_ALIAS_ID) {
    canonicalLocationId = CROWS_DEN_CANONICAL_ID
    hints.push('The legacy crows_den location is not chain-backed; use canonical location 11 for The Crow\'s Den.')
  } else if (requestedLocationId === CROWS_DEN_CANONICAL_ID) {
    canonicalLocationId = CROWS_DEN_CANONICAL_ID
    if (relatedLocations.some((candidate) => candidate.id === CROWS_DEN_ALIAS_ID)) {
      hints.push('Legacy duplicate crows_den exists; do not move staking or room state away from location 11.')
    }
  } else if (location?.chainLocationId) {
    canonicalLocationId = location.id
  }

  if (canonical && requestedLocationId !== canonical.id && normalizedRequested === CROWS_DEN_ALIAS_ID) {
    hints.push(`Canonical row found: ${canonical.name} (${canonical.id}).`)
  }

  return {
    requestedLocationId,
    canonicalLocationId,
    isCanonical: !canonicalLocationId || requestedLocationId === canonicalLocationId,
    hints,
  }
}

function recommendedNextAction(input: {
  locationExists: boolean
  canonical: LocationRoomHealthDiagnostics['canonical']
  config: LocationRoomHealthDiagnostics['config']
  gmReadiness: LocationRoomHealthDiagnostics['gmReadiness']
  participantCount: number
  room: LocationRoom | null
  activeTicks: LocationRoomTick[]
  publicMessageCount: number
  now: Date
}): LocationRoomRecommendedNextAction {
  if (!input.locationExists) {
    return input.canonical.canonicalLocationId ? 'use_canonical_location_11' : 'location_not_found'
  }

  if (!input.canonical.isCanonical && input.canonical.canonicalLocationId === CROWS_DEN_CANONICAL_ID) {
    return 'use_canonical_location_11'
  }

  if (!input.config.locationRoomsEnabled) return 'enable_location_rooms'
  if (!input.config.officialElizaOsConfigured) return 'configure_official_elizaos'
  if (input.gmReadiness.required && !input.gmReadiness.ready) return 'configure_game_master'
  if (input.participantCount < MINIMUM_PARTICIPANTS) return 'stake_or_sync_participants'
  if (!input.room) return 'trigger_location_room_tick'
  if (!input.room.tickEnabled) return 'enable_room_ticks'

  const dueActive = input.activeTicks.find((tick) => isDue(tick, input.now))
  if (dueActive) return 'run_location_room_worker'
  if (input.activeTicks.some((tick) => tick.status === 'failed')) return 'inspect_failed_tick'
  if (input.publicMessageCount === 0) return 'trigger_location_room_tick'
  if (!input.room.nextTickAt || new Date(input.room.nextTickAt).getTime() <= input.now.getTime()) {
    return 'run_location_room_worker'
  }

  return 'healthy'
}

export class LocationRoomAdminDiagnosticsService {
  private readonly roomRepository: LocationRoomRepository
  private readonly membershipRepository: LocationRoomMembershipRepository
  private readonly narrativeRepository: LocationRoomNarrativeRepository
  private readonly gameplayRepository: LocationRoomGameplayRepository
  private readonly gameMasterResolver: GameMasterResolver
  private readonly now: () => Date

  constructor(deps: LocationRoomAdminDiagnosticsDeps = {}) {
    this.roomRepository = deps.roomRepository ?? locationRoomRepository
    this.membershipRepository = deps.membershipRepository ?? locationRoomMembershipRepository
    this.narrativeRepository = deps.narrativeRepository ?? locationRoomNarrativeRepository
    this.gameplayRepository = deps.gameplayRepository ?? locationRoomGameplayRepository
    this.gameMasterResolver = deps.gameMasterResolver ?? gameMasterAgentService
    this.now = deps.now ?? (() => new Date())
  }

  async inspectLocation(locationId: string): Promise<LocationRoomHealthDiagnostics> {
    const now = this.now()
    const relatedIds = locationId === CROWS_DEN_ALIAS_ID || locationId === CROWS_DEN_CANONICAL_ID
      ? [CROWS_DEN_CANONICAL_ID, CROWS_DEN_ALIAS_ID]
      : []

    const [location, relatedLocations, gmResolutionResult] = await Promise.all([
      this.roomRepository.getLocationDetails(locationId),
      this.roomRepository.listLocationsByIds(relatedIds),
      this.gameMasterResolver.resolveActiveGameMasterAgent()
        .then((resolution) => ({ resolution, error: null as unknown }))
        .catch((error) => ({ resolution: null, error })),
    ])

    const canonical = buildCanonicalHints(locationId, location, relatedLocations)
    const gmResolution = gmResolutionResult.resolution ?? {
      source: 'missing' as const,
      officialAgentId: null,
      setting: null,
      envFallbackAgentId: null,
    }
    const gameplayEnabledForLocation = isGameplayEnabledForLocation(locationId)
    const config = {
      locationRoomsEnabled: elizaConfig.locationRooms.enabled,
      officialElizaOsConfigured: Boolean(elizaConfig.official.baseUrl),
      narrativeEnabled: elizaConfig.locationRooms.narrative.enabled,
      gameplayEnabledForLocation,
      tickIntervalMinutes: elizaConfig.locationRooms.tickIntervalMinutes,
      maxTicksPerRun: elizaConfig.locationRooms.maxTicksPerRun,
    }
    const gmRequired = config.narrativeEnabled || config.gameplayEnabledForLocation
    const gmReadiness = {
      required: gmRequired,
      ready: !gmRequired || Boolean(gmResolution.officialAgentId),
      source: gmResolution.source,
      officialAgentId: gmResolution.officialAgentId,
      safeError: gmResolutionResult.error
        ? 'Game-master agent readiness could not be resolved. Check server logs for details.'
        : gmRequired && !gmResolution.officialAgentId
          ? 'Game-master agent is not configured.'
          : null,
    }

    if (!location) {
      return {
        generatedAt: now.toISOString(),
        location: {
          id: locationId,
          name: null,
          chainLocationId: null,
          active: null,
          exists: false,
        },
        canonical,
        config,
        gmReadiness,
        participants: { count: 0, minimumRequired: MINIMUM_PARTICIPANTS, sample: [] },
        room: {
          exists: false,
          id: null,
          tickEnabled: null,
          lastTickAt: null,
          nextTickAt: null,
          tickCount: null,
          lastError: null,
          createdAt: null,
          updatedAt: null,
        },
        ticks: { active: [], recent: [] },
        publicTranscript: { messageCount: 0, latestSequence: null, latestCreatedAt: null },
        narrative: {
          enabled: config.narrativeEnabled,
          link: null,
          stateExists: false,
          stateUpdatedAt: null,
          currentObjective: null,
          latestBeat: null,
        },
        gameplay: {
          enabled: gameplayEnabledForLocation,
          link: null,
          stateStatus: null,
          activeEncounterStatus: null,
          recentTurnCount: 0,
          latestTurnStatus: null,
          rewardClaimCount: 0,
          activeRun: null,
          recentRuns: [],
        },
        recommendedNextAction: recommendedNextAction({
          locationExists: false,
          canonical,
          config,
          gmReadiness,
          participantCount: 0,
          room: null,
          activeTicks: [],
          publicMessageCount: 0,
          now,
        }),
      }
    }

    const [room, participants] = await Promise.all([
      this.roomRepository.findRoomByLocationId(locationId),
      this.membershipRepository.listEligibleParticipantsByLocation(locationId),
    ])

    const [activeTicks, recentTicks] = room
      ? await Promise.all([
        this.roomRepository.listActiveTicksForRoom(room.id, ACTIVE_TICK_LIMIT),
        this.roomRepository.listRecentTicksForRoom(room.id, RECENT_TICK_LIMIT),
      ])
      : [[], []]
    const publicTranscript = room
      ? await this.roomRepository.getPublicMessageStats(room.id)
      : { messageCount: 0, latestSequence: null, latestCreatedAt: null }

    const [
      narrativeState,
      latestBeats,
      gameplayState,
      activeEncounter,
      gameplayTurns,
      rewardClaims,
      activeRun,
      recentRuns,
    ] = room
      ? await Promise.all([
        config.narrativeEnabled ? this.narrativeRepository.findStateByRoomId(room.id) : Promise.resolve(null),
        config.narrativeEnabled ? this.narrativeRepository.listRecentBeatsByRoomId(room.id, 1) : Promise.resolve([]),
        gameplayEnabledForLocation ? this.gameplayRepository.findStateByRoomId(room.id) : Promise.resolve(null),
        gameplayEnabledForLocation ? this.gameplayRepository.findActiveEncounterByRoomId(room.id) : Promise.resolve(null),
        gameplayEnabledForLocation ? this.gameplayRepository.listRecentTurnsByRoomId(room.id, 5) : Promise.resolve([]),
        gameplayEnabledForLocation ? this.gameplayRepository.listRewardClaims({ roomId: room.id, limit: 5 }) : Promise.resolve([]),
        gameplayEnabledForLocation ? this.gameplayRepository.findActiveRunByRoomId(room.id) : Promise.resolve(null),
        gameplayEnabledForLocation ? this.gameplayRepository.listRecentRunsByRoomId(room.id, 5) : Promise.resolve([]),
      ])
      : [null, [], null, null, [], [], null, []] as const

    const latestBeat = latestBeats[0] ?? null
    const diagnostics: LocationRoomHealthDiagnostics = {
      generatedAt: now.toISOString(),
      location: {
        id: location.id,
        name: location.name,
        chainLocationId: location.chainLocationId,
        active: location.active,
        exists: true,
      },
      canonical,
      config,
      gmReadiness,
      participants: {
        count: participants.length,
        minimumRequired: MINIMUM_PARTICIPANTS,
        sample: sampleParticipants(participants),
      },
      room: {
        exists: Boolean(room),
        id: room?.id ?? null,
        tickEnabled: room?.tickEnabled ?? null,
        lastTickAt: room?.lastTickAt ?? null,
        nextTickAt: room?.nextTickAt ?? null,
        tickCount: room?.tickCount ?? null,
        lastError: sanitizeStoredError(room?.lastError, SAFE_ROOM_ERROR),
        createdAt: room?.createdAt ?? null,
        updatedAt: room?.updatedAt ?? null,
      },
      ticks: {
        active: activeTicks.map(serializeTick),
        recent: recentTicks.map(serializeTick),
      },
      publicTranscript,
      narrative: {
        enabled: config.narrativeEnabled,
        link: room ? `/api/admin/eliza/location-rooms/${encodeURIComponent(locationId)}/narrative` : null,
        stateExists: Boolean(narrativeState),
        stateUpdatedAt: narrativeState?.updatedAt ?? null,
        currentObjective: narrativeState?.currentObjective ?? null,
        latestBeat: latestBeat ? {
          status: latestBeat.status,
          selectedTokenId: latestBeat.selectedTokenId,
          completedAt: latestBeat.completedAt,
          lastError: sanitizeStoredError(latestBeat.lastError, SAFE_NARRATIVE_ERROR),
        } : null,
      },
      gameplay: {
        enabled: gameplayEnabledForLocation,
        link: room ? `/api/admin/eliza/location-rooms/${encodeURIComponent(locationId)}/gameplay` : null,
        stateStatus: gameplayState?.status ?? null,
        activeEncounterStatus: activeEncounter?.status ?? null,
        recentTurnCount: gameplayTurns.length,
        latestTurnStatus: gameplayTurns[0]?.status ?? null,
        rewardClaimCount: rewardClaims.length,
        activeRun: activeRun ? serializeRun(activeRun) : null,
        recentRuns: recentRuns.map(serializeRun),
      },
      recommendedNextAction: 'healthy',
    }

    diagnostics.recommendedNextAction = recommendedNextAction({
      locationExists: true,
      canonical,
      config,
      gmReadiness,
      participantCount: participants.length,
      room,
      activeTicks,
      publicMessageCount: publicTranscript.messageCount,
      now,
    })

    return diagnostics
  }
}

export const locationRoomAdminDiagnosticsService = new LocationRoomAdminDiagnosticsService()
