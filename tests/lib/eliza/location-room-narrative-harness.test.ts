/**
 * @jest-environment node
 */

jest.mock('@/lib/eliza/official/messaging', () => ({
  normalizeOfficialResponseText: (text: string) => text.trim(),
  createOfficialElizaMessagingClient: jest.fn(() => ({
    startAgent: jest.fn(),
    createSession: jest.fn(),
    sendSessionMessage: jest.fn(),
    collectStreamedResponseText: jest.fn(),
    deleteSession: jest.fn(),
  })),
}))

jest.mock('@/lib/eliza/locationRooms/officialTurnGenerator', () => ({
  officialLocationRoomTurnGenerator: { generateTurn: jest.fn() },
  normalizeLocationRoomGeneratedContent: (content: string) => content.trim() || null,
}))

jest.mock('@/lib/eliza/gameMasterAgent/service', () => ({
  gameMasterAgentService: { resolveRuntimeGameMasterAgentId: jest.fn(async () => 'gm-harness') },
}))

import {
  NARRATIVE_HARNESS_SCENARIO_COUNT,
  NARRATIVE_HARNESS_TICKS_PER_SCENARIO,
  analyzeNarrativeMessages,
  narrativeHarnessScenarios,
  runNarrativeCombatSeparationProbe,
  runNarrativeHarness,
} from './location-room-narrative-harness'
import { scoreNarrativeQuality } from '../../../scripts/location-room-narrative-quality'

