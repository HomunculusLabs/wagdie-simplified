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

function mapCompleteMessage(data: unknown, fallbackText: string): ChatMessage {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const content = fallbackText.trim() ? fallbackText : readTextField(record, ['text', 'content', 'message']) ?? fallbackText

  return {
    id: readTextField(record, ['messageId', 'id']) ?? `official-${Date.now()}`,
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
  }
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

  let reading = true
  while (reading) {
    const { done, value } = await reader.read()
    if (done) {
      reading = false
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSseEvents(buffer)
    buffer = parsed.rest

    for (const event of parsed.events) {
      let data: unknown
      try {
        data = JSON.parse(event.data)
      } catch {
        data = event.data
      }

      const type =
        event.event ??
        (data && typeof data === 'object' ? String((data as Record<string, unknown>).type ?? '') : '')

      if (type === 'chunk') {
        const chunk = readTextField(data, ['chunk', 'text', 'content'])
        if (chunk) {
          fullText += chunk
          callbacks.onChunk?.(chunk)
        }
      } else if (type === 'done' || type === 'complete') {
        const message = mapCompleteMessage(data, fullText)
        if (!fullText && message.content) {
          fullText = message.content
          callbacks.onChunk?.(message.content)
        }
        await callbacks.onComplete?.(message, conversationId)
        return
      } else if (type === 'error') {
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
    }
  }

  await callbacks.onComplete?.(
    {
      id: `official-${Date.now()}`,
      role: 'assistant',
      content: fullText,
      createdAt: new Date().toISOString(),
    },
    conversationId
  )
}
