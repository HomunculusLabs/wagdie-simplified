import { normalizeSceneCheckEscalation } from '@/lib/eliza/locationRooms/encounterEscalation'
import type {
  GameMasterBeatGenerator,
  GameMasterBeatOutput,
  GenerateGameMasterBeatInput,
  GenerateGameMasterSceneCheckOutcomeInput,
  GameMasterSceneCheckOutcomeOutput,
} from '@/lib/eliza/locationRooms/gameMasterGenerator'
import { normalizeNarrativeTtrpgMetadata } from '@/lib/eliza/locationRooms/narrativeTypes'
import type { LocationRoomAdventurePatch, LocationRoomNarrativeStateSnapshot } from '@/lib/eliza/locationRooms/narrativeTypes'
import type {
  GenerateOfficialLocationRoomTurnInput,
  GenerateOfficialLocationRoomTurnResult,
  OfficialLocationRoomTurnGenerator,
} from '@/lib/eliza/locationRooms/officialTurnGenerator'
import { normalizeSceneCheckRequest } from '@/lib/eliza/locationRooms/sceneChecks/rules'
import type { SceneCheckActionIntent } from '@/lib/eliza/locationRooms/sceneChecks/types'
import type { NarrativeHarnessScenario, ScriptedRollProfile } from './scenarios'
import { FALLBACK_CHECK_TYPES } from './scenarios'

export class ScriptedGameMasterBeatGenerator implements GameMasterBeatGenerator {
  private turn = 0
  private outcomeTurn = 0

  constructor(private readonly scenario: NarrativeHarnessScenario) {}

  async generateBeat(input: GenerateGameMasterBeatInput): Promise<GameMasterBeatOutput> {
    this.turn += 1
    const shouldRequestCheck = this.turn % this.scenario.checkEvery === 0
    const checkIndex = Math.floor(this.turn / this.scenario.checkEvery)
    const actionIntent = this.actionIntentForTurn(checkIndex)
    const checkType = FALLBACK_CHECK_TYPES[checkIndex % FALLBACK_CHECK_TYPES.length]
    const sceneCheckNormalization = shouldRequestCheck
      ? normalizeSceneCheckRequest({
        id: `check-${this.scenario.id}-${this.turn}`,
        source: 'game_master',
        actionIntent,
        summary: `Resolve ${input.speaker.name}'s attempt to press deeper into ${this.scenario.locationName}: ${this.scenario.objective}`,
        rollChoice: { source: 'fixed', checkType },
        difficulty: this.turn % 6 === 0 ? 'hard' : 'normal',
      })
      : null
    const sceneCheckRequest = sceneCheckNormalization?.ok ? sceneCheckNormalization.value : null

    const stateAfter: LocationRoomNarrativeStateSnapshot = {
      stateSummary: `${this.scenario.premise} Progress marker ${this.turn}: ${input.speaker.name} has changed the room's leverage, and the next clue points toward ${this.scenario.objective}`,
      currentObjective: this.turn % 5 === 0
        ? `Choose whether to confront the source of ${this.scenario.locationName}'s problem or exploit it.`
        : this.scenario.objective,
      openThreads: [
        this.scenario.stakes,
        `Unresolved clue ${this.turn}: ${input.speaker.name} noticed a cost attached to the last choice.`,
      ],
    }

    const adventurePatch: LocationRoomAdventurePatch = {
      arcSummary: `${this.scenario.locationName}: ${this.scenario.premise}`,
      currentStakes: this.scenario.stakes,
      activeDecision: this.turn % 4 === 0 ? {
        id: `decision-${this.scenario.id}-${this.turn}`,
        prompt: `How should the party handle the newest pressure in ${this.scenario.locationName}?`,
        options: [
          { id: 'press', label: 'Press deeper', summary: 'Accept risk for a clearer answer.' },
          { id: 'bargain', label: 'Bargain sideways', summary: 'Trade time or leverage for safety.' },
          { id: 'withdraw', label: 'Withdraw and watch', summary: 'Yield tempo to learn who moves next.' },
        ],
      } : null,
      discoveries: [`${input.speaker.name} found evidence tied to ${this.scenario.openingImage}.`],
      clocks: [{ id: `clock-${this.scenario.id}`, label: 'Location pressure', value: Math.min(6, this.turn), max: 6, summary: this.scenario.stakes }],
      spatialContext: {
        currentArea: `${this.scenario.locationName} threshold floor`,
        landmarks: [this.scenario.openingImage, `${this.scenario.locationName} landmark ${this.turn}`],
        routes: [`main path through ${this.scenario.locationName}`, `side door toward ${this.scenario.objective}`],
        unresolvedSpatialQuestions: [`Which passage changes if ${input.speaker.name} presses the current choice?`],
      },
    }

    return {
      gameMasterAgentId: 'gm-harness',
      publicNarration: this.publicNarration(input.speaker.name, shouldRequestCheck),
      speakerInstruction: shouldRequestCheck
        ? `Have ${input.speaker.name} take a concrete risk. The scene check is about ${actionIntent}.`
        : `Invite ${input.speaker.name} to make a specific choice that changes the next beat.`,
      stateAfter,
      ttrpgPhase: this.turn < 4 ? 'exploration' : this.turn < 20 ? 'threat' : 'aftermath',
      combatReadiness: this.turn > 20 ? 'foreshadow' : 'none',
      threatLevel: Math.min(10, Math.ceil(this.turn / 3)),
      requestedGameplayAction: null,
      encounterSeed: null,
      sceneCheckRequest,
      adventurePatch,
      metadata: {
        currentObjective: stateAfter.currentObjective,
        selectedSpeakerTokenId: input.speaker.tokenId,
        ttrpgPhase: this.turn < 4 ? 'exploration' : this.turn < 20 ? 'threat' : 'aftermath',
        combatReadiness: this.turn > 20 ? 'foreshadow' : 'none',
        threatLevel: Math.min(10, Math.ceil(this.turn / 3)),
        sceneCheckRequest,
        adventurePatch,
      },
    }
  }

