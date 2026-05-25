import { gameMasterAgentService } from '@/lib/eliza/gameMasterAgent/service'
import {
  GAME_MASTER_AUTHOR_NAME,
  GameMasterBeatGenerationError,
  buildGameMasterBeatProgressionContext,
  officialGameMasterBeatGenerator,
  validateGameMasterBeatProgressionContract,
  type GameMasterBeatGenerator,
  type GameMasterBeatOutput,
  type GameMasterSceneCheckOutcomeOutput,
  type GameMasterBeatProgressionContext,
  type GameMasterGenerationDiagnostics,
  type GameMasterGenerationResponseFlags,
} from './gameMasterGenerator'
import {
  locationRoomNarrativeRepository,
  type LocationRoomNarrativeRepository,
} from './narrativeRepository'
import {
  mergeAdventureMetadata,
  mergeNarrativeSceneCheckMetadata,
  mergeNarrativeTtrpgMetadata,
  normalizeAdventureMemory,
  normalizeAdventurePatch,
  normalizeDeclaredAction,
  normalizeNarrativeSceneCheckMetadata,
  normalizeNarrativeTtrpgMetadata,
  recordAdventureDeclaredAction,
  toNarrativeStateSnapshot,
  type LocationRoomAdventureMemory,
  type LocationRoomAdventurePatch,
  type LocationRoomDeclaredAction,
  type LocationRoomNarrativeBeat,
  type LocationRoomNarrativeStateSnapshot,
} from './narrativeTypes'
import {
  locationRoomRepository,
  type LocationRoomRepository,
} from './repository'
import {
  officialLocationRoomTurnGenerator,
  normalizeLocationRoomGeneratedContent,
  type OfficialLocationRoomTurnGenerator,
} from './officialTurnGenerator'
import {
  adjudicateSceneCheck,
  resolveSceneCheck,
} from './sceneChecks/rules'
import { projectPublicSceneCheckRolls } from './sceneChecks/publicRolls'
import { sanitizePublicLocationRoomAdventure } from './publicAdventure'
import type {
  SceneCheckAdjudication,
  SceneCheckResolution,
} from './sceneChecks/types'
import type {
  LocationRoom,
  LocationRoomMessage,
  LocationRoomNarrativeTurnContext,
  LocationRoomParticipant,
  LocationRoomTick,
  PublicLocationRoomGameplayRolls,
} from './types'

export type ProcessNarrativeLocationRoomTurnInput = {
  room: LocationRoom
  tick: LocationRoomTick
  speaker: LocationRoomParticipant
  participants: LocationRoomParticipant[]
  recentMessages: LocationRoomMessage[]
}

export type ProcessNarrativeLocationRoomTurnResult = {
  selectedTokenId: number
  /** Final public message appended by the narrative tick. */
  messageId: string
  /** Scene-check subflow public message ids, in order: character_action, roll_card, gm_outcome. */
  messageIds?: string[]
  sceneCheckId?: string | null
  /** Public-safe routing diagnostics for service logs; contains no prompt or payload bodies. */
  sceneCheckDiagnostics?: {
    requestPresent: boolean
    proposalPresent: boolean
    proposalErrorPresent: boolean
    selected: boolean
    skipReason?: string | null
  }
}

export interface LocationRoomNarrativeCoordinator {
  processTurn(input: ProcessNarrativeLocationRoomTurnInput): Promise<ProcessNarrativeLocationRoomTurnResult>
  markTickFailed(tickId: string, error: unknown, options?: { dead?: boolean }): Promise<void>
}

export interface GameMasterAgentResolver {
  resolveRuntimeGameMasterAgentId(): Promise<string>
}

function isUsableGeneratedBeat(beat: LocationRoomNarrativeBeat): boolean {
  return Boolean(beat.speakerInstruction && getStateAfterSnapshot(beat.stateAfter))
}

function getStateAfterSnapshot(value: unknown): LocationRoomNarrativeStateSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const stateSummary = typeof candidate.stateSummary === 'string'
    ? candidate.stateSummary.trim()
    : typeof candidate.state_summary === 'string'
      ? candidate.state_summary.trim()
      : ''

  if (!stateSummary) return null

  const currentObjective = typeof candidate.currentObjective === 'string'
    ? candidate.currentObjective.trim() || null
    : typeof candidate.current_objective === 'string'
      ? candidate.current_objective.trim() || null
      : null
  const openThreads = Array.isArray(candidate.openThreads)
    ? candidate.openThreads.filter((thread): thread is string => typeof thread === 'string' && thread.trim().length > 0)
        .map((thread) => thread.trim())
    : Array.isArray(candidate.open_threads)
      ? candidate.open_threads.filter((thread): thread is string => typeof thread === 'string' && thread.trim().length > 0)
          .map((thread) => thread.trim())
      : []

  return {
    stateSummary,
    currentObjective,
    openThreads,
  }
}

