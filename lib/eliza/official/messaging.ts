import { ElizaClient } from '@elizaos/api-client'
import type { ChatMessage, StreamCallbacks } from '@/lib/eliza/gateway/types'
import {
  WagdieElizaError,
  getGatewayErrorCode,
  isRetryableGatewayStatus,
  isWagdieElizaError,
} from '@/lib/eliza/gateway/errors'
import { streamOfficialElizaSse } from './stream'
import { clampOfficialElizaText } from './text'

export type OfficialMessagingConfig = {
  baseUrl: string
  apiKey?: string
  timeout?: number
  client?: ElizaClient
}

export type OfficialMetadataValue = string | number | boolean | undefined
export type OfficialMetadata = Record<string, OfficialMetadataValue>

export type OfficialCreateSessionInput = {
  agentId: string
  userId: string
  metadata?: OfficialMetadata
}

export type OfficialSession = {
  sessionId: string
  agentId?: string
  userId?: string
  createdAt?: string | Date | number
  metadata?: OfficialMetadata
  [key: string]: unknown
}

export type OfficialSendSessionMessageInput = {
  sessionId: string
  content: string
  metadata?: OfficialMetadata
  signal?: AbortSignal
  transport?: 'http' | 'sse'
}

export type OfficialCollectedResponse = {
  message: ChatMessage | null
  text: string
}

export type OfficialEphemeralSessionMessageInput = {
  session: OfficialCreateSessionInput
  message: Omit<OfficialSendSessionMessageInput, 'sessionId'>
  collect?: {
    callbacks?: StreamCallbacks
    maxAttempts?: number
    retryDelayMs?: number
  }
  sessionNotFoundRecovery?: {
    enabled?: boolean
    delayMs?: number
  }
  logContext?: OfficialMetadata
}

export type OfficialEphemeralMessagingClient = Pick<OfficialElizaMessagingClient,
  'createSession' | 'deleteSession'
> & Partial<Pick<OfficialElizaMessagingClient,
  'sendAndCollectSessionMessage' | 'sendSessionMessage' | 'collectStreamedResponseText'
>>

const DEFAULT_STREAM_MESSAGE_ATTEMPTS = 3
const DEFAULT_STREAM_RETRY_DELAY_MS = 1000
const DEFAULT_SESSION_NOT_FOUND_RECOVERY_DELAY_MS = 250

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableOfficialStreamError(error: unknown): boolean {
  return isWagdieElizaError(error) && error.isRetryable
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function recordKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value) : []
}

function normalizeOfficialSessionResponse(
  raw: unknown,
  input: OfficialCreateSessionInput
): OfficialSession {
  const rawRecord = isRecord(raw) ? raw : null
  const dataRecord = rawRecord && isRecord(rawRecord.data) ? rawRecord.data : null
  const topSessionId = readNonEmptyString(rawRecord?.sessionId)
  const topId = readNonEmptyString(rawRecord?.id)
  const dataSessionId = readNonEmptyString(dataRecord?.sessionId)
  const dataId = readNonEmptyString(dataRecord?.id)
  const sessionId = topSessionId ?? dataSessionId ?? topId ?? dataId

  if (!sessionId) {
    throw new WagdieElizaError('Official ElizaOS session creation returned no session id', {
      code: 'API_ERROR',
      statusCode: 502,
      details: {
        agentId: input.agentId,
        userId: input.userId,
        responseKeys: recordKeys(raw),
        dataKeys: recordKeys(rawRecord?.data),
        hasTopLevelSessionId: typeof rawRecord?.sessionId === 'string',
        hasTopLevelId: typeof rawRecord?.id === 'string',
        hasDataSessionId: typeof dataRecord?.sessionId === 'string',
        hasDataId: typeof dataRecord?.id === 'string',
      },
    })
  }

  const source = dataRecord && (dataSessionId || dataId) ? dataRecord : (rawRecord ?? {})

  return {
    ...source,
    sessionId,
    agentId: readNonEmptyString(source.agentId) ?? input.agentId,
    userId: readNonEmptyString(source.userId) ?? input.userId,
    metadata: isRecord(source.metadata) ? source.metadata as OfficialMetadata : input.metadata,
  }
}

function bodyContainsOfficialSessionNotFound(body: string): boolean {
  if (!body.trim()) {
    return false
  }

  try {
    const parsed = JSON.parse(body)
    if (valueContainsOfficialSessionNotFound(parsed)) {
      return true
    }
  } catch {
    // Fall back to text checks below.
  }

  return body.includes('SESSION_NOT_FOUND') || /session\b[\s\S]{0,120}\bnot\s+found/i.test(body)
}

function valueContainsOfficialSessionNotFound(value: unknown): boolean {
  if (typeof value === 'string') {
    return value === 'SESSION_NOT_FOUND' || bodyContainsOfficialSessionNotFound(value)
  }

  if (Array.isArray(value)) {
    return value.some(valueContainsOfficialSessionNotFound)
  }

  if (!isRecord(value)) {
    return false
  }

  const code = readNonEmptyString(value.code)
  if (code === 'SESSION_NOT_FOUND') {
    return true
  }

  return Object.values(value).some(valueContainsOfficialSessionNotFound)
}