  async generateSceneCheckOutcome(input: GenerateGameMasterSceneCheckOutcomeInput): Promise<GameMasterSceneCheckOutcomeOutput> {
    const tier = input.resolution.roll.tier
    const failure = tier === 'failure' || tier === 'critical_failure'
    const partial = tier === 'partial_success'
    const consequence = failure
      ? `${input.speaker.name}'s mistake makes the location bite back: ${this.scenario.stakes}`
      : partial
        ? `${input.speaker.name} gets the clue, but it costs time, noise, and a new obligation.`
        : `${input.speaker.name} earns a clean advantage and forces the location to reveal a true seam.`

    this.outcomeTurn += 1
    const outcomeVerbs = ['splinters', 'answers', 'tightens', 'reveals', 'punishes', 'unlocks', 'bargains', 'twists', 'echoes', 'brands']
    const outcomeLead = `${this.scenario.locationName} ${outcomeVerbs[this.outcomeTurn % outcomeVerbs.length]} ${input.speaker.name}'s ${input.resolution.actionIntent} test with ${tier}`

    const publicNarration = failure
      ? `${outcomeLead}. ${input.characterAction} collapses into consequence: ${consequence} A witness, door, or omen now turns openly hostile, leaving the party with fewer safe options and a visible price to pay.`
      : `${outcomeLead}. ${input.characterAction} changes the scene. ${consequence} The party can act on this immediately: exploit the opening, protect the exposed character, or follow the clue before it cools.`
    const escalation = normalizeSceneCheckEscalation({
      narrativeState: input.narrativeState,
      rawEscalation: failure
        ? { decision: 'danger', dangerKind: 'monster_pressure' }
        : { decision: 'none', dangerKind: 'unknown', reason: 'scripted_success_no_escalation' },
      recentOutcomeSummary: publicNarration,
      fallbackSummary: publicNarration,
      rollTier: tier,
      selectedTokenId: input.resolution.actorTokenId,
    })

    return {
      gameMasterAgentId: input.gameMasterAgentId,
      publicNarration,
      stateAfter: {
        stateSummary: `${this.scenario.premise} Latest roll (${tier}) created this consequence: ${consequence}`,
        currentObjective: failure ? `Recover from the complication: ${this.scenario.stakes}` : this.scenario.objective,
        openThreads: [this.scenario.stakes, consequence],
      },
      adventurePatch: {
        lastOutcome: {
          kind: 'scene_check',
          sourceId: input.sceneCheckId,
          tier,
          summary: consequence,
        },
        consequenceLedger: [{ id: `consequence-${input.sceneCheckId}`, source: input.sceneCheckId, summary: consequence, status: failure ? 'complication' : 'advantage', tier }],
        spatialContext: {
          currentArea: `${this.scenario.locationName} contested room`,
          landmarks: [`${this.scenario.locationName} marked table`, `${input.speaker.name}'s altered threshold`],
          routes: failure
            ? [`blocked door beside ${this.scenario.locationName}`, `riskier passage around the cost`]
            : [`opened route through ${this.scenario.locationName}`, `clear path toward ${this.scenario.objective}`],
          unresolvedSpatialQuestions: [`Who controls the next exit after ${tier}?`],
        },
      },
      escalation: escalation.escalation,
      ttrpgMetadataPatch: escalation.ttrpgMetadataPatch,
      metadata: {
        adventurePatch: { currentStakes: this.scenario.stakes },
        sceneCheckEscalation: escalation.escalation,
      },
    }
  }

  private publicNarration(speakerName: string, checkRequested: boolean): string {
    return `${this.scenario.locationName} tightens around the party: ${this.scenario.openingImage}. ${this.scenario.premise} ${speakerName} is placed at the useful edge of the problem, where a decision can change what the room wants next. ${checkRequested ? 'The moment is sharp enough to demand a roll, and failure must leave a mark.' : 'No one is forced down a single track; the party has room to bargain, pry, retreat, or make the place worse.'}`
  }

