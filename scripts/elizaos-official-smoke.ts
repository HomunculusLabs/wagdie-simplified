import { createHash, randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import {
  OFFICIAL_ELIZA_MESSAGE_MAX_BYTES,
  clampOfficialElizaText,
  getOfficialElizaTextMetrics,
} from '../lib/eliza/official/text'

type SmokeResult = {
  name: string
  ok: boolean
  status?: number
  detail?: string
  skipped?: boolean
}

type JsonResponse = {
  status: number
  ok: boolean
  body: unknown
  text: string
  headers: Headers
}

type SmokeState = {
  runId: string
  baseUrl: string
  agentId?: string
  sessionAgentId?: string
  sessionId?: string
  tokenId: string
  knowledgeDocumentId?: string
  knowledgeMemoryId?: string
  createdAt: string
}

type SmokeConfig = {
  baseUrl: string
  apiKey: string
  badApiKey: string
  knowledgeApiKey: string
  healthPath: string
  phase: 'fresh' | 'post-restart'
  runId: string
  statePath: string
  skipChat: boolean
  cleanup: boolean
  failOnSkipped: boolean
  tokenId: string
}

const DEFAULT_STATE_PATH = 'tmp/elizaos-official-smoke-state.json'
function usage(): string {
  return `ElizaOS official smoke validation\n\nUsage:\n  bun run elizaos:smoke\n  ELIZAOS_SMOKE_PHASE=post-restart bun run elizaos:smoke\n\nRequired for live validation:\n  ELIZAOS_BASE_URL              Hosted ElizaOS service base URL\n  ELIZAOS_API_KEY               X-API-KEY accepted by the service (or ELIZA_SERVER_AUTH_TOKEN)\n\nOptional:\n  WAGDIE_KNOWLEDGE_INGESTION_TOKEN or ELIZAOS_KNOWLEDGE_API_KEY\n                                Token for /wagdie-knowledge/*; defaults to ELIZAOS_API_KEY\n  ELIZAOS_HEALTH_PATH           Defaults to /api/server/health\n  ELIZAOS_SMOKE_PHASE           fresh | post-restart (default: fresh)\n  ELIZAOS_SMOKE_RUN_ID          Stable id for reruns/restart validation\n  ELIZAOS_SMOKE_STATE_PATH      Defaults to ${DEFAULT_STATE_PATH}\n  ELIZAOS_SMOKE_SKIP_CHAT=true  Skip provider-backed SSE checks\n  ELIZAOS_SMOKE_TOKEN_ID        Token id used in knowledge smoke payloads. Default: 0\n  ELIZAOS_SMOKE_CLEANUP=true    Delete persisted smoke session/knowledge during post-restart\n  ELIZAOS_SMOKE_FAIL_ON_SKIPPED=true\n                                Treat skipped optional checks as failures\n`
}

function boolEnv(name: string): boolean {
  return process.env[name] === 'true'
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] || fallback || ''
  if (!value.trim()) {
    throw new Error(`Missing required env var ${name}. Run with --help for the validation env list.`)
  }
  return value.trim()
}

function getConfig(): SmokeConfig {
  const phase = process.env.ELIZAOS_SMOKE_PHASE === 'post-restart' ? 'post-restart' : 'fresh'
  const apiKey = requireEnv('ELIZAOS_API_KEY', process.env.ELIZA_SERVER_AUTH_TOKEN)

  return {
    baseUrl: requireEnv('ELIZAOS_BASE_URL').replace(/\/$/, ''),
    apiKey,
    badApiKey: process.env.ELIZAOS_BAD_API_KEY || `bad-${randomUUID()}`,
    knowledgeApiKey:
      process.env.ELIZAOS_KNOWLEDGE_API_KEY ||
      process.env.WAGDIE_KNOWLEDGE_INGESTION_TOKEN ||
      apiKey,
    healthPath: process.env.ELIZAOS_HEALTH_PATH || '/api/server/health',
    phase,
    runId: process.env.ELIZAOS_SMOKE_RUN_ID || `smoke-${Date.now()}`,
    statePath: process.env.ELIZAOS_SMOKE_STATE_PATH || DEFAULT_STATE_PATH,
    skipChat: boolEnv('ELIZAOS_SMOKE_SKIP_CHAT'),
    cleanup: boolEnv('ELIZAOS_SMOKE_CLEANUP'),
    failOnSkipped: boolEnv('ELIZAOS_SMOKE_FAIL_ON_SKIPPED'),
    tokenId: process.env.ELIZAOS_SMOKE_TOKEN_ID || '0',
  }
}

