/**
 * @jest-environment node
 */

jest.mock('@elizaos/api-client', () => ({
  ElizaClient: {
    create: jest.fn(() => ({
      sessions: {
        createSession: jest.fn(),
        deleteSession: jest.fn(),
      },
    })),
  },
}))

jest.mock('@/lib/eliza/official/stream', () => ({
  streamOfficialElizaSse: jest.fn(),
}))

import { WagdieElizaError } from '@/lib/eliza/gateway/errors'
import { OfficialElizaMessagingClient } from '@/lib/eliza/official/messaging'
import { streamOfficialElizaSse } from '@/lib/eliza/official/stream'
import {
  OFFICIAL_ELIZA_MESSAGE_MAX_BYTES,
  getOfficialElizaUtf8ByteLength,
} from '@/lib/eliza/official/text'

const mockedStreamOfficialElizaSse = streamOfficialElizaSse as jest.MockedFunction<typeof streamOfficialElizaSse>

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
      continue
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return true
  }
  return false
}

describe('OfficialElizaMessagingClient', () => {
  beforeEach(() => {
    mockedStreamOfficialElizaSse.mockReset()
    global.fetch = jest.fn(async () => new Response('', { status: 200 })) as jest.Mock
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('prefers streamed chunks over final complete content when collecting responses', async () => {
    mockedStreamOfficialElizaSse.mockImplementationOnce(async (_response, callbacks, conversationId) => {
      callbacks.onChunk?.('{"publicNarration":"Ash moves."}')
      await callbacks.onComplete?.({
        id: 'message-1',
        role: 'assistant',
        content: 'Here is your answer',
        createdAt: new Date().toISOString(),
      }, conversationId)
    })
    const client = new OfficialElizaMessagingClient({ baseUrl: 'https://eliza.example', apiKey: 'key' })

    const collected = await client.collectStreamedResponseText(new Response('', { status: 200 }), {
      conversationId: 'session-1',
    })

    expect(collected.text).toBe('{"publicNarration":"Ash moves."}')
  })

  it('retries retryable stream errors from session message collection', async () => {
    mockedStreamOfficialElizaSse
      .mockRejectedValueOnce(new WagdieElizaError('upstream unavailable', {
        code: 'API_ERROR',
        statusCode: 503,
        isRetryable: true,
      }))
      .mockImplementationOnce(async (_response, callbacks, conversationId) => {
        await callbacks.onComplete?.({
          id: 'message-2',
          role: 'assistant',
          content: '{"publicNarration":"Ash moves."}',
          createdAt: new Date().toISOString(),
        }, conversationId)
      })
    const client = new OfficialElizaMessagingClient({ baseUrl: 'https://eliza.example', apiKey: 'key' })

    const collected = await client.sendAndCollectSessionMessage({
      sessionId: 'session-1',
      content: 'prompt',
    }, {
      retryDelayMs: 0,
    })

    expect(collected.text).toBe('{"publicNarration":"Ash moves."}')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('sanitizes malformed and over-budget content before sending session messages', async () => {
    const client = new OfficialElizaMessagingClient({ baseUrl: 'https://eliza.example', apiKey: 'key' })
    const content = `𝔚𝔄𝔊𝔇𝔦𝔈 ${'🦴🔥'.repeat(1200)}${String.fromCharCode(0)}${String.fromCharCode(0xd83d)}`

    await client.sendSessionMessage({
      sessionId: 'session-1',
      content,
      metadata: { source: 'test' },
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body as string) as { content: string; transport: string; metadata: Record<string, unknown> }

    expect(body.transport).toBe('sse')
    expect(body.metadata).toEqual({ source: 'test' })
    expect(body.content).not.toContain('\u0000')
    expect(getOfficialElizaUtf8ByteLength(body.content)).toBeLessThanOrEqual(OFFICIAL_ELIZA_MESSAGE_MAX_BYTES)
    expect(hasLoneSurrogate(body.content)).toBe(false)
    expect(JSON.stringify(body.content)).not.toMatch(/\\ud[89ab][0-9a-f]{2}/i)
  })
})