  private actionIntentForTurn(turn: number): SceneCheckActionIntent {
    const intents: SceneCheckActionIntent[] = ['investigate', 'search', 'negotiate', 'recall_lore', 'sneak', 'force', 'endure']
    return intents[turn % intents.length]
  }
}

export class ExplicitCombatStartBeatGenerator implements GameMasterBeatGenerator {
  async generateBeat(input: GenerateGameMasterBeatInput): Promise<GameMasterBeatOutput> {
    const ttrpg = normalizeNarrativeTtrpgMetadata(input.narrativeState.metadata)
    const encounterSeed = ttrpg.lastEncounterSeed ?? {
      title: 'Catalog Threat Breaks Cover',
      summary: 'The catalog-seeded danger finally enters the room openly.',
      stakes: 'Survive the threat that the failed scene check exposed.',
      source: 'fallback' as const,
    }

    const stateAfter: LocationRoomNarrativeStateSnapshot = {
      stateSummary: `${input.narrativeState.stateSummary} The danger breaks cover and demands structured combat.`,
      currentObjective: 'Survive the threat that has fully emerged.',
      openThreads: [...input.narrativeState.openThreads, 'The explicit combat trigger is now unconsumed.'].slice(-4),
    }

    return {
      gameMasterAgentId: 'gm-harness',
      publicNarration: 'The foreshadowed pressure breaks cover: claws scrape the rafters, the exit slams shut, and the room must answer in combat.',
      speakerInstruction: 'React to the threat entering combat; do not resolve the combat in prose.',
      stateAfter,
      ttrpgPhase: 'threat',
      combatReadiness: 'ready',
      threatLevel: 5,
      requestedGameplayAction: 'start_combat',
      encounterSeed,
      sceneCheckRequest: null,
      adventurePatch: {
        currentStakes: 'The party must survive the catalog-seeded threat.',
        discoveries: ['The earlier failed check exposed the threat clearly enough for combat.'],
      },
      metadata: {
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 5,
        requestedGameplayAction: 'start_combat',
        encounterSeed,
      },
    }
  }
}

export class ScriptedTurnGenerator implements OfficialLocationRoomTurnGenerator {
  private turn = 0

  constructor(private readonly scenario: NarrativeHarnessScenario) {}

  async generateTurn(input: GenerateOfficialLocationRoomTurnInput): Promise<GenerateOfficialLocationRoomTurnResult> {
    this.turn += 1
    const decision = input.narrativeContext?.activeDecision
    const chosen = decision?.options[this.turn % decision.options.length]
    const sceneCheckRequest = input.narrativeContext?.sceneCheck?.request
    const action = sceneCheckRequest
      ? `I test the ${sceneCheckRequest.actionIntent} angle and accept the danger instead of waiting for the room to choose for us.`
      : chosen
        ? `I choose ${chosen.label.toLowerCase()} because ${chosen.summary?.toLowerCase() ?? 'the party needs a direction'}.`
        : `I push on the most suspicious detail and ask what price ${this.scenario.locationName} is trying to hide.`

    return {
      officialAgentId: `agent-${input.speaker.tokenId}`,
      content: `${input.speaker.name}: ${action} ${input.speaker.backgroundStory ? `My instinct says this smells like ${input.speaker.backgroundStory.split(' ').slice(0, 7).join(' ').toLowerCase()}.` : ''}`.trim(),
      declaredAction: {
        summary: action,
        chosenOptionId: chosen?.id ?? null,
        chosenOptionLabel: chosen?.label ?? null,
        actionIntent: sceneCheckRequest?.actionIntent ?? 'press the scene',
      },
      sceneCheckProposal: sceneCheckRequest
        ? {
          id: null,
          source: 'character',
          actionIntent: sceneCheckRequest.actionIntent,
          gameplayActionType: sceneCheckRequest.gameplayActionType,
          intentSummary: action,
          rollChoice: sceneCheckRequest.rollChoice,
          contextualChecks: sceneCheckRequest.contextualChecks,
        }
        : null,
      sceneCheckProposalError: null,
    }
  }
}

export function rngSequenceFor(profile: ScriptedRollProfile): () => number {
  const sequences: Record<ScriptedRollProfile, number[]> = {
    mixed: [0.05, 0.24, 0.49, 0.74, 0.91, 0.31, 0.67],
    'fail-heavy': [0.01, 0.08, 0.16, 0.22, 0.41, 0.12, 0.58],
    'success-heavy': [0.42, 0.68, 0.82, 0.94, 0.55, 0.76, 0.99],
  }
  const values = sequences[profile]
  let index = 0
  return () => {
    const value = values[index % values.length]
    index += 1
    return value
  }
}
