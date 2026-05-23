import { randomUUID } from 'crypto'
import { elizaConfig } from '@/lib/eliza/config'
import { gameMasterAgentService } from '@/lib/eliza/gameMasterAgent/service'
import type {
  EnqueueScheduledTicksResult,
  LocationRoom,
  LocationRoomMessage,
  LocationRoomParticipant,
  LocationRoomTick,
  LocationRoomWorkerResult,
  ProcessLocationRoomTickResult,
  PublicGameplayStatusBand,
  PublicLocationRoomGameplayMessageKind,
  PublicLocationRoomGameplaySummary,
  PublicLocationRoomMessage,
  PublicLocationRoomParticipant,
  PublicLocationRoomRead,
  RequestLocationRoomTickAndProcessResult,
  RequestLocationRoomTickInput,
  RequestLocationRoomTickResult,
} from './types'
import {
  locationRoomRepository,
  type LocationRoomRepository,
} from './repository'
import {
  locationRoomMembershipRepository,
  participantBelongsToWallet,
  type LocationRoomMembershipRepository,
} from './membership'
import {
  officialLocationRoomTurnGenerator,
  normalizeLocationRoomGeneratedContent,
  type OfficialLocationRoomTurnGenerator,
} from './officialTurnGenerator'
import {
  locationRoomNarrativeCoordinator,
  type GameMasterAgentResolver,
  type LocationRoomNarrativeCoordinator,
} from './narrativeCoordinator'
import {
  locationRoomGameplayCoordinator,
  type LocationRoomGameplayCoordinator,
} from './gameplay/coordinator'
import {
  locationRoomGameplayRepository,
  type LocationRoomGameplayRepository,
} from './gameplay/repository'
import { parseGameplayMonsters, parseGameplayRewardPlan } from './gameplay/rules'
import type { GameplayCharacterState, GameplayEncounter, GameplayRoomState } from './gameplay/types'
import { selectLocationRoomSpeaker as selectLocationRoomSpeakerInternal } from './speakerSelection'

const MIN_ELIGIBLE_PARTICIPANTS = 2
const MAX_TICK_ATTEMPTS = 3
const MAX_STORED_ERROR_LENGTH = 1000
const OWNER_MANUAL_TICK_COOLDOWN_MS = 5 * 60_000
const LEGACY_LOCATION_ALIASES = new Map<string, string>([
  ['crows_den', '11'],
])

function resolveCanonicalLocationRoomId(locationId: string): string {
  return LEGACY_LOCATION_ALIASES.get(locationId.trim().toLowerCase()) ?? locationId
}

export class LocationRoomNotFoundError extends Error {
  constructor(locationId: string) {
    super(`Location not found: ${locationId}`)
    this.name = 'LocationRoomNotFoundError'
  }
}

export class LocationRoomFeatureDisabledError extends Error {
  constructor() {
    super('Eliza location rooms are disabled')
    this.name = 'LocationRoomFeatureDisabledError'
  }
}

export class LocationRoomOfficialServiceDisabledError extends Error {
  constructor() {
    super('Official ElizaOS service is not configured')
    this.name = 'LocationRoomOfficialServiceDisabledError'
  }
}

export class LocationRoomNarrativeConfigError extends Error {
  constructor() {
    super('Location room narrative mode requires an admin-managed game-master agent or ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID')
    this.name = 'LocationRoomNarrativeConfigError'
  }
}

export class LocationRoomGameplayConfigError extends Error {
  constructor(message = 'Location room gameplay mode requires official ElizaOS, narrative mode, and a resolvable game-master agent') {
    super(message)
    this.name = 'LocationRoomGameplayConfigError'
  }
}

export class LocationRoomForbiddenError extends Error {
  constructor() {
    super('Wallet does not own an eligible participant at this location')
    this.name = 'LocationRoomForbiddenError'
  }
}

export class LocationRoomInsufficientParticipantsError extends Error {
  constructor() {
    super('At least two eligible participants are required')
    this.name = 'LocationRoomInsufficientParticipantsError'
  }
}

export class LocationRoomManualCooldownError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('Location room manual trigger is cooling down')
    this.name = 'LocationRoomManualCooldownError'
  }
}

