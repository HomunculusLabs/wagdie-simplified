import type { PublicLocationRoomGameplayRolls } from '../types'
import type { SceneCheckResolution } from './types'

export function projectPublicSceneCheckRolls(
  resolution: SceneCheckResolution,
  options: { sceneCheckId?: string | null } = {}
): PublicLocationRoomGameplayRolls {
  const actionRoll = resolution.roll

  return {
    rollContext: 'scene_check',
    sceneCheck: {
      sceneCheckId: options.sceneCheckId ?? null,
      actionIntent: resolution.actionIntent,
      requestSource: resolution.requestSource,
      adjudicationSource: resolution.adjudicationSource,
      adjudicationReason: resolution.adjudicationReason,
    },
    action: {
      actionType: resolution.actionIntent,
      checkType: actionRoll.checkType,
      checkLabel: actionRoll.checkLabel,
      checkSource: actionRoll.checkSource,
      ...(actionRoll.contextualCheckId ? { contextualCheckId: actionRoll.contextualCheckId } : {}),
      actor: {
        kind: 'character',
        id: String(resolution.actorTokenId),
        tokenId: resolution.actorTokenId,
        name: resolution.actorName,
      },
      target: actionRoll.targetKind === 'scene'
        ? { kind: 'environment', id: null, name: null }
        : null,
      roll: {
        formula: actionRoll.roll.formula,
        total: actionRoll.roll.total,
      },
      modifier: actionRoll.modifier,
      total: actionRoll.total,
      dc: actionRoll.dc,
      tier: actionRoll.tier,
      outcome: actionRoll.tier,
    },
    publicEffects: [],
    retaliation: null,
    deaths: [],
    encounterStatusAfter: 'unknown',
  }
}
