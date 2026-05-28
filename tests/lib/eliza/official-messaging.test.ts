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
import {
  OfficialElizaMessagingClient,
  collectOfficialHttpResponse,
  sendAndCollectOfficialEphemeralSessionMessage,
} from '@/lib/eliza/official/messaging'
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

function createClientWithSessionResponse(response: unknown): OfficialElizaMessagingClient {
  return new OfficialElizaMessagingClient({
    baseUrl: 'https://eliza.example',
    apiKey: 'key',
    client: {
      sessions: {
        createSession: jest.fn(async () => response),
        deleteSession: jest.fn(),
      },
    } as never,
  })
}

describe('OfficialElizaMessagingClient', () => {
  beforeEach(() => {
    mockedStreamOfficialElizaSse.mockReset()
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
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
      transport: 'sse',
    }, {
      retryDelayMs: 0,
    })

    expect(collected.text).toBe('{"publicNarration":"Ash moves."}')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('sanitizes malformed and over-budget content before sending session messages using default HTTP transport', async () => {
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

    expect(body.transport).toBe('http')
    expect(body.metadata).toEqual({ source: 'test' })
    expect(body.content).not.toContain('\u0000')
    expect(getOfficialElizaUtf8ByteLength(body.content)).toBeLessThanOrEqual(OFFICIAL_ELIZA_MESSAGE_MAX_BYTES)
    expect(hasLoneSurrogate(body.content)).toBe(false)
    expect(JSON.stringify(body.content)).not.toMatch(/\\ud[89ab][0-9a-f]{2}/i)
  })

  it('preserves explicit SSE transport for streaming callers', async () => {
    const client = new OfficialElizaMessagingClient({ baseUrl: 'https://eliza.example', apiKey: 'key' })

    await client.sendSessionMessage({
      sessionId: 'session-1',
      content: 'prompt',
      transport: 'sse',
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body as string) as { transport: string }

    expect(body.transport).toBe('sse')
  })

  it.each([
    ['sessionId', { sessionId: 'session-1' }],
    ['id', { id: 'session-1' }],
    ['wrapped sessionId', { data: { sessionId: 'session-1' } }],
    ['wrapped id', { data: { id: 'session-1' } }],
  ])('normalizes createSession responses with %s', async (_label, response) => {
    const client = createClientWithSessionResponse(response)

    const session = await client.createSession({
      agentId: 'agent-1',
      userId: 'user-1',
      metadata: { source: 'test' },
    })

    expect(session.sessionId).toBe('session-1')
  })

  it('rejects malformed createSession responses without returning an undefined session id', async () => {
    const client = createClientWithSessionResponse({ data: {} })

    await expect(client.createSession({
      agentId: 'agent-1',
      userId: 'user-1',
    })).rejects.toMatchObject({
      name: 'WagdieElizaError',
      statusCode: 502,
      message: 'Official ElizaOS session creation returned no session id',
    })
  })

  it('classifies non-OK HTTP responses as retryable WagdieElizaError when appropriate', async () => {
    await expect(collectOfficialHttpResponse(new Response('upstream unavailable', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    }))).rejects.toMatchObject({
      name: 'WagdieElizaError',
      code: 'API_ERROR',
      statusCode: 503,
      isRetryable: true,
      details: {
        upstreamStatus: 503,
        upstreamBody: 'upstream unavailable',
      },
    })
  })

  it('recovers a fresh ephemeral SESSION_NOT_FOUND once with a replacement session', async () => {
    const createSession = jest.fn()
      .mockResolvedValueOnce({ sessionId: 'session-a' })
      .mockResolvedValueOnce({ sessionId: 'session-b' })
    const deleteSession = jest.fn(async () => undefined)
    const client = new OfficialElizaMessagingClient({
      baseUrl: 'https://eliza.example',
      apiKey: 'key',
      client: {
        sessions: { createSession, deleteSession },
      } as never,
    })
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response('SESSION_NOT_FOUND', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ agentResponse: { text: 'Recovered text' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as jest.Mock

    const collected = await sendAndCollectOfficialEphemeralSessionMessage(client, {
      session: {
        agentId: 'agent-1',
        userId: 'user-1',
        metadata: { source: 'test' },
      },
      message: {
        content: 'prompt',
        transport: 'http',
        metadata: { source: 'test' },
      },
      sessionNotFoundRecovery: { delayMs: 0 },
    })

    expect(collected.text).toBe('Recovered text')
    expect(createSession).toHaveBeenCalledTimes(2)
    expect(deleteSession).toHaveBeenCalledWith('session-a')
    expect(deleteSession).toHaveBeenCalledWith('session-b')
    expect(global.fetch).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(((global.fetch as jest.Mock).mock.calls[0][1]).body as string) as { transport: string }
    const secondBody = JSON.parse(((global.fetch as jest.Mock).mock.calls[1][1]).body as string) as { transport: string }
    expect(firstBody.transport).toBe('http')
    expect(secondBody.transport).toBe('http')
  })

  it('does not recover a generic ephemeral 404 without SESSION_NOT_FOUND', async () => {
    const createSession = jest.fn(async () => ({ sessionId: 'session-a' }))
    const deleteSession = jest.fn(async () => undefined)
    const client = new OfficialElizaMessagingClient({
      baseUrl: 'https://eliza.example',
      apiKey: 'key',
      client: {
        sessions: { createSession, deleteSession },
      } as never,
    })
    global.fetch = jest.fn(async () => new Response('missing route', { status: 404 })) as jest.Mock

    await expect(sendAndCollectOfficialEphemeralSessionMessage(client, {
      session: {
        agentId: 'agent-1',
        userId: 'user-1',
      },
      message: {
        content: 'prompt',
        transport: 'http',
      },
      sessionNotFoundRecovery: { delayMs: 0 },
    })).rejects.toMatchObject({
      name: 'WagdieElizaError',
      statusCode: 404,
    })

    expect(createSession).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(deleteSession).toHaveBeenCalledWith('session-a')
  })
})
