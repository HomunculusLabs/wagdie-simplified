#!/usr/bin/env ts-node

import {
  narrativeQualityAttributionMetrics,
  scoreNarrativeQuality,
  type NarrativeQualityMessage,
} from './location-room-narrative-quality'

type PublicMessage = NarrativeQualityMessage

type PublicRoomStatus = {
  ttrpg: {
    phase?: string | null
    combatReadiness?: string | null
    threatLevel?: number | null
  } | null
  gameplay: {
    mode?: string | null
    status?: string | null
    encounterStatus?: string | null
    encounterTitle?: string | null
  } | null
}

type PublicRoomSnapshot = PublicRoomStatus & {
  messages: PublicMessage[]
}

type Config = {
  baseUrl: string
  locationId: string
  pageSize: number
  triggerTicks: number
  intent: 'auto' | 'story' | 'combat'
  cookie: string | null
  bearerToken: string | null
  minScore: number
  failOnWarnings: boolean
}

function usage(): string {
  return `Location-room narrative evaluation\n\nUsage:\n  bun run narrative:harness:live -- --location 11 --base-url http://localhost:3000\n  NARRATIVE_EVAL_TRIGGER_TICKS=10 NARRATIVE_EVAL_COOKIE='...' bun run narrative:harness:live -- --location 11\n\nOptions/env:\n  --base-url <url>              Defaults to NARRATIVE_EVAL_BASE_URL, WAGDIE_API_BASE_URL, or http://localhost:3000\n  --location <id>               Defaults to NARRATIVE_EVAL_LOCATION_ID or 11\n  --page-size <n>               Defaults to NARRATIVE_EVAL_PAGE_SIZE or 300\n  --trigger-ticks <n>           POST this many manual ticks before scoring. Defaults to NARRATIVE_EVAL_TRIGGER_TICKS or 0\n  --intent <auto|story|combat>  Manual tick intent. Defaults to story\n  --min-score <n>               Minimum GNQS warning threshold. Defaults to NARRATIVE_EVAL_MIN_SCORE or 75\n  --fail-on-warnings            Exit nonzero when quality warnings or score warnings are present\n  NARRATIVE_EVAL_COOKIE         Auth cookie for manual tick POSTs\n  NARRATIVE_EVAL_BEARER_TOKEN   Optional bearer token for manual tick POSTs\n`
}

function parseConfig(): Config {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage())
    process.exit(0)
  }

  const valueFor = (flag: string): string | null => {
    const index = args.indexOf(flag)
    return index >= 0 ? args[index + 1] ?? null : null
  }

  const intent = (valueFor('--intent') ?? process.env.NARRATIVE_EVAL_INTENT ?? 'story') as Config['intent']
  if (!['auto', 'story', 'combat'].includes(intent)) {
    throw new Error(`Invalid intent: ${intent}`)
  }

  return {
    baseUrl: (valueFor('--base-url') ?? process.env.NARRATIVE_EVAL_BASE_URL ?? process.env.WAGDIE_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    locationId: valueFor('--location') ?? process.env.NARRATIVE_EVAL_LOCATION_ID ?? '11',
    pageSize: Number(valueFor('--page-size') ?? process.env.NARRATIVE_EVAL_PAGE_SIZE ?? 300),
    triggerTicks: Number(valueFor('--trigger-ticks') ?? process.env.NARRATIVE_EVAL_TRIGGER_TICKS ?? 0),
    intent,
    cookie: process.env.NARRATIVE_EVAL_COOKIE ?? null,
    bearerToken: process.env.NARRATIVE_EVAL_BEARER_TOKEN ?? null,
    minScore: Number(valueFor('--min-score') ?? process.env.NARRATIVE_EVAL_MIN_SCORE ?? 75),
    failOnWarnings: args.includes('--fail-on-warnings') || process.env.NARRATIVE_EVAL_FAIL_ON_WARNINGS === 'true',
  }
}

