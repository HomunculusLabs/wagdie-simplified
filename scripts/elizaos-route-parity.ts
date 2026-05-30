import { Wallet } from 'ethers'
import { SiweMessage } from 'siwe'

type Result = {
  name: string
  ok: boolean
  status?: number
  detail?: string
  skipped?: boolean
}

type Config = {
  baseUrl: string
  tokenId: string
  privateKey?: string
  walletAddress?: string
  secondPrivateKey?: string
  runId: string
  mutate: boolean
  skipChat: boolean
  cleanup: boolean
  failOnSkipped: boolean
  timeoutMs: number
}

type JsonResponse = {
  status: number
  ok: boolean
  body: unknown
  text: string
  headers: Headers
}

type SseEvent = {
  event: string
  data: string
}

class CookieJar {
  private readonly cookies = new Map<string, string>()

  header(): string | undefined {
    const entries = Array.from(this.cookies.entries())
    return entries.length > 0 ? entries.map(([name, value]) => `${name}=${value}`).join('; ') : undefined
  }

  store(headers: Headers): void {
    const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
    const values = typeof getSetCookie === 'function' ? getSetCookie.call(headers) : []
    const fallback = headers.get('set-cookie')
    if (fallback) values.push(fallback)

    for (const value of values) {
      // Good enough for these Next.js session cookies. Avoid logging values.
      const parts = value.split(/,(?=\s*[^;,=]+=[^;,]+)/g)
      for (const part of parts) {
        const [pair] = part.trim().split(';')
        const eq = pair.indexOf('=')
        if (eq <= 0) continue
        const name = pair.slice(0, eq)
        const cookieValue = pair.slice(eq + 1)
        if (cookieValue) this.cookies.set(name, cookieValue)
        else this.cookies.delete(name)
      }
    }
  }
}

function usage(): string {
  return `WAGDIE official-mode route parity validation\n\nUsage:\n  bun run elizaos:routes:validate\n\nRequired for full live validation:\n  WAGDIE_DEV_BASE_URL or WAGDIE_APP_BASE_URL\n      Deployed WAGDIE dev app URL running ELIZA_INTEGRATION_MODE=official.\n  WAGDIE_ROUTE_PARITY_PRIVATE_KEY or WAGDIE_TEST_WALLET_PRIVATE_KEY\n      Disposable test wallet private key used only to sign SIWE messages.\n  WAGDIE_ROUTE_PARITY_TOKEN_ID or WAGDIE_TEST_TOKEN_ID\n      WAGDIE token id owned by the test wallet, or accessible by an admin test wallet.\n\nOptional:\n  WAGDIE_ROUTE_PARITY_WALLET_ADDRESS\n      Expected wallet address; script verifies the private key derives this address.\n  WAGDIE_ROUTE_PARITY_SECOND_PRIVATE_KEY\n      Optional second wallet for cross-wallet conversation isolation check.\n  WAGDIE_ROUTE_PARITY_MUTATE=true\n      Enables character PUT/import and knowledge upload/delete checks.\n      Without this, the script validates read/chat/conversation contracts only.\n  WAGDIE_ROUTE_PARITY_CONFIRM_MUTATION_TARGET=true\n      Required together with WAGDIE_ROUTE_PARITY_MUTATE=true to acknowledge\n      persona/import mutations are not automatically reverted.\n  WAGDIE_ROUTE_PARITY_SKIP_CHAT=true\n      Skip provider-backed /api/eliza/chat SSE checks.\n  WAGDIE_ROUTE_PARITY_CLEANUP=true\n      Delete the conversation created by the chat check.\n  WAGDIE_ROUTE_PARITY_RUN_ID\n      Stable marker used in disposable payloads.\n  WAGDIE_ROUTE_PARITY_TIMEOUT_MS\n      Request timeout. Default: 30000.\n  WAGDIE_ROUTE_PARITY_FAIL_ON_SKIPPED=true\n      Treat skipped optional checks as failures.\n\nPreconditions:\n  - WAGDIE dev app is deployed with ELIZA_INTEGRATION_MODE=official.\n  - The same dev app points at a validated hosted ElizaOS service.\n  - The test wallet can pass app SIWE auth.\n  - For mutation checks, the test wallet owns WAGDIE_ROUTE_PARITY_TOKEN_ID or is configured as admin, and the token is safe for disposable AI persona/knowledge edits.\n`
}

function getEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]
    if (value?.trim()) return value.trim()
  }
  return undefined
}

