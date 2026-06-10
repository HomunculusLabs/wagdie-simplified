import type { LocationRoomRouteDiagnostic } from './routeDiagnostics'

export type LocationRoomStallDiagnosticMessage = {
  id?: string
  authorKind?: string | null
  authorName?: string | null
  content: string
  messageKind?: string | null
  messageDomain?: string | null
  gameplayMessageKind?: string | null
  createdAt?: string | null
  metadata?: Record<string, unknown> | null
}

export type LocationRoomStallDiagnosticGameplaySnapshot = {
  mode?: string | null
  status?: string | null
  encounterStatus?: string | null
  encounterTitle?: string | null
}

export type LocationRoomStallDiagnosticInput = {
  messages: LocationRoomStallDiagnosticMessage[]
  routeDiagnostics?: LocationRoomRouteDiagnostic[]
  gameplay?: LocationRoomStallDiagnosticGameplaySnapshot | null
  terminalThreatNames?: string[]
  skipStreakThreshold?: number
  silentAdvancementThreshold?: number
  recentMessageWindow?: number
}

export type LocationRoomStallDiagnosticCode =
  | 'silent_advancement'
  | 'skip_streak'
  | 'terminal_mismatch'
  | 'missing_aftermath'
  | 'target_resurrection'

export type LocationRoomStallDiagnosticFinding = {
  code: LocationRoomStallDiagnosticCode
  severity: 'warning' | 'failure'
  message: string
  evidence: Record<string, unknown>
}

const DEFAULT_SKIP_STREAK_THRESHOLD = 3
const DEFAULT_SILENT_ADVANCEMENT_THRESHOLD = 3
const DEFAULT_RECENT_MESSAGE_WINDOW = 80
const TERMINAL_ENCOUNTER_STATUSES = new Set(['victory', 'defeat', 'fled', 'abandoned', 'completed', 'stopped', 'failed'])
const PUBLIC_AFTER_TERMINAL_PATTERN = /\b(?:aftermath|reward|spoils|survivors?|dead|slain|defeated|vanquished|falls?|collapses?|fled|escape|retreat|victory|body|corpse|silence returns|breathing room|wound|cost)\b/i
const TERMINAL_PROSE_PATTERN = /\b(?:dead|slain|defeated|destroyed|vanquished|falls?|collapses?|corpse|body|fled|retreats?|driven off|no longer moves|goes still)\b/i
const ATTACK_AFTER_TERMINAL_PATTERN = /\b(?:attacks?|strikes?|lunges?|bites?|claws?\s+(?:at|toward|for|into)|targets?|turns on|swings?|slashes?|charges?|presses the attack|still fighting|again attacks?)\b/i

export function evaluateLocationRoomStallDiagnostics(
  input: LocationRoomStallDiagnosticInput
): LocationRoomStallDiagnosticFinding[] {
  const routeDiagnostics = input.routeDiagnostics ?? []
  const messages = input.messages.slice(-Math.max(1, input.recentMessageWindow ?? DEFAULT_RECENT_MESSAGE_WINDOW))
  const findings: LocationRoomStallDiagnosticFinding[] = []

  findings.push(...detectSilentAdvancement(routeDiagnostics, input.silentAdvancementThreshold ?? DEFAULT_SILENT_ADVANCEMENT_THRESHOLD))
  findings.push(...detectSkipStreaks(routeDiagnostics, input.skipStreakThreshold ?? DEFAULT_SKIP_STREAK_THRESHOLD))
  findings.push(...detectTerminalMismatch(input.gameplay ?? null, routeDiagnostics))
  findings.push(...detectMissingAftermath(messages, routeDiagnostics, input.gameplay ?? null))
  findings.push(...detectTargetResurrection(messages, input.terminalThreatNames ?? []))

  return dedupeFindings(findings)
}

export function locationRoomStallWarnings(findings: LocationRoomStallDiagnosticFinding[]): string[] {
  return findings.map((finding) => `${finding.code}: ${finding.message}`)
}