function ok(name: string, status?: number, detail?: string): SmokeResult {
  return { name, ok: true, status, detail }
}

function fail(name: string, detail: string, status?: number): SmokeResult {
  return { name, ok: false, status, detail }
}

function skip(name: string, detail: string): SmokeResult {
  return { name, ok: true, skipped: true, detail }
}

function redact(value: string, secret: string, label: string): string {
  return secret ? value.split(secret).join(label) : value
}

function safeDetail(value: string, config: SmokeConfig): string {
  return redact(redact(value, config.apiKey, '[redacted-api-key]'), config.knowledgeApiKey, '[redacted-knowledge-key]').slice(0, 500)
}

async function requestJson(
  config: SmokeConfig,
  path: string,
  options: RequestInit & { apiKey?: string | false } = {}
): Promise<JsonResponse> {
  const headers = new Headers(options.headers)
  const apiKey = options.apiKey === undefined ? config.apiKey : options.apiKey

  if (apiKey) {
    headers.set('X-API-KEY', apiKey)
  }

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers,
  })
  const text = await response.text()

  try {
    return {
      status: response.status,
      ok: response.ok,
      body: text ? JSON.parse(text) : null,
      text,
      headers: response.headers,
    }
  } catch {
    return { status: response.status, ok: response.ok, body: null, text, headers: response.headers }
  }
}

async function checkJson(
  config: SmokeConfig,
  name: string,
  path: string,
  options?: RequestInit & { apiKey?: string | false }
): Promise<SmokeResult> {
  try {
    const response = await requestJson(config, path, options)
    return response.ok
      ? ok(name, response.status)
      : fail(name, safeDetail(response.text, config), response.status)
  } catch (error) {
    return fail(name, error instanceof Error ? error.message : String(error))
  }
}

function expectRejected(name: string, response: JsonResponse, config: SmokeConfig): SmokeResult {
  if (response.status === 401 || response.status === 403) {
    return ok(name, response.status)
  }

  return fail(
    name,
    `expected 401/403, got ${response.status}: ${safeDetail(response.text, config)}`,
    response.status
  )
}

async function checkAuthRejection(config: SmokeConfig): Promise<SmokeResult[]> {
  const knowledgeProbe = {
    tokenId: '0',
    documentId: `unauthorized-${config.runId}`,
    officialAgentId: randomUUID(),
    path: 'smoke/unauthorized.md',
    content: 'unauthorized probe',
    contentHash: sha256('unauthorized probe'),
    sourcePointer: {
      tokenId: '0',
      documentId: `unauthorized-${config.runId}`,
      officialAgentId: randomUUID(),
      path: 'smoke/unauthorized.md',
      contentHash: sha256('unauthorized probe'),
      version: 'smoke-v1',
    },
  }

  const checks: SmokeResult[] = []
  checks.push(
    expectRejected(
      'service auth rejects missing X-API-KEY on configured health',
      await requestJson(config, config.healthPath, { apiKey: false }),
      config
    )
  )
  checks.push(
    expectRejected(
      'service auth rejects bad X-API-KEY on configured health',
      await requestJson(config, config.healthPath, { apiKey: config.badApiKey }),
      config
    )
  )
  checks.push(
    expectRejected(
      'knowledge auth rejects missing X-API-KEY',
      await requestJson(config, '/wagdie-knowledge/index', {
        method: 'POST',
        apiKey: false,
        body: JSON.stringify(knowledgeProbe),
      }),
      config
    )
  )
  checks.push(
    expectRejected(
      'knowledge auth rejects bad X-API-KEY',
      await requestJson(config, '/wagdie-knowledge/index', {
        method: 'POST',
        apiKey: config.badApiKey,
        body: JSON.stringify(knowledgeProbe),
      }),
      config
    )
  )

  return checks
}