function requireEnv(names: string[]): string {
  const value = getEnv(names)
  if (!value) {
    throw new Error(`Missing required env var. Set one of: ${names.join(', ')}. Run with --help for details.`)
  }
  return value
}

function boolEnv(name: string): boolean {
  return process.env[name] === 'true'
}

function configFromEnv(): Config {
  const mutate = boolEnv('WAGDIE_ROUTE_PARITY_MUTATE')
  if (mutate && !boolEnv('WAGDIE_ROUTE_PARITY_CONFIRM_MUTATION_TARGET')) {
    throw new Error(
      'WAGDIE_ROUTE_PARITY_MUTATE=true requires WAGDIE_ROUTE_PARITY_CONFIRM_MUTATION_TARGET=true because character PUT/import mutations are not automatically reverted.'
    )
  }

  return {
    baseUrl: requireEnv(['WAGDIE_DEV_BASE_URL', 'WAGDIE_APP_BASE_URL']).replace(/\/$/, ''),
    tokenId: requireEnv(['WAGDIE_ROUTE_PARITY_TOKEN_ID', 'WAGDIE_TEST_TOKEN_ID']),
    privateKey: getEnv(['WAGDIE_ROUTE_PARITY_PRIVATE_KEY', 'WAGDIE_TEST_WALLET_PRIVATE_KEY']),
    walletAddress: getEnv(['WAGDIE_ROUTE_PARITY_WALLET_ADDRESS', 'WAGDIE_TEST_WALLET_ADDRESS'])?.toLowerCase(),
    secondPrivateKey: getEnv(['WAGDIE_ROUTE_PARITY_SECOND_PRIVATE_KEY', 'WAGDIE_SECOND_TEST_WALLET_PRIVATE_KEY']),
    runId: process.env.WAGDIE_ROUTE_PARITY_RUN_ID || `route-parity-${Date.now()}`,
    mutate,
    skipChat: boolEnv('WAGDIE_ROUTE_PARITY_SKIP_CHAT'),
    cleanup: boolEnv('WAGDIE_ROUTE_PARITY_CLEANUP'),
    failOnSkipped: boolEnv('WAGDIE_ROUTE_PARITY_FAIL_ON_SKIPPED'),
    timeoutMs: Number(process.env.WAGDIE_ROUTE_PARITY_TIMEOUT_MS || '30000'),
  }
}

function pass(name: string, status?: number, detail?: string): Result {
  return { name, ok: true, status, detail }
}

function fail(name: string, detail: string, status?: number): Result {
  return { name, ok: false, status, detail }
}

function skip(name: string, detail: string): Result {
  return { name, ok: true, skipped: true, detail }
}

function redact(value: string, config: Config): string {
  let redacted = value
  for (const secret of [config.privateKey, config.secondPrivateKey]) {
    if (secret) redacted = redacted.split(secret).join('[redacted-private-key]')
  }
  return redacted.slice(0, 500)
}

async function request(
  config: Config,
  jar: CookieJar,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers)
  const cookie = jar.header()
  if (cookie) headers.set('Cookie', cookie)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers,
      redirect: 'manual',
      signal: controller.signal,
    })
    jar.store(response.headers)
    return response
  } finally {
    clearTimeout(timeout)
  }
}

