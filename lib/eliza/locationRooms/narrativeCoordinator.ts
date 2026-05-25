import { gameMasterAgentService } from '@/lib/eliza/gameMasterAgent/service'
import {
  GAME_MASTER_AUTHOR_NAME,
  GameMasterBeatGenerationError,
  officialGameMasterBeatGenerator,
  validateGameMasterBeatProgressionContract,
  type GameMasterBeatGenerator,
  type GameMasterBeatOutput,
  type GameMasterGenerationDiagnostics,
  type GameMasterGenerationResponseFlags,
} from './gameMasterGenerator'
import {
  locationRoomNarrativeRepository,
  type LocationRoomNarrativeRepository,
} from './narrativeRepository'
import {
  mergeNarrativeTtrpgMetadata,
  normalizeNarrativeTtrpgMetadata,
  toNarrativeStateSnapshot,
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
import type {
  LocationRoom,
  LocationRoomMessage,
  LocationRoomNarrativeTurnContext,
  LocationRoomParticipant,
  LocationRoomTick,
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
  messageId: string
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
  fallbackGameMasterAgentId: string
): GameMasterBeatOutput {
  const stateAfter = getStateAfterSnapshot(beat.stateAfter)
  if (!beat.speakerInstruction || !stateAfter) {
    throw new Error('Location room narrative beat is missing generated output')
  }

  const ttrpg = normalizeNarrativeTtrpgMetadata(beat.metadata)

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
    metadata: beat.metadata,
  }

  validateGameMasterBeatProgressionContract(output)
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
  }
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

function toCharacterNarrativeContext(output: GameMasterBeatOutput): LocationRoomNarrativeTurnContext {
  return {
    stateSummary: output.stateAfter.stateSummary,
    currentObjective: output.stateAfter.currentObjective,
    openThreads: output.stateAfter.openThreads,
    speakerInstruction: output.speakerInstruction,
    publicNarration: output.publicNarration,
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

    let gameMasterOutput: GameMasterBeatOutput
    if (isUsableGeneratedBeat(beat)) {
      gameMasterOutput = beatToOutput(beat, beatGameMasterAgentId)
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
        })
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

    const generated = await this.turnGenerator.generateTurn({
      room: input.room,
      speaker: input.speaker,
      participants: input.participants,
      recentMessages: input.recentMessages,
      narrativeContext: toCharacterNarrativeContext(gameMasterOutput),
    })
    const content = normalizeLocationRoomGeneratedContent(generated.content)

    if (!content) {
      throw new Error('Official ElizaOS generated an empty location-room turn')
    }

    const message = await this.repository.appendMessage({
      roomId: input.room.id,
      locationId: input.room.locationId,
      tickId: input.tick.id,
      authorKind: 'agent',
      tokenId: input.speaker.tokenId,
      officialAgentId: generated.officialAgentId,
      authorName: input.speaker.name,
      content,
      visibility: 'public',
      metadata: {
        source: 'scheduled-location-room-tick',
        triggerType: input.tick.triggerType,
        narrative: true,
        beatId: beat.id,
        messageDomain: 'narrative',
        messageKind: 'character_reaction',
        ttrpgPhase: gameMasterOutput.ttrpgPhase,
      },
    })

    try {
      await this.narrativeRepository.markBeatCharacterAppended(beat.id)
      await this.narrativeRepository.updateState(input.room, {
        stateSummary: gameMasterOutput.stateAfter.stateSummary,
        currentObjective: gameMasterOutput.stateAfter.currentObjective,
        openThreads: gameMasterOutput.stateAfter.openThreads,
        metadata: mergeNarrativeTtrpgMetadata(narrativeState.metadata, {
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

    return {
      selectedTokenId: input.speaker.tokenId,
      messageId: message.id,
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