function detectSilentAdvancement(
  diagnostics: LocationRoomRouteDiagnostic[],
  threshold: number
): LocationRoomStallDiagnosticFinding[] {
  const silentRuns = diagnostics.reduce<LocationRoomRouteDiagnostic[][]>((runs, diagnostic) => {
    const isSilent = diagnostic.publicOutputOutcome !== undefined && diagnostic.publicOutputOutcome !== 'public_message_appended'
    if (!isSilent) return [...runs, []]

    const current = runs[runs.length - 1] ?? []
    const previous = current[current.length - 1]
    const nextRun = previous && previous.roomId === diagnostic.roomId && previous.locationId === diagnostic.locationId
      ? [...current, diagnostic]
      : [diagnostic]
    return [...runs.slice(0, -1), nextRun]
  }, [[]])
  const longest = silentRuns.reduce<LocationRoomRouteDiagnostic[]>((best, run) => run.length > best.length ? run : best, [])
  if (longest.length < threshold) return []

  return [{
    code: 'silent_advancement',
    severity: 'failure',
    message: `${longest.length} consecutive routed ticks produced no public message`,
    evidence: {
      threshold,
      tickIds: longest.map((diagnostic) => diagnostic.tickId),
      outcomes: longest.map((diagnostic) => diagnostic.publicOutputOutcome),
      skipReasons: longest.map((diagnostic) => diagnostic.skipReason).filter(Boolean),
    },
  }]
}

function detectSkipStreaks(
  diagnostics: LocationRoomRouteDiagnostic[],
  threshold: number
): LocationRoomStallDiagnosticFinding[] {
  const runs = diagnostics.reduce<LocationRoomRouteDiagnostic[][]>((accumulator, diagnostic) => {
    const current = accumulator[accumulator.length - 1] ?? []
    if (diagnostic.selectedRoute !== 'skip' || !diagnostic.skipReason) {
      return [...accumulator, []]
    }

    const previous = current[current.length - 1]
    const nextRun = previous && previous.skipReason === diagnostic.skipReason && previous.roomId === diagnostic.roomId
      ? [...current, diagnostic]
      : [diagnostic]
    return [...accumulator.slice(0, -1), nextRun]
  }, [[]])
  const longest = runs.reduce<LocationRoomRouteDiagnostic[]>((best, run) => run.length > best.length ? run : best, [])
  if (longest.length < threshold) return []

  return [{
    code: 'skip_streak',
    severity: 'warning',
    message: `${longest.length} consecutive skips used reason ${longest[0]?.skipReason}`,
    evidence: {
      threshold,
      skipReason: longest[0]?.skipReason,
      tickIds: longest.map((diagnostic) => diagnostic.tickId),
    },
  }]
}

function detectTerminalMismatch(
  gameplay: LocationRoomStallDiagnosticGameplaySnapshot | null,
  diagnostics: LocationRoomRouteDiagnostic[]
): LocationRoomStallDiagnosticFinding[] {
  const encounterStatus = normalizeStatus(gameplay?.encounterStatus)
  const gameplayStatus = normalizeStatus(gameplay?.status)
  const terminalStatus = encounterStatus && TERMINAL_ENCOUNTER_STATUSES.has(encounterStatus)
  const activeGameplayStatus = gameplayStatus === 'active_encounter' || gameplayStatus === 'active'
  const combatAfterTerminal = diagnostics.find((diagnostic) => {
    if (diagnostic.selectedRoute !== 'combat') return false
    return diagnostic.publicOutputOutcome === 'terminal_run_closed' ||
      Boolean(diagnostic.skipReason?.startsWith('encounter_')) ||
      diagnostic.skipReason === 'no_active_gameplay_encounter'
  })

  if (!terminalStatus || (!activeGameplayStatus && !combatAfterTerminal)) return []

  return [{
    code: 'terminal_mismatch',
    severity: 'failure',
    message: `encounter is terminal (${encounterStatus}) while gameplay still appears active`,
    evidence: {
      gameplay,
      combatAfterTerminalTickId: combatAfterTerminal?.tickId ?? null,
    },
  }]
}

