export type NarrativeQualityGrade = 'excellent' | 'good' | 'needs_work' | 'poor'

export type NarrativeQualityMessage = {
  id?: string
  authorKind?: string | null
  authorName?: string | null
  tokenId?: number | null
  content: string
  messageDomain?: string | null
  messageKind?: string | null
  ttrpgPhase?: string | null
  gameplayMessageKind?: string | null
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
  publicGameMasterBeatCount: number
  publicGameMasterBeatMaxGap: number
  spatialContinuitySignalCount: number
  genericPressurePhraseCount: number
  catalogAnchorSignalCount: number
  distinctCharacterVoiceSignalCount: number
  sceneFrameStrengthCount: number
  actionForwardResponseCount: number
  combatTranscriptShare: number
  combatTranscriptWindow: number
  genericThreatIdentityCount: number
}

export type NarrativeQualityAttributionMetrics = Pick<
  NarrativeQualityMetrics,
  | 'catalogAnchorSignalCount'
  | 'distinctCharacterVoiceSignalCount'
  | 'sceneFrameStrengthCount'
  | 'actionForwardResponseCount'
  | 'combatTranscriptShare'
  | 'combatTranscriptWindow'
  | 'genericThreatIdentityCount'
>

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
const SPATIAL_CONTINUITY_PATTERN = /\b(room|door|stair|cellar|route|path|threshold|wall|table|tunnel|landing|arch|floor|passage|landmark|exit)\b/i
const GENERIC_PRESSURE_PATTERN = /\b(room shifts|scene shifts|pressure gathers|danger gathers|repeated hesitation|something moves just out of sight|standing still|the room answers|the room waits|the room notices)\b/i
const SCENE_FRAME_STRENGTH_PATTERN = /\b(choose|choice|option|decision|decide|risk|cost|price|obstacle|blocked?|reveals?|clue|route|path|door|exit|threshold|press|bargain|retreat|withdraw|protect|exploit|follow|confront|intercept|imminent|hostile|before|now|must)\b/i
const ACTION_FORWARD_PATTERN = /\b(?:i|we)\s+(?:choose|press|push|move|step|cross|open|force|draw|raise|block|shield|follow|track|search|examine|inspect|test|ask|question|bargain|confront|protect|retreat|withdraw|pry|climb|descend|enter|listen|watch|mark|take|grab|cut|throw|whisper|smell|crawl|sneak|strike|shove|interpret|read|study|touch|pull|carry|drag|hide|lead|signal|warn|hold|brace|bar|unlock|light|extinguish|burn|break|tie|untie|offer|trade|circle|approach|leave|return|answer|resist|quiet|bait|investigate|navigate|recall)\b/i
const AGREEMENT_ONLY_PATTERN = /^\s*(?:[^:]{1,40}:\s*)?(?:yes|yeah|yep|ok|okay|agreed|i agree|sounds good|that sounds right|fine)\s*[.!?]*\s*$/i
const COMBAT_TRANSCRIPT_SHARE_WINDOW = 40
const GENERIC_THREAT_IDENTITY_PATTERN = /\b(?:a dreadful encounter|wagdie horror|lurking threat|fallback apparition|ashen horror|restless shade|escalating danger|location encounter|shadowy figure|unknown threat|generic threat|faceless threat|nameless threat|unseen enemy|enemy appears|creatures? attacks?|monsters? attack|dark shape|something moves just out of sight|something attacks|threat emerges|danger emerges|hostile presence|the thing in the dark|the room answers with danger)\b/i
const CATALOG_ANCHOR_FALLBACK_PATTERN = /\b(?:altar|auction|bell|brine|candle|captain|cellar|chapel|corpse|court|debt|dock|ferry|feather|floorboards?|fruit|index|lantern|ledger|library|market|mill|mirror|omen|orchard|pilings|plank|pews?|rafters?|relic|salt|sermon|stall|stair|tavern|throne|tunnel|wake|witness|wolves)\b/gi
const POSSESSIVE_LOCATION_NAME_PATTERN = /\b[A-Z][a-z]+[’']s\s+[A-Z][a-z]+\b/
const DISTINCT_VOICE_STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'because', 'before', 'being', 'between', 'choose', 'could', 'every', 'from', 'have', 'into', 'just', 'more', 'most', 'next', 'only', 'party', 'press', 'room', 'scene', 'that', 'their', 'them', 'then', 'there', 'they', 'this', 'through', 'trying', 'what', 'when', 'where', 'while', 'with', 'would',
])