async function requestJson(
  config: Config,
  jar: CookieJar,
  path: string,
  init: RequestInit = {}
): Promise<JsonResponse> {
  const headers = new Headers(init.headers)
  const isFormDataBody = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body && !isFormDataBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await request(config, jar, path, { ...init, headers })
  const text = await response.text()
  try {
    return { status: response.status, ok: response.ok, body: text ? JSON.parse(text) : null, text, headers: response.headers }
  } catch {
    return { status: response.status, ok: response.ok, body: null, text, headers: response.headers }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringField(body: unknown, name: string): string | undefined {
  return isRecord(body) && typeof body[name] === 'string' ? body[name] : undefined
}

function expectStatus(name: string, response: JsonResponse, expected: number | number[], config: Config): Result {
  const allowed = Array.isArray(expected) ? expected : [expected]
  return allowed.includes(response.status)
    ? pass(name, response.status)
    : fail(name, `expected ${allowed.join('/')} got ${response.status}: ${redact(response.text, config)}`, response.status)
}

function expectShape(name: string, response: JsonResponse, predicate: (body: unknown) => boolean, config: Config): Result {
  if (!response.ok) return fail(name, redact(response.text, config), response.status)
  return predicate(response.body)
    ? pass(name, response.status)
    : fail(name, `unexpected response shape: ${redact(response.text, config)}`, response.status)
}

function walletFromConfig(config: Config): Wallet {
  if (!config.privateKey) {
    throw new Error('Full route parity requires WAGDIE_ROUTE_PARITY_PRIVATE_KEY or WAGDIE_TEST_WALLET_PRIVATE_KEY. Run with --help for details.')
  }

  const wallet = new Wallet(config.privateKey)
  if (config.walletAddress && wallet.address.toLowerCase() !== config.walletAddress) {
    throw new Error('Configured WAGDIE_ROUTE_PARITY_WALLET_ADDRESS does not match private key address')
  }
  return wallet
}

async function signInToWagdie(config: Config, wallet: Wallet): Promise<{ jar: CookieJar; results: Result[] }> {
  const jar = new CookieJar()
  const results: Result[] = []

  const nonce = await requestJson(config, jar, '/api/auth/nonce', { method: 'POST' })
  const nonceValue = stringField(nonce.body, 'nonce')
  results.push(
    nonce.ok && nonceValue
      ? pass('WAGDIE auth nonce contract', nonce.status)
      : fail('WAGDIE auth nonce contract', redact(nonce.text || 'missing nonce', config), nonce.status)
  )
  if (!nonceValue) return { jar, results }

  const url = new URL(config.baseUrl)
  const message = new SiweMessage({
    domain: url.host,
    address: wallet.address,
    statement: 'Sign in with Ethereum to WAGDIE',
    uri: config.baseUrl,
    version: '1',
    chainId: 1,
    nonce: nonceValue,
  }).prepareMessage()
  const signature = await wallet.signMessage(message)
  const verify = await requestJson(config, jar, '/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ message, signature }),
  })
  results.push(expectShape('WAGDIE auth verify contract', verify, (body) => isRecord(body) && body.success === true && typeof body.address === 'string', config))

  return { jar, results }
}

async function signInToEliza(config: Config, jar: CookieJar, wallet: Wallet): Promise<Result[]> {
  const results: Result[] = []
  const nonce = await requestJson(config, jar, '/api/eliza/auth/nonce', { method: 'POST' })
  const message = stringField(nonce.body, 'message')
  results.push(
    nonce.ok && stringField(nonce.body, 'sessionId') && stringField(nonce.body, 'nonce') && message && stringField(nonce.body, 'issuedAt')
      ? pass('/api/eliza/auth/nonce contract', nonce.status)
      : fail('/api/eliza/auth/nonce contract', redact(nonce.text || 'missing SIWE message', config), nonce.status)
  )
  if (!message) return results

  const signature = await wallet.signMessage(message)
  const verify = await requestJson(config, jar, '/api/eliza/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ signature }),
  })
  results.push(expectShape('/api/eliza/auth/verify contract', verify, (body) => Boolean(stringField(body, 'accessToken') && stringField(body, 'expiresAt')), config))
  return results
}

async function checkUnauthenticatedContracts(config: Config): Promise<Result[]> {
  const jar = new CookieJar()
  const results: Result[] = []
  results.push(expectStatus('unauthenticated /api/eliza/auth/nonce returns 401', await requestJson(config, jar, '/api/eliza/auth/nonce', { method: 'POST' }), 401, config))
  results.push(expectStatus('unauthenticated /api/eliza/chat returns 401', await requestJson(config, jar, '/api/eliza/chat', { method: 'POST', body: JSON.stringify({ tokenId: config.tokenId, message: 'unauthenticated probe' }) }), 401, config))
  results.push(expectStatus('unauthenticated /api/eliza/conversations returns 401', await requestJson(config, jar, '/api/eliza/conversations'), 401, config))
  return results
}

function parseSse(text: string): SseEvent[] {
  const events: SseEvent[] = []
  for (const block of text.split(/\n\n+/)) {
    let event = 'message'
    const data: string[] = []
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice('event:'.length).trim()
      if (line.startsWith('data:')) data.push(line.slice('data:'.length).trim())
    }
    if (data.length > 0) events.push({ event, data: data.join('\n') })
  }
  return events
}

