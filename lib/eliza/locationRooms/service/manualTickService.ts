import type { LocationRoom, LocationRoomTick, RequestLocationRoomTickInput, RequestLocationRoomTickResult } from '../types'
import type { LocationRoomRepository } from '../repository'
import { participantBelongsToWallet, type LocationRoomMembershipRepository } from '../membership'
import type { LocationRoomNarrativeRepository } from '../narrativeRepository'
import type { GameMasterAgentResolver } from '../narrativeCoordinator'
import {
  ensureLocationRoomFeatureEnabled,
  ensureLocationRoomGameplayConfigReady,
  isLocationRoomGameplayEnabledForLocation,
} from './configGuards'
import {
  LocationRoomForbiddenError,
  LocationRoomGameplayConfigError,
  LocationRoomInsufficientParticipantsError,
  LocationRoomManualCooldownError,
  LocationRoomManualTickIntentForbiddenError,
  LocationRoomNotFoundError,
  LocationRoomTickDisabledError,
} from './errors'
import { resolveCanonicalLocationRoomId } from './identity'
import { ensureAdminCombatTriggerForTick } from './gameplayRouting'
import { MIN_ELIGIBLE_PARTICIPANTS, normalizeWallet, OWNER_MANUAL_TICK_COOLDOWN_MS } from './support'

const TURN_INTENT_PRIORITY = {
  auto: 0,
  story: 1,
  combat: 2,
} as const

function shouldPromoteTurnIntent(existing: LocationRoomTick['turnIntent'], requested: LocationRoomTick['turnIntent']): boolean {
  return TURN_INTENT_PRIORITY[requested] > TURN_INTENT_PRIORITY[existing]
}

export type PreparedManualLocationRoomTick = {
  room: LocationRoom
  enqueuedTick: LocationRoomTick | null
  enqueuedTickIsFresh: boolean
  result: RequestLocationRoomTickResult
}

export class LocationRoomManualTickService {
  constructor(
    private readonly repository: LocationRoomRepository,
    private readonly membership: LocationRoomMembershipRepository,
    private readonly narrativeRepository: LocationRoomNarrativeRepository,
    private readonly gameMasterAgentResolver: GameMasterAgentResolver
  ) {}

  async requestTick(locationId: string, input: RequestLocationRoomTickInput): Promise<RequestLocationRoomTickResult> {
    const prepared = await this.prepareManualTick(locationId, input)
    return prepared.result
  }

  async prepareManualTick(locationId: string, input: RequestLocationRoomTickInput): Promise<PreparedManualLocationRoomTick> {
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

    const intent = input.intent ?? 'auto'
    if (intent === 'combat' && input.actor !== 'admin') {
      throw new LocationRoomManualTickIntentForbiddenError()
    }

    if (intent === 'combat' && !isLocationRoomGameplayEnabledForLocation(room.locationId)) {
      throw new LocationRoomGameplayConfigError('Combat tick intent requires gameplay to be enabled for this location')
    }

    const triggerType = input.actor === 'admin' ? 'admin' : 'owner'
    const requestedByTokenId = input.actor === 'owner'
      ? ownedParticipant?.tokenId ?? null
      : null

    const preexistingOpenTick = await this.repository.findOpenTickForRoom(room.id)
    const enqueueResult = preexistingOpenTick?.status === 'failed'
      ? { tick: null, deduped: true }
      : await this.repository.enqueueTick({
        room,
        triggerType,
        requestedByWallet: normalizedWallet,
        requestedByTokenId,
        gameplayRunId: null,
        turnIntent: intent,
      })

    let resultTick = enqueueResult.tick ?? (preexistingOpenTick?.status === 'failed' ? preexistingOpenTick : null)
    if (enqueueResult.deduped && !resultTick) {
      resultTick = preexistingOpenTick ?? await this.repository.findOpenTickForRoom(room.id)
    }
    if (resultTick && resultTick.status !== 'processing' && shouldPromoteTurnIntent(resultTick.turnIntent, intent)) {
      resultTick = await this.repository.promoteOpenTickIntent({
        tickId: resultTick.id,
        roomId: room.id,
        turnIntent: intent,
      }) ?? resultTick
    }

    if (intent === 'combat' && resultTick && resultTick.triggerType === 'admin' && resultTick.status !== 'processing') {
      await ensureAdminCombatTriggerForTick({
        narrativeRepository: this.narrativeRepository,
        room,
        tick: resultTick,
        now: input.now ?? new Date(),
      })
    }

    return {
      room,
      enqueuedTick: enqueueResult.tick,
      enqueuedTickIsFresh: Boolean(enqueueResult.tick),
      result: {
        roomId: room.id,
        locationId: room.locationId,
        tickId: resultTick?.id ?? null,
        triggerType,
        turnIntent: resultTick?.turnIntent ?? intent,
        deduped: enqueueResult.deduped,
        requestedByTokenId,
        participantCount: participants.length,
      },
    }
  }
}
