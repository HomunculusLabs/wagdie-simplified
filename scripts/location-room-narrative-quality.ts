export type NarrativeQualityGrade = 'excellent' | 'good' | 'needs_work' | 'poor'

export type NarrativeQualityMessage = {
  id?: string
  authorKind?: string | null
  authorName?: string | null
  tokenId?: number | null
  content: string
  metadata?: Record<string, unknown> | null
}

export type NarrativeQualityAdventureState = {
  currentStakes?: string | null
  activeDecisionPresent?: boolean
  consequenceCount?: number
  discoveryCount?: number
  clockCount?: number
  lastDeclaredActionPresent?: boolean
  lastOutcomePresent?: boolean
}

export type NarrativeQualityMetrics = {
  totalMessages: number
  gameMasterMessages: number
  characterMessages: number
  rollCards: number
  gmOutcomes: number
  sceneCheckCount: number
  completedTicks: number
  failedTicks: number
  averageGameMasterNarrationChars: number
  averageOutcomeChars: number
  uniqueSpeakerCount: number
  uniqueCheckTypes: number
  repeatedCheckTypeMaxRun: number
  failureOutcomeCount: number
  failureOutcomeAverageChars: number
  weakFailureOutcomeCount: number
  repeatedOutcomePrefixCount: number
}

export type NarrativeQualitySubmetrics = {
  rollOutcomeIntegrity: number
  narrationSubstance: number
  failureConsequenceStrength: number
  agencyChoiceAffordance: number
  continuityPressure: number
  checkVariety: number
  repetitionFreshness: number
  characterAffordance: number
}

export type NarrativeQualityWarningOptions = {
  ticksPerScenario?: number
  minTranscriptMessages?: number
  minRollCards?: number
  maxRollCards?: number
  requireFailureOutcome?: boolean
  repeatedOutcomePrefixWarningThreshold?: number
}

export type NarrativeQualityInput = {
  messages: NarrativeQualityMessage[]
  completedTicks?: number
  failedTicks?: number
  adventureState?: NarrativeQualityAdventureState | null
  warningOptions?: NarrativeQualityWarningOptions
}

export type NarrativeQualityResult = {
  gmNarrativeQualityScore: number
  grade: NarrativeQualityGrade
  submetrics: NarrativeQualitySubmetrics
  warnings: string[]
  rawMetrics: NarrativeQualityMetrics
}

const FAILURE_PATTERN = /failure|critical_failure|goes badly|mistake|complication|cost|hostile|partial_success|price|blocked|worse/i
const STRONG_FAILURE_PATTERN = /cost|price|hostile|complication|fewer safe options|bite back|wound|lost|blocked|worse|danger|pressure|consequence|obligation|fewer|mark/i
const AGENCY_PATTERN = /\b(choose|choice|option|decide|approach|press|bargain|retreat|withdraw|risk|act on|exploit|protect|follow|accept|trade|ask what|specific choice|concrete risk)\b/i
const CONTINUITY_PATTERN = /\b(stakes|consequence|cost|clue|clock|pressure|objective|unresolved|last|now|price|discover|found|evidence|outcome|thread|obligation|mark)\b/i

export function analyzeNarrativeMessages(
  messages: NarrativeQualityMessage[],
  completedTicks = 0,
  failedTicks = 0
): NarrativeQualityMetrics {
  const gameMasterMessages = messages.filter((message) => message.authorKind === 'game_master')
  const characterMessages = messages.filter((message) => message.authorKind === 'agent')
  const rollCards = messages.filter((message) => isRollCardMessage(message))
  const gmOutcomes = inferGmOutcomeMessages(messages)
  const checkTypes = rollCards.map((message) => inferCheckType(message))
  const failureOutcomes = gmOutcomes.filter((message) => FAILURE_PATTERN.test(message.content))
  const weakFailureOutcomes = failureOutcomes.filter((message) => message.content.length < 180 || !STRONG_FAILURE_PATTERN.test(message.content))
  const prefixes = new Map<string, number>()

  for (const outcome of gmOutcomes) {
    const prefix = normalizedPrefix(outcome.content)
    if (!prefix) continue
    prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1)
  }

  return {
    totalMessages: messages.length,
    gameMasterMessages: gameMasterMessages.length,
    characterMessages: characterMessages.length,
    rollCards: rollCards.length,
    gmOutcomes: gmOutcomes.length,
    sceneCheckCount: rollCards.length,
    completedTicks,
    failedTicks,
    averageGameMasterNarrationChars: averageLength(gameMasterMessages),
    averageOutcomeChars: averageLength(gmOutcomes),
    uniqueSpeakerCount: new Set(characterMessages.map((message) => message.tokenId).filter(Boolean)).size,
    uniqueCheckTypes: new Set(checkTypes).size,
    repeatedCheckTypeMaxRun: maxRunLength(checkTypes),
    failureOutcomeCount: failureOutcomes.length,
    failureOutcomeAverageChars: averageLength(failureOutcomes),
    weakFailureOutcomeCount: weakFailureOutcomes.length,
    repeatedOutcomePrefixCount: [...prefixes.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0),
  }
}