export class LocationRoomTickDisabledError extends Error {
  constructor() {
    super('Location room ticks are disabled')
    this.name = 'LocationRoomTickDisabledError'
  }
}

function normalizePage(value: string | null): number {
  const page = value ? Number(value) : 1
  return Number.isInteger(page) && page >= 1 ? page : 1
}

function normalizePageSize(value: string | null): number {
  const pageSize = value ? Number(value) : 20
  if (!Number.isInteger(pageSize)) return 20
  return Math.min(50, Math.max(1, pageSize))
}

function routeSafeError(error: unknown): string {
  const message = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : 'Location room tick failed'
  return message.slice(0, MAX_STORED_ERROR_LENGTH)
}

function nextRetryAt(attempts: number, now: Date): string {
  const delayMinutes = Math.min(60, 5 * 2 ** Math.max(0, attempts - 1))
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString()
}

function toPublicParticipant(participant: LocationRoomParticipant): PublicLocationRoomParticipant {
  return {
    tokenId: participant.tokenId,
    name: participant.name,
    imageUrl: participant.imageUrl,
  }
}

const PUBLIC_GAMEPLAY_MESSAGE_KINDS: readonly PublicLocationRoomGameplayMessageKind[] = [
  'gm_setup',
  'character_action',
  'gm_outcome',
]

function toPublicGameplayMessageKind(metadata: Record<string, unknown>): PublicLocationRoomGameplayMessageKind | undefined {
  const value = metadata.gameplayMessageKind
  return typeof value === 'string' && PUBLIC_GAMEPLAY_MESSAGE_KINDS.includes(value as PublicLocationRoomGameplayMessageKind)
    ? value as PublicLocationRoomGameplayMessageKind
    : undefined
}