export function analyzeNarrativeMessages(
  messages: NarrativeQualityMessage[],
  completedTicks = 0,
  failedTicks = 0
): NarrativeQualityMetrics {
  const gameMasterMessages = messages.filter((message) => message.authorKind === 'game_master')
  const characterMessages = messages.filter((message) => message.authorKind === 'agent')
  const rollCards = messages.filter((message) => isRollCardMessage(message))
  const gmOutcomes = inferGmOutcomeMessages(messages)
  const gameMasterBeats = messages.filter((message) => isPublicGameMasterBeatMessage(message))
  const beatAndOutcomeMessages = uniqueMessages([...gameMasterBeats, ...gmOutcomes])
  const catalogAnchorTerms = extractCatalogAnchorTerms(messages)
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
    publicGameMasterBeatCount: gameMasterBeats.length,
    publicGameMasterBeatMaxGap: maxPublicGameMasterBeatGap(messages),
    spatialContinuitySignalCount: countSpatialContinuitySignals(messages, gmOutcomes),
    genericPressurePhraseCount: countGenericPressurePhrases([...gameMasterBeats, ...gmOutcomes]),
    catalogAnchorSignalCount: countCatalogAnchorSignals(beatAndOutcomeMessages, catalogAnchorTerms),
    distinctCharacterVoiceSignalCount: countDistinctCharacterVoiceSignals(characterMessages),
    sceneFrameStrengthCount: countSceneFrameStrengthSignals(gameMasterBeats),
    actionForwardResponseCount: countActionForwardResponses(characterMessages),
    combatTranscriptShare: combatTranscriptShare(messages),
    combatTranscriptWindow: Math.min(messages.length, COMBAT_TRANSCRIPT_SHARE_WINDOW),
    genericThreatIdentityCount: countGenericThreatIdentitySignals(messages),
  }
}

export function narrativeQualityAttributionMetrics(
  metrics: NarrativeQualityMetrics
): NarrativeQualityAttributionMetrics {
  return {
    catalogAnchorSignalCount: metrics.catalogAnchorSignalCount,
    distinctCharacterVoiceSignalCount: metrics.distinctCharacterVoiceSignalCount,
    sceneFrameStrengthCount: metrics.sceneFrameStrengthCount,
    actionForwardResponseCount: metrics.actionForwardResponseCount,
    combatTranscriptShare: metrics.combatTranscriptShare,
    combatTranscriptWindow: metrics.combatTranscriptWindow,
    genericThreatIdentityCount: metrics.genericThreatIdentityCount,
  }
}