function parseCompletePayload(events: SseEvent[]): { conversationId?: string; content?: string; leaksOfficialSessionId: boolean } {
  const complete = events.find((event) => event.event === 'complete')
  if (!complete) return { leaksOfficialSessionId: false }
  try {
    const parsed = JSON.parse(complete.data) as Record<string, unknown>
    return {
      conversationId: typeof parsed.conversationId === 'string' ? parsed.conversationId : undefined,
      content: typeof parsed.content === 'string' ? parsed.content : undefined,
      leaksOfficialSessionId: Object.keys(parsed).some((key) => /official.*session/i.test(key)),
    }
  } catch {
    return { leaksOfficialSessionId: false }
  }
}

function streamedAssistantText(events: SseEvent[]): string {
  return events.map((event) => {
    try {
      const parsed = JSON.parse(event.data) as Record<string, unknown>
      if (event.event === 'token' && typeof parsed.token === 'string') return parsed.token
      if (event.event === 'complete' && typeof parsed.content === 'string') return parsed.content
    } catch {
      // Ignore malformed event data; other validation reports unknown shapes.
    }
    return ''
  }).join('')
}

async function checkChat(config: Config, jar: CookieJar): Promise<{ results: Result[]; conversationId?: string }> {
  if (config.skipChat) return { results: [skip('/api/eliza/chat SSE contract', 'WAGDIE_ROUTE_PARITY_SKIP_CHAT=true')] }

  const results: Result[] = []
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'text/event-stream' })
  const response = await request(config, jar, '/api/eliza/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tokenId: config.tokenId,
      message: `Route parity smoke ${config.runId}: reply with one short sentence.`,
    }),
  })
  const text = await response.text()
  if (!response.ok) {
    return { results: [fail('/api/eliza/chat SSE contract', redact(text, config), response.status)] }
  }

  const events = parseSse(text)
  const hasToken = events.some((event) => event.event === 'token')
  const complete = parseCompletePayload(events)
  const conversationId = complete.conversationId
  const hasOnlyKnownEvents = events.every((event) => ['token', 'complete', 'error'].includes(event.event))
  const hasError = events.some((event) => event.event === 'error')
  const hasAssistantText = Boolean(streamedAssistantText(events).trim())

  if (!hasToken || !conversationId || !hasOnlyKnownEvents || hasError || !hasAssistantText || complete.leaksOfficialSessionId) {
    return {
      results: [
        fail(
          '/api/eliza/chat SSE contract',
          `expected non-empty token/complete content, complete.conversationId, no error/unknown events, and no official session leak; got ${events.map((event) => event.event).join(', ') || 'none'}`,
          response.status
        ),
      ],
    }
  }

  results.push(pass('/api/eliza/chat SSE token/complete contract', response.status, `conversationId=${conversationId}`))

  const secondResponse = await request(config, jar, '/api/eliza/chat', {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }),
    body: JSON.stringify({
      tokenId: config.tokenId,
      conversationId,
      message: `Route parity smoke ${config.runId}: continue with one short sentence.`,
    }),
  })
  const secondText = await secondResponse.text()
  if (!secondResponse.ok) {
    results.push(fail('/api/eliza/chat existing conversation reuse', redact(secondText, config), secondResponse.status))
    return { results, conversationId }
  }

  const secondEvents = parseSse(secondText)
  const secondComplete = parseCompletePayload(secondEvents)
  const secondHasAssistantText = Boolean(streamedAssistantText(secondEvents).trim())
  if (secondComplete.conversationId !== conversationId || !secondHasAssistantText || secondEvents.some((event) => event.event === 'error')) {
    results.push(fail(
      '/api/eliza/chat existing conversation reuse',
      `expected same conversationId and non-empty assistant text; got conversationId=${secondComplete.conversationId ?? 'none'} events=${secondEvents.map((event) => event.event).join(', ') || 'none'}`,
      secondResponse.status
    ))
  } else {
    results.push(pass('/api/eliza/chat existing conversation reuse', secondResponse.status, `conversationId=${conversationId}`))
  }

  return { results, conversationId }
}