async function main(): Promise<void> {
  const config = parseConfig()

  for (let index = 0; index < config.triggerTicks; index += 1) {
    await triggerTick(config, index + 1)
  }

  const snapshot = await fetchRoomSnapshot(config)
  const messages = snapshot.messages
  const quality = scoreNarrativeQuality({
    messages,
    warningOptions: {
      minTranscriptMessages: 20,
      minRollCards: 3,
      repeatedOutcomePrefixWarningThreshold: 2,
    },
  })
  const scoreWarnings = quality.gmNarrativeQualityScore < config.minScore
    ? [`GNQS below minimum (${quality.gmNarrativeQualityScore} < ${config.minScore})`]
    : []
  const escalationWarnings = escalationObservabilityWarnings(snapshot, quality.rawMetrics)
  const warnings = [...quality.warnings, ...escalationWarnings]
  const attributionMetrics = narrativeQualityAttributionMetrics(quality.rawMetrics)

  console.log(JSON.stringify({
    locationId: config.locationId,
    baseUrl: config.baseUrl,
    triggerTicks: config.triggerTicks,
    minScore: config.minScore,
    failOnWarnings: config.failOnWarnings,
    gmNarrativeQualityScore: quality.gmNarrativeQualityScore,
    grade: quality.grade,
    submetrics: quality.submetrics,
    metrics: quality.rawMetrics,
    attributionMetrics,
    ttrpg: snapshot.ttrpg,
    gameplay: snapshot.gameplay,
    warnings,
    scoreWarnings,
  }, null, 2))

  if (config.failOnWarnings && (warnings.length > 0 || scoreWarnings.length > 0)) {
    process.exitCode = 1
  }
}

async function triggerTick(config: Config, tickNumber: number): Promise<void> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (config.cookie) headers.cookie = config.cookie
  if (config.bearerToken) headers.authorization = `Bearer ${config.bearerToken}`

  const response = await fetch(`${config.baseUrl}/api/eliza/location-rooms/${encodeURIComponent(config.locationId)}/tick`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ intent: config.intent }),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Tick ${tickNumber} failed: HTTP ${response.status} ${text}`)
  }
}

async function fetchRoomSnapshot(config: Config): Promise<PublicRoomSnapshot> {
  const messages: PublicMessage[] = []
  let status: PublicRoomStatus = { ttrpg: null, gameplay: null }
  let page = 1
  let hasMore = true

  while (hasMore && messages.length < config.pageSize) {
    const response = await fetch(`${config.baseUrl}/api/eliza/location-rooms/${encodeURIComponent(config.locationId)}?page=${page}&pageSize=${config.pageSize}`)
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`Fetch room failed: HTTP ${response.status} ${text}`)
    }

    const body = JSON.parse(text) as {
      messages?: PublicMessage[]
      pagination?: { hasMore?: boolean }
      ttrpg?: { phase?: string | null; combatReadiness?: string | null; threatLevel?: number | null }
      gameplay?: { mode?: string | null; status?: string | null; encounter?: { publicTitle?: string | null; status?: string | null } | null }
    }
    if (page === 1) {
      status = {
        ttrpg: body.ttrpg ? {
          phase: body.ttrpg.phase ?? null,
          combatReadiness: body.ttrpg.combatReadiness ?? null,
          threatLevel: body.ttrpg.threatLevel ?? null,
        } : null,
        gameplay: body.gameplay ? {
          mode: body.gameplay.mode ?? null,
          status: body.gameplay.status ?? null,
          encounterStatus: body.gameplay.encounter?.status ?? null,
          encounterTitle: body.gameplay.encounter?.publicTitle ?? null,
        } : null,
      }
    }
    const pageMessages = Array.isArray(body.messages) ? body.messages : []
    messages.push(...pageMessages)

    hasMore = body.pagination?.hasMore === true && pageMessages.length > 0
    page += 1
  }

  return { ...status, messages: messages.slice(0, config.pageSize) }
}

function escalationObservabilityWarnings(snapshot: PublicRoomSnapshot, metrics: { totalMessages: number; failureOutcomeCount: number }): string[] {
  if (metrics.totalMessages < 20 || metrics.failureOutcomeCount < 2) return []
  const ttrpg = snapshot.ttrpg
  const gameplay = snapshot.gameplay
  const hasEscalation = ttrpg?.phase === 'threat' ||
    ttrpg?.phase === 'combat' ||
    ttrpg?.combatReadiness === 'foreshadow' ||
    ttrpg?.combatReadiness === 'ready' ||
    (typeof ttrpg?.threatLevel === 'number' && ttrpg.threatLevel > 0) ||
    gameplay?.status === 'active_encounter'
  return hasEscalation ? [] : ['calibration: repeated failure outcomes observed with no public escalation state']
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