function beatToOutput(
  beat: LocationRoomNarrativeBeat,
  fallbackGameMasterAgentId: string,
  progressionContext: GameMasterBeatProgressionContext
): GameMasterBeatOutput {
  const stateAfter = getStateAfterSnapshot(beat.stateAfter)
  if (!beat.speakerInstruction || !stateAfter) {
    throw new Error('Location room narrative beat is missing generated output')
  }

  const ttrpg = normalizeNarrativeTtrpgMetadata(beat.metadata)
  const sceneCheck = normalizeNarrativeSceneCheckMetadata(beat.metadata)

  const output = {
    gameMasterAgentId: beat.gameMasterAgentId ?? fallbackGameMasterAgentId,
    publicNarration: beat.publicNarration,
    speakerInstruction: beat.speakerInstruction,
    stateAfter,
    ttrpgPhase: ttrpg.ttrpgPhase,
    combatReadiness: ttrpg.combatReadiness,
    threatLevel: ttrpg.threatLevel,
    requestedGameplayAction: ttrpg.requestedGameplayAction,
    encounterSeed: ttrpg.lastEncounterSeed,
    sceneCheckRequest: sceneCheck.request,
    adventurePatch: normalizeAdventurePatch(beat.metadata.adventurePatch ?? {
      currentStakes: stateAfter.currentObjective ?? 'The scene carries unresolved pressure.',
    }),
    metadata: mergeNarrativeSceneCheckMetadata(beat.metadata, { request: sceneCheck.request }),
  }

  validateGameMasterBeatProgressionContract({
    ...output,
    progressionContext,
  })
  return output
}

function toGameMasterBeatMetadata(output: GameMasterBeatOutput): Record<string, unknown> {
  return {
    ...output.metadata,
    ttrpgPhase: output.ttrpgPhase,
    combatReadiness: output.combatReadiness,
    threatLevel: output.threatLevel,
    requestedGameplayAction: output.requestedGameplayAction,
    encounterSeed: output.encounterSeed,
    sceneCheckRequest: output.sceneCheckRequest,
    sceneCheck: {
      ...output.metadata.sceneCheck,
      request: output.sceneCheckRequest,
    },
    adventurePatch: output.adventurePatch,
  }
}

function adventureSourceIdForBeat(beatId: string): string {
  return `beat:${beatId}`
}

function adventureSourceIdForSceneCheck(sceneCheckId: string): string {
  return `scene_check:${sceneCheckId}`
}

function withAdventurePatchSource(value: unknown, sourceId: string): LocationRoomAdventurePatch {
  const patch = normalizeAdventurePatch(value, { sourceId })
  return normalizeAdventurePatch({
    ...patch,
    consequenceLedger: patch.consequenceLedger?.map((consequence, index) => ({
      ...consequence,
      source: sourceId,
      id: `${sourceId}:consequence:${index + 1}`,
    })),
  }, { sourceId })
}

function withSourcedGameMasterPatch(output: GameMasterBeatOutput, sourceId: string): GameMasterBeatOutput {
  const adventurePatch = withAdventurePatchSource(output.adventurePatch, sourceId)
  return {
    ...output,
    adventurePatch,
    metadata: {
      ...output.metadata,
      adventurePatch,
    },
  }
}

function publicAdventureMetadata(value: unknown): Record<string, unknown> {
  const publicAdventure = sanitizePublicLocationRoomAdventure(value)
  return publicAdventure ? { publicAdventure } : {}
}

function latestAdventureConsequence(memory: LocationRoomAdventureMemory): unknown {
  return memory.consequenceLedger[memory.consequenceLedger.length - 1] ?? memory.lastOutcome ?? null
}

function buildLastBeatOutcome(output: GameMasterBeatOutput, sourceId: string): LocationRoomAdventurePatch {
  const summary = output.publicNarration || output.stateAfter.currentObjective || output.stateAfter.stateSummary
  return normalizeAdventurePatch({
    lastOutcome: {
      kind: 'beat',
      sourceId,
      summary,
    },
  }, { sourceId })
}

function buildLastSceneCheckOutcome(input: {
  sceneSourceId: string
  tier: string
  summary: string
}): LocationRoomAdventurePatch {
  return normalizeAdventurePatch({
    lastOutcome: {
      kind: 'scene_check',
      sourceId: input.sceneSourceId,
      tier: input.tier,
      summary: input.summary,
    },
  }, { sourceId: input.sceneSourceId })
}

function storeableDeclaredAction(
  action: LocationRoomDeclaredAction | null | undefined,
  content: string,
  activeDecision: LocationRoomAdventureMemory['activeDecision']
): LocationRoomDeclaredAction | null {
  return normalizeDeclaredAction(action ?? { summary: content }, { activeDecision })
}

type StoredBeatCharacterAction = {
  content: string
  officialAgentId: string | null
  authorName: string | null
}

function normalizeStoredBeatCharacterAction(value: unknown): StoredBeatCharacterAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const content = typeof source.content === 'string' ? source.content.replace(/\s+/g, ' ').trim() : ''
  if (!content) return null
  return {
    content: content.slice(0, 500).trim(),
    officialAgentId: typeof source.officialAgentId === 'string' && source.officialAgentId.trim()
      ? source.officialAgentId.trim()
      : null,
    authorName: typeof source.authorName === 'string' && source.authorName.trim()
      ? source.authorName.trim().slice(0, 120)
      : null,
  }
}

function storeableCharacterAction(input: {
  content: string
  officialAgentId: string | null
  authorName: string
}): StoredBeatCharacterAction {
  return {
    content: input.content,
    officialAgentId: input.officialAgentId,
    authorName: input.authorName,
  }
}

function mergeNormalAdventureMetadata(input: {
  metadata: Record<string, unknown>
  gmPatch: LocationRoomAdventurePatch
  declaredAction: LocationRoomDeclaredAction | null
  tokenId: number
  beatId: string
  output: GameMasterBeatOutput
}): Record<string, unknown> {
  const beatSourceId = adventureSourceIdForBeat(input.beatId)
  let metadata = mergeAdventureMetadata(input.metadata, input.gmPatch, { sourceId: beatSourceId })
  metadata = recordAdventureDeclaredAction(metadata, input.declaredAction, {
    tokenId: input.tokenId,
    beatId: input.beatId,
  })
  metadata = mergeAdventureMetadata(metadata, buildLastBeatOutcome(input.output, beatSourceId), { sourceId: beatSourceId })
  return metadata
}