async function checkConversations(config: Config, jar: CookieJar, conversationId?: string): Promise<Result[]> {
  const results: Result[] = []
  const list = await requestJson(config, jar, `/api/eliza/conversations?tokenId=${encodeURIComponent(config.tokenId)}&page=1&pageSize=10`)
  results.push(expectShape('/api/eliza/conversations list contract', list, (body) => isRecord(body) && Array.isArray(body.conversations) && typeof body.total === 'number' && typeof body.hasMore === 'boolean', config))

  if (!conversationId) {
    results.push(skip('/api/eliza/conversations/[id] get/delete contract', 'no conversationId from chat check'))
    return results
  }

  const detail = await requestJson(config, jar, `/api/eliza/conversations/${encodeURIComponent(conversationId)}`)
  results.push(expectShape('/api/eliza/conversations/[id] get contract', detail, (body) => isRecord(body) && body.id === conversationId && Array.isArray(body.messages) && typeof body.messageCount === 'number', config))

  if (config.cleanup) {
    const deleted = await requestJson(config, jar, `/api/eliza/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' })
    results.push(expectShape('/api/eliza/conversations/[id] delete contract', deleted, (body) => isRecord(body) && body.success === true, config))
  } else {
    results.push(skip('/api/eliza/conversations/[id] delete contract', 'set WAGDIE_ROUTE_PARITY_CLEANUP=true to delete created conversation'))
  }

  return results
}

function updatePayload(config: Config): Record<string, unknown> {
  return {
    bio: [`Route parity validation bio ${config.runId}`],
    lore: [`Route parity validation lore ${config.runId}`],
    topics: ['route-parity', 'official-mode'],
    adjectives: ['validated'],
    style: { all: ['Keep route parity responses short.'], chat: ['Use a concise test voice.'] },
    postExamples: [`Route parity post example ${config.runId}`],
    systemPrompt: `Route parity validation prompt ${config.runId}`,
    exampleMessages: [
      { userMessage: 'Who are you?', assistantMessage: 'A route parity validation persona.' },
    ],
  }
}

function importPayload(config: Config): Record<string, unknown> {
  return {
    name: `Ignored route parity import name ${config.runId}`,
    bio: [`Imported route parity bio ${config.runId}`],
    lore: [`Imported route parity lore ${config.runId}`],
    topics: ['route-parity-import'],
    adjectives: ['imported'],
    style: { all: ['Imported style rule.'] },
    messageExamples: [[{ user: 'user', content: { text: 'Import check?' } }]],
    postExamples: [`Imported post example ${config.runId}`],
    systemPrompt: `Imported system prompt ${config.runId}`,
  }
}

async function checkCharacterRead(config: Config, jar: CookieJar): Promise<Result[]> {
  const get = await requestJson(config, jar, `/api/eliza/characters/${encodeURIComponent(config.tokenId)}`)
  const result = expectShape('/api/eliza/characters/[tokenId] get contract', get, (body) => isRecord(body) && typeof body.id === 'string' && String(body.externalId) === config.tokenId && typeof body.name === 'string', config)
  const exportResponse = await requestJson(config, jar, `/api/eliza/characters/${encodeURIComponent(config.tokenId)}/export`)
  const exportResult = expectShape('/api/eliza/characters/[tokenId]/export contract', exportResponse, (body) => isRecord(body) && typeof body.name === 'string' && Array.isArray(body.bio), config)
  return [result, exportResult]
}

async function checkCharacterMutations(config: Config, jar: CookieJar): Promise<Result[]> {
  if (!config.mutate) {
    return [skip('character edit/import and knowledge mutation checks', 'set WAGDIE_ROUTE_PARITY_MUTATE=true with an owned/admin disposable token')]
  }

  const results: Result[] = []
  const put = await requestJson(config, jar, `/api/eliza/characters/${encodeURIComponent(config.tokenId)}`, {
    method: 'PUT',
    body: JSON.stringify(updatePayload(config)),
  })
  results.push(expectShape('/api/eliza/characters/[tokenId] put contract', put, (body) => isRecord(body) && String(body.externalId) === config.tokenId && typeof body.name === 'string', config))

  const importResponse = await requestJson(config, jar, `/api/eliza/characters/${encodeURIComponent(config.tokenId)}/import`, {
    method: 'POST',
    body: JSON.stringify(importPayload(config)),
  })
  results.push(expectShape('/api/eliza/characters/[tokenId]/import contract', importResponse, (body) => isRecord(body) && body.success === true && Array.isArray(body.imported) && Array.isArray(body.warnings), config))

  return results
}

async function checkKnowledge(config: Config, jar: CookieJar): Promise<Result[]> {
  const results: Result[] = []
  const list = await requestJson(config, jar, `/api/eliza/characters/${encodeURIComponent(config.tokenId)}/knowledge`)
  results.push(expectShape('/api/eliza/characters/[tokenId]/knowledge list contract', list, (body) => isRecord(body) && Array.isArray(body.documents), config))

  if (!config.mutate) {
    results.push(skip('/api/eliza/characters/[tokenId]/knowledge upload/delete contract', 'set WAGDIE_ROUTE_PARITY_MUTATE=true with an owned/admin disposable token'))
    return results
  }

  const form = new FormData()
  const filename = `route-parity-${config.runId}.md`
  form.set(
    'file',
    new Blob([`Route parity knowledge document ${config.runId}`], { type: 'text/markdown' }),
    filename
  )
  const upload = await requestJson(config, jar, `/api/eliza/characters/${encodeURIComponent(config.tokenId)}/knowledge`, {
    method: 'POST',
    body: form,
  })
  const documentId = stringField(upload.body, 'id')
  results.push(
    upload.ok && documentId && stringField(upload.body, 'path')
      ? pass('/api/eliza/characters/[tokenId]/knowledge upload contract', upload.status)
      : fail('/api/eliza/characters/[tokenId]/knowledge upload contract', redact(upload.text || 'missing document id', config), upload.status)
  )

  if (documentId) {
    const detail = await requestJson(config, jar, `/api/eliza/characters/${encodeURIComponent(config.tokenId)}/knowledge/${encodeURIComponent(documentId)}`)
    results.push(expectShape('/api/eliza/characters/[tokenId]/knowledge/[documentId] get contract', detail, (body) => isRecord(body) && body.id === documentId && typeof body.content === 'string', config))

    const deleted = await requestJson(config, jar, `/api/eliza/characters/${encodeURIComponent(config.tokenId)}/knowledge/${encodeURIComponent(documentId)}`, { method: 'DELETE' })
    results.push(expectShape('/api/eliza/characters/[tokenId]/knowledge/[documentId] delete contract', deleted, (body) => isRecord(body) && body.success === true, config))
  }

  return results
}

async function checkSecondWalletIsolation(config: Config, conversationId?: string): Promise<Result[]> {
  if (!config.secondPrivateKey || !conversationId) {
    return [skip('cross-wallet conversation isolation', 'set WAGDIE_ROUTE_PARITY_SECOND_PRIVATE_KEY and run chat check to validate Wallet B 404/403 behavior')]
  }

  const wallet = new Wallet(config.secondPrivateKey)
  const { jar, results } = await signInToWagdie(config, wallet)
  results.push(...(await signInToEliza(config, jar, wallet)))
  const detail = await requestJson(config, jar, `/api/eliza/conversations/${encodeURIComponent(conversationId)}`)
  results.push(
    [403, 404].includes(detail.status)
      ? pass('cross-wallet conversation get isolation', detail.status)
      : fail('cross-wallet conversation get isolation', `expected 403/404 got ${detail.status}: ${redact(detail.text, config)}`, detail.status)
  )
  const deleted = await requestJson(config, jar, `/api/eliza/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' })
  results.push(
    [403, 404].includes(deleted.status)
      ? pass('cross-wallet conversation delete isolation', deleted.status)
      : fail('cross-wallet conversation delete isolation', `expected 403/404 got ${deleted.status}: ${redact(deleted.text, config)}`, deleted.status)
  )
  return results
}

function printResults(results: Result[]): void {
  for (const result of results) {
    const marker = result.skipped ? '-' : result.ok ? '✓' : '✗'
    const status = result.status ? ` (${result.status})` : ''
    console.log(`${marker} ${result.name}${status}`)
    if (result.detail) console.log(`  ${result.detail}`)
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage())
    return
  }

  const config = configFromEnv()
  const wallet = walletFromConfig(config)
  const results: Result[] = []

  results.push(...(await checkUnauthenticatedContracts(config)))

  const signIn = await signInToWagdie(config, wallet)
  results.push(...signIn.results)
  results.push(...(await signInToEliza(config, signIn.jar, wallet)))

  results.push(...(await checkCharacterRead(config, signIn.jar)))
  results.push(...(await checkCharacterMutations(config, signIn.jar)))
  results.push(...(await checkKnowledge(config, signIn.jar)))

  const chat = await checkChat(config, signIn.jar)
  results.push(...chat.results)
  results.push(...(await checkConversations(config, signIn.jar, chat.conversationId)))
  results.push(...(await checkSecondWalletIsolation(config, chat.conversationId)))

  printResults(results)

  const failed = results.filter((result) => !result.ok)
  const skipped = results.filter((result) => result.skipped)
  if (failed.length > 0 || (config.failOnSkipped && skipped.length > 0)) {
    throw new Error(`${failed.length} failed and ${skipped.length} skipped WAGDIE route parity check(s) for ${config.baseUrl}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
