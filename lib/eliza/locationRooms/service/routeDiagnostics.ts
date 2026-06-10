import type { LocationRoomTick, LocationRoomTickPublicOutputOutcome, LocationRoomTurnIntent } from '../types'

export type LocationRoomRouteDiagnostic = {
  tickId: string
  roomId: string
  locationId: string
  turnIntent: LocationRoomTurnIntent
  triggerType: LocationRoomTick['triggerType']
  gameplayGateResult: 'enabled' | 'disabled'
  activeEncounterId: string | null
  combatTriggerId: string | null
  sceneCheckRequestPresent: boolean
  sceneCheckProposalPresent: boolean
  sceneCheckProposalErrorPresent?: boolean
  selectedRoute: 'combat' | 'narrative' | 'narrative_scene_check' | 'skip' | 'dead'
  skipReason: string | null
  combatRouteSkipReason?: string | null
  sceneCheckSkipReason?: string | null
  routeSource?: 'active_encounter' | 'combat_trigger' | null
  publicOutputOutcome?: LocationRoomTickPublicOutputOutcome
}

export type LocationRoomRouteDiagnosticEvent = LocationRoomRouteDiagnostic & {
  schemaVersion: 1
  eventType: 'location_room.route_decision'
  occurredAt: string
  severity: 'info' | 'warn'
  diagnostic: LocationRoomRouteDiagnostic
  labels: {
    locationId: string
    roomId: string
    tickId: string
    route: LocationRoomRouteDiagnostic['selectedRoute']
    triggerType: LocationRoomTick['triggerType']
    turnIntent: LocationRoomTurnIntent
    publicOutputOutcome: LocationRoomTickPublicOutputOutcome | 'unknown'
    skipReason: string | 'none'
  }
  observability: {
    requiresPublicOutputAttention: boolean
    terminalClosureSignal: boolean
    blockedParticipantSignal: boolean
    sceneCheckSignal: boolean
  }
}

export function createLocationRoomRouteDiagnosticEvent(
  diagnostic: LocationRoomRouteDiagnostic,
  occurredAt = new Date()
): LocationRoomRouteDiagnosticEvent {
  const sceneCheckSignal = hasSceneCheckSignal(diagnostic)
  const terminalClosureSignal = diagnostic.publicOutputOutcome === 'terminal_run_closed' ||
    Boolean(diagnostic.skipReason?.startsWith('encounter_')) ||
    diagnostic.skipReason === 'no_active_gameplay_encounter'
  const blockedParticipantSignal = diagnostic.publicOutputOutcome === 'blocked_waiting_for_participants' ||
    diagnostic.skipReason === 'insufficient_participants' ||
    diagnostic.skipReason === 'insufficient_living_gameplay_participants'
  const requiresPublicOutputAttention = diagnostic.selectedRoute === 'skip' ||
    diagnostic.publicOutputOutcome === 'failed_retry' ||
    diagnostic.publicOutputOutcome === 'failed_terminal' ||
    terminalClosureSignal ||
    blockedParticipantSignal

  return {
    ...diagnostic,
    schemaVersion: 1,
    eventType: 'location_room.route_decision',
    occurredAt: occurredAt.toISOString(),
    severity: requiresPublicOutputAttention ? 'warn' : 'info',
    diagnostic,
    labels: {
      locationId: diagnostic.locationId,
      roomId: diagnostic.roomId,
      tickId: diagnostic.tickId,
      route: diagnostic.selectedRoute,
      triggerType: diagnostic.triggerType,
      turnIntent: diagnostic.turnIntent,
      publicOutputOutcome: diagnostic.publicOutputOutcome ?? 'unknown',
      skipReason: diagnostic.skipReason ?? 'none',
    },
    observability: {
      requiresPublicOutputAttention,
      terminalClosureSignal,
      blockedParticipantSignal,
      sceneCheckSignal,
    },
  }
}

export function shouldLogLocationRoomRouteDecision(diagnostic: LocationRoomRouteDiagnostic): boolean {
  if (diagnostic.selectedRoute !== 'narrative') return true
  return hasSceneCheckSignal(diagnostic)
}

export function logLocationRoomRouteDecision(diagnostic: LocationRoomRouteDiagnostic): void {
  if (!shouldLogLocationRoomRouteDecision(diagnostic)) return
  console.info('[Eliza Location Rooms] tick route decision', createLocationRoomRouteDiagnosticEvent(diagnostic))
}

function hasSceneCheckSignal(diagnostic: LocationRoomRouteDiagnostic): boolean {
  return diagnostic.sceneCheckRequestPresent ||
    diagnostic.sceneCheckProposalPresent ||
    diagnostic.sceneCheckProposalErrorPresent ||
    Boolean(diagnostic.sceneCheckSkipReason) ||
    diagnostic.selectedRoute === 'narrative_scene_check'
}
