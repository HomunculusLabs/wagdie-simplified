export type PublicNarrativeContractCategory =
  | 'publicness'
  | 'voice_hygiene'
  | 'narrative_motion'
  | 'grounding'
  | 'payoff'
  | 'fact_alignment'

export type PublicOutputDenylistContext = {
  contextualCheckId?: string | null
  contextualCheckLabel?: string | null
  contextualCheckSource?: string | null
  contextualIds?: Array<string | null | undefined>
  contextualLabels?: Array<string | null | undefined>
  /** Character utterances may naturally use "check" as a verb; GM prose should keep it false. */
  allowGenericCheckWord?: boolean
}

export type PublicOutputDenylistViolation = {
  reason: string
  category: 'publicness'
}

export type PublicNarrativeContractViolation = {
  category: PublicNarrativeContractCategory
  reason: string
}

export type PublicNarrativeContractFacts = PublicOutputDenylistContext & {
  label?: string
  allowCharacterDialogue?: boolean
  requireNarrativeMotion?: boolean
  requireConcreteGrounding?: boolean
  groundingTerms?: Array<string | null | undefined>
  requirePayoff?: 'any' | 'success' | 'consequence'
  disallowUnsafeMechanics?: boolean
  minChars?: number
}

const SHARED_PUBLIC_PROSE_DENYLIST_PATTERNS: Array<[RegExp, string, { allowGenericCheckWord?: boolean }?]> = [
  [/\bbell bait\b/i, 'internal encounter label'],
  [/\bencounter site\b/i, 'internal encounter-site label'],
  [/\bbackend\b/i, 'backend mechanics label'],
  [/\bmechanical\b/i, 'mechanical label'],
  [/\broll card\b/i, 'roll-card label'],
  [/\bdc\s*\d*\b/i, 'DC label'],
  [/\bchecks?\b/i, 'check label', { allowGenericCheckWord: true }],
]