const SAFE_GM_GENERATION_ERROR_CATEGORIES = new Set([
  'empty_response',
  'missing_json_object',
  'invalid_json',
  'speaker_constraint',
  'token_constraint',
  'progression_contract',
  'missing_required_field',
  'validation_error',
  'repair_transport_error',
])

function normalizeDiagnosticsCategory(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return SAFE_GM_GENERATION_ERROR_CATEGORIES.has(value) ? value : undefined
}

function normalizeDiagnosticsLength(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(100000, Math.floor(value)))
}

function normalizeDiagnosticsFlags(value: unknown): GameMasterGenerationResponseFlags | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const flags = value as Partial<Record<keyof GameMasterGenerationResponseFlags, unknown>>
  return {
    empty: flags.empty === true,
    hasJsonObject: flags.hasJsonObject === true,
    fencedJson: flags.fencedJson === true,
    startsWithJsonObject: flags.startsWithJsonObject === true,
  }
}

function sanitizeGameMasterGenerationDiagnostics(value: unknown): GameMasterGenerationDiagnostics | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Partial<Record<keyof GameMasterGenerationDiagnostics, unknown>>
  const status = source.status === 'accepted' || source.status === 'repaired' || source.status === 'repair_failed'
    ? source.status
    : null
  if (!status) return null

  return {
    status,
    repairAttempted: source.repairAttempted === true,
    repaired: source.repaired === true,
    ...(normalizeDiagnosticsCategory(source.initialErrorCategory)
      ? { initialErrorCategory: normalizeDiagnosticsCategory(source.initialErrorCategory) }
      : {}),
    ...(normalizeDiagnosticsCategory(source.repairErrorCategory)
      ? { repairErrorCategory: normalizeDiagnosticsCategory(source.repairErrorCategory) }
      : {}),
    ...(normalizeDiagnosticsLength(source.initialResponseLength) !== undefined
      ? { initialResponseLength: normalizeDiagnosticsLength(source.initialResponseLength) }
      : {}),
    ...(normalizeDiagnosticsLength(source.repairResponseLength) !== undefined
      ? { repairResponseLength: normalizeDiagnosticsLength(source.repairResponseLength) }
      : {}),
    ...(normalizeDiagnosticsFlags(source.initialResponseFlags)
      ? { initialResponseFlags: normalizeDiagnosticsFlags(source.initialResponseFlags) }
      : {}),
    ...(normalizeDiagnosticsFlags(source.repairResponseFlags)
      ? { repairResponseFlags: normalizeDiagnosticsFlags(source.repairResponseFlags) }
      : {}),
  }
}

function getGameMasterGenerationDiagnostics(error: unknown): GameMasterGenerationDiagnostics | null {
  if (error instanceof GameMasterBeatGenerationError) {
    return sanitizeGameMasterGenerationDiagnostics(error.diagnostics)
  }
  if (!error || typeof error !== 'object') return null
  return sanitizeGameMasterGenerationDiagnostics((error as { diagnostics?: unknown }).diagnostics)
}

function shouldAppendGameMasterMessage(beat: LocationRoomNarrativeBeat, output: GameMasterBeatOutput): boolean {
  if (!output.publicNarration) return false
  return !['game_master_message_appended', 'character_appended', 'completed'].includes(beat.status)
}

function toCharacterNarrativeContext(
  output: GameMasterBeatOutput,
  activeDecision: LocationRoomAdventureMemory['activeDecision']
): LocationRoomNarrativeTurnContext {
  return {
    stateSummary: output.stateAfter.stateSummary,
    currentObjective: output.stateAfter.currentObjective,
    openThreads: output.stateAfter.openThreads,
    speakerInstruction: output.speakerInstruction,
    publicNarration: output.publicNarration,
    activeDecision,
    sceneCheck: output.sceneCheckRequest
      ? {
        mode: 'requested',
        request: output.sceneCheckRequest,
        contextualChecks: output.sceneCheckRequest.contextualChecks,
      }
      : null,
  }
}

function messageIdsWith(existing: string[], id: string): string[] {
  return existing.includes(id) ? existing : [...existing, id]
}

function sceneCheckIdForBeat(
  beat: LocationRoomNarrativeBeat,
  existingId: string | null,
  adjudication: SceneCheckAdjudication
): string {
  if (existingId) return existingId
  if (adjudication.decision !== 'run') return `scene_check:${beat.id}`
  const sourceId = adjudication.request?.id ?? adjudication.proposal?.id
  return sourceId ? `scene_check:${beat.id}:${sourceId}` : `scene_check:${beat.id}`
}

function sceneRollCardContent(publicRolls: PublicLocationRoomGameplayRolls): string {
  const action = publicRolls.action
  const checkLabel = action.checkLabel?.trim() || action.checkType?.replace(/_/g, ' ') || action.actionType.replace(/_/g, ' ')
  const total = typeof action.total === 'number' ? ` total ${action.total}` : null
  const dc = typeof action.dc === 'number' ? ` vs DC ${action.dc}` : null
  const outcome = action.outcome && action.outcome !== 'unknown'
    ? ` — ${action.outcome.replace(/_/g, ' ')}`
    : null

  return [
    checkLabel ? `The scene ${checkLabel} check resolves` : 'The scene check resolves',
    total,
    dc,
    outcome,
  ].filter(Boolean).join('') + '.'
}