export function scoreNarrativeQuality(input: NarrativeQualityInput): NarrativeQualityResult {
  const rawMetrics = analyzeNarrativeMessages(input.messages, input.completedTicks ?? 0, input.failedTicks ?? 0)
  const submetrics: NarrativeQualitySubmetrics = {
    rollOutcomeIntegrity: scoreRollOutcomeIntegrity(rawMetrics),
    narrationSubstance: scoreNarrationSubstance(rawMetrics),
    failureConsequenceStrength: scoreFailureConsequenceStrength(rawMetrics),
    agencyChoiceAffordance: scoreAgencyChoiceAffordance(input.messages, input.adventureState ?? null),
    continuityPressure: scoreContinuityPressure(input.messages, input.adventureState ?? null, rawMetrics),
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
  if (metrics.genericPressurePhraseCount > 0) warnings.push(`${metrics.genericPressurePhraseCount} generic pressure phrases`)
  if (metrics.totalMessages >= 20) {
    if (metrics.publicGameMasterBeatCount < 2) warnings.push(`calibration: too few public GM beats (${metrics.publicGameMasterBeatCount})`)
    if (metrics.publicGameMasterBeatMaxGap > 10) warnings.push(`calibration: public GM beat gap too wide (${metrics.publicGameMasterBeatMaxGap})`)
    if (metrics.spatialContinuitySignalCount < 4) warnings.push(`calibration: thin spatial continuity signals (${metrics.spatialContinuitySignalCount})`)
  }
  return warnings
}

export function isPublicGameMasterBeatMessage(message: NarrativeQualityMessage): boolean {
  return message.authorKind === 'game_master' && messageKindFor(message) === 'gm_beat'
}

export function isRollCardMessage(message: NarrativeQualityMessage): boolean {
  if (messageKindFor(message) === 'roll_card') return true
  return message.authorKind === 'game_master' && /\bcheck resolves total\b|\bd20\b/i.test(message.content)
}

export function isGmOutcomeMessage(message: NarrativeQualityMessage): boolean {
  if (messageKindFor(message) === 'gm_outcome') return true
  if (messageKindFor(message)) return false
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
  return message.authorKind === 'game_master' && !messageKindFor(message) && !isRollCardMessage(message)
}

export function inferCheckType(message: NarrativeQualityMessage): string {
  const structured = ((message.metadata?.publicRolls ?? metadataValue(message, 'gameplayRolls')) as { action?: { checkType?: string } } | undefined)?.action?.checkType
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
  const cadence = metrics.totalMessages < 20
    ? 0.9
    : Math.min(1, metrics.publicGameMasterBeatCount / 2) * (metrics.publicGameMasterBeatMaxGap > 10 ? 0.75 : 1)
  return clampScore(Math.round((gmNarration * 0.5 + outcomes * 0.4 + cadence * 0.1) * 100))
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

function scoreContinuityPressure(
  messages: NarrativeQualityMessage[],
  adventureState: NarrativeQualityAdventureState | null,
  metrics: NarrativeQualityMetrics
): number {
  const publicText = messages.map((message) => message.content).join('\n')
  const continuityHits = countPatternMatches(publicText, CONTINUITY_PATTERN)
  const transcriptScore = Math.min(55, continuityHits * 7 + metrics.spatialContinuitySignalCount * 5)
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

function maxPublicGameMasterBeatGap(messages: NarrativeQualityMessage[]): number {
  const beatIndexes = messages
    .map((message, index) => isPublicGameMasterBeatMessage(message) ? index : -1)
    .filter((index) => index >= 0)
  if (beatIndexes.length === 0) return messages.length

  let maxGap = 0
  for (let index = 0; index < beatIndexes.length; index += 1) {
    const currentBeatIndex = beatIndexes[index]
    const nextBeatIndex = beatIndexes[index + 1]
    const gapEnd = nextBeatIndex ?? messages.length
    maxGap = Math.max(maxGap, Math.max(0, gapEnd - currentBeatIndex - 1))
  }
  return maxGap
}

function countGenericPressurePhrases(messages: NarrativeQualityMessage[]): number {
  return messages.filter((message) => GENERIC_PRESSURE_PATTERN.test(message.content)).length
}

function countSpatialContinuitySignals(
  messages: NarrativeQualityMessage[],
  gmOutcomes: NarrativeQualityMessage[]
): number {
  const outcomeIds = new Set(gmOutcomes.map((message) => message.id).filter(Boolean))
  return messages.filter((message) => {
    const isBeatOrOutcome = isPublicGameMasterBeatMessage(message) ||
      (message.id ? outcomeIds.has(message.id) : isGmOutcomeMessage(message))
    return isBeatOrOutcome && SPATIAL_CONTINUITY_PATTERN.test(message.content)
  }).length
}

function countCatalogAnchorSignals(messages: NarrativeQualityMessage[], catalogAnchorTerms: string[]): number {
  return messages.filter((message) => hasCatalogAnchorSignal(message.content, catalogAnchorTerms)).length
}

function countDistinctCharacterVoiceSignals(messages: NarrativeQualityMessage[]): number {
  const speakerKeys = new Set(messages.map(speakerKeyFor).filter(Boolean))
  if (speakerKeys.size < 2) return 0

  const tokenSets = messages.map((message) => new Set(distinctiveTokensFor(message.content)))
  return messages.filter((message, index) => {
    const ownTokens = tokenSets[index]
    if (ownTokens.size < 4) return false

    const ownSpeaker = speakerKeyFor(message)
    const otherTokens = new Set<string>()
    for (let otherIndex = 0; otherIndex < messages.length; otherIndex += 1) {
      if (otherIndex === index || speakerKeyFor(messages[otherIndex]) === ownSpeaker) continue
      for (const token of tokenSets[otherIndex]) otherTokens.add(token)
    }

    const uniqueTokens = [...ownTokens].filter((token) => !otherTokens.has(token))
    const maxSimilarity = Math.max(0, ...messages.map((otherMessage, otherIndex) => {
      if (otherIndex === index || speakerKeyFor(otherMessage) === ownSpeaker) return 0
      return jaccardSimilarity(ownTokens, tokenSets[otherIndex])
    }))
    return uniqueTokens.length >= 2 && maxSimilarity <= 0.72
  }).length
}

function countSceneFrameStrengthSignals(messages: NarrativeQualityMessage[]): number {
  return messages.filter((message) => SCENE_FRAME_STRENGTH_PATTERN.test(message.content)).length
}

function countActionForwardResponses(messages: NarrativeQualityMessage[]): number {
  return messages.filter((message) => ACTION_FORWARD_PATTERN.test(message.content) && !AGREEMENT_ONLY_PATTERN.test(message.content)).length
}

function combatTranscriptShare(messages: NarrativeQualityMessage[]): number {
  const recentMessages = messages.slice(-COMBAT_TRANSCRIPT_SHARE_WINDOW)
  if (recentMessages.length === 0) return 0
  const combatMessages = recentMessages.filter((message) => isCombatDomainMessage(message)).length
  return Math.round((combatMessages / recentMessages.length) * 1000) / 1000
}

function countGenericThreatIdentitySignals(messages: NarrativeQualityMessage[]): number {
  return messages.filter((message) => {
    if (message.authorKind !== 'game_master') return false
    return GENERIC_THREAT_IDENTITY_PATTERN.test([
      message.content,
      metadataString(message, 'title'),
      metadataString(message, 'publicTitle'),
      metadataString(message, 'monsterName'),
      metadataString(message, 'monsterArchetype'),
    ].filter(Boolean).join(' '))
  }).length
}

function hasCatalogAnchorSignal(content: string, catalogAnchorTerms: string[]): boolean {
  const normalizedContent = normalizeCatalogTerm(content)
  if (catalogAnchorTerms.length > 0) {
    return catalogAnchorTerms.some((term) => term.length >= 4 && normalizedCatalogContentIncludes(normalizedContent, term))
  }

  const fallbackMatches = content.match(CATALOG_ANCHOR_FALLBACK_PATTERN) ?? []
  const uniqueFallbackMatches = new Set(fallbackMatches.map((match) => match.toLowerCase()))
  return uniqueFallbackMatches.size >= 3 ||
    (uniqueFallbackMatches.size >= 2 && POSSESSIVE_LOCATION_NAME_PATTERN.test(content))
}

function extractCatalogAnchorTerms(messages: NarrativeQualityMessage[]): string[] {
  const terms = new Set<string>()
  for (const message of messages) {
    collectCatalogAnchorTerms(message.metadata, terms)
    collectCatalogAnchorTerms(message, terms)
  }
  return [...terms].slice(0, 80)
}

function collectCatalogAnchorTerms(value: unknown, terms: Set<string>, keyHint: string | null = null, depth = 0): void {
  if (depth > 5 || terms.size >= 80) return
  if (typeof value === 'string') {
    if (isCatalogAnchorKey(keyHint)) addCatalogAnchorTerm(value, terms)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectCatalogAnchorTerms(item, terms, keyHint, depth + 1)
    return
  }
  if (!value || typeof value !== 'object') return

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    collectCatalogAnchorTerms(nested, terms, key, depth + 1)
  }
}

function isCatalogAnchorKey(key: string | null): boolean {
  if (!key) return false
  return /^(?:title|name|tags?|catalogEntryIds?|selectedCatalogEntryIds?|encounterHints?|monsterHints?)$/i.test(key)
}

function addCatalogAnchorTerm(raw: string, terms: Set<string>): void {
  const candidates = [raw]
  const colonPrefix = raw.split(':')[0]
  if (colonPrefix && colonPrefix !== raw) candidates.push(colonPrefix)

  for (const candidate of candidates) {
    const normalized = normalizeCatalogTerm(candidate.replace(/^\d+(?:\.\d+)*[._-]*/, ''))
    const words = normalized.split(' ').filter(Boolean)
    if (words.length === 0 || words.length > 4) continue
    const term = words.join(' ')
    if (term.length >= 4 && !/^(?:hostile|threat|danger|unknown|fallback)$/.test(term)) terms.add(term)
  }
}

function normalizeCatalogTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizedCatalogContentIncludes(normalizedContent: string, normalizedTerm: string): boolean {
  return (` ${normalizedContent} `).includes(` ${normalizedTerm} `)
}

function distinctiveTokensFor(content: string): string[] {
  return content
    .toLowerCase()
    .replace(/^[^:]{1,40}:\s*/, '')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/^'+|'+$/g, ''))
    .filter((token) => token.length >= 4 && !DISTINCT_VOICE_STOPWORDS.has(token))
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1
  let intersection = 0
  for (const token of left) {
    if (right.has(token)) intersection += 1
  }
  const union = new Set([...left, ...right]).size
  return union === 0 ? 0 : intersection / union
}