export async function isOfficialSessionNotFoundResponse(response: Response): Promise<boolean> {
  if (response.status !== 404) {
    return false
  }

  const body = await response.clone().text().catch(() => '')
  return bodyContainsOfficialSessionNotFound(body)
}

export function isOfficialSessionNotFoundError(error: unknown): boolean {
  if (!isWagdieElizaError(error) || error.statusCode !== 404) {
    return false
  }

  const upstreamBody = typeof error.details?.upstreamBody === 'string'
    ? error.details.upstreamBody
    : ''

  return bodyContainsOfficialSessionNotFound(upstreamBody)
}

export function normalizeOfficialResponseText(text: string): string {
  return text.replace(/\r\n/g, '\n').split('\u0000').join('').trim()
}

export class OfficialElizaMessagingClient {
  private readonly client: ElizaClient
  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly timeout: number

  constructor(config: OfficialMessagingConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.apiKey = config.apiKey
    this.timeout = config.timeout ?? 30000
    this.client =
      config.client ??
      ElizaClient.create({
        baseUrl: this.baseUrl,
        apiKey: config.apiKey,
        timeout: this.timeout,
      })
  }

  async startAgent(agentId: string, options: { signal?: AbortSignal } = {}): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/agents/${agentId}/start`, {
      method: 'POST',
      headers: this.authHeaders(),
      signal: options.signal,
    })

    if (!response.ok) {
      throw new WagdieElizaError('Failed to start official ElizaOS agent', {
        code: response.status === 404 ? 'NOT_FOUND' : 'API_ERROR',
        statusCode: response.status,
        details: {
          upstreamStatus: response.status,
          upstreamBody: (await response.text().catch(() => '')).slice(0, 500),
        },
      })
    }
  }

  async createSession(input: OfficialCreateSessionInput): Promise<OfficialSession> {
    const raw = await this.client.sessions.createSession({
      agentId: input.agentId,
      userId: input.userId,
      metadata: input.metadata,
    })

    return normalizeOfficialSessionResponse(raw, input)
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.sessions.deleteSession(sessionId)
  }

  async sendSessionMessage(input: OfficialSendSessionMessageInput): Promise<Response> {
    const content = clampOfficialElizaText(input.content)

    return fetch(`${this.baseUrl}/api/messaging/sessions/${input.sessionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders(),
      },
      body: JSON.stringify({
        content,
        transport: input.transport ?? 'http',
        metadata: input.metadata,
      }),
      signal: input.signal,
    })
  }

  async collectStreamedResponseText(
    response: Response,
    options: {
      callbacks?: StreamCallbacks
      conversationId?: string
    } = {}
  ): Promise<OfficialCollectedResponse> {
    return collectOfficialStreamedResponseText(response, options)
  }

  async sendAndCollectSessionMessage(
    input: OfficialSendSessionMessageInput,
    options: {
      callbacks?: StreamCallbacks
      conversationId?: string
      maxAttempts?: number
      retryDelayMs?: number
    } = {}
  ): Promise<OfficialCollectedResponse> {
    const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_STREAM_MESSAGE_ATTEMPTS)
    const retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_STREAM_RETRY_DELAY_MS)
    let lastError: unknown = null

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await this.sendSessionMessage(input)

      try {
        if ((input.transport ?? 'http') === 'http') {
          return await collectOfficialHttpResponse(response)
        }

        return await this.collectStreamedResponseText(response, {
          callbacks: options.callbacks,
          conversationId: options.conversationId ?? input.sessionId,
        })
      } catch (error) {
        lastError = error
        if (attempt >= maxAttempts || !isRetryableOfficialStreamError(error)) {
          throw error
        }

        console.warn('[Official ElizaOS] retrying failed streaming message', {
          attempt,
          maxAttempts,
          statusCode: isWagdieElizaError(error) ? error.statusCode : undefined,
          code: isWagdieElizaError(error) ? error.code : undefined,
        })

        if (retryDelayMs > 0) {
          await sleep(retryDelayMs * attempt)
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Official ElizaOS streaming request failed')
  }

  private authHeaders(): Record<string, string> {
    return this.apiKey ? { 'X-API-KEY': this.apiKey } : {}
  }
}

function readNestedText(value: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    let current: unknown = value
    for (const key of path) {
      if (!current || typeof current !== 'object') {
        current = undefined
        break
      }
      current = (current as Record<string, unknown>)[key]
    }
    if (typeof current === 'string' && current.trim()) {
      return current
    }
  }

  return undefined
}