function fallbackSceneCheckOutcome(input: {
  gameMasterAgentId: string
  narrativeState: LocationRoomNarrativeStateSnapshot
  resolution: SceneCheckResolution
}): GameMasterSceneCheckOutcomeOutput {
  const roll = input.resolution.roll
  const actor = input.resolution.actorName ?? `#${input.resolution.actorTokenId}`
  const outcome = roll.tier.replace(/_/g, ' ')
  const publicNarration = `${actor}'s ${roll.checkLabel.toLowerCase()} check resolves as ${outcome}: ${roll.total} against DC ${roll.dc}. The scene shifts around that result, leaving the next choice in the characters' hands.`

  return {
    gameMasterAgentId: input.gameMasterAgentId,
    publicNarration,
    stateAfter: {
      stateSummary: `${input.narrativeState.stateSummary} ${actor}'s ${input.resolution.actionIntent.replace(/_/g, ' ')} check resolved as ${outcome}.`.trim(),
      currentObjective: input.narrativeState.currentObjective || 'Respond to the consequence of the resolved scene check.',
      openThreads: input.narrativeState.openThreads.length > 0
        ? input.narrativeState.openThreads
        : ['How will the room respond to the scene-check result?'],
    },
    adventurePatch: normalizeAdventurePatch({
      currentStakes: 'The room is now shaped by the resolved scene check.',
      consequence: {
        summary: `${actor}'s check leaves a durable consequence for the next choice.`,
        status: roll.tier === 'success' || roll.tier === 'critical_success' ? 'advantage' : 'complication',
        tier: roll.tier,
      },
    }),
    metadata: { fallbackUsed: true },
  }
}

export class DefaultLocationRoomNarrativeCoordinator implements LocationRoomNarrativeCoordinator {
  constructor(
    private readonly repository: LocationRoomRepository = locationRoomRepository,
    private readonly narrativeRepository: LocationRoomNarrativeRepository = locationRoomNarrativeRepository,
    private readonly gameMasterGenerator: GameMasterBeatGenerator = officialGameMasterBeatGenerator,
    private readonly turnGenerator: OfficialLocationRoomTurnGenerator = officialLocationRoomTurnGenerator,
    private readonly gameMasterAgentResolver: GameMasterAgentResolver = gameMasterAgentService
  ) {}