export function scoreNarrativeQuality(input: NarrativeQualityInput): NarrativeQualityResult {
  const rawMetrics = analyzeNarrativeMessages(input.messages, input.completedTicks ?? 0, input.failedTicks ?? 0)
  const submetrics: NarrativeQualitySubmetrics = {
    rollOutcomeIntegrity: scoreRollOutcomeIntegrity(rawMetrics),
    narrationSubstance: scoreNarrationSubstance(rawMetrics),
    failureConsequenceStrength: scoreFailureConsequenceStrength(rawMetrics),
    agencyChoiceAffordance: scoreAgencyChoiceAffordance(input.messages, input.adventureState ?? null),
    continuityPressure: scoreContinuityPressure(input.messages, input.adventureState ?? null),
    checkVariety: scoreCheckVariety(rawMetrics),
    repetitionFreshness: scoreRepetitionFreshness(rawMetrics),
    characterAffordance: scoreCharacterAffordance(rawMetrics),
  }
  const gmNarrativeQualityScore = Math.round(
    submetrics.rollOutcomeIntegrity * 0.1 +
    submetrics.narrationSubstance * 0.15 +
    submetrics.failureConsequenceStrength * 0.15 +
    submetrics.agencyChoiceAffordance * 0.15 +
    submetrics.continuityPressure * 0.2 +
    submetrics.checkVariety * 0.1 +
    submetrics.repetitionFreshness * 0.1 +
    submetrics.characterAffordance * 0.05
  )

  return {
    gmNarrativeQualityScore,
    grade: gradeFor(gmNarrativeQualityScore),
    submetrics,
    warnings: warningsForNarrativeQuality(rawMetrics, input.warningOptions),
    rawMetrics,
  }
}

export function warningsForNarrativeQuality(
  metrics: NarrativeQualityMetrics,
  options: NarrativeQualityWarningOptions = {}
): string[] {
  const warnings: string[] = []
  const repeatedOutcomePrefixWarningThreshold = options.repeatedOutcomePrefixWarningThreshold ?? 1

  if (options.ticksPerScenario !== undefined && metrics.completedTicks !== options.ticksPerScenario) {
    warnings.push(`completed ${metrics.completedTicks}/${options.ticksPerScenario} ticks`)
  }
  if (options.minTranscriptMessages !== undefined && metrics.totalMessages < options.minTranscriptMessages) {
    warnings.push(`not enough transcript messages (${metrics.totalMessages})`)
  }
  if (metrics.gameMasterMessages < 1) warnings.push(options.minTranscriptMessages ? 'missing public GM narration' : 'missing opening/public GM narration')
  if (options.minRollCards !== undefined && metrics.rollCards < options.minRollCards) warnings.push(`too few roll cards (${metrics.rollCards})`)
  if (options.maxRollCards !== undefined && metrics.rollCards > options.maxRollCards) warnings.push(`too many roll cards (${metrics.rollCards})`)
  if (metrics.gmOutcomes !== metrics.rollCards) warnings.push(`roll/outcome mismatch (${metrics.rollCards} rolls, ${metrics.gmOutcomes} outcomes)`)
  if (metrics.averageGameMasterNarrationChars > 0 && metrics.averageGameMasterNarrationChars < 220) warnings.push(`GM narration too short on average (${metrics.averageGameMasterNarrationChars})`)
  if (metrics.averageOutcomeChars > 0 && metrics.averageOutcomeChars < 180) warnings.push(`GM outcomes too short on average (${metrics.averageOutcomeChars})`)
  if (metrics.uniqueSpeakerCount < 3) warnings.push(`speaker rotation too narrow (${metrics.uniqueSpeakerCount})`)
  if (metrics.rollCards >= 5 && metrics.uniqueCheckTypes < 3) warnings.push(`check variety too narrow (${metrics.uniqueCheckTypes})`)
  if (metrics.repeatedCheckTypeMaxRun > 2) warnings.push(`same check type repeated ${metrics.repeatedCheckTypeMaxRun} times in a row`)
  if (options.requireFailureOutcome !== false && metrics.failureOutcomeCount < 1) warnings.push(options.minTranscriptMessages ? 'no failure/complication outcomes observed' : 'no failure outcomes observed')
  if (metrics.weakFailureOutcomeCount > 0) warnings.push(`${metrics.weakFailureOutcomeCount} weak failure outcomes`)
  if (metrics.repeatedOutcomePrefixCount > repeatedOutcomePrefixWarningThreshold) warnings.push(`${metrics.repeatedOutcomePrefixCount} repeated outcome openings`)
  return warnings
}

