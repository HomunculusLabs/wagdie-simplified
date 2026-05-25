import type { ElizaLocationRoomGameplayDifficulty } from '@/lib/eliza/config'
import {
  inferGameplayRollChoice,
  normalizeGameplayContextualChecks,
  resolveActionRoll,
  validateGameplayActionEnvelope,
} from '../gameplay/rules'
import type {
  GameplayActionType,
  GameplayContextualCheckOption,
  GameplayRollChoice,
} from '../gameplay/types'
import {
  SCENE_CHECK_ACTION_INTENTS,
  type NormalizedSceneCheckProposal,
  type NormalizedSceneCheckRequest,
  type ResolveSceneCheckInput,
  type SceneCheckActionIntent,
  type SceneCheckAdjudication,
  type SceneCheckFallback,
  type SceneCheckNormalizationResult,
  type SceneCheckRequestInput,
  type SceneCheckResolution,
} from './types'

const SCENE_CHECK_DIFFICULTIES = ['easy', 'normal', 'hard', 'deadly'] as const
const DEFAULT_SCENE_CHECK_DIFFICULTY: ElizaLocationRoomGameplayDifficulty = 'normal'

const SCENE_INTENT_TO_GAMEPLAY_ACTION: Record<SceneCheckActionIntent, GameplayActionType> = {
  investigate: 'investigate',
  examine: 'investigate',
  search: 'investigate',
  track: 'investigate',
  navigate: 'investigate',
  sneak: 'flee',
  negotiate: 'negotiate',
  persuade: 'negotiate',
  intimidate: 'negotiate',
  recall_lore: 'investigate',
  tend: 'help',
  force: 'attack',
  endure: 'defend',
  escape: 'flee',
  help: 'help',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function trimString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function normalizeSceneCheckId(value: unknown): string | null {
  const trimmed = trimString(value, 80)
  if (!trimmed) return null
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || null
}

function normalizeDifficulty(value: unknown): ElizaLocationRoomGameplayDifficulty {
  return typeof value === 'string' && (SCENE_CHECK_DIFFICULTIES as readonly string[]).includes(value)
    ? value as ElizaLocationRoomGameplayDifficulty
    : DEFAULT_SCENE_CHECK_DIFFICULTY
}

export function isSceneCheckActionIntent(value: unknown): value is SceneCheckActionIntent {
  return typeof value === 'string' && (SCENE_CHECK_ACTION_INTENTS as readonly string[]).includes(value)
}

export function mapSceneCheckIntentToGameplayActionType(intent: SceneCheckActionIntent): GameplayActionType {
  return SCENE_INTENT_TO_GAMEPLAY_ACTION[intent]
}

function normalizeActionIntent(value: unknown, fallback: SceneCheckActionIntent = 'investigate'): SceneCheckActionIntent {
  return isSceneCheckActionIntent(value) ? value : fallback
}

function rejectUnsupportedActionIntent(value: unknown): string | null {
  return typeof value === 'string' && !isSceneCheckActionIntent(value)
    ? 'Unsupported scene-check action intent'
    : null
}

function normalizeRollChoice(
  value: unknown,
  actionType: GameplayActionType,
  contextualChecks: GameplayContextualCheckOption[]
): SceneCheckNormalizationResult<GameplayRollChoice> {
  const validation = validateGameplayActionEnvelope({
    actionType,
    target: null,
    publicSpeech: 'Scene check.',
    rollChoice: value ?? null,
    intentSummary: null,
  }, {
    contextualChecks,
    publicSpeechMaxLength: 100,
    intentSummaryMaxLength: 100,
  })

  if (!validation.ok) {
    return { ok: false, error: validation.error }
  }

  return { ok: true, value: validation.action.rollChoice ?? inferGameplayRollChoice(actionType) }
}

export function normalizeSceneCheckRequest(
  input: unknown,
  options: { fallbackDifficulty?: ElizaLocationRoomGameplayDifficulty } = {}
): SceneCheckNormalizationResult<NormalizedSceneCheckRequest> {
  if (!isRecord(input)) return { ok: false, error: 'Scene-check request must be a JSON object' }

  const actionIntent = normalizeActionIntent(input.actionIntent)
  const gameplayActionType = mapSceneCheckIntentToGameplayActionType(actionIntent)
  const difficulty = normalizeDifficulty(input.difficulty ?? options.fallbackDifficulty)
  const contextualChecks = normalizeGameplayContextualChecks(input.contextualChecks, { maxCount: 4 })
  const rollChoice = normalizeRollChoice(input.rollChoice, gameplayActionType, contextualChecks)
  if (!rollChoice.ok) return { ok: false, error: rollChoice.error }

  return {
    ok: true,
    value: {
      id: normalizeSceneCheckId(input.id),
      source: input.source === 'backend' ? 'backend' : 'game_master',
      actionIntent,
      gameplayActionType,
      summary: trimString(input.summary, 240),
      rollChoice: rollChoice.value,
      contextualChecks,
      difficulty,
    },
  }
}

export function normalizeSceneCheckProposal(
  input: unknown,
  options: { contextualChecks?: GameplayContextualCheckOption[] } = {}
): SceneCheckNormalizationResult<NormalizedSceneCheckProposal> {
  if (!isRecord(input)) return { ok: false, error: 'Scene-check proposal must be a JSON object' }

  const invalidActionIntent = rejectUnsupportedActionIntent(input.actionIntent)
  if (invalidActionIntent) return { ok: false, error: invalidActionIntent }

  const actionIntent = normalizeActionIntent(input.actionIntent)
  const gameplayActionType = mapSceneCheckIntentToGameplayActionType(actionIntent)
  const rollChoice = normalizeRollChoice(input.rollChoice, gameplayActionType, options.contextualChecks ?? [])
  if (!rollChoice.ok) return { ok: false, error: rollChoice.error }

  return {
    ok: true,
    value: {
      id: normalizeSceneCheckId(input.id),
      source: 'character',
      actionIntent,
      gameplayActionType,
      intentSummary: trimString(input.intentSummary, 240),
      rollChoice: rollChoice.value,
      contextualChecks: options.contextualChecks ?? [],
    },
  }
}

function fallbackToRequest(fallback: SceneCheckFallback): SceneCheckRequestInput {
  return {
    source: 'backend',
    actionIntent: fallback.actionIntent ?? 'investigate',
    ...(fallback.summary ? { summary: fallback.summary } : {}),
    rollChoice: fallback.rollChoice ?? null,
    difficulty: fallback.difficulty ?? DEFAULT_SCENE_CHECK_DIFFICULTY,
  }
}

export function adjudicateSceneCheck(input: {
  actorTokenId: number
  actorName?: string | null
  request?: SceneCheckNormalizationResult<NormalizedSceneCheckRequest> | NormalizedSceneCheckRequest | null
  proposal?: SceneCheckNormalizationResult<NormalizedSceneCheckProposal> | NormalizedSceneCheckProposal | null
  fallback?: SceneCheckFallback | null
}): SceneCheckAdjudication {
  const requestResult = unwrapNormalization(input.request)
  const proposalResult = unwrapNormalization(input.proposal)
  const request = requestResult.ok ? requestResult.value : null
  const proposal = proposalResult.ok ? proposalResult.value : null
  const skippedProposalError = proposalResult.ok ? null : proposalResult.error

  if (request) {
    return {
      decision: 'run',
      source: request.source,
      adjudicationSource: request.source,
      requestSource: request.source,
      reason: request.source === 'backend' ? 'backend_request' : 'gm_request',
      actorTokenId: input.actorTokenId,
      actorName: input.actorName ?? null,
      actionIntent: request.actionIntent,
      gameplayActionType: request.gameplayActionType,
      rollChoice: request.rollChoice,
      contextualChecks: request.contextualChecks,
      difficulty: request.difficulty,
      request,
      proposal,
      skippedProposalError,
    }
  }

  if (proposal) {
    return {
      decision: 'run',
      source: 'character',
      adjudicationSource: 'character',
      requestSource: null,
      reason: 'character_proposal',
      actorTokenId: input.actorTokenId,
      actorName: input.actorName ?? null,
      actionIntent: proposal.actionIntent,
      gameplayActionType: proposal.gameplayActionType,
      rollChoice: proposal.rollChoice,
      contextualChecks: proposal.contextualChecks,
      difficulty: DEFAULT_SCENE_CHECK_DIFFICULTY,
      request: null,
      proposal,
      skippedProposalError: null,
    }
  }

  if (input.fallback) {
    const fallbackRequest = normalizeSceneCheckRequest(fallbackToRequest(input.fallback))
    if (fallbackRequest.ok) {
      return {
        decision: 'run',
        source: 'backend',
        adjudicationSource: 'backend',
        requestSource: null,
        reason: 'backend_fallback',
        actorTokenId: input.actorTokenId,
        actorName: input.actorName ?? null,
        actionIntent: fallbackRequest.value.actionIntent,
        gameplayActionType: fallbackRequest.value.gameplayActionType,
        rollChoice: fallbackRequest.value.rollChoice,
        contextualChecks: fallbackRequest.value.contextualChecks,
        difficulty: fallbackRequest.value.difficulty,
        request: null,
        proposal: null,
        skippedProposalError,
      }
    }
  }

  return {
    decision: 'skip',
    source: 'backend',
    reason: skippedProposalError ? 'invalid_proposal' : 'no_check',
    request: null,
    proposal: null,
    skippedProposalError,
  }
}

function unwrapNormalization<T>(
  value: SceneCheckNormalizationResult<T> | T | null | undefined
): SceneCheckNormalizationResult<T | null> {
  if (!value) return { ok: true, value: null }
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'ok')) {
    return value as SceneCheckNormalizationResult<T>
  }
  return { ok: true, value: value as T }
}

export function resolveSceneCheck(input: ResolveSceneCheckInput): SceneCheckResolution {
  const adjudication = input.adjudication
  const roll = resolveActionRoll({
    actionType: adjudication.gameplayActionType,
    target: null,
    rollChoice: adjudication.rollChoice,
  }, {
    difficulty: adjudication.difficulty,
    rng: input.rng,
    effectiveStats: input.effectiveStats,
    modifierSources: input.modifierSources,
    statsEnabled: input.statsEnabled,
    contextualChecks: adjudication.contextualChecks,
  })

  return {
    actorTokenId: adjudication.actorTokenId,
    actorName: adjudication.actorName,
    actionIntent: adjudication.actionIntent,
    gameplayActionType: adjudication.gameplayActionType,
    requestSource: adjudication.requestSource,
    adjudicationSource: adjudication.adjudicationSource,
    adjudicationReason: adjudication.reason,
    roll,
    diceResults: [roll.roll],
  }
}