function detectMissingAftermath(
  messages: LocationRoomStallDiagnosticMessage[],
  diagnostics: LocationRoomRouteDiagnostic[],
  gameplay: LocationRoomStallDiagnosticGameplaySnapshot | null
): LocationRoomStallDiagnosticFinding[] {
  const terminalRoute = diagnostics.some((diagnostic) => diagnostic.publicOutputOutcome === 'terminal_run_closed' || Boolean(diagnostic.skipReason?.startsWith('encounter_')))
  const terminalGameplay = TERMINAL_ENCOUNTER_STATUSES.has(normalizeStatus(gameplay?.encounterStatus) ?? '')
  if (!terminalRoute && !terminalGameplay) return []

  const publicAftermath = messages.some((message) => {
    if (message.authorKind !== 'game_master') return false
    if (messageKindFor(message) === 'roll_card') return false
    return PUBLIC_AFTER_TERMINAL_PATTERN.test(message.content)
  })
  if (publicAftermath) return []

  return [{
    code: 'missing_aftermath',
    severity: 'warning',
    message: 'terminal encounter signal has no visible aftermath/reward/cost prose in the evaluated transcript window',
    evidence: {
      terminalRoute,
      terminalGameplay,
      encounterStatus: gameplay?.encounterStatus ?? null,
      windowMessages: messages.length,
    },
  }]
}

function detectTargetResurrection(
  messages: LocationRoomStallDiagnosticMessage[],
  configuredThreatNames: string[]
): LocationRoomStallDiagnosticFinding[] {
  const threatNames = new Set(configuredThreatNames.map(normalizeThreatName).filter(Boolean))
  for (const message of messages) collectThreatNamesFromMessage(message, threatNames)

  const names = [...threatNames].filter((name) => name.length >= 4)
  const terminalIndexes = new Map<string, number>()

  messages.forEach((message, index) => {
    const content = normalizeText(message.content)
    if (!TERMINAL_PROSE_PATTERN.test(message.content)) return
    for (const name of names) {
      if (content.includes(name)) terminalIndexes.set(name, Math.min(terminalIndexes.get(name) ?? index, index))
    }
  })

  for (const [name, terminalIndex] of terminalIndexes) {
    for (let index = terminalIndex + 1; index < messages.length; index += 1) {
      const message = messages[index]
      if (!normalizeText(message.content).includes(name)) continue
      if (!ATTACK_AFTER_TERMINAL_PATTERN.test(message.content)) continue
      return [{
        code: 'target_resurrection',
        severity: 'failure',
        message: `${name} appears to act or be targeted after terminal prose`,
        evidence: {
          threatName: name,
          terminalMessageId: messages[terminalIndex]?.id ?? null,
          resurrectionMessageId: message.id ?? null,
          terminalIndex,
          resurrectionIndex: index,
        },
      }]
    }
  }

  return []
}

function collectThreatNamesFromMessage(message: LocationRoomStallDiagnosticMessage, names: Set<string>): void {
  for (const key of ['encounterTitle', 'publicTitle', 'monsterName', 'monsterArchetype', 'targetName', 'title']) {
    const value = metadataString(message, key)
    if (value) names.add(normalizeThreatName(value))
  }
}


function dedupeFindings(findings: LocationRoomStallDiagnosticFinding[]): LocationRoomStallDiagnosticFinding[] {
  const seen = new Set<string>()
  return findings.filter((finding) => {
    const key = `${finding.code}:${finding.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function messageKindFor(message: LocationRoomStallDiagnosticMessage): string | null {
  return metadataString(message, 'messageKind') ?? message.messageKind ?? null
}

function metadataString(message: LocationRoomStallDiagnosticMessage, key: string): string | null {
  const direct = (message as unknown as Record<string, unknown>)[key]
  if (typeof direct === 'string') return direct
  const value = message.metadata?.[key]
  return typeof value === 'string' ? value : null
}

function normalizeStatus(status: string | null | undefined): string | null {
  return status ? status.toLowerCase().trim() : null
}

function normalizeThreatName(value: string): string {
  return normalizeText(value.replace(/^the\s+/i, ''))
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}