function speakerKeyFor(message: NarrativeQualityMessage): string | null {
  if (message.tokenId !== null && message.tokenId !== undefined) return `token:${message.tokenId}`
  if (message.authorName) return `name:${message.authorName}`
  return null
}

function isCombatDomainMessage(message: NarrativeQualityMessage): boolean {
  return messageDomainFor(message) === 'combat' ||
    ttrpgPhaseFor(message) === 'combat' ||
    Boolean(message.metadata?.gameplay) ||
    Boolean(gameplayMessageKindFor(message))
}

function uniqueMessages(messages: NarrativeQualityMessage[]): NarrativeQualityMessage[] {
  const seen = new Set<string>()
  return messages.filter((message, index) => {
    const key = message.id ? `id:${message.id}` : `index:${index}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function metadataValue(message: NarrativeQualityMessage, key: string): unknown {
  return message.metadata?.[key] ?? (message as unknown as Record<string, unknown>)[key]
}

function metadataString(message: NarrativeQualityMessage, key: string): string | null {
  const value = metadataValue(message, key)
  return typeof value === 'string' ? value : null
}

function messageKindFor(message: NarrativeQualityMessage): string | null {
  return metadataString(message, 'messageKind')
}

function messageDomainFor(message: NarrativeQualityMessage): string | null {
  return metadataString(message, 'messageDomain')
}

function ttrpgPhaseFor(message: NarrativeQualityMessage): string | null {
  return metadataString(message, 'ttrpgPhase')
}

function gameplayMessageKindFor(message: NarrativeQualityMessage): string | null {
  return metadataString(message, 'gameplayMessageKind')
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