function smokeCharacter(agentId: string, runId: string, updateMarker: string): Record<string, unknown> {
  return {
    id: agentId,
    name: `WAGDIE Smoke Agent ${runId}`,
    username: `wagdie-smoke-${runId}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48),
    system:
      'You are a disposable WAGDIE cutover smoke-test agent. Keep replies short and do not expose secrets.',
    bio: [
      'Disposable WAGDIE-hosted ElizaOS validation agent for official service cutover testing.',
    ],
    topics: ['WAGDIE', 'cutover', 'smoke-test'],
    adjectives: ['concise', 'disposable', 'safe'],
    plugins: ['@elizaos/plugin-venice'],
    style: {
      all: ['Use one short sentence.', 'Never print API keys or credentials.'],
      chat: ['Answer as a smoke-test character.'],
    },
    settings: {
      wagdie: {
        externalId: `smoke-${runId}`,
        smokeRunId: runId,
        updateMarker,
      },
    },
  }
}

function extractId(body: unknown, fallback?: string): string | undefined {
  if (!body || typeof body !== 'object') return fallback
  const record = body as Record<string, unknown>
  const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : record
  const character = data.character && typeof data.character === 'object' ? (data.character as Record<string, unknown>) : null
  const id = data.id || character?.id || record.id
  return typeof id === 'string' ? id : fallback
}

async function createOrUpdateAgent(
  config: SmokeConfig,
  state: SmokeState
): Promise<{ result: SmokeResult; agentId?: string }> {
  const agentId = state.agentId || process.env.ELIZAOS_SMOKE_AGENT_ID || randomUUID()

  const create = await requestJson(config, '/api/agents', {
    method: 'POST',
    body: JSON.stringify({ characterJson: smokeCharacter(agentId, config.runId, 'create') }),
  })

  if (!create.ok && create.status !== 409) {
    return {
      result: fail('agent create/update disposable character', safeDetail(create.text, config), create.status),
    }
  }

  const createdAgentId = create.ok ? extractId(create.body, agentId) || agentId : agentId
  const update = await requestJson(config, `/api/agents/${createdAgentId}`, {
    method: 'PATCH',
    body: JSON.stringify(smokeCharacter(createdAgentId, config.runId, `update-${Date.now()}`)),
  })

  if (!update.ok) {
    return {
      result: fail('agent create/update disposable character', safeDetail(update.text, config), update.status),
      agentId: createdAgentId,
    }
  }

  return {
    result: ok(
      create.status === 409
        ? 'agent update existing disposable character'
        : 'agent create/update disposable character',
      update.status
    ),
    agentId: extractId(update.body, createdAgentId),
  }
}

async function verifyAgent(config: SmokeConfig, state: SmokeState): Promise<SmokeResult> {
  if (!state.agentId) return fail('post-restart agent persistence', 'state file has no agentId')
  return checkJson(config, 'post-restart agent persistence', `/api/agents/${state.agentId}`)
}

function extractAgents(body: unknown): Array<{ id: string; status?: string; name?: string }> {
  if (!body || typeof body !== 'object') return []
  const record = body as Record<string, unknown>
  const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : record
  const agents = Array.isArray(data.agents) ? data.agents : Array.isArray(record.agents) ? record.agents : []

  return agents.flatMap((agent) => {
    if (!agent || typeof agent !== 'object') return []
    const item = agent as Record<string, unknown>
    return typeof item.id === 'string'
      ? [{ id: item.id, status: typeof item.status === 'string' ? item.status : undefined, name: typeof item.name === 'string' ? item.name : undefined }]
      : []
  })
}

async function resolveSessionAgentId(config: SmokeConfig, preferredAgentId: string): Promise<{ agentId?: string; result: SmokeResult }> {
  const response = await requestJson(config, '/api/agents')
  if (!response.ok) {
    return { result: fail('resolve live session agent', safeDetail(response.text, config), response.status) }
  }

  const agents = extractAgents(response.body)
  const preferred = agents.find((agent) => agent.id === preferredAgentId && agent.status === 'active')
  const active = preferred || agents.find((agent) => agent.status === 'active') || agents[0]

  if (!active?.id) {
    return { result: fail('resolve live session agent', 'no agents returned by /api/agents', response.status) }
  }

  return { agentId: active.id, result: ok('resolve live session agent', response.status) }
}

async function createSession(config: SmokeConfig, agentId: string, purpose: string): Promise<{ sessionId?: string; result: SmokeResult }> {
  const response = await requestJson(config, '/api/messaging/sessions', {
    method: 'POST',
    body: JSON.stringify({
      agentId,
      userId: uuidFromString(`wagdie-smoke-user:${config.runId}`),
      metadata: { source: 'wagdie-smoke', purpose, runId: config.runId },
    }),
  })

  const sessionId = extractSessionId(response.body)
  if (!response.ok || !sessionId) {
    return {
      result: fail(`session create (${purpose})`, safeDetail(response.text || 'missing session id', config), response.status),
    }
  }

  return { sessionId, result: ok(`session create (${purpose})`, response.status) }
}

function extractSessionId(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const record = body as Record<string, unknown>
  const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : record
  const id = data.sessionId || data.id || record.sessionId || record.id
  return typeof id === 'string' ? id : undefined
}

type SseEvent = { event: string; data: string }

function buildNearLimitUnicodeSmokePayload(runId: string): string {
  const gothicName = '𝔚𝔄𝔊𝔇𝔦𝔈 𝔠𝔯𝔬𝔴 𝔰𝔪𝔬𝔨𝔢'
  const observedStyle = `${gothicName} — 🜂🜃🜁🜄 skull-bell omen 🦴🔥🕯️ `
  const overBudget = [
    `Reply with one short smoke-test word for run ${runId}.`,
    'This message intentionally validates near-limit Unicode persistence without logging prompt content.',
    observedStyle.repeat(140),
    '\uD83D',
  ].join('\n')
  const clamped = clampOfficialElizaText(overBudget)
  const metrics = getOfficialElizaTextMetrics(clamped)

  if (metrics.utf8Bytes > OFFICIAL_ELIZA_MESSAGE_MAX_BYTES) {
    throw new Error(`near-limit Unicode smoke payload exceeded ${OFFICIAL_ELIZA_MESSAGE_MAX_BYTES} UTF-8 bytes`)
  }

  return clamped
}

function parseSse(text: string): SseEvent[] {
  const events: SseEvent[] = []

  for (const block of text.split(/\n\n+/)) {
    const lines = block.split(/\r?\n/)
    let event = 'message'
    const data: string[] = []

    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice('event:'.length).trim()
      if (line.startsWith('data:')) data.push(line.slice('data:'.length).trim())
    }

    if (data.length > 0) events.push({ event, data: data.join('\n') })
  }

  return events
}

async function sendSseMessage(
  config: SmokeConfig,
  sessionId: string,
  content: string,
  name: string
): Promise<SmokeResult> {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'X-API-KEY': config.apiKey,
  })
  const response = await fetch(`${config.baseUrl}/api/messaging/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content,
      transport: 'sse',
      metadata: { source: 'wagdie-smoke', runId: config.runId },
    }),
  })
  const text = await response.text()
  const sanitized = safeDetail(text, config)

  if (!response.ok) {
    return fail(name, sanitized, response.status)
  }

  const events = parseSse(text)
  const eventNames = new Set(events.map((event) => event.event))
  const doneOrCompleteEvents = events.filter(
    (event) => event.event === 'done' || event.event === 'complete'
  )
  const doneHasText = doneOrCompleteEvents.some((event) => {
    try {
      const data = JSON.parse(event.data) as Record<string, unknown>
      return typeof data.text === 'string' || typeof data.content === 'string' || typeof data.message === 'string'
    } catch {
      return Boolean(event.data.trim())
    }
  })
  const hasTokenLikeEvent =
    eventNames.has('chunk') || eventNames.has('token') || eventNames.has('message') || doneHasText
  const hasCompleteLikeEvent = doneOrCompleteEvents.length > 0

  if (!hasTokenLikeEvent || !hasCompleteLikeEvent) {
    return fail(
      name,
      `expected token/chunk and done/complete SSE events, got: ${Array.from(eventNames).join(', ') || 'none'}`,
      response.status
    )
  }

  return ok(name, response.status, `events=${Array.from(eventNames).join(',')}`)
}

