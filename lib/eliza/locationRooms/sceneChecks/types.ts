import type { ElizaLocationRoomGameplayDifficulty } from '@/lib/eliza/config'
import type {
  GameplayActionType,
  GameplayCheckType,
  GameplayContextualCheckOption,
  GameplayDiceRollResult,
  GameplayEffectiveStats,
  GameplayModifierSource,
  GameplayRollChoice,
} from '../gameplay/types'
import type { GameplayRollResolution } from '../gameplay/rules'

export const SCENE_CHECK_ACTION_INTENTS = [
  'investigate',
  'examine',
  'search',
  'track',
  'navigate',
  'sneak',
  'negotiate',
  'persuade',
  'intimidate',
  'recall_lore',
  'tend',
  'force',
  'endure',
  'escape',
  'help',
] as const

export type SceneCheckActionIntent = typeof SCENE_CHECK_ACTION_INTENTS[number]
export type SceneCheckRequestSource = 'game_master' | 'backend'
export type SceneCheckProposalSource = 'character'
export type SceneCheckAdjudicationSource = SceneCheckRequestSource | SceneCheckProposalSource
export type SceneCheckDecision = 'run' | 'skip'

export type SceneCheckRollChoiceInput = Partial<{
  source: GameplayRollChoice['source']
  checkType: GameplayCheckType | string
  contextualCheckId: string | null
}>

export type SceneCheckRequestInput = Partial<{
  id: string
  source: SceneCheckRequestSource
  actionIntent: SceneCheckActionIntent | string
  summary: string
  rollChoice: SceneCheckRollChoiceInput | null
  contextualChecks: unknown
  difficulty: ElizaLocationRoomGameplayDifficulty | string
}>

export type SceneCheckProposalInput = Partial<{
  id: string
  actionIntent: SceneCheckActionIntent | string
  intentSummary: string
  rollChoice: SceneCheckRollChoiceInput | null
}>

export type NormalizedSceneCheckRequest = {
  id: string | null
  source: SceneCheckRequestSource
  actionIntent: SceneCheckActionIntent
  gameplayActionType: GameplayActionType
  summary: string | null
  rollChoice: GameplayRollChoice
  contextualChecks: GameplayContextualCheckOption[]
  difficulty: ElizaLocationRoomGameplayDifficulty
}

export type NormalizedSceneCheckProposal = {
  id: string | null
  source: SceneCheckProposalSource
  actionIntent: SceneCheckActionIntent
  gameplayActionType: GameplayActionType
  intentSummary: string | null
  rollChoice: GameplayRollChoice
  contextualChecks: GameplayContextualCheckOption[]
}

export type SceneCheckNormalizationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export type SceneCheckFallback = {
  actionIntent?: SceneCheckActionIntent | string | null
  rollChoice?: SceneCheckRollChoiceInput | null
  summary?: string | null
  difficulty?: ElizaLocationRoomGameplayDifficulty | string | null
}

// `backend_fallback` is legacy persisted metadata only; new backend-created checks emit `backend_inferred`.
export type SceneCheckAdjudicationReason = 'gm_request' | 'backend_request' | 'character_proposal' | 'backend_inferred' | 'backend_fallback'

export type SceneCheckAdjudication =
  | {
      decision: 'run'
      source: SceneCheckAdjudicationSource
      adjudicationSource: SceneCheckAdjudicationSource
      requestSource: SceneCheckRequestSource | null
      reason: SceneCheckAdjudicationReason
      actorTokenId: number
      actorName: string | null
      actionIntent: SceneCheckActionIntent
      gameplayActionType: GameplayActionType
      rollChoice: GameplayRollChoice
      contextualChecks: GameplayContextualCheckOption[]
      difficulty: ElizaLocationRoomGameplayDifficulty
      request: NormalizedSceneCheckRequest | null
      proposal: NormalizedSceneCheckProposal | null
      skippedProposalError?: string | null
    }
  | {
      decision: 'skip'
      source: 'backend'
      reason: 'no_check' | 'invalid_proposal'
      request: NormalizedSceneCheckRequest | null
      proposal: NormalizedSceneCheckProposal | null
      skippedProposalError?: string | null
    }

export type ResolveSceneCheckInput = {
  adjudication: Extract<SceneCheckAdjudication, { decision: 'run' }>
  rng?: () => number
  effectiveStats?: GameplayEffectiveStats | null
  modifierSources?: GameplayModifierSource[]
  statsEnabled?: boolean
}

export type SceneCheckResolution = {
  actorTokenId: number
  actorName: string | null
  actionIntent: SceneCheckActionIntent
  gameplayActionType: GameplayActionType
  requestSource: SceneCheckRequestSource | null
  adjudicationSource: SceneCheckAdjudicationSource
  adjudicationReason: Extract<SceneCheckAdjudication, { decision: 'run' }>['reason']
  roll: GameplayRollResolution
  diceResults: GameplayDiceRollResult[]
}
