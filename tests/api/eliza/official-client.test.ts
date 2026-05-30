/**
 * @jest-environment node
 */

jest.mock('@elizaos/api-client', () => {
  class ApiError extends Error {
    code: string
    details?: string
    status?: number

    constructor(code: string, message: string, details?: string, status?: number) {
      super(message)
      this.name = 'ApiError'
      this.code = code
      this.details = details
      this.status = status
    }
  }

  async function request(baseUrl: string, apiKey: string | undefined, method: string, path: string, body?: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-API-KEY': apiKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await response.json().catch(() => null)

    if (!response.ok) {
      const error = json?.error ?? { code: 'HTTP_ERROR', message: `HTTP ${response.status}` }
      throw new ApiError(error.code, error.message, error.details, response.status)
    }

    if (json && typeof json === 'object' && 'success' in json) {
      if (!json.success) {
        const error = json.error ?? { code: 'UNKNOWN_ERROR', message: 'Unknown error' }
        throw new ApiError(error.code, error.message, error.details, response.status)
      }
      return json.data
    }

    return json
  }

  class ElizaClient {
    static create(config: { baseUrl: string; apiKey?: string }) {
      const baseUrl = config.baseUrl.replace(/\/$/, '')
      const apiKey = config.apiKey

      return {
        agents: {
          listAgents: () => request(baseUrl, apiKey, 'GET', '/api/agents'),
          getAgent: (id: string) => request(baseUrl, apiKey, 'GET', `/api/agents/${id}`),
          createAgent: (params: unknown) => request(baseUrl, apiKey, 'POST', '/api/agents', params),
          updateAgent: (id: string, params: unknown) =>
            request(baseUrl, apiKey, 'PATCH', `/api/agents/${id}`, params),
        },
        sessions: {
          createSession: (params: unknown) =>
            request(baseUrl, apiKey, 'POST', '/api/messaging/sessions', params),
          listSessions: () => request(baseUrl, apiKey, 'GET', '/api/messaging/sessions'),
          getSession: (id: string) => request(baseUrl, apiKey, 'GET', `/api/messaging/sessions/${id}`),
          getMessages: (id: string) =>
            request(baseUrl, apiKey, 'GET', `/api/messaging/sessions/${id}/messages`),
          deleteSession: (id: string) =>
            request(baseUrl, apiKey, 'DELETE', `/api/messaging/sessions/${id}`),
        },
        server: {
          checkHealth: () => request(baseUrl, apiKey, 'GET', '/api/server/health'),
        },
      }
    }
  }

  return { ApiError, ElizaClient }
})

import { OfficialWagdieElizaClient } from '@/lib/eliza/official/client'
import type { OfficialConversationLink, OfficialConversationRepository } from '@/lib/eliza/officialConversationRepository'

const AGENT_ID = '11111111-1111-5111-8111-111111111111'
const SESSION_ID = '22222222-2222-5222-8222-222222222222'
const WAGDIE_CONVERSATION_ID = '44444444-4444-5444-8444-444444444444'

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  })
}

function sseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line))
      controller.close()
    },
  })
}