  async processTurn(input: ProcessNarrativeLocationRoomTurnInput): Promise<ProcessNarrativeLocationRoomTurnResult> {
    const resolvedGameMasterAgentId = await this.gameMasterAgentResolver.resolveRuntimeGameMasterAgentId()
    const narrativeState = await this.narrativeRepository.ensureStateForRoom({ room: input.room })
    const publicAuthorMessageStats = await this.repository.getPublicAuthorMessageStats(input.room.id)
    const progressionContext = buildGameMasterBeatProgressionContext({
      room: input.room,
      narrativeState,
      publicAuthorMessageStats,
    })
    const stateBefore = toNarrativeStateSnapshot(narrativeState)
    let beat = await this.narrativeRepository.createOrReuseBeat({
      room: input.room,
      tick: input.tick,
      selectedTokenId: input.speaker.tokenId,
      gameMasterAgentId: resolvedGameMasterAgentId,
      stateBefore,
      metadata: {
        source: 'location-room-narrative-coordinator',
        roomId: input.room.id,
        locationId: input.room.locationId,
      },
    })
    const beatGameMasterAgentId = beat.gameMasterAgentId ?? resolvedGameMasterAgentId
    const beatAdventureSourceId = adventureSourceIdForBeat(beat.id)

    let gameMasterOutput: GameMasterBeatOutput
    if (isUsableGeneratedBeat(beat)) {
      gameMasterOutput = withSourcedGameMasterPatch(
        beatToOutput(beat, beatGameMasterAgentId, progressionContext),
        beatAdventureSourceId
      )
    } else {
      try {
        gameMasterOutput = await this.gameMasterGenerator.generateBeat({
          gameMasterAgentId: beatGameMasterAgentId,
          room: input.room,
          tick: input.tick,
          participants: input.participants,
          speaker: input.speaker,
          recentMessages: input.recentMessages,
          narrativeState,
          progressionContext,
        })
        validateGameMasterBeatProgressionContract({
          ...gameMasterOutput,
          progressionContext,
        })
        gameMasterOutput = withSourcedGameMasterPatch(gameMasterOutput, beatAdventureSourceId)
      } catch (error) {
        const gmGeneration = getGameMasterGenerationDiagnostics(error)
        if (gmGeneration) {
          await this.narrativeRepository.markBeatFailed(beat.id, error, {
            metadata: {
              ...beat.metadata,
              gmGeneration,
            },
          }).catch(() => null)
        }
        throw error
      }

      beat = await this.narrativeRepository.storeBeatGameMasterOutput(beat.id, {
        gameMasterAgentId: gameMasterOutput.gameMasterAgentId,
        publicNarration: gameMasterOutput.publicNarration,
        speakerInstruction: gameMasterOutput.speakerInstruction,
        stateAfter: gameMasterOutput.stateAfter,
        metadata: toGameMasterBeatMetadata(gameMasterOutput),
      })
    }

    const adventureAfterGameMasterPatch = normalizeAdventureMemory(
      mergeAdventureMetadata(narrativeState.metadata, gameMasterOutput.adventurePatch, { sourceId: beatAdventureSourceId })
    )

    if (shouldAppendGameMasterMessage(beat, gameMasterOutput)) {
      const publicNarration = gameMasterOutput.publicNarration
      if (!publicNarration) {
        throw new Error('Location room narrative beat is missing public narration')
      }

      await this.repository.appendMessage({
        roomId: input.room.id,
        locationId: input.room.locationId,
        tickId: input.tick.id,
        authorKind: 'game_master',
        tokenId: null,
        officialAgentId: gameMasterOutput.gameMasterAgentId,
        authorName: GAME_MASTER_AUTHOR_NAME,
        content: publicNarration,
        visibility: 'public',
        metadata: {
          source: 'location-room-game-master',
          triggerType: input.tick.triggerType,
          beatId: beat.id,
          messageDomain: 'narrative',
          messageKind: 'gm_beat',
          ttrpgPhase: gameMasterOutput.ttrpgPhase,
          ...publicAdventureMetadata({
            currentStakes: gameMasterOutput.adventurePatch.currentStakes ?? adventureAfterGameMasterPatch.currentStakes,
            activeDecision: adventureAfterGameMasterPatch.activeDecision,
            consequenceLedger: gameMasterOutput.adventurePatch.consequenceLedger,
            clocks: adventureAfterGameMasterPatch.clocks,
          }),
        },
      })

      try {
        beat = await this.narrativeRepository.markBeatGameMasterMessageAppended(beat.id, {
          gameMasterAgentId: gameMasterOutput.gameMasterAgentId,
          publicNarration: gameMasterOutput.publicNarration,
          speakerInstruction: gameMasterOutput.speakerInstruction,
          stateAfter: gameMasterOutput.stateAfter,
          metadata: toGameMasterBeatMetadata(gameMasterOutput),
        })
      } catch (error) {
        console.warn('[Location Room Narrative] Failed to mark game-master message appended after public append:', error)
      }
    }

    let storedSceneCheck = normalizeNarrativeSceneCheckMetadata(beat.metadata)
    const storedCharacterAction = normalizeStoredBeatCharacterAction(beat.metadata.characterAction)
    let content = storedSceneCheck.characterAction?.content ?? storedCharacterAction?.content ?? null
    let officialAgentId = storedSceneCheck.characterAction?.officialAgentId ?? storedCharacterAction?.officialAgentId ?? null
    let sceneCheckProposal = storedSceneCheck.proposal
    let sceneCheckProposalError = storedSceneCheck.proposalError
    let declaredAction = normalizeDeclaredAction(beat.metadata.declaredAction, {
      activeDecision: adventureAfterGameMasterPatch.activeDecision,
    })

    if (!content) {
      const generated = await this.turnGenerator.generateTurn({
        room: input.room,
        speaker: input.speaker,
        participants: input.participants,
        recentMessages: input.recentMessages,
        narrativeContext: toCharacterNarrativeContext(gameMasterOutput, adventureAfterGameMasterPatch.activeDecision),
      })
      content = normalizeLocationRoomGeneratedContent(generated.content)
      officialAgentId = generated.officialAgentId
      declaredAction = storeableDeclaredAction(generated.declaredAction, content ?? '', adventureAfterGameMasterPatch.activeDecision)
      sceneCheckProposal = generated.sceneCheckProposal ?? null
      sceneCheckProposalError = generated.sceneCheckProposalError ?? null
    }

    if (!content) {
      throw new Error('Official ElizaOS generated an empty location-room turn')
    }

    declaredAction = declaredAction ?? storeableDeclaredAction(null, content, adventureAfterGameMasterPatch.activeDecision)

    let sceneCheckMetadata = (gameMasterOutput.sceneCheckRequest || sceneCheckProposal || sceneCheckProposalError || storedSceneCheck.resolution)
      ? mergeNarrativeSceneCheckMetadata({
        ...toGameMasterBeatMetadata(gameMasterOutput),
        declaredAction,
        characterAction: storeableCharacterAction({ content, officialAgentId, authorName: input.speaker.name }),
      }, {
        id: storedSceneCheck.id,
        proposal: sceneCheckProposal ?? null,
        proposalError: sceneCheckProposalError ?? null,
        adjudication: storedSceneCheck.adjudication,
        resolution: storedSceneCheck.resolution,
        publicRolls: storedSceneCheck.publicRolls,
        messageIds: storedSceneCheck.messageIds,
        characterAction: storedSceneCheck.characterAction,
        gmOutcome: storedSceneCheck.gmOutcome,
      })
      : {
        ...toGameMasterBeatMetadata(gameMasterOutput),
        declaredAction,
        characterAction: storeableCharacterAction({ content, officialAgentId, authorName: input.speaker.name }),
      }

    if (gameMasterOutput.sceneCheckRequest || sceneCheckProposal || sceneCheckProposalError || storedSceneCheck.resolution) {
      try {
        beat = await this.narrativeRepository.patchBeatMetadata(beat.id, sceneCheckMetadata)
        storedSceneCheck = normalizeNarrativeSceneCheckMetadata(beat.metadata)
      } catch (error) {
        console.warn('[Location Room Narrative] Failed to patch scene-check proposal metadata:', error)
      }
    } else if (declaredAction && !beat.metadata.declaredAction) {
      try {
        beat = await this.narrativeRepository.patchBeatMetadata(beat.id, sceneCheckMetadata)
      } catch (error) {
        console.warn('[Location Room Narrative] Failed to patch declared-action metadata:', error)
      }
    }

    const adjudication = storedSceneCheck.adjudication ?? adjudicateSceneCheck({
      actorTokenId: input.speaker.tokenId,
      actorName: input.speaker.name,
      request: storedSceneCheck.request,
      proposal: sceneCheckProposal,
    })

    if (adjudication.decision === 'skip') {
      const normalAdventureMetadata = mergeNormalAdventureMetadata({
        metadata: narrativeState.metadata,
        gmPatch: gameMasterOutput.adventurePatch,
        declaredAction,
        tokenId: input.speaker.tokenId,
        beatId: beat.id,
        output: gameMasterOutput,
      })
      const normalAdventureMemory = normalizeAdventureMemory(normalAdventureMetadata)

      const message = await this.repository.appendMessage({
        roomId: input.room.id,
        locationId: input.room.locationId,
        tickId: input.tick.id,
        authorKind: 'agent',
        tokenId: input.speaker.tokenId,
        officialAgentId,
        authorName: input.speaker.name,
        content,
        visibility: 'public',
        dedupeKey: `narrative:${beat.id}:character_reaction`,
        metadata: {
          source: 'scheduled-location-room-tick',
          triggerType: input.tick.triggerType,
          narrative: true,
          beatId: beat.id,
          messageDomain: 'narrative',
          messageKind: 'character_reaction',
          ttrpgPhase: gameMasterOutput.ttrpgPhase,
          ...publicAdventureMetadata({
            currentStakes: normalAdventureMemory.currentStakes,
            activeDecision: normalAdventureMemory.activeDecision,
            declaredAction: normalAdventureMemory.lastDeclaredAction ?? declaredAction,
            consequence: latestAdventureConsequence(normalAdventureMemory),
            clocks: normalAdventureMemory.clocks,
          }),
          ...(gameMasterOutput.sceneCheckRequest || sceneCheckProposal || sceneCheckProposalError
            ? {
              sceneCheck: {
                request: gameMasterOutput.sceneCheckRequest,
                proposal: sceneCheckProposal ?? null,
                proposalError: sceneCheckProposalError ?? null,
                adjudication,
              },
              sceneCheckRequest: gameMasterOutput.sceneCheckRequest,
              sceneCheckProposal: sceneCheckProposal ?? null,
              sceneCheckProposalError: sceneCheckProposalError ?? null,
            }
            : {}),
        },
      })

      try {
        if (sceneCheckProposal || sceneCheckProposalError) {
          await this.narrativeRepository.patchBeatMetadata(beat.id, mergeNarrativeSceneCheckMetadata(sceneCheckMetadata, {
            adjudication,
          }))
        }
        await this.narrativeRepository.markBeatCharacterAppended(beat.id)
        await this.narrativeRepository.updateState(input.room, {
          stateSummary: gameMasterOutput.stateAfter.stateSummary,
          currentObjective: gameMasterOutput.stateAfter.currentObjective,
          openThreads: gameMasterOutput.stateAfter.openThreads,
          metadata: mergeNarrativeTtrpgMetadata(normalAdventureMetadata, {
            ttrpgPhase: gameMasterOutput.ttrpgPhase,
            combatReadiness: gameMasterOutput.combatReadiness,
            threatLevel: gameMasterOutput.threatLevel,
            requestedGameplayAction: gameMasterOutput.requestedGameplayAction,
            lastEncounterSeed: gameMasterOutput.encounterSeed,
            lastCombatTriggerBeatId: gameMasterOutput.requestedGameplayAction === 'start_combat'
              ? beat.id
              : null,
          }, {
            source: 'location-room-narrative-coordinator',
            lastBeatId: beat.id,
            lastTickId: input.tick.id,
            lastSelectedTokenId: input.speaker.tokenId,
          }),
        })
        await this.narrativeRepository.markBeatCompleted(beat.id)
      } catch (error) {
        await this.narrativeRepository.markBeatFailed(beat.id, error).catch(() => null)
      }

      const hasSceneCheckSignal = Boolean(storedSceneCheck.request || sceneCheckProposal || storedSceneCheck.proposal || sceneCheckProposalError || storedSceneCheck.proposalError)
      return {
        selectedTokenId: input.speaker.tokenId,
        messageId: message.id,
        ...(hasSceneCheckSignal
          ? {
            sceneCheckDiagnostics: {
              requestPresent: Boolean(storedSceneCheck.request),
              proposalPresent: Boolean(sceneCheckProposal ?? storedSceneCheck.proposal),
              proposalErrorPresent: Boolean(sceneCheckProposalError ?? storedSceneCheck.proposalError),
              selected: false,
              skipReason: adjudication.reason,
            },
          }
          : {}),
      }
    }

    let messageIds: string[] = []
    const sceneCheckId = sceneCheckIdForBeat(beat, storedSceneCheck.id, adjudication)
    const sceneAdventureSourceId = adventureSourceIdForSceneCheck(sceneCheckId)
    sceneCheckMetadata = mergeNarrativeSceneCheckMetadata(sceneCheckMetadata, {
      id: sceneCheckId,
      adjudication,
      characterAction: storedSceneCheck.characterAction ?? {
        content,
        officialAgentId,
        authorName: input.speaker.name,
      },
    })
    beat = await this.narrativeRepository.patchBeatMetadata(beat.id, sceneCheckMetadata)
    storedSceneCheck = normalizeNarrativeSceneCheckMetadata(beat.metadata)
    let actionAdventureMetadata = mergeAdventureMetadata(narrativeState.metadata, gameMasterOutput.adventurePatch, {
      sourceId: beatAdventureSourceId,
    })
    actionAdventureMetadata = recordAdventureDeclaredAction(actionAdventureMetadata, declaredAction, {
      tokenId: input.speaker.tokenId,
      beatId: beat.id,
    })
    const actionAdventureMemory = normalizeAdventureMemory(actionAdventureMetadata)

    const actionMessage = await this.repository.appendMessage({
      roomId: input.room.id,
      locationId: input.room.locationId,
      tickId: input.tick.id,
      authorKind: 'agent',
      tokenId: input.speaker.tokenId,
      officialAgentId,
      authorName: input.speaker.name,
      content: storedSceneCheck.characterAction?.content ?? content,
      visibility: 'public',
      dedupeKey: `scene_check:${beat.id}:character_action`,
      metadata: {
        source: 'scheduled-location-room-tick',
        triggerType: input.tick.triggerType,
        narrative: true,
        beatId: beat.id,
        sceneCheck: true,
        sceneCheckId,
        messageDomain: 'narrative',
        messageKind: 'character_action',
        ttrpgPhase: gameMasterOutput.ttrpgPhase,
        adjudication,
        sceneCheckRequest: storedSceneCheck.request,
        sceneCheckProposal: storedSceneCheck.proposal,
        sceneCheckProposalError: storedSceneCheck.proposalError,
        ...publicAdventureMetadata({
          currentStakes: actionAdventureMemory.currentStakes,
          activeDecision: actionAdventureMemory.activeDecision,
          declaredAction: actionAdventureMemory.lastDeclaredAction ?? declaredAction,
          clocks: actionAdventureMemory.clocks,
        }),
      },
    })
    messageIds = messageIdsWith(messageIds, actionMessage.id)

    let resolution = storedSceneCheck.resolution
    let publicRolls = storedSceneCheck.publicRolls
    if (!resolution) {
      resolution = resolveSceneCheck({ adjudication })
      publicRolls = projectPublicSceneCheckRolls(resolution, { sceneCheckId })
      beat = await this.narrativeRepository.patchBeatMetadata(beat.id, mergeNarrativeSceneCheckMetadata(beat.metadata, {
        id: sceneCheckId,
        adjudication,
        resolution,
        publicRolls,
        messageIds: {
          ...storedSceneCheck.messageIds,
          characterAction: actionMessage.id,
        },
      }))
      storedSceneCheck = normalizeNarrativeSceneCheckMetadata(beat.metadata)
    } else if (!publicRolls) {
      publicRolls = projectPublicSceneCheckRolls(resolution, { sceneCheckId })
    }

    const rollCardMessage = await this.repository.appendMessage({
      roomId: input.room.id,
      locationId: input.room.locationId,
      tickId: input.tick.id,
      authorKind: 'game_master',
      tokenId: null,
      officialAgentId: gameMasterOutput.gameMasterAgentId,
      authorName: GAME_MASTER_AUTHOR_NAME,
      content: sceneRollCardContent(publicRolls),
      visibility: 'public',
      dedupeKey: `scene_check:${beat.id}:roll_card`,
      metadata: {
        source: 'location-room-scene-check',
        triggerType: input.tick.triggerType,
        narrative: true,
        beatId: beat.id,
        sceneCheck: true,
        sceneCheckId,
        messageDomain: 'narrative',
        messageKind: 'roll_card',
        ttrpgPhase: gameMasterOutput.ttrpgPhase,
        publicRolls,
      },
    })
    messageIds = messageIdsWith(messageIds, rollCardMessage.id)

    beat = await this.narrativeRepository.patchBeatMetadata(beat.id, mergeNarrativeSceneCheckMetadata(beat.metadata, {
      messageIds: {
        ...storedSceneCheck.messageIds,
        characterAction: actionMessage.id,
        rollCard: rollCardMessage.id,
      },
      publicRolls,
    }))
    storedSceneCheck = normalizeNarrativeSceneCheckMetadata(beat.metadata)

    let outcome = storedSceneCheck.gmOutcome
    if (!outcome) {
      const outcomeNarrativeState = {
        ...narrativeState,
        stateSummary: gameMasterOutput.stateAfter.stateSummary,
        currentObjective: gameMasterOutput.stateAfter.currentObjective,
        openThreads: gameMasterOutput.stateAfter.openThreads,
      }
      const generatedOutcome = this.gameMasterGenerator.generateSceneCheckOutcome
        ? await this.gameMasterGenerator.generateSceneCheckOutcome({
          gameMasterAgentId: gameMasterOutput.gameMasterAgentId,
          room: input.room,
          tick: input.tick,
          participants: input.participants,
          speaker: input.speaker,
          recentMessages: input.recentMessages,
          narrativeState: outcomeNarrativeState,
          characterAction: actionMessage.content,
          sceneCheckId,
          resolution,
          publicRolls,
        })
        : fallbackSceneCheckOutcome({
          gameMasterAgentId: gameMasterOutput.gameMasterAgentId,
          narrativeState: gameMasterOutput.stateAfter,
          resolution,
        })

      const outcomeAdventurePatch = withAdventurePatchSource(
        generatedOutcome.adventurePatch ?? generatedOutcome.metadata?.adventurePatch,
        sceneAdventureSourceId
      )
      outcome = {
        gameMasterAgentId: generatedOutcome.gameMasterAgentId,
        publicNarration: generatedOutcome.publicNarration,
        stateAfter: generatedOutcome.stateAfter,
        metadata: {
          ...generatedOutcome.metadata,
          adventurePatch: outcomeAdventurePatch,
        },
      }
      beat = await this.narrativeRepository.patchBeatMetadata(beat.id, mergeNarrativeSceneCheckMetadata(beat.metadata, {
        gmOutcome: outcome,
      }))
      storedSceneCheck = normalizeNarrativeSceneCheckMetadata(beat.metadata)
    }

    const outcomeAdventurePatch = withAdventurePatchSource(outcome.metadata?.adventurePatch, sceneAdventureSourceId)
    let sceneAdventureMetadata = actionAdventureMetadata
    sceneAdventureMetadata = mergeAdventureMetadata(sceneAdventureMetadata, outcomeAdventurePatch, {
      sourceId: sceneAdventureSourceId,
    })
    sceneAdventureMetadata = mergeAdventureMetadata(sceneAdventureMetadata, buildLastSceneCheckOutcome({
      sceneSourceId: sceneAdventureSourceId,
      tier: resolution.roll.tier,
      summary: outcome.publicNarration,
    }), { sourceId: sceneAdventureSourceId })
    const sceneAdventureMemory = normalizeAdventureMemory(sceneAdventureMetadata)

    const outcomeMessage = await this.repository.appendMessage({
      roomId: input.room.id,
      locationId: input.room.locationId,
      tickId: input.tick.id,
      authorKind: 'game_master',
      tokenId: null,
      officialAgentId: outcome.gameMasterAgentId,
      authorName: GAME_MASTER_AUTHOR_NAME,
      content: outcome.publicNarration,
      visibility: 'public',
      dedupeKey: `scene_check:${beat.id}:gm_outcome`,
      metadata: {
        source: 'location-room-scene-check',
        triggerType: input.tick.triggerType,
        narrative: true,
        beatId: beat.id,
        sceneCheck: true,
        sceneCheckId,
        messageDomain: 'narrative',
        messageKind: 'gm_outcome',
        ttrpgPhase: gameMasterOutput.ttrpgPhase,
        ...publicAdventureMetadata({
          currentStakes: sceneAdventureMemory.currentStakes,
          activeDecision: sceneAdventureMemory.activeDecision,
          consequence: latestAdventureConsequence(sceneAdventureMemory),
          clocks: sceneAdventureMemory.clocks,
        }),
        rollFacts: {
          actorTokenId: resolution.actorTokenId,
          actionIntent: resolution.actionIntent,
          checkType: resolution.roll.checkType,
          checkLabel: resolution.roll.checkLabel,
          d20: resolution.roll.roll.total,
          modifier: resolution.roll.modifier,
          total: resolution.roll.total,
          dc: resolution.roll.dc,
          tier: resolution.roll.tier,
        },
      },
    })
    messageIds = messageIdsWith(messageIds, outcomeMessage.id)

    try {
      await this.narrativeRepository.patchBeatMetadata(beat.id, mergeNarrativeSceneCheckMetadata(beat.metadata, {
        messageIds: {
          ...storedSceneCheck.messageIds,
          characterAction: actionMessage.id,
          rollCard: rollCardMessage.id,
          gmOutcome: outcomeMessage.id,
        },
      }))
      await this.narrativeRepository.markBeatCharacterAppended(beat.id)
      await this.narrativeRepository.updateState(input.room, {
        stateSummary: outcome.stateAfter.stateSummary,
        currentObjective: outcome.stateAfter.currentObjective,
        openThreads: outcome.stateAfter.openThreads,
        metadata: mergeNarrativeTtrpgMetadata(sceneAdventureMetadata, {
          ttrpgPhase: gameMasterOutput.ttrpgPhase,
          combatReadiness: gameMasterOutput.combatReadiness,
          threatLevel: gameMasterOutput.threatLevel,
          requestedGameplayAction: gameMasterOutput.requestedGameplayAction,
          lastEncounterSeed: gameMasterOutput.encounterSeed,
          lastCombatTriggerBeatId: gameMasterOutput.requestedGameplayAction === 'start_combat'
            ? beat.id
            : null,
        }, {
          source: 'location-room-scene-check',
          lastBeatId: beat.id,
          lastTickId: input.tick.id,
          lastSelectedTokenId: input.speaker.tokenId,
          lastSceneCheckId: sceneCheckId,
          lastSceneCheckOutcome: resolution.roll.tier,
        }),
      })
      await this.narrativeRepository.markBeatCompleted(beat.id)
    } catch (error) {
      await this.narrativeRepository.markBeatFailed(beat.id, error).catch(() => null)
    }

    return {
      selectedTokenId: input.speaker.tokenId,
      messageId: outcomeMessage.id,
      messageIds,
      sceneCheckId,
      sceneCheckDiagnostics: {
        requestPresent: Boolean(storedSceneCheck.request),
        proposalPresent: Boolean(storedSceneCheck.proposal),
        proposalErrorPresent: Boolean(storedSceneCheck.proposalError),
        selected: true,
      },
    }
  }

  async markTickFailed(tickId: string, error: unknown, options: { dead?: boolean } = {}): Promise<void> {
    const beat = await this.narrativeRepository.findBeatByTickId(tickId)
    if (!beat) return

    if (options.dead) {
      await this.narrativeRepository.markBeatDead(beat.id, error)
      return
    }

    await this.narrativeRepository.markBeatFailed(beat.id, error)
  }
}

export const locationRoomNarrativeCoordinator = new DefaultLocationRoomNarrativeCoordinator()