export const PUBLIC_CHARACTER_DIALOGUE_NARRATION_PATTERN = /\b(?:says?|said|asks?|asked|answers?|answered|replies?|replied|whispers?|whispered|shouts?|shouted|calls?|called|cries?|cried|mutters?|muttered|murmurs?|murmured|tells?|told|speaks?|spoke)\b[\s,:;'"“”‘’.-]{0,24}(?:["“”‘’']|that\b|to\b)|(?:["“”][^"“”]{2,160}["“”]\s*,?\s*)\b(?:says?|said|asks?|asked|answers?|answered|replies?|replied|whispers?|whispered|shouts?|shouted|calls?|called|cries?|cried|mutters?|muttered|murmurs?|murmured)\b/i

export const PUBLIC_CONCRETE_GROUNDING_PATTERN = /\b(?:altar|arch|ash|bar|beam|bell|bell rope|bench|blade|boat|book|bridge|candle|cart|cask|casks|cave|cellar|chain|chamber|chest|corridor|courtyard|crate|crow|crows|dock|door|doorway|feather|feathers|floor|floorboard|floorboards|forest|fountain|gate|glyph|grate|hall|idol|key|landing|lantern|lanterns|ledge|lever|lock|mark|marks|mask|mirror|passage|path|pit|platform|pool|rafter|rafters|river|road|rookery|roof|rope|route|salt|scratch|scratches|seam|shelf|shrine|shutter|shutters|stair|stairs|statue|stream|symbol|table|taproom|threshold|throne|torch|tower|track|tracks|tree|tunnel|wagon|wall|well|window)\b/i

export const PUBLIC_NARRATIVE_MOTION_PATTERN = /\b(?:advances?|answers?|approaches?|bars?|bends?|blocks?|breaks?|buckles?|catches?|changes?|closes?|collapses?|costs?|cuts?|descends?|drags?|drives?|drops?|endures?|enters?|examines?|exposes?|falls?|flares?|follows?|forces?|gathers?|gives?|grabs?|grinds?|guards?|hooks?|inspects?|interprets?|jerks?|lands?|leans?|lifts?|listens?|locks?|marks?|moves?|narrows?|opens?|pins?|presses?|protects?|pulls?|pushes?|questions?|reaches?|reads?|reels?|retreats?|reveals?|rises?|searches?|scrapes?|settles?|shifts?|slams?|snaps?|spills?|staggers?|strikes?|studies?|swings?|tears?|tests?|tightens?|tracks?|turns?|unfolds?|warns?|withdraws?|wounds?)\b/i

export const PUBLIC_SUCCESS_PAYOFF_PATTERN = /\b(?:advantage|bypasses?|clearer|clue|control|controls|discerns?|discerned|exposes?|finds?|lead|learns?|names?|notices?|opens?|opened|points?|reveal|reveals|revealed|safer|shortcut|shows?|tracks?|unlocks?|usable)\b/i

export const PUBLIC_CONSEQUENCE_PAYOFF_PATTERN = /\b(?:blocked|blocks|choice narrows|complication|complicates|consequence|cost|costs|danger|dangerous|exposed|harder choice|hostile response|lost opportunity|obligation|payment|pressure|price|risk|route closes|route narrows|scarce|setback|threat|worse)\b/i

const PUBLIC_UNSAFE_NONCOMBAT_MECHANICS_PATTERN = /\b(?:hp|hit points?|damage|rewards?|xp|dies?|death|fatal|fatality|finality|permanent end|no way forward|cannot continue|wallet|private chain|chain data)\b/i
const PUBLIC_EXPLICIT_MECHANICS_PATTERN = /\b(?:d20|dice|roll(?:ed|s|ing)?\s+(?:result|total|card)|roll(?:ed|s|ing)?\s+(?:a\s+)?d20|rolled?\s+\d+|make(?:s|ing)?\s+(?:a\s+)?check|(?:attack|scene|skill|perception|investigation|arcana|athletics|stealth|survival|lore|history)\s+checks?)\b/i

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizedValue(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function normalizeForTermMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesExactLabel(text: string, label: string): boolean {
  return new RegExp(`\\b${escapeRegExp(label)}\\b`, 'i').test(text)
}

function includesContextualId(text: string, value: string): boolean {
  const normalizedId = normalizeForTermMatch(value)
  const tokenCount = normalizedId.split(/\s+/).filter(Boolean).length
  if (normalizedId.replace(/\s+/g, '').length < 6 || tokenCount < 3) return false
  return ` ${normalizeForTermMatch(text)} `.includes(` ${normalizedId} `)
}

function includesGroundingTerm(publicText: string, groundingTerms: PublicNarrativeContractFacts['groundingTerms']): boolean {
  const normalizedText = ` ${normalizeForTermMatch(publicText)} `
  return (groundingTerms ?? []).some((term) => {
    const normalizedTerm = normalizeForTermMatch(normalizedValue(term))
    return Boolean(normalizedTerm && normalizedText.includes(` ${normalizedTerm} `))
  })
}

export function findPublicOutputDenylistViolation(
  publicText: string,
  context: PublicOutputDenylistContext = {}
): PublicOutputDenylistViolation | null {
  const normalizedText = normalizedValue(publicText)
  if (!normalizedText) return null
  if (PUBLIC_EXPLICIT_MECHANICS_PATTERN.test(normalizedText)) {
    return { reason: 'explicit roll/check mechanics', category: 'publicness' }
  }

  for (const [pattern, reason, options] of SHARED_PUBLIC_PROSE_DENYLIST_PATTERNS) {
    if (options?.allowGenericCheckWord && context.allowGenericCheckWord) continue
    if (pattern.test(normalizedText)) return { reason, category: 'publicness' }
  }

  const contextualCheckId = normalizedValue(context.contextualCheckId)
  if (contextualCheckId && includesContextualId(normalizedText, contextualCheckId)) {
    return { reason: 'contextual check id', category: 'publicness' }
  }

  const contextualCheckLabel = normalizedValue(context.contextualCheckLabel)
  const contextualCheckSource = normalizedValue(context.contextualCheckSource).toLowerCase()
  if (contextualCheckLabel && contextualCheckSource === 'contextual' && includesExactLabel(normalizedText, contextualCheckLabel)) {
    return { reason: 'contextual check label', category: 'publicness' }
  }

  for (const contextualId of context.contextualIds ?? []) {
    const value = normalizedValue(contextualId)
    if (value && includesContextualId(normalizedText, value)) return { reason: 'contextual id', category: 'publicness' }
  }

  for (const contextualLabel of context.contextualLabels ?? []) {
    const value = normalizedValue(contextualLabel)
    if (value && includesExactLabel(normalizedText, value)) return { reason: 'contextual label', category: 'publicness' }
  }

  return null
}

export function findPublicNarrativeContractViolation(
  publicText: string,
  facts: PublicNarrativeContractFacts = {}
): PublicNarrativeContractViolation | null {
  const normalizedText = normalizedValue(publicText)
  if (!normalizedText) {
    return { category: 'narrative_motion', reason: 'empty public text' }
  }

  if (facts.minChars != null && normalizedText.length < facts.minChars) {
    return { category: 'narrative_motion', reason: `shorter than ${facts.minChars} characters` }
  }

  const denylistViolation = findPublicOutputDenylistViolation(normalizedText, facts)
  if (denylistViolation) return denylistViolation

  if (facts.allowCharacterDialogue !== true && PUBLIC_CHARACTER_DIALOGUE_NARRATION_PATTERN.test(normalizedText)) {
    return { category: 'voice_hygiene', reason: 'narrates character dialogue' }
  }

  if (facts.disallowUnsafeMechanics && PUBLIC_UNSAFE_NONCOMBAT_MECHANICS_PATTERN.test(normalizedText)) {
    return { category: 'fact_alignment', reason: 'unsafe mechanics, reward, fatality, wallet, or chain language' }
  }

  if (facts.requireConcreteGrounding) {
    const hasGrounding = PUBLIC_CONCRETE_GROUNDING_PATTERN.test(normalizedText) || includesGroundingTerm(normalizedText, facts.groundingTerms)
    if (!hasGrounding) {
      return { category: 'grounding', reason: 'missing concrete visible object, route, place, or provided anchor' }
    }
  }

  if (facts.requireNarrativeMotion && !PUBLIC_NARRATIVE_MOTION_PATTERN.test(normalizedText)) {
    return { category: 'narrative_motion', reason: 'missing visible action, motion, or changed state' }
  }

  if (facts.requirePayoff) {
    const hasSuccessPayoff = PUBLIC_SUCCESS_PAYOFF_PATTERN.test(normalizedText)
    const hasConsequencePayoff = PUBLIC_CONSEQUENCE_PAYOFF_PATTERN.test(normalizedText)
    if (facts.requirePayoff === 'success' && !hasSuccessPayoff) {
      return { category: 'payoff', reason: 'missing usable success payoff' }
    }
    if (facts.requirePayoff === 'consequence' && !hasConsequencePayoff) {
      return { category: 'payoff', reason: 'missing visible consequence or cost' }
    }
    if (facts.requirePayoff === 'any' && !hasSuccessPayoff && !hasConsequencePayoff) {
      return { category: 'payoff', reason: 'missing payoff, consequence, or changed choice' }
    }
  }

  return null
}

export function validatePublicNarrativeContract(
  publicText: string,
  facts: PublicNarrativeContractFacts = {}
): { ok: true } | { ok: false; violation: PublicNarrativeContractViolation } {
  const violation = findPublicNarrativeContractViolation(publicText, facts)
  return violation ? { ok: false, violation } : { ok: true }
}

export function assertPublicNarrativeContract(
  publicText: string,
  facts: PublicNarrativeContractFacts = {}
): void {
  const violation = findPublicNarrativeContractViolation(publicText, facts)
  if (violation) {
    const label = facts.label ?? 'Public narrative'
    throw new Error(`${label} violates public narrative contract (${violation.category}: ${violation.reason})`)
  }
}

export function assertPublicOutputDenylistFree(
  publicText: string,
  label: string,
  context: PublicOutputDenylistContext = {}
): void {
  const violation = findPublicOutputDenylistViolation(publicText, context)
  if (violation) {
    throw new Error(`${label} leaks private ${violation.reason}`)
  }
}
