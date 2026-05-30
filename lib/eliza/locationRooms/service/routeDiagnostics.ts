import type { LocationRoomTick, LocationRoomTurnIntent } from '../types'

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
}

export function logLocationRoomRouteDecision(diagnostic: LocationRoomRouteDiagnostic): void {
  const hasSceneCheckSignal = diagnostic.sceneCheckRequestPresent ||
    diagnostic.sceneCheckProposalPresent ||
    diagnostic.sceneCheckProposalErrorPresent ||
    Boolean(diagnostic.sceneCheckSkipReason) ||
    diagnostic.selectedRoute === 'narrative_scene_check'
  if (diagnostic.selectedRoute === 'narrative' && !hasSceneCheckSignal) return
  console.info('[Eliza Location Rooms] tick route decision', diagnostic)
}
