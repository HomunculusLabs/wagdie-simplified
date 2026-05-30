import type { ChatMessage, StreamCallbacks } from '@/lib/eliza/gateway/types'
import { WagdieElizaError, isRetryableGatewayStatus } from '@/lib/eliza/gateway/errors'

type OfficialSseEvent = {
  event?: string
  data: string
}

function parseSseEvents(buffer: string): { events: OfficialSseEvent[]; rest: string } {
  const events: OfficialSseEvent[] = []
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split(/\n\n/)
  const rest = parts.pop() ?? ''

  for (const part of parts) {
    const event: OfficialSseEvent = { data: '' }

    for (const line of part.split(/\n/)) {
      if (line.startsWith('event:')) {
        event.event = line.slice('event:'.length).trim()
      } else if (line.startsWith('data:')) {
        event.data += `${line.slice('data:'.length).trim()}\n`
      }
    }

    event.data = event.data.trim()
    if (event.data || event.event === 'error' || event.event === 'done' || event.event === 'complete') {
      events.push(event)
    }
  }

  return { events, rest }
}

function readTextField(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const record = value as Record<string, unknown>

  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === 'string') {
      return candidate
    }
  }

  return undefined
}

function readNestedStringField(value: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    let current = value

    for (const key of path) {
      if (!current || typeof current !== 'object') {
        current = undefined
        break
      }

      current = (current as Record<string, unknown>)[key]
    }

    if (typeof current === 'string') {
      return current
    }
  }

  return undefined
}

function readNestedTextField(value: unknown, paths: string[][]): string | undefined {
  const candidate = readNestedStringField(value, paths)
  return candidate?.trim() ? candidate : undefined
}

function readNumberField(value: unknown, keys: string[]): number | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const record = value as Record<string, unknown>

  for (const key of keys) {
    const candidate = record[key]
    const numeric = typeof candidate === 'number' ? candidate : typeof candidate === 'string' ? Number(candidate) : NaN
    if (Number.isInteger(numeric)) {
      return numeric
    }
  }

  return undefined
}

function readChunkText(data: unknown): string | undefined {
  return readTextField(data, ['chunk', 'text', 'content']) ??
    readNestedStringField(data, [
      ['content', 'text'],
      ['delta', 'content'],
      ['data', 'chunk'],
      ['data', 'text'],
      ['data', 'content', 'text'],
    ])
}

function mapCompleteMessage(data: unknown, fallbackText: string): ChatMessage {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const content = fallbackText.trim()
    ? fallbackText
    : readTextField(record, ['text', 'content', 'message']) ??
      readNestedTextField(record, [
        ['content', 'text'],
        ['data', 'text'],
        ['data', 'content'],
        ['data', 'content', 'text'],
        ['data', 'message'],
        ['response', 'text'],
        ['response', 'content'],
        ['response', 'content', 'text'],
        ['agentResponse', 'text'],
        ['agentResponse', 'content'],
        ['agentResponse', 'content', 'text'],
      ]) ??
      fallbackText

  return {
    id: readTextField(record, ['messageId', 'id']) ?? `official-${Date.now()}`,
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
  }
}

function parseEventData(event: OfficialSseEvent): unknown {
  try {
    return JSON.parse(event.data)
  } catch {
    return event.data
  }
}

function getEventType(event: OfficialSseEvent, data: unknown): string {
  return event.event ||
    (data && typeof data === 'object' ? String((data as Record<string, unknown>).type ?? '') : '')
}

function createEmptyStreamError(
  message: string,
  details: {
    reason: string
    eventTypes: string[]
    contentLength: number
    bytesRead: number
  }
): WagdieElizaError {
  console.warn('[Official ElizaOS] stream ended without assistant content', details)

  return new WagdieElizaError(message, {
    code: 'API_ERROR',
    statusCode: 502,
    isRetryable: true,
    details,
  })
}

export async function streamOfficialElizaSse(
  response: Response,
  callbacks: StreamCallbacks,
  conversationId: string
): Promise<void> {
  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '')
    const upstreamBody = body.slice(0, 500)

    console.warn('[Official ElizaOS] streaming request failed', {
      status: response.status,
      contentType: response.headers.get('content-type'),
      hasBody: Boolean(response.body),
      upstreamBody,
    })

    throw new WagdieElizaError('Official ElizaOS streaming request failed', {
      code: response.status === 401 || response.status === 403 ? 'AUTH_ERROR' : 'API_ERROR',
      statusCode: response.status,
      isRetryable: isRetryableGatewayStatus(response.status),
      details: {
        upstreamStatus: response.status,
        upstreamBody,
      },
    })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let bytesRead = 0
  const seenEventTypes = new Set<string>()

  const fail = (reason: string, message: string): never => {
    throw createEmptyStreamError(message, {
      reason,
      eventTypes: Array.from(seenEventTypes),
      contentLength: fullText.trim().length,
      bytesRead,
    })
  }

  const handleEvent = async (event: OfficialSseEvent): Promise<boolean> => {
    const data = parseEventData(event)
    const type = getEventType(event, data)
    if (type) {
      seenEventTypes.add(type)
    }

    if (type === 'chunk') {
      const chunk = readChunkText(data)
      if (typeof chunk === 'string' && chunk.length > 0) {
        fullText += chunk
        callbacks.onChunk?.(chunk)
      }
      return false
    }

    if (type === 'done' || type === 'complete') {
      const message = mapCompleteMessage(data, fullText)
      if (!message.content.trim()) {
        fail('empty_terminal', 'Official ElizaOS stream ended without assistant content')
      }

      if (!fullText.trim()) {
        fullText = message.content
        callbacks.onChunk?.(message.content)
      }

      await callbacks.onComplete?.(message, conversationId)
      return true
    }

    if (type === 'error') {
      const message = readTextField(data, ['message', 'error']) ?? 'Official ElizaOS stream failed'
      const statusCode = readNumberField(data, ['statusCode', 'status', 'upstreamStatus']) ?? 502
      const code = statusCode === 401 || statusCode === 403
        ? 'AUTH_ERROR'
        : statusCode === 429
          ? 'RATE_LIMIT'
          : 'API_ERROR'
      const error = new WagdieElizaError(message, {
        code,
        statusCode,
        isRetryable: isRetryableGatewayStatus(statusCode),
        details: {
          eventType: 'error',
          upstreamStatus: statusCode,
        },
      })
      try {
        await callbacks.onError?.(error)
      } catch (callbackError) {
        console.warn('[Official ElizaOS] stream error callback failed', callbackError)
      }
      throw error
    }

    return false
  }

  let reading = true
  while (reading) {
    const { done, value } = await reader.read()
    if (done) {
      const tail = decoder.decode()
      if (tail) buffer += tail
      reading = false
      break
    }

    bytesRead += value.byteLength
    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSseEvents(buffer)
    buffer = parsed.rest

    for (const event of parsed.events) {
      if (await handleEvent(event)) {
        return
      }
    }
  }

  if (buffer.trim()) {
    const parsed = parseSseEvents(`${buffer}\n\n`)

    for (const event of parsed.events) {
      if (await handleEvent(event)) {
        return
      }
    }
  }

  if (bytesRead === 0 || seenEventTypes.size === 0) {
    fail('empty_stream', 'Official ElizaOS stream ended without assistant content')
  }

  if (fullText.trim()) {
    fail('missing_terminal', 'Official ElizaOS stream ended without a completion event')
  }

  fail('unsupported_stream', 'Official ElizaOS stream ended without assistant content')
}