describe('location room narrative quality harness', () => {
  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('defines ten scenario seeds for fast narrative evaluation', () => {
    expect(narrativeHarnessScenarios).toHaveLength(NARRATIVE_HARNESS_SCENARIO_COUNT)
    expect(new Set(narrativeHarnessScenarios.map((scenario) => scenario.id)).size).toBe(NARRATIVE_HARNESS_SCENARIO_COUNT)
    expect(narrativeHarnessScenarios.every((scenario) => scenario.characters.length >= 3)).toBe(true)
  })

  it('runs 10 scenarios through 30 manual service ticks and passes quality gates', async () => {
    const result = await runNarrativeHarness()

    expect(result.ticksPerScenario).toBe(NARRATIVE_HARNESS_TICKS_PER_SCENARIO)
    expect(result.scenarioResults).toHaveLength(NARRATIVE_HARNESS_SCENARIO_COUNT)
    expect(result.aggregate.completedTicks).toBe(NARRATIVE_HARNESS_SCENARIO_COUNT * NARRATIVE_HARNESS_TICKS_PER_SCENARIO)
    expect(result.aggregate.failedTicks).toBe(0)
    expect(result.aggregate.rollCards).toBeGreaterThanOrEqual(NARRATIVE_HARNESS_SCENARIO_COUNT * 7)
    console.log(JSON.stringify({
      gmNarrativeQualityScore: result.aggregate.quality.gmNarrativeQualityScore,
      grade: result.aggregate.quality.grade,
      submetrics: result.aggregate.quality.submetrics,
      metrics: result.aggregate.quality.rawMetrics,
      warnings: result.aggregate.warnings,
      scenarioScores: result.scenarioResults.map((scenarioResult) => ({
        id: scenarioResult.scenario.id,
        gmNarrativeQualityScore: scenarioResult.quality.gmNarrativeQualityScore,
        submetrics: scenarioResult.quality.submetrics,
        warnings: scenarioResult.warnings,
      })),
    }, null, 2))

    expect(result.aggregate.gmOutcomes).toBe(result.aggregate.rollCards)
    expect(result.aggregate.quality.rawMetrics.publicGameMasterBeatCount).toBeGreaterThanOrEqual(NARRATIVE_HARNESS_SCENARIO_COUNT * 2)
    expect(result.aggregate.quality.rawMetrics.publicGameMasterBeatMaxGap).toBeLessThanOrEqual(10)
    expect(result.aggregate.quality.rawMetrics.spatialContinuitySignalCount).toBeGreaterThanOrEqual(NARRATIVE_HARNESS_SCENARIO_COUNT * 4)
    expect(result.aggregate.quality.rawMetrics.uniqueCheckTypes).toBeGreaterThanOrEqual(5)
    expect(result.aggregate.quality.rawMetrics.repeatedCheckTypeMaxRun).toBeLessThanOrEqual(2)
    expect(result.aggregate.quality.gmNarrativeQualityScore).toBeGreaterThanOrEqual(85)
    for (const scenarioResult of result.scenarioResults) {
      expect(scenarioResult.quality.gmNarrativeQualityScore).toBeGreaterThanOrEqual(75)
    }
    expect(result.aggregate.warnings).toEqual([])
  }, 30_000)

  it('keeps story ticks separate from combat even when cadence and triggers are present', async () => {
    const result = await runNarrativeCombatSeparationProbe()

    expect(result.storyWithTrigger).toMatchObject({
      status: 'completed',
      gameplayProcessCalls: 0,
      gameplayRunCreates: 0,
      messageDomain: 'narrative',
    })
    expect(result.storyWithTrigger.publicGameMasterBeatAppended).toBe(true)
    expect(result.autoWithTrigger).toMatchObject({
      status: 'completed',
      gameplayProcessCalls: 1,
      gameplayRunCreates: 1,
    })
    expect(result.autoWithTrigger.gameplayRunId).toMatch(/^run-/)
    expect(result.adminCombat).toMatchObject({
      status: 'completed',
      gameplayProcessCalls: 1,
      gameplayRunCreates: 1,
    })
    expect(result.adminCombat.gameplayRunId).toMatch(/^run-/)
  })

  it('flags weak narrative output from public transcript messages', () => {
    const metrics = analyzeNarrativeMessages([
      {
        id: 'msg-1',
        roomId: 'room-1',
        locationId: 'loc-1',
        tickId: 'tick-1',
        sequence: 1,
        visibility: 'public',
        authorKind: 'game_master',
        tokenId: null,
        officialAgentId: 'gm',
        authorName: 'Game Master',
        content: 'You enter. It is spooky.',
        metadata: { messageKind: 'gm_beat' },
        createdAt: '2026-05-26T12:00:00.000Z',
      },
      {
        id: 'msg-2',
        roomId: 'room-1',
        locationId: 'loc-1',
        tickId: 'tick-2',
        sequence: 2,
        visibility: 'public',
        authorKind: 'game_master',
        tokenId: null,
        officialAgentId: 'gm',
        authorName: 'Game Master',
        content: 'Failure.',
        metadata: { messageKind: 'gm_outcome' },
        createdAt: '2026-05-26T12:00:01.000Z',
      },
    ], 2, 0)

    expect(metrics.averageGameMasterNarrationChars).toBeLessThan(80)
    expect(metrics.weakFailureOutcomeCount).toBe(1)
    expect(metrics.publicGameMasterBeatCount).toBe(1)
    expect(metrics.publicGameMasterBeatMaxGap).toBe(1)
    expect(metrics.spatialContinuitySignalCount).toBe(0)

    const quality = scoreNarrativeQuality({ messages: [
      {
        id: 'msg-1',
        roomId: 'room-1',
        locationId: 'loc-1',
        tickId: 'tick-1',
        sequence: 1,
        visibility: 'public',
        authorKind: 'game_master',
        tokenId: null,
        officialAgentId: 'gm',
        authorName: 'Game Master',
        content: 'You enter. It is spooky.',
        metadata: { messageKind: 'gm_beat' },
        createdAt: '2026-05-26T12:00:00.000Z',
      },
      {
        id: 'msg-2',
        roomId: 'room-1',
        locationId: 'loc-1',
        tickId: 'tick-2',
        sequence: 2,
        visibility: 'public',
        authorKind: 'game_master',
        tokenId: null,
        officialAgentId: 'gm',
        authorName: 'Game Master',
        content: 'Failure.',
        metadata: { messageKind: 'gm_outcome' },
        createdAt: '2026-05-26T12:00:01.000Z',
      },
    ], completedTicks: 2 })

    expect(quality.gmNarrativeQualityScore).toBeLessThan(65)
    expect(quality.submetrics.failureConsequenceStrength).toBeLessThan(50)
  })

  it('classifies metadata-less public roll cards and outcomes separately', () => {
    const metrics = analyzeNarrativeMessages([
      {
        id: 'roll-public',
        authorKind: 'game_master',
        tokenId: null,
        authorName: 'Game Master',
        content: 'The scene Investigate check resolves total 3 vs DC 12 — failure.',
      },
      {
        id: 'outcome-public',
        authorKind: 'game_master',
        tokenId: null,
        authorName: 'Game Master',
        content: 'Quarion Amastacia\'s investigate check resolves as failure (3 vs DC 12). The scene answers the attempt without changing the roll: the result becomes the next clear pressure for the room to address.',
      },
      {
        id: 'roll-public-success',
        authorKind: 'game_master',
        tokenId: null,
        authorName: 'Game Master',
        content: 'The scene Investigate check resolves total 16 vs DC 12 — success.',
      },
      {
        id: 'outcome-public-success',
        authorKind: 'game_master',
        tokenId: null,
        authorName: 'Game Master',
        content: 'With a satisfying click, the lever moves down. A narrow hidden door swings open, revealing a gloomy stone tunnel beyond.',
      },
    ])

    expect(metrics.rollCards).toBe(2)
    expect(metrics.gmOutcomes).toBe(2)
  })

  it('warns on long transcripts with sparse GM cadence and thin spatial continuity', () => {
    const messages = [
      gmBeat('The opening pressure names a consequence and asks the party to choose what to risk next.'),
      ...Array.from({ length: 21 }, (_, index) => characterMessage(`Character ${index} chooses to wait, decide, and repeat the same vague pressure.`)),
    ]
    const quality = scoreNarrativeQuality({ messages, warningOptions: { minTranscriptMessages: 20, requireFailureOutcome: false } })

    expect(quality.rawMetrics.publicGameMasterBeatCount).toBe(1)
    expect(quality.rawMetrics.publicGameMasterBeatMaxGap).toBe(21)
    expect(quality.rawMetrics.spatialContinuitySignalCount).toBe(0)
    expect(quality.warnings).toEqual(expect.arrayContaining([
      'calibration: too few public GM beats (1)',
      'calibration: public GM beat gap too wide (21)',
      'calibration: thin spatial continuity signals (0)',
    ]))
  })

  it('scores repetition, roll integrity, and adventure-state continuity signals', () => {
    const repeatedCheckMessages = [
      rollCard('roll-1', 'perception'),
      rollCard('roll-2', 'perception'),
      rollCard('roll-3', 'perception'),
      outcome('outcome-1', 'The room answers with a success and a useful clue.'),
      outcome('outcome-2', 'The room answers with a failure and the cost blocks the safe door.'),
      outcome('outcome-3', 'The room answers with a failure and the cost blocks the safe door.'),
    ]

    const repeatedQuality = scoreNarrativeQuality({ messages: repeatedCheckMessages })
    const healthyQuality = scoreNarrativeQuality({
      messages: [
        gmBeat('The party must choose whether to press deeper, bargain sideways, or retreat while the clock advances and old consequences remain visible.'),
        characterMessage('I choose to press deeper and accept the risk.'),
        rollCard('roll-1', 'perception'),
        outcome('outcome-1', 'Crow\'s Den splinters the perception test with failure. The cost turns a witness openly hostile, blocks the safe door, and forces the party to choose a riskier route.'),
      ],
      adventureState: {
        currentStakes: 'The captain bargains with something under the pilings.',
        activeDecisionPresent: true,
        consequenceCount: 2,
        discoveryCount: 1,
        clockCount: 1,
        lastDeclaredActionPresent: true,
        lastOutcomePresent: true,
      },
    })

    expect(repeatedQuality.submetrics.rollOutcomeIntegrity).toBe(100)
    expect(repeatedQuality.submetrics.checkVariety).toBeLessThan(80)
    expect(repeatedQuality.submetrics.repetitionFreshness).toBeLessThan(100)
    expect(scoreNarrativeQuality({ messages: [rollCard('roll-1', 'arcana')] }).submetrics.rollOutcomeIntegrity).toBeLessThan(100)
    expect(healthyQuality.submetrics.continuityPressure).toBeGreaterThan(repeatedQuality.submetrics.continuityPressure)
    expect(healthyQuality.submetrics.agencyChoiceAffordance).toBeGreaterThan(repeatedQuality.submetrics.agencyChoiceAffordance)
  })
})

function gmBeat(content: string) {
  return {
    id: `gm-${content.slice(0, 8)}`,
    authorKind: 'game_master',
    tokenId: null,
    content,
    metadata: { messageKind: 'gm_beat' },
  }
}

function characterMessage(content: string) {
  return {
    id: `agent-${content.slice(0, 8)}`,
    authorKind: 'agent',
    tokenId: 101,
    content,
    metadata: {},
  }
}

function rollCard(id: string, checkType: string) {
  return {
    id,
    authorKind: 'game_master',
    tokenId: null,
    content: `${checkType} check resolves total 12 vs DC 14`,
    metadata: { messageKind: 'roll_card', publicRolls: { action: { checkType } } },
  }
}

function outcome(id: string, content: string) {
  return {
    id,
    authorKind: 'game_master',
    tokenId: null,
    content,
    metadata: { messageKind: 'gm_outcome' },
  }
}