export async function collectOfficialHttpResponse(response: Response): Promise<OfficialCollectedResponse> {
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const upstreamBody = body.slice(0, 500)

    console.warn('[Official ElizaOS] HTTP request failed', {
      status: response.status,
      contentType: response.headers.get('content-type'),
      hasBody: Boolean(response.body),
      upstreamBody,
    })

    throw new WagdieElizaError('Official ElizaOS HTTP request failed', {
      code: getGatewayErrorCode(response.status),
      statusCode: response.status,
      isRetryable: isRetryableGatewayStatus(response.status),
      details: {
        upstreamStatus: response.status,
        upstreamBody,
      },
    })
  }

  const body = await response.json().catch(() => null)
  const text = readNestedText(body, [
    ['agentResponse', 'text'],
    ['agentResponse', 'content'],
    ['agentResponse', 'message'],
    ['data', 'agentResponse', 'text'],
    ['data', 'agentResponse', 'content'],
    ['text'],
    ['content'],
    ['message'],
  ]) ?? ''

  return {
    message: {
      id: readNestedText(body, [
        ['agentResponse', 'id'],
        ['data', 'agentResponse', 'id'],
      ]) ?? `official-${Date.now()}`,
      role: 'assistant',
      content: text,
      createdAt: new Date().toISOString(),
    },
    text: normalizeOfficialResponseText(text),
  }
}

export async function sendAndCollectOfficialEphemeralSessionMessage(
  messaging: OfficialEphemeralMessagingClient,
  input: OfficialEphemeralSessionMessageInput
): Promise<OfficialCollectedResponse> {
  const recoveryEnabled = input.sessionNotFoundRecovery?.enabled ?? true
  const recoveryDelayMs = Math.max(
    0,
    input.sessionNotFoundRecovery?.delayMs ?? DEFAULT_SESSION_NOT_FOUND_RECOVERY_DELAY_MS
  )
  const createdSessionIds: string[] = []
  const deletedSessionIds = new Set<string>()

  const deleteBestEffort = async (sessionId: string): Promise<void> => {
    if (deletedSessionIds.has(sessionId)) {
      return
    }

    deletedSessionIds.add(sessionId)
    await messaging.deleteSession(sessionId).catch(() => null)
  }

  try {
    let session = await messaging.createSession(input.session)
    createdSessionIds.push(session.sessionId)

    for (let attempt = 1; attempt <= (recoveryEnabled ? 2 : 1); attempt += 1) {
      try {
        const messageInput = {
          sessionId: session.sessionId,
          ...input.message,
        }

        if (typeof messaging.sendAndCollectSessionMessage === 'function') {
          return await messaging.sendAndCollectSessionMessage(messageInput, {
            callbacks: input.collect?.callbacks,
            conversationId: session.sessionId,
            maxAttempts: input.collect?.maxAttempts,
            retryDelayMs: input.collect?.retryDelayMs,
          })
        }

        if (
          typeof messaging.sendSessionMessage === 'function' &&
          typeof messaging.collectStreamedResponseText === 'function'
        ) {
          const response = await messaging.sendSessionMessage(messageInput)
          return await messaging.collectStreamedResponseText(response, {
            callbacks: input.collect?.callbacks,
            conversationId: session.sessionId,
          })
        }

        throw new Error('Official ElizaOS messaging client cannot send session messages')
      } catch (error) {
        if (attempt !== 1 || !recoveryEnabled || !isOfficialSessionNotFoundError(error)) {
          throw error
        }

        console.warn('[Official ElizaOS] recovering missing ephemeral session', {
          agentId: input.session.agentId,
          userId: input.session.userId,
          source: input.logContext?.source ?? input.session.metadata?.source,
          roomId: input.logContext?.roomId ?? input.session.metadata?.roomId,
          locationId: input.logContext?.locationId ?? input.session.metadata?.locationId,
          tickId: input.logContext?.tickId ?? input.session.metadata?.tickId,
          attempt,
        })

        await deleteBestEffort(session.sessionId)
        if (recoveryDelayMs > 0) {
          await sleep(recoveryDelayMs)
        }

        session = await messaging.createSession(input.session)
        createdSessionIds.push(session.sessionId)
      }
    }
  } finally {
    for (const sessionId of createdSessionIds) {
      await deleteBestEffort(sessionId)
    }
  }

  throw new Error('Official ElizaOS ephemeral session message failed')
}

export async function collectOfficialStreamedResponseText(
  response: Response,
  options: {
    callbacks?: StreamCallbacks
    conversationId?: string
  } = {}
): Promise<OfficialCollectedResponse> {
  const callbacks = options.callbacks ?? {}
  const conversationId = options.conversationId ?? 'official-session'
  let streamedText = ''
  let collected: OfficialCollectedResponse | null = null

  await streamOfficialElizaSse(
    response,
    {
      ...callbacks,
      onChunk: (chunk) => {
        streamedText += chunk
        callbacks.onChunk?.(chunk)
      },
      onComplete: async (message, completedConversationId) => {
        const selectedText = streamedText.trim() ? streamedText : message.content
        collected = {
          message,
          text: normalizeOfficialResponseText(selectedText),
        }
        await callbacks.onComplete?.(message, completedConversationId)
      },
      onError: async (error) => {
        await callbacks.onError?.(error)
      },
    },
    conversationId
  )

  return collected ?? { message: null, text: normalizeOfficialResponseText(streamedText) }
}

export function createOfficialElizaMessagingClient(
  config: OfficialMessagingConfig
): OfficialElizaMessagingClient {
  return new OfficialElizaMessagingClient(config)
}
