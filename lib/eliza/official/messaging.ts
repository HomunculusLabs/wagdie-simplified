import { ElizaClient } from '@elizaos/api-client'
import type { ChatMessage, StreamCallbacks } from '@/lib/eliza/gateway/types'
import { WagdieElizaError, isWagdieElizaError } from '@/lib/eliza/gateway/errors'
import { streamOfficialElizaSse } from './stream'

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
  transport?: 'sse'
}

export type OfficialCollectedResponse = {
  message: ChatMessage | null
  text: string
}

const DEFAULT_STREAM_MESSAGE_ATTEMPTS = 3
const DEFAULT_STREAM_RETRY_DELAY_MS = 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableOfficialStreamError(error: unknown): boolean {
  return isWagdieElizaError(error) && error.isRetryable
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
    return (await this.client.sessions.createSession({
      agentId: input.agentId,
      userId: input.userId,
      metadata: input.metadata,
    })) as unknown as OfficialSession
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.sessions.deleteSession(sessionId)
  }

  async sendSessionMessage(input: OfficialSendSessionMessageInput): Promise<Response> {
    return fetch(`${this.baseUrl}/api/messaging/sessions/${input.sessionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders(),
      },
      body: JSON.stringify({
        content: input.content,
        transport: input.transport ?? 'sse',
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
        collected = {
          message,
          text: normalizeOfficialResponseText(message.content || streamedText),
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