async function checkSseErrorCompatibility(config: SmokeConfig): Promise<SmokeResult> {
  const response = await fetch(`${config.baseUrl}/api/messaging/sessions/not-a-real-session/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'X-API-KEY': config.apiKey,
    },
    body: JSON.stringify({ content: 'force a route-safe error', transport: 'sse' }),
  })
  const text = await response.text()
  const sanitized = safeDetail(text, config)

  if (text.includes(config.apiKey) || text.includes(config.knowledgeApiKey)) {
    return fail('SSE error response does not leak configured keys', 'response contained a configured secret')
  }

  if (response.ok) {
    const events = parseSse(text)
    if (!events.some((event) => event.event === 'error')) {
      return fail('SSE error compatibility', 'expected HTTP error status or SSE error event')
    }
  }

  return ok('SSE error compatibility without key leakage', response.status)
}

async function checkChatAndSessions(
  config: SmokeConfig,
  state: SmokeState
): Promise<SmokeResult[]> {
  if (config.skipChat) {
    return [skip('SSE chat/session checks', 'ELIZAOS_SMOKE_SKIP_CHAT=true')]
  }

  if (!state.agentId) {
    return [fail('SSE chat/session checks', 'agentId is required')]
  }

  const results: SmokeResult[] = []
  const sessionAgent = await resolveSessionAgentId(config, state.agentId)
  results.push(sessionAgent.result)

  if (!sessionAgent.agentId) {
    results.push(await checkSseErrorCompatibility(config))
    return results
  }

  state.sessionAgentId = sessionAgent.agentId
  const mainSession = await createSession(config, sessionAgent.agentId, 'persistence')
  results.push(mainSession.result)

  if (mainSession.sessionId) {
    state.sessionId = mainSession.sessionId
    results.push(await sendSseMessage(config, mainSession.sessionId, 'Reply with one smoke-test word.', 'SSE chat success'))
    results.push(await sendSseMessage(config, mainSession.sessionId, 'Reply with one different word.', 'session reuse on same official session'))
    results.push(await sendSseMessage(
      config,
      mainSession.sessionId,
      buildNearLimitUnicodeSmokePayload(config.runId),
      'near-limit Unicode session message persistence'
    ))
  }

  const deleteSession = await createSession(config, sessionAgent.agentId, 'delete-check')
  results.push(deleteSession.result)
  if (deleteSession.sessionId) {
    const deleted = await requestJson(config, `/api/messaging/sessions/${deleteSession.sessionId}`, {
      method: 'DELETE',
    })
    results.push(
      deleted.ok
        ? ok('session delete', deleted.status)
        : fail('session delete', safeDetail(deleted.text, config), deleted.status)
    )
  }

  results.push(await checkSseErrorCompatibility(config))
  return results
}

async function verifySessionPersistence(config: SmokeConfig, state: SmokeState): Promise<SmokeResult[]> {
  if (!state.sessionId) return [skip('post-restart session persistence', 'state file has no sessionId')]

  const session = await requestJson(config, `/api/messaging/sessions/${state.sessionId}`)
  if (session.ok) {
    return [
      ok('post-restart session persistence', session.status),
      await checkJson(
        config,
        'post-restart session messages persistence',
        `/api/messaging/sessions/${state.sessionId}/messages`
      ),
    ]
  }

  if (session.status === 404) {
    return [
      ok(
        'post-restart session volatility acknowledged',
        session.status,
        'official ElizaOS messaging sessions are volatile across service restarts; WAGDIE recreates sessions when needed'
      ),
    ]
  }

  return [fail('post-restart session persistence', safeDetail(session.text, config), session.status)]
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function uuidFromString(value: string): string {
  const hex = sha256(value).slice(0, 32)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}

function knowledgeBody(config: SmokeConfig, state: SmokeState, documentId: string, content: string) {
  if (!state.agentId) throw new Error('agentId is required for knowledge checks')
  const contentHash = sha256(content)
  return {
    tokenId: config.tokenId,
    documentId,
    officialAgentId: state.agentId,
    path: `smoke/${documentId}.md`,
    content,
    contentHash,
    sourcePointer: {
      tokenId: config.tokenId,
      documentId,
      officialAgentId: state.agentId,
      path: `smoke/${documentId}.md`,
      contentHash,
      version: 'smoke-v1',
    },
  }
}

async function indexKnowledge(
  config: SmokeConfig,
  body: ReturnType<typeof knowledgeBody>,
  name: string
): Promise<{ result: SmokeResult; memoryId?: string }> {
  const response = await requestJson(config, '/wagdie-knowledge/index', {
    method: 'POST',
    apiKey: config.knowledgeApiKey,
    body: JSON.stringify(body),
  })
  const memoryId = extractMemoryId(response.body)
  return {
    result:
      response.ok && memoryId
        ? ok(name, response.status)
        : fail(name, safeDetail(response.text || 'missing memory id', config), response.status),
    memoryId,
  }
}

function extractMemoryId(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const record = body as Record<string, unknown>
  const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : record
  const id = data.memoryId || record.memoryId
  return typeof id === 'string' ? id : undefined
}

async function deleteKnowledge(
  config: SmokeConfig,
  input: { tokenId: string; documentId: string; officialAgentId?: string; officialMemoryId?: string },
  name: string
): Promise<SmokeResult> {
  const response = await requestJson(config, '/wagdie-knowledge/delete', {
    method: 'POST',
    apiKey: config.knowledgeApiKey,
    body: JSON.stringify(input),
  })

  return response.ok
    ? ok(name, response.status)
    : fail(name, safeDetail(response.text, config), response.status)
}

async function checkKnowledge(config: SmokeConfig, state: SmokeState): Promise<SmokeResult[]> {
  if (!state.agentId) return [fail('knowledge index/delete', 'agentId is required')]

  const results: SmokeResult[] = []
  const immediateDocumentId = `smoke-delete-${config.runId}`
  const immediateBody = knowledgeBody(
    config,
    state,
    immediateDocumentId,
    `Immediate delete smoke document ${config.runId}`
  )
  const immediateIndex = await indexKnowledge(config, immediateBody, 'knowledge index disposable document')
  results.push(immediateIndex.result)
  if (immediateIndex.memoryId) {
    results.push(
      await deleteKnowledge(
        config,
        {
          tokenId: immediateBody.tokenId,
          documentId: immediateBody.documentId,
          officialAgentId: immediateBody.officialAgentId,
          officialMemoryId: immediateIndex.memoryId,
        },
        'knowledge delete disposable document'
      )
    )
  }

  const persistedDocumentId = `smoke-persist-${config.runId}`
  const persistedBody = knowledgeBody(
    config,
    state,
    persistedDocumentId,
    `Persisted smoke document ${config.runId}`
  )
  const persistedIndex = await indexKnowledge(config, persistedBody, 'knowledge index persisted restart document')
  results.push(persistedIndex.result)
  if (persistedIndex.memoryId) {
    state.knowledgeDocumentId = persistedDocumentId
    state.knowledgeMemoryId = persistedIndex.memoryId
  }

  return results
}

async function verifyKnowledgePostRestartInvalidation(config: SmokeConfig, state: SmokeState): Promise<SmokeResult[]> {
  if (!state.knowledgeDocumentId || !state.knowledgeMemoryId || !state.agentId) {
    return [skip('post-restart knowledge invalidation cleanup', 'state file has no persisted knowledge ids')]
  }

  return [
    await deleteKnowledge(
      config,
      {
        tokenId: state.tokenId,
        documentId: state.knowledgeDocumentId,
        officialAgentId: state.agentId,
        officialMemoryId: state.knowledgeMemoryId,
      },
      'post-restart knowledge invalidation/delete path'
    ),
  ]
}

function saveState(config: SmokeConfig, state: SmokeState): SmokeResult {
  mkdirSync(dirname(config.statePath), { recursive: true })
  writeFileSync(config.statePath, `${JSON.stringify(state, null, 2)}\n`)
  return ok('persistence state artifact written', undefined, config.statePath)
}

function loadState(config: SmokeConfig): SmokeState {
  if (!existsSync(config.statePath)) {
    throw new Error(
      `Missing smoke state file ${config.statePath}. Run the fresh phase before the post-restart phase, or set ELIZAOS_SMOKE_STATE_PATH.`
    )
  }

  const parsed = JSON.parse(readFileSync(config.statePath, 'utf8')) as SmokeState
  if (!parsed.runId) throw new Error(`Invalid smoke state file ${config.statePath}: missing runId`)
  return parsed
}

async function runFresh(config: SmokeConfig): Promise<SmokeResult[]> {
  const state: SmokeState = {
    runId: config.runId,
    baseUrl: config.baseUrl,
    tokenId: config.tokenId,
    createdAt: new Date().toISOString(),
  }
  const results: SmokeResult[] = []

  results.push(await checkJson(config, 'configured health', config.healthPath))
  results.push(await checkJson(config, 'lightweight healthz', '/healthz', { apiKey: false }))
  results.push(await checkJson(config, 'lightweight health', '/health', { apiKey: false }))
  results.push(await checkJson(config, 'sessions health', '/api/messaging/sessions/health'))
  results.push(await checkJson(config, 'agents list', '/api/agents'))
  results.push(...(await checkAuthRejection(config)))

  const agent = await createOrUpdateAgent(config, state)
  results.push(agent.result)
  if (agent.agentId) state.agentId = agent.agentId

  results.push(...(await checkChatAndSessions(config, state)))
  results.push(...(await checkKnowledge(config, state)))
  results.push(saveState(config, state))

  return results
}

async function runPostRestart(config: SmokeConfig): Promise<SmokeResult[]> {
  const state = loadState(config)
  const results: SmokeResult[] = []

  results.push(await checkJson(config, 'post-restart configured health', config.healthPath))
  results.push(await verifyAgent(config, state))
  results.push(...(await verifySessionPersistence(config, state)))
  results.push(...(await verifyKnowledgePostRestartInvalidation(config, state)))

  if (config.cleanup && state.sessionId) {
    const deleted = await requestJson(config, `/api/messaging/sessions/${state.sessionId}`, {
      method: 'DELETE',
    })
    results.push(
      deleted.ok
        ? ok('post-restart cleanup session delete', deleted.status)
        : fail('post-restart cleanup session delete', safeDetail(deleted.text, config), deleted.status)
    )
  }

  return results
}

function printResults(results: SmokeResult[]): void {
  for (const result of results) {
    const status = result.status ? ` (${result.status})` : ''
    const marker = result.skipped ? '-' : result.ok ? '✓' : '✗'
    console.log(`${marker} ${result.name}${status}`)

    if (result.detail) {
      console.log(`  ${result.detail}`)
    }
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage())
    return
  }

  const config = getConfig()
  const results = config.phase === 'post-restart' ? await runPostRestart(config) : await runFresh(config)

  printResults(results)

  const failed = results.filter((result) => !result.ok)
  const skipped = results.filter((result) => result.skipped)

  if (failed.length > 0 || (config.failOnSkipped && skipped.length > 0)) {
    throw new Error(
      `${failed.length} failed and ${skipped.length} skipped ElizaOS smoke check(s) for ${config.baseUrl}`
    )
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