export function isRollCardMessage(message: NarrativeQualityMessage): boolean {
  if (message.metadata?.messageKind === 'roll_card') return true
  return message.authorKind === 'game_master' && /\bcheck resolves total\b|\bd20\b/i.test(message.content)
}

export function isGmOutcomeMessage(message: NarrativeQualityMessage): boolean {
  if (message.metadata?.messageKind === 'gm_outcome') return true
  if (message.metadata?.messageKind) return false
  return message.authorKind === 'game_master' && /critical_failure|failure|partial_success|success|goes badly|complication|cost/i.test(message.content) && !isRollCardMessage(message)
}

function inferGmOutcomeMessages(messages: NarrativeQualityMessage[]): NarrativeQualityMessage[] {
  const outcomes: NarrativeQualityMessage[] = []
  let awaitingMetadataLessOutcome = false

  for (const message of messages) {
    if (isRollCardMessage(message)) {
      awaitingMetadataLessOutcome = true
      continue
    }

    if (isGmOutcomeMessage(message) || (awaitingMetadataLessOutcome && isMetadataLessGameMasterMessage(message))) {
      outcomes.push(message)
      awaitingMetadataLessOutcome = false
      continue
    }

    if (message.authorKind === 'game_master') {
      awaitingMetadataLessOutcome = false
    }
  }

  return outcomes
}

function isMetadataLessGameMasterMessage(message: NarrativeQualityMessage): boolean {
  return message.authorKind === 'game_master' && !message.metadata?.messageKind && !isRollCardMessage(message)
}

export function inferCheckType(message: NarrativeQualityMessage): string {
  const structured = (message.metadata?.publicRolls as { action?: { checkType?: string } } | undefined)?.action?.checkType
  if (structured) return String(structured)
  const match = message.content.match(/\b(Investigate|Examine|Search|Track|Navigate|Sneak|Negotiate|Persuade|Intimidate|Recall Lore|Tend|Force|Endure|Escape|Help|Perception|Survival|Stealth|Arcana|Athletics|Persuasion)\b/i)
  return match ? match[1].toLowerCase().replace(/\s+/g, '_') : 'unknown'
}

function scoreRollOutcomeIntegrity(metrics: NarrativeQualityMetrics): number {
  const mismatch = Math.abs(metrics.rollCards - metrics.gmOutcomes)
  return clampScore(100 - mismatch * 25 - metrics.failedTicks * 15)
}

function scoreNarrationSubstance(metrics: NarrativeQualityMetrics): number {
  const gmNarration = metrics.gameMasterMessages === 0 ? 0 : Math.min(1, metrics.averageGameMasterNarrationChars / 220)
  const outcomes = metrics.gmOutcomes === 0 ? 0.75 : Math.min(1, metrics.averageOutcomeChars / 180)
  return clampScore(Math.round((gmNarration * 0.55 + outcomes * 0.45) * 100))
}