function makeConversationLink(overrides: Partial<OfficialConversationLink> = {}): OfficialConversationLink {
  const now = '2026-05-10T00:00:00.000Z'
  return {
    id: WAGDIE_CONVERSATION_ID,
    walletAddress: '0xabc',
    officialUserId: 'wallet-derived-user-id',
    tokenId: '123',
    officialAgentId: AGENT_ID,
    officialSessionId: SESSION_ID,
    status: 'active',
    messageCount: 0,
    lastMessageAt: now,
    lastError: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeConversationRepository(
  overrides: Partial<jest.Mocked<OfficialConversationRepository>> = {}
): jest.Mocked<OfficialConversationRepository> {
  const link = makeConversationLink()

  return {
    create: jest.fn(async () => link),
    findForUser: jest.fn(async () => link),
    listForUser: jest.fn(async () => ({
      items: [link],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    })),
    rebindSession: jest.fn(async (_conversationId, _officialUserId, officialSessionId) =>
      makeConversationLink({ officialSessionId })
    ),
    markActivity: jest.fn(async () => makeConversationLink({ messageCount: 2 })),
    recordError: jest.fn(async () => makeConversationLink({ status: 'error' })),
    markDeleted: jest.fn(async () => makeConversationLink({ status: 'deleted' })),
    ...overrides,
  }
}

describe('OfficialWagdieElizaClient', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('maps official agents to WAGDIE character records by externalId', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { agents: [{ id: AGENT_ID, name: 'Ash', characterName: 'Ash', status: 'active' }] },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            id: AGENT_ID,
            name: 'Ash',
            bio: ['A watcher'],
            settings: { wagdie: { externalId: '123' } },
            createdAt: 1770000000000,
            updatedAt: 1770000001000,
          },
        })
      )

    global.fetch = fetchMock as typeof fetch

    const client = new OfficialWagdieElizaClient({
      baseUrl: 'https://elizaos.example',
      apiKey: 'service-key',
    })

    await expect(client.characters.getRecordByExternalId('123')).resolves.toMatchObject({
      id: AGENT_ID,
      externalId: '123',
      character: { name: 'Ash', settings: { wagdie: { externalId: '123' } } },
    })

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://elizaos.example/api/agents',
      `https://elizaos.example/api/agents/${AGENT_ID}`,
    ])
  })

  it('skips stale listed official agents that 404 during externalId lookup', async () => {
    const staleAgentId = '22222222-2222-5222-8222-222222222222'
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            agents: [
              { id: staleAgentId, name: 'Stale', characterName: 'Stale', status: 'inactive' },
              { id: AGENT_ID, name: 'Ash', characterName: 'Ash', status: 'active' },
            ],
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } }, { status: 404 }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            id: AGENT_ID,
            name: 'Ash',
            settings: { wagdie: { externalId: '123' } },
          },
        })
      )

    global.fetch = fetchMock as typeof fetch

    const client = new OfficialWagdieElizaClient({
      baseUrl: 'https://elizaos.example',
      apiKey: 'service-key',
    })

    await expect(client.characters.getRecordByExternalId('123')).resolves.toMatchObject({
      id: AGENT_ID,
      externalId: '123',
    })
  })

  it('creates official agents with WAGDIE external id metadata', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          success: true,
          data: {
            id: AGENT_ID,
            character: {
              id: AGENT_ID,
              name: 'Bone',
              bio: ['A test character'],
              settings: { wagdie: { externalId: '404' } },
            },
          },
        },
        { status: 201 }
      )
    )

    global.fetch = fetchMock as typeof fetch

    const client = new OfficialWagdieElizaClient({
      baseUrl: 'https://elizaos.example',
      apiKey: 'service-key',
    })

    await expect(
      client.characters.createRecord({
        externalId: '404',
        character: {
          id: 'legacy-record-id',
          name: 'Bone',
          bio: ['A test character'],
          backstory: 'A forbidden top-level backstory',
          lore: ['A forbidden top-level lore entry'],
        } as any,
      })
    ).resolves.toMatchObject({
      id: AGENT_ID,
      externalId: '404',
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.characterJson).toMatchObject({
      name: 'Bone',
      settings: {
        wagdie: {
          externalId: '404',
          backstory: 'A forbidden top-level backstory',
          lore: ['A forbidden top-level lore entry'],
        },
      },
    })
    expect(body.characterJson).not.toHaveProperty('backstory')
    expect(body.characterJson).not.toHaveProperty('lore')
    expect(typeof body.characterJson.id).toBe('string')
    expect(body.characterJson.id).not.toBe('legacy-record-id')
  })

  it('updates official agents without legacy WAGDIE character keys at the top level', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            id: AGENT_ID,
            name: 'Bone',
            bio: ['Current character'],
            settings: { wagdie: { externalId: '404' } },
            createdAt: 1770000000000,
            updatedAt: 1770000001000,
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            id: AGENT_ID,
            name: 'Bone Updated',
            bio: ['Updated character'],
            settings: {
              wagdie: {
                externalId: '404',
                backstory: 'Updated backstory',
                lore: ['Updated lore'],
              },
            },
          },
        })
      )

    global.fetch = fetchMock as typeof fetch

    const client = new OfficialWagdieElizaClient({
      baseUrl: 'https://elizaos.example',
      apiKey: 'service-key',
    })

    await expect(
      client.characters.replaceRecord(AGENT_ID, {
        character: {
          name: 'Bone Updated',
          bio: ['Updated character'],
          backstory: 'Updated backstory',
          lore: ['Updated lore'],
        } as any,
      })
    ).resolves.toMatchObject({
      id: AGENT_ID,
      externalId: '404',
    })

    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(body).toMatchObject({
      id: AGENT_ID,
      name: 'Bone Updated',
      settings: {
        wagdie: {
          externalId: '404',
          backstory: 'Updated backstory',
          lore: ['Updated lore'],
        },
      },
    })
    expect(body).not.toHaveProperty('backstory')
    expect(body).not.toHaveProperty('lore')
  })

  it('streams official session SSE with raw fetch and WAGDIE callbacks', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { status: 'active' } }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            sessionId: SESSION_ID,
            agentId: AGENT_ID,
            userId: '33333333-3333-5333-8333-333333333333',
            createdAt: new Date().toISOString(),
            metadata: {},
          },
          { status: 201 }
        )
      )
      .mockResolvedValueOnce({
        ok: true,
        body: sseStream([
          'event: user_message\r\ndata: {\"id\":\"user-message\"}\r\n\r\n',
          'event: chunk\r\ndata: {\"chunk\":\"Ash\"}\r\n\r\n',
          'event: chunk\r\ndata: {\"chunk\":\" speaks\"}\r\n\r\n',
          'event: done\r\ndata: {\"messageId\":\"agent-message\",\"text\":\"Ash speaks\"}\r\n\r\n',
        ]),
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        status: 200,
      })

    global.fetch = fetchMock as typeof fetch

    const conversationRepository = makeConversationRepository()
    const client = new OfficialWagdieElizaClient({
      baseUrl: 'https://elizaos.example',
      apiKey: 'service-key',
      officialUserId: 'wallet-derived-user-id',
      walletAddress: '0xabc',
      conversationRepository,
    })

    const chunks: string[] = []
    const complete = jest.fn()

    await client.chat.sendMessageStream(
      {
        characterId: AGENT_ID,
        message: 'Speak',
      },
      {
        onChunk: (chunk) => chunks.push(chunk),
        onComplete: complete,
      }
    )

    expect(chunks).toEqual(['Ash', ' speaks'])
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-message', content: 'Ash speaks' }),
      WAGDIE_CONVERSATION_ID
    )
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://elizaos.example/api/agents/${AGENT_ID}/start`
    )
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      agentId: AGENT_ID,
      userId: 'wallet-derived-user-id',
    })
    expect(conversationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        walletAddress: '0xabc',
        officialUserId: 'wallet-derived-user-id',
        officialAgentId: AGENT_ID,
        officialSessionId: SESSION_ID,
      })
    )
    expect(fetchMock.mock.calls[2][0]).toBe(
      `https://elizaos.example/api/messaging/sessions/${SESSION_ID}/messages`
    )
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toMatchObject({
      content: 'Speak',
      transport: 'sse',
      metadata: expect.objectContaining({ wagdieConversationId: WAGDIE_CONVERSATION_ID }),
    })
    expect(conversationRepository.markActivity).toHaveBeenCalledWith(
      WAGDIE_CONVERSATION_ID,
      'wallet-derived-user-id',
      expect.objectContaining({ incrementBy: 2 })
    )
  })

  it('maps final official SSE content when the done event has nested text and closes without delimiter', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { status: 'active' } }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            sessionId: SESSION_ID,
            agentId: AGENT_ID,
            userId: 'wallet-derived-user-id',
            createdAt: new Date().toISOString(),
            metadata: {},
          },
          { status: 201 }
        )
      )
      .mockResolvedValueOnce({
        ok: true,
        body: sseStream([
          'event: user_message\r\ndata: {\"id\":\"user-message\"}\r\n\r\n',
          'event: done\r\ndata: {\"messageId\":\"agent-message\",\"content\":{\"text\":\"Nested reply\"}}',
        ]),
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        status: 200,
      })

    global.fetch = fetchMock as typeof fetch

    const client = new OfficialWagdieElizaClient({
      baseUrl: 'https://elizaos.example',
      apiKey: 'service-key',
      officialUserId: 'wallet-derived-user-id',
      walletAddress: '0xabc',
      conversationRepository: makeConversationRepository(),
    })

    const chunks: string[] = []
    const complete = jest.fn()

    await client.chat.sendMessageStream(
      {
        characterId: AGENT_ID,
        message: 'Speak',
      },
      {
        onChunk: (chunk) => chunks.push(chunk),
        onComplete: complete,
      }
    )

    expect(chunks).toEqual(['Nested reply'])
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'agent-message', content: 'Nested reply' }),
      WAGDIE_CONVERSATION_ID
    )
  })

  it('best-effort deletes newly created official sessions when mapping creation fails', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { status: 'active' } }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            sessionId: SESSION_ID,
            agentId: AGENT_ID,
            userId: 'wallet-derived-user-id',
            createdAt: new Date().toISOString(),
            metadata: {},
          },
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
    global.fetch = fetchMock as typeof fetch
    const conversationRepository = makeConversationRepository({
      create: jest.fn(async () => {
        throw new Error('mapping insert failed')
      }),
    })

    const client = new OfficialWagdieElizaClient({
      baseUrl: 'https://elizaos.example',
      apiKey: 'service-key',
      officialUserId: 'wallet-derived-user-id',
      conversationRepository,
    })

    await expect(
      client.chat.sendMessageStream(
        {
          characterId: AGENT_ID,
          message: 'Speak',
        },
        {}
      )
    ).rejects.toMatchObject({ message: 'Official ElizaOS chat stream failed' })
    expect(fetchMock.mock.calls.map((call) => [call[0], call[1].method])).toEqual([
      [`https://elizaos.example/api/agents/${AGENT_ID}/start`, 'POST'],
      ['https://elizaos.example/api/messaging/sessions', 'POST'],
      [`https://elizaos.example/api/messaging/sessions/${SESSION_ID}`, 'DELETE'],
    ])
  })

  it('requires wallet-scoped official user identity for chat sessions', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as typeof fetch

    const client = new OfficialWagdieElizaClient({
      baseUrl: 'https://elizaos.example',
      apiKey: 'service-key',
    })

    await expect(
      client.chat.sendMessageStream(
        {
          characterId: AGENT_ID,
          message: 'Speak',
        },
        {}
      )
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 501,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reuses caller-provided WAGDIE conversation ids through the wallet-scoped mapping', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { status: 'active' } }))
      .mockResolvedValueOnce({
      ok: true,
      body: sseStream([
        'event: chunk\r\ndata: {\"chunk\":\"Again\"}\r\n\r\n',
        'event: done\r\ndata: {\"messageId\":\"agent-message-2\",\"text\":\"Again\"}\r\n\r\n',
      ]),
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      status: 200,
    })
    global.fetch = fetchMock as typeof fetch
    const conversationRepository = makeConversationRepository()

    const client = new OfficialWagdieElizaClient({
      baseUrl: 'https://elizaos.example',
      apiKey: 'service-key',
      officialUserId: 'wallet-derived-user-id',
      conversationRepository,
    })

    const complete = jest.fn()

    await client.chat.sendMessageStream(
      {
        characterId: AGENT_ID,
        conversationId: WAGDIE_CONVERSATION_ID,
        message: 'Continue',
      },
      { onComplete: complete }
    )

    expect(conversationRepository.findForUser).toHaveBeenCalledWith(
      WAGDIE_CONVERSATION_ID,
      'wallet-derived-user-id'
    )
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://elizaos.example/api/agents/${AGENT_ID}/start`
    )
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://elizaos.example/api/messaging/sessions/${SESSION_ID}/messages`
    )
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Again' }),
      WAGDIE_CONVERSATION_ID
    )
  })

  it('returns NOT_FOUND when a mapped WAGDIE conversation is missing for the official user', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as typeof fetch
    const conversationRepository = makeConversationRepository({
      findForUser: jest.fn(async () => null),
    })

    const client = new OfficialWagdieElizaClient({
      baseUrl: 'https://elizaos.example',
      apiKey: 'service-key',
      officialUserId: 'wallet-derived-user-id',
      conversationRepository,
    })

    await expect(
      client.chat.sendMessageStream(
        {
          characterId: AGENT_ID,
          conversationId: WAGDIE_CONVERSATION_ID,
          message: 'Continue',
        },
        {}
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
    await expect(client.conversations.get(WAGDIE_CONVERSATION_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('implements official conversation list/get/delete through WAGDIE mappings', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          messages: [
            {
              id: 'm1',
              content: 'Hi',
              authorId: 'wallet-derived-user-id',
              isAgent: false,
              createdAt: '2026-05-10T00:00:00.000Z',
              metadata: {},
            },
            {
              id: 'm2',
              content: 'Hello',
              authorId: AGENT_ID,
              isAgent: true,
              createdAt: '2026-05-10T00:00:01.000Z',
              metadata: {},
            },
          ],
          hasMore: false,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
    global.fetch = fetchMock as typeof fetch
    const conversationRepository = makeConversationRepository()

    const client = new OfficialWagdieElizaClient({
      baseUrl: 'https://elizaos.example',
      apiKey: 'service-key',
      officialUserId: 'wallet-derived-user-id',
      conversationRepository,
    })

    await expect(client.conversations.list()).resolves.toMatchObject({
      items: [{ id: WAGDIE_CONVERSATION_ID, characterId: AGENT_ID }],
      total: 1,
    })
    await expect(client.conversations.get(WAGDIE_CONVERSATION_ID)).resolves.toMatchObject({
      id: WAGDIE_CONVERSATION_ID,
      messages: [
        { id: 'm1', role: 'user', content: 'Hi' },
        { id: 'm2', role: 'assistant', content: 'Hello' },
      ],
    })
    await expect(client.conversations.delete(WAGDIE_CONVERSATION_ID)).resolves.toBeUndefined()

    expect(conversationRepository.listForUser).toHaveBeenCalledWith({
      officialUserId: 'wallet-derived-user-id',
      page: undefined,
      pageSize: undefined,
    })
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `https://elizaos.example/api/messaging/sessions/${SESSION_ID}/messages`,
      `https://elizaos.example/api/messaging/sessions/${SESSION_ID}`,
    ])
    expect(conversationRepository.markDeleted).toHaveBeenCalledWith(
      WAGDIE_CONVERSATION_ID,
      'wallet-derived-user-id'
    )
  })

  it('normalizes official API errors into WAGDIE gateway errors', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: {
            code: 'PROVIDER_SECRET_STACK_TRACE',
            message: 'raw provider failure',
            details: 'secret details',
          },
        },
        { status: 500 }
      )
    )

    global.fetch = fetchMock as typeof fetch

    const client = new OfficialWagdieElizaClient({
      baseUrl: 'https://elizaos.example',
      apiKey: 'service-key',
    })

    await expect(client.characters.getRecord(AGENT_ID)).rejects.toMatchObject({
      code: 'API_ERROR',
      statusCode: 500,
      message: 'Failed to load official ElizaOS agent',
      details: { officialCode: 'PROVIDER_SECRET_STACK_TRACE' },
    })
  })

  it('marks official auth flow unsupported until the auth bridge work item', async () => {
    const client = new OfficialWagdieElizaClient({ baseUrl: 'https://elizaos.example' })

    await expect(client.auth.getNonce()).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 501,
    })
  })
})