function toPublicMessage(message: LocationRoomMessage): PublicLocationRoomMessage {
  const gameplayMessageKind = toPublicGameplayMessageKind(message.metadata)

  return {
    id: message.id,
    sequence: message.sequence,
    authorKind: message.authorKind,
    tokenId: message.tokenId,
    authorName: message.authorName,
    content: message.content,
    createdAt: message.createdAt,
    ...(gameplayMessageKind ? { gameplayMessageKind } : {}),
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

export const selectLocationRoomSpeaker = selectLocationRoomSpeakerInternal

function normalizeWallet(value: string): string {
  return value.trim().toLowerCase()
}

export function isLocationRoomGameplayEnabledForLocation(locationId: string): boolean {
  const gameplay = elizaConfig.locationRooms.gameplay
  if (!gameplay.enabled) return false

  const normalizedLocationId = locationId.trim().toLowerCase()
  return gameplay.locationAllowlist.some((allowedLocationId) =>
    allowedLocationId.trim().toLowerCase() === normalizedLocationId
  )
}

async function ensureLocationRoomFeatureEnabled(
  gameMasterAgentResolver: GameMasterAgentResolver = gameMasterAgentService
): Promise<void> {
  if (!elizaConfig.locationRooms.enabled) {
    throw new LocationRoomFeatureDisabledError()
  }

  if (!elizaConfig.official.baseUrl) {
    throw new LocationRoomOfficialServiceDisabledError()
  }

  if (elizaConfig.locationRooms.narrative.enabled) {
    try {
      await gameMasterAgentResolver.resolveRuntimeGameMasterAgentId()
    } catch {
      throw new LocationRoomNarrativeConfigError()
    }
  }
}

async function ensureLocationRoomGameplayConfigReady(
  locationId: string,
  gameMasterAgentResolver: GameMasterAgentResolver = gameMasterAgentService
): Promise<void> {
  if (!isLocationRoomGameplayEnabledForLocation(locationId)) {
    return
  }

  if (!elizaConfig.locationRooms.enabled) {
    throw new LocationRoomFeatureDisabledError()
  }

  if (elizaConfig.mode !== 'official' || !elizaConfig.official.baseUrl) {
    throw new LocationRoomGameplayConfigError('Location room gameplay mode requires ELIZA_INTEGRATION_MODE=official and ELIZAOS_BASE_URL')
  }

  if (!elizaConfig.locationRooms.narrative.enabled) {
    throw new LocationRoomGameplayConfigError('Location room gameplay mode requires narrative mode to be enabled')
  }

  try {
    await gameMasterAgentResolver.resolveRuntimeGameMasterAgentId()
  } catch {
    throw new LocationRoomGameplayConfigError()
  }
}

export class LocationRoomService {
  constructor(
    private readonly repository: LocationRoomRepository = locationRoomRepository,
    private readonly membership: LocationRoomMembershipRepository = locationRoomMembershipRepository,
    private readonly turnGenerator: OfficialLocationRoomTurnGenerator = officialLocationRoomTurnGenerator,
    private readonly narrativeCoordinator: LocationRoomNarrativeCoordinator = locationRoomNarrativeCoordinator,
    private readonly gameMasterAgentResolver: GameMasterAgentResolver = gameMasterAgentService,
    private readonly gameplayCoordinator: LocationRoomGameplayCoordinator = locationRoomGameplayCoordinator,
    private readonly gameplayRepository: LocationRoomGameplayRepository = locationRoomGameplayRepository
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
    const gameplayEnabled = isLocationRoomGameplayEnabledForLocation(canonicalLocationId)
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
      participants: participants.map(toPublicParticipant),
      messages: messages.messages.map(toPublicMessage),
      ...(gameplay ? { gameplay } : {}),
      pagination: {
        page: messages.page,
        pageSize: messages.pageSize,
        total: messages.total,
        hasMore: messages.hasMore,
      },
    }
  }

  async requestTick(locationId: string, input: RequestLocationRoomTickInput): Promise<RequestLocationRoomTickResult> {
    const prepared = await this.validateAndEnqueueManualTick(locationId, input)
    return prepared.result
  }

  async requestTickAndProcess(
    locationId: string,
    input: RequestLocationRoomTickInput
  ): Promise<RequestLocationRoomTickAndProcessResult> {
    const now = input.now ?? new Date()
    const prepared = await this.validateAndEnqueueManualTick(locationId, { ...input, now })
    const workerId = `location-room-manual-${randomUUID()}`
    const targetTick = prepared.enqueuedTick ?? await this.repository.findOldestProcessableTickForRoom(prepared.room.id, now)

    if (!targetTick) {
      const processingTick = await this.repository.findNonStaleProcessingTickForRoom(prepared.room.id, now)
      return {
        ...prepared.result,
        processing: processingTick
          ? {
              attempted: false,
              status: 'already_processing',
              tickId: processingTick.id,
              reason: 'Tick is already owned by another worker',
            }
          : {
              attempted: false,
              status: 'not_claimable',
              tickId: null,
              reason: 'No due room tick is currently claimable',
            },
      }
    }

    const claimedTick = await this.repository.claimTick(targetTick.id, workerId, now)
    if (!claimedTick) {
      const processingTick = await this.repository.findNonStaleProcessingTickForRoom(prepared.room.id, now)
      return {
        ...prepared.result,
        processing: processingTick
          ? {
              attempted: false,
              status: 'already_processing',
              tickId: processingTick.id,
              reason: 'Tick is already owned by another worker',
            }
          : {
              attempted: false,
              status: 'not_claimable',
              tickId: targetTick.id,
              reason: 'Target tick was not due or was claimed by another worker',
            },
      }
    }

    const processed = await this.processClaimedTick(claimedTick, now)
    return {
      ...prepared.result,
      processing: {
        attempted: true,
        status: processed.status,
        tickId: processed.tickId,
        result: processed,
      },
    }
  }

  private async validateAndEnqueueManualTick(
    locationId: string,
    input: RequestLocationRoomTickInput
  ): Promise<{
    room: LocationRoom
    enqueuedTick: LocationRoomTick | null
    result: RequestLocationRoomTickResult
  }> {
    const canonicalLocationId = resolveCanonicalLocationRoomId(locationId)

    await ensureLocationRoomFeatureEnabled(this.gameMasterAgentResolver)
    await ensureLocationRoomGameplayConfigReady(canonicalLocationId, this.gameMasterAgentResolver)

    const location = await this.repository.getLocation(canonicalLocationId)
    if (!location) {
      throw new LocationRoomNotFoundError(canonicalLocationId)
    }

    const room = await this.repository.ensureRoomForLocation(canonicalLocationId)
    if (!room.tickEnabled) {
      throw new LocationRoomTickDisabledError()
    }

    const participants = await this.membership.listEligibleParticipantsByLocation(canonicalLocationId)
    if (participants.length < MIN_ELIGIBLE_PARTICIPANTS) {
      throw new LocationRoomInsufficientParticipantsError()
    }

    const normalizedWallet = normalizeWallet(input.walletAddress)
    const ownedParticipant = participants.find((participant) =>
      participantBelongsToWallet(participant, normalizedWallet)
    )

    if (input.actor === 'owner' && !ownedParticipant) {
      throw new LocationRoomForbiddenError()
    }

    if (input.actor === 'owner') {
      const now = input.now ?? new Date()
      const since = new Date(now.getTime() - OWNER_MANUAL_TICK_COOLDOWN_MS)
      const recentTick = await this.repository.findRecentCompletedOwnerTick({
        roomId: room.id,
        walletAddress: normalizedWallet,
        since,
      })

      if (recentTick) {
        const elapsedMs = now.getTime() - new Date(recentTick.createdAt).getTime()
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((OWNER_MANUAL_TICK_COOLDOWN_MS - elapsedMs) / 1000)
        )
        throw new LocationRoomManualCooldownError(retryAfterSeconds)
      }
    }

    const triggerType = input.actor === 'admin' ? 'admin' : 'owner'
    const requestedByTokenId = input.actor === 'owner'
      ? ownedParticipant?.tokenId ?? null
      : null
    const enqueueResult = await this.repository.enqueueTick({
      room,
      triggerType,
      requestedByWallet: normalizedWallet,
      requestedByTokenId,
    })

    return {
      room,
      enqueuedTick: enqueueResult.tick,
      result: {
        roomId: room.id,
        locationId: room.locationId,
        tickId: enqueueResult.tick?.id ?? null,
        triggerType,
        deduped: enqueueResult.deduped,
        requestedByTokenId,
        participantCount: participants.length,
      },
    }
  }

  async enqueueDueScheduledTicks(now = new Date()): Promise<EnqueueScheduledTicksResult> {
    await ensureLocationRoomFeatureEnabled(this.gameMasterAgentResolver)

    const activeLocationIds = await this.membership.listEligibleLocationIds(MIN_ELIGIBLE_PARTICIPANTS)
    for (const locationId of activeLocationIds) {
      const location = await this.repository.getLocation(locationId)
      if (location) {
        await this.repository.ensureRoomForLocation(locationId)
      }
    }

    const dueRooms = await this.repository.listDueRooms(
      now,
      Math.max(elizaConfig.locationRooms.maxTicksPerRun, activeLocationIds.length, 1)
    )

    for (const room of dueRooms) {
      await ensureLocationRoomGameplayConfigReady(room.locationId, this.gameMasterAgentResolver)
    }

    let enqueued = 0
    let deduped = 0
    for (const room of dueRooms) {
      const result = await this.repository.enqueueTick({ room, triggerType: 'scheduled' })
      if (result.deduped) deduped += 1
      else enqueued += 1
    }

    return {
      roomsChecked: dueRooms.length,
      enqueued,
      deduped,
    }
  }

  async processDueTicks(limit = elizaConfig.locationRooms.maxTicksPerRun, now = new Date()): Promise<ProcessLocationRoomTickResult[]> {
    await ensureLocationRoomFeatureEnabled(this.gameMasterAgentResolver)

    const workerId = `location-room-worker-${randomUUID()}`
    const ticks = await this.repository.claimDueTicks(limit, workerId, now)
    const results: ProcessLocationRoomTickResult[] = []

    for (const tick of ticks) {
      results.push(await this.processClaimedTick(tick, now))
    }

    return results
  }

  async runScheduledWorker(now = new Date()): Promise<LocationRoomWorkerResult> {
    await ensureLocationRoomFeatureEnabled(this.gameMasterAgentResolver)

    const enqueueResult = await this.enqueueDueScheduledTicks(now)
    const results = await this.processDueTicks(elizaConfig.locationRooms.maxTicksPerRun, now)

    return {
      enabled: true,
      enqueued: enqueueResult.enqueued,
      deduped: enqueueResult.deduped,
      processed: results.length,
      completed: results.filter((result) => result.status === 'completed').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      failed: results.filter((result) => result.status === 'failed').length,
      dead: results.filter((result) => result.status === 'dead').length,
      results,
    }
  }

  private async processClaimedTick(tick: LocationRoomTick, now: Date): Promise<ProcessLocationRoomTickResult> {
    try {
      return await this.processClaimedTickUnsafe(tick, now)
    } catch (error) {
      const storedError = routeSafeError(error)
      const selectedTokenId = tick.selectedTokenId
      const shouldMarkGameplayTurn = isLocationRoomGameplayEnabledForLocation(tick.locationId)
      const shouldMarkNarrativeBeat = !shouldMarkGameplayTurn && elizaConfig.locationRooms.narrative.enabled

      if (tick.attempts >= MAX_TICK_ATTEMPTS) {
        if (shouldMarkGameplayTurn) {
          await this.gameplayCoordinator.markTickFailed(tick.id, error, { dead: true }).catch(() => null)
        } else if (shouldMarkNarrativeBeat) {
          await this.narrativeCoordinator.markTickFailed(tick.id, error, { dead: true }).catch(() => null)
        }
        await this.repository.markTickDead(tick.id, storedError).catch(() => null)
        return {
          tickId: tick.id,
          status: 'dead',
          selectedTokenId,
          reason: 'attempts_exhausted',
        }
      }

      if (shouldMarkGameplayTurn) {
        await this.gameplayCoordinator.markTickFailed(tick.id, error).catch(() => null)
      } else if (shouldMarkNarrativeBeat) {
        await this.narrativeCoordinator.markTickFailed(tick.id, error).catch(() => null)
      }

      await this.repository.markTickFailed(tick.id, storedError, nextRetryAt(tick.attempts, now)).catch(() => null)
      return {
        tickId: tick.id,
        status: 'failed',
        selectedTokenId,
        reason: 'retry_scheduled',
      }
    }
  }

  private async processClaimedTickUnsafe(tick: LocationRoomTick, now: Date): Promise<ProcessLocationRoomTickResult> {
    const room = await this.repository.findRoomById(tick.roomId)
    if (!room) {
      await this.repository.markTickDead(tick.id, 'Location room no longer exists')
      return {
        tickId: tick.id,
        status: 'dead',
        selectedTokenId: null,
        reason: 'room_missing',
      }
    }

    await ensureLocationRoomGameplayConfigReady(room.locationId, this.gameMasterAgentResolver)

    const participants = await this.membership.listEligibleParticipantsByLocation(room.locationId)
    if (participants.length < MIN_ELIGIBLE_PARTICIPANTS) {
      await this.repository.markTickSkipped(tick.id, 'Fewer than two eligible participants')
      await this.repository.updateRoomAfterProcessedTick(room, {
        tickIntervalMinutes: elizaConfig.locationRooms.tickIntervalMinutes,
        now,
      })
      return {
        tickId: tick.id,
        status: 'skipped',
        selectedTokenId: null,
        reason: 'insufficient_participants',
      }
    }

    const recentMessages = await this.repository.listRecentPublicMessages(
      room.id,
      elizaConfig.locationRooms.transcriptWindow
    )

    if (isLocationRoomGameplayEnabledForLocation(room.locationId)) {
      const gameplayResult = await this.gameplayCoordinator.processTurn({
        room,
        tick,
        participants,
        recentMessages,
        now,
      })

      if (gameplayResult.status === 'skipped') {
        await this.repository.markTickSkipped(tick.id, gameplayResult.reason)
        await this.repository.updateRoomAfterProcessedTick(room, {
          tickIntervalMinutes: elizaConfig.locationRooms.tickIntervalMinutes,
          now,
        })
        return {
          tickId: tick.id,
          status: 'skipped',
          selectedTokenId: null,
          reason: gameplayResult.reason,
        }
      }

      await this.repository.markTickCompleted(tick.id)
      await this.repository.updateRoomAfterProcessedTick(room, {
        tickIntervalMinutes: elizaConfig.locationRooms.tickIntervalMinutes,
        now,
      })

      return {
        tickId: tick.id,
        status: 'completed',
        selectedTokenId: gameplayResult.selectedTokenId,
        messageId: gameplayResult.messageId,
      }
    }

    const narrativeEnabled = elizaConfig.locationRooms.narrative.enabled
    const speaker = narrativeEnabled && tick.selectedTokenId != null
      ? participants.find((participant) => participant.tokenId === tick.selectedTokenId)
      : selectLocationRoomSpeaker(participants, recentMessages)

    if (!speaker) {
      throw new Error('Selected narrative speaker is no longer eligible for this location room')
    }

    if (tick.selectedTokenId !== speaker.tokenId) {
      await this.repository.markTickSelected(tick.id, speaker.tokenId)
    }

    let appendedMessageId: string | null = null

    try {
      if (narrativeEnabled) {
        const narrativeResult = await this.narrativeCoordinator.processTurn({
          room,
          tick,
          speaker,
          participants,
          recentMessages,
        })
        if (!narrativeResult.messageId) {
          throw new Error('Narrative coordinator did not append a character message')
        }
        appendedMessageId = narrativeResult.messageId
        await this.repository.markTickCompleted(tick.id)
        await this.repository.updateRoomAfterProcessedTick(room, {
          tickIntervalMinutes: elizaConfig.locationRooms.tickIntervalMinutes,
          now,
        })

        return {
          tickId: tick.id,
          status: 'completed',
          selectedTokenId: speaker.tokenId,
          messageId: narrativeResult.messageId,
        }
      }

      const generated = await this.turnGenerator.generateTurn({
        room,
        speaker,
        participants,
        recentMessages,
      })
      const content = normalizeLocationRoomGeneratedContent(generated.content)

      if (!content) {
        const error = 'Official ElizaOS generated an empty location-room turn'
        await this.repository.markTickDead(tick.id, error)
        await this.repository.recordRoomError(room.id, error)
        return {
          tickId: tick.id,
          status: 'dead',
          selectedTokenId: speaker.tokenId,
          reason: 'empty_generation',
        }
      }

      const message = await this.repository.appendMessage({
        roomId: room.id,
        locationId: room.locationId,
        tickId: tick.id,
        authorKind: 'agent',
        tokenId: speaker.tokenId,
        officialAgentId: generated.officialAgentId,
        authorName: speaker.name,
        content,
        visibility: 'public',
        metadata: {
          source: 'scheduled-location-room-tick',
          triggerType: tick.triggerType,
        },
      })
      appendedMessageId = message.id
      await this.repository.markTickCompleted(tick.id)
      await this.repository.updateRoomAfterProcessedTick(room, {
        tickIntervalMinutes: elizaConfig.locationRooms.tickIntervalMinutes,
        now,
      })

      return {
        tickId: tick.id,
        status: 'completed',
        selectedTokenId: speaker.tokenId,
        messageId: message.id,
      }
    } catch (error) {
      const storedError = routeSafeError(error)
      await this.repository.recordRoomError(room.id, storedError).catch(() => null)

      if (appendedMessageId) {
        await this.repository.markTickCompleted(tick.id).catch(() => null)
        await this.repository.updateRoomAfterProcessedTick(room, {
          tickIntervalMinutes: elizaConfig.locationRooms.tickIntervalMinutes,
          now,
        }).catch(() => null)
        return {
          tickId: tick.id,
          status: 'completed',
          selectedTokenId: speaker.tokenId,
          messageId: appendedMessageId,
          reason: 'message_appended_before_completion_error',
        }
      }

      if (narrativeEnabled) {
        await this.narrativeCoordinator.markTickFailed(tick.id, error, {
          dead: tick.attempts >= MAX_TICK_ATTEMPTS,
        }).catch(() => null)
      }

      if (tick.attempts >= MAX_TICK_ATTEMPTS) {
        await this.repository.markTickDead(tick.id, storedError)
        return {
          tickId: tick.id,
          status: 'dead',
          selectedTokenId: speaker.tokenId,
          reason: 'attempts_exhausted',
        }
      }

      await this.repository.markTickFailed(tick.id, storedError, nextRetryAt(tick.attempts, now))
      return {
        tickId: tick.id,
        status: 'failed',
        selectedTokenId: speaker.tokenId,
        reason: 'retry_scheduled',
      }
    }
  }
}

export const locationRoomService = new LocationRoomService()