function scoreFailureConsequenceStrength(metrics: NarrativeQualityMetrics): number {
  if (metrics.gmOutcomes === 0) return 75
  if (metrics.failureOutcomeCount === 0) return 45
  const strongRatio = (metrics.failureOutcomeCount - metrics.weakFailureOutcomeCount) / metrics.failureOutcomeCount
  const lengthScore = Math.min(1, metrics.failureOutcomeAverageChars / 220)
  return clampScore(Math.round(strongRatio * 70 + lengthScore * 30))
}

function scoreAgencyChoiceAffordance(messages: NarrativeQualityMessage[], adventureState: NarrativeQualityAdventureState | null): number {
  const publicText = messages.map((message) => message.content).join('\n')
  const agencyHits = countPatternMatches(publicText, AGENCY_PATTERN)
  const transcriptScore = Math.min(70, agencyHits * 12)
  const stateScore = (adventureState?.activeDecisionPresent ? 15 : 0) + (adventureState?.lastDeclaredActionPresent ? 15 : 0)
  return clampScore(Math.max(transcriptScore + stateScore, transcriptScore > 0 ? 55 : 25))
}

function scoreContinuityPressure(messages: NarrativeQualityMessage[], adventureState: NarrativeQualityAdventureState | null): number {
  const publicText = messages.map((message) => message.content).join('\n')
  const continuityHits = countPatternMatches(publicText, CONTINUITY_PATTERN)
  const transcriptScore = Math.min(55, continuityHits * 7)
  const stateScore =
    (adventureState?.currentStakes ? 15 : 0) +
    (adventureState?.activeDecisionPresent ? 8 : 0) +
    Math.min(20, (adventureState?.consequenceCount ?? 0) * 5) +
    Math.min(10, (adventureState?.discoveryCount ?? 0) * 3) +
    Math.min(16, (adventureState?.clockCount ?? 0) * 8) +
    (adventureState?.lastDeclaredActionPresent ? 8 : 0) +
    (adventureState?.lastOutcomePresent ? 8 : 0)
  return clampScore(Math.max(transcriptScore + stateScore, transcriptScore > 0 ? 50 : 20))
}

function scoreCheckVariety(metrics: NarrativeQualityMetrics): number {
  if (metrics.rollCards < 3) return 70
  const uniqueRatio = Math.min(1, metrics.uniqueCheckTypes / Math.min(6, metrics.rollCards))
  const runPenalty = Math.max(0, metrics.repeatedCheckTypeMaxRun - 2) * 15
  return clampScore(Math.round(55 + uniqueRatio * 45 - runPenalty))
}

function scoreRepetitionFreshness(metrics: NarrativeQualityMetrics): number {
  if (metrics.gmOutcomes === 0) return 85
  const repeatedRatio = metrics.repeatedOutcomePrefixCount / metrics.gmOutcomes
  return clampScore(Math.round(100 - repeatedRatio * 80))
}

function scoreCharacterAffordance(metrics: NarrativeQualityMetrics): number {
  const speakerScore = Math.min(1, metrics.uniqueSpeakerCount / 3) * 70
  const characterPresence = metrics.characterMessages > 0 ? 30 : 0
  return clampScore(Math.round(speakerScore + characterPresence))
}

function gradeFor(score: number): NarrativeQualityGrade {
  if (score >= 90) return 'excellent'
  if (score >= 80) return 'good'
  if (score >= 65) return 'needs_work'
  return 'poor'
}

function averageLength(messages: NarrativeQualityMessage[]): number {
  if (messages.length === 0) return 0
  return Math.round(messages.reduce((sum, message) => sum + message.content.length, 0) / messages.length)
}

function maxRunLength(values: string[]): number {
  let max = 0
  let current = 0
  let previous: string | null = null
  for (const value of values) {
    current = value === previous ? current + 1 : 1
    previous = value
    max = Math.max(max, current)
  }
  return max
}

function normalizedPrefix(content: string): string {
  return content.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 8).join(' ')
}

function countPatternMatches(text: string, pattern: RegExp): number {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  const globalPattern = new RegExp(pattern.source, flags)
  return text.match(globalPattern)?.length ?? 0
}

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}
