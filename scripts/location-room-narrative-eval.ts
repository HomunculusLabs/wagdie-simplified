#!/usr/bin/env ts-node

import { scoreNarrativeQuality, type NarrativeQualityMessage } from './location-room-narrative-quality'

type PublicMessage = NarrativeQualityMessage

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

  const messages = await fetchMessages(config)
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
    warnings: quality.warnings,
    scoreWarnings,
  }, null, 2))

  if (config.failOnWarnings && (quality.warnings.length > 0 || scoreWarnings.length > 0)) {
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

async function fetchMessages(config: Config): Promise<PublicMessage[]> {
  const messages: PublicMessage[] = []
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
    }
    const pageMessages = Array.isArray(body.messages) ? body.messages : []
    messages.push(...pageMessages)

    hasMore = body.pagination?.hasMore === true && pageMessages.length > 0
    page += 1
  }

  return messages.slice(0, config.pageSize)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
