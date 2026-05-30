import type { LocationRoomMessage } from '@/lib/eliza/locationRooms/types'
import {
  analyzeNarrativeMessages as analyzeQualityNarrativeMessages,
  narrativeQualityAttributionMetrics,
  scoreNarrativeQuality,
  warningsForNarrativeQuality,
  type NarrativeQualityAdventureState,
} from '../../../../../scripts/location-room-narrative-quality'
import type {
  NarrativeHarnessAggregateMetrics,
  NarrativeHarnessMetrics,
  NarrativeHarnessScenarioResult,
} from './scenarios'

export function analyzeNarrativeMessages(
  messages: LocationRoomMessage[],
  completedTicks = 0,
  failedTicks = 0
): NarrativeHarnessMetrics {
  return analyzeQualityNarrativeMessages(messages, completedTicks, failedTicks)
}

export function aggregateHarnessResults(results: NarrativeHarnessScenarioResult[]): NarrativeHarnessAggregateMetrics {
  const allMessages = results.flatMap((result) => result.messages)
  const completedTicks = results.reduce((sum, result) => sum + result.metrics.completedTicks, 0)
  const failedTicks = results.reduce((sum, result) => sum + result.metrics.failedTicks, 0)
  const quality = scoreNarrativeQuality({
    messages: allMessages,
    completedTicks,
    failedTicks,
    adventureState: aggregateAdventureState(results),
  })

  return {
    ...quality.rawMetrics,
    scenarioCount: results.length,
    attributionMetrics: narrativeQualityAttributionMetrics(quality.rawMetrics),
    warnings: results.flatMap((result) => result.warnings.map((warning) => `${result.scenario.id}: ${warning}`)),
    quality,
  }
}

export function warningsForScenario(metrics: NarrativeHarnessMetrics, ticksPerScenario: number): string[] {
  return warningsForNarrativeQuality(metrics, warningOptionsForHarness(ticksPerScenario))
}

export function warningOptionsForHarness(ticksPerScenario: number) {
  return {
    ticksPerScenario,
    minRollCards: Math.floor(ticksPerScenario / 5),
    maxRollCards: Math.ceil(ticksPerScenario / 2),
    repeatedOutcomePrefixWarningThreshold: 1,
  }
}

function aggregateAdventureState(results: NarrativeHarnessScenarioResult[]): NarrativeQualityAdventureState {
  return {
    currentStakes: results.some((result) => result.adventureState.currentStakes) ? 'aggregate stakes present' : null,
    activeDecisionPresent: results.some((result) => result.adventureState.activeDecisionPresent),
    consequenceCount: results.reduce((sum, result) => sum + (result.adventureState.consequenceCount ?? 0), 0),
    discoveryCount: results.reduce((sum, result) => sum + (result.adventureState.discoveryCount ?? 0), 0),
    clockCount: results.reduce((sum, result) => sum + (result.adventureState.clockCount ?? 0), 0),
    lastDeclaredActionPresent: results.some((result) => result.adventureState.lastDeclaredActionPresent),
    lastOutcomePresent: results.some((result) => result.adventureState.lastOutcomePresent),
  }
}
