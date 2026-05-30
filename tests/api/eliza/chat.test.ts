/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { POST as chatHandler } from '@/app/api/eliza/chat/route'
import { getSession } from '@/lib/auth/session'
import { getElizaClient } from '@/lib/eliza/client'
import { getCharacterByTokenId } from '@/lib/eliza/characterResolver'
import { getCharacter } from '@/lib/services/character-service'
import { elizaConfig } from '@/lib/eliza/config'
import { getOfficialElizaUserIdForWallet } from '@/lib/eliza/authBridge'

jest.mock('@/lib/auth/session', () => ({ getSession: jest.fn() }))
jest.mock('@/lib/eliza/client', () => ({ getElizaClient: jest.fn() }))
jest.mock('@/lib/eliza/characterResolver', () => ({ getCharacterByTokenId: jest.fn() }))
jest.mock('@/lib/services/character-service', () => ({ getCharacter: jest.fn() }))

function createNextRequest(body: unknown) {
  return new NextRequest('http://localhost/api/eliza/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function drainStream(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return
  const reader = body.getReader()
  while (true) {
    const { done } = await reader.read()
    if (done) break
  }
}

async function readStreamText(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) return ''
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  return text
}

describe('Eliza Chat API Route', () => {
  const originalMode = elizaConfig.mode

  beforeEach(() => {
    jest.clearAllMocks()
    elizaConfig.mode = 'legacy'
  })

  afterAll(() => {
    elizaConfig.mode = originalMode
  })

  it('should return 401 when wallet session is missing', async () => {
    ;(getSession as jest.Mock).mockResolvedValueOnce({
      address: undefined,
    })

    const response = await chatHandler(createNextRequest({ tokenId: '1', message: 'Hello' }))
    expect(response.status).toBe(401)

    const data = await (response as any).json()
    expect(data.error).toBe('UNAUTHORIZED')
  })

  it('should return 401 when Eliza token is missing', async () => {
    ;(getSession as jest.Mock).mockResolvedValueOnce({
      address: '0xabc',
      eliza: { tokens: undefined },
    })

    const response = await chatHandler(createNextRequest({ tokenId: '1', message: 'Hello' }))
    expect(response.status).toBe(401)

    const data = await (response as any).json()
    expect(data.error).toBe('NO_TOKEN')
  })

  it('should return 401 when Eliza token is expired', async () => {
    ;(getSession as jest.Mock).mockResolvedValueOnce({
      address: '0xabc',
      eliza: {
        tokens: {
          accessToken: 'token',
          expiresAt: Date.now() - 1000,
        },
      },
    })

    const response = await chatHandler(createNextRequest({ tokenId: '1', message: 'Hello' }))
    expect(response.status).toBe(401)

    const data = await (response as any).json()
    expect(data.error).toBe('TOKEN_EXPIRED')
  })

  it('should return 400 when request body is missing tokenId or message', async () => {
    ;(getSession as jest.Mock).mockResolvedValueOnce({
      address: '0xabc',
      eliza: {
        tokens: {
          accessToken: 'token',
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
      },
    })

    const response = await chatHandler(createNextRequest({ tokenId: '1' }))
    expect(response.status).toBe(400)

    const data = await (response as any).json()
    expect(data.error).toBe('VALIDATION_ERROR')
  })

  it('should return 404 when WAGDIE character is not found', async () => {
    ;(getSession as jest.Mock).mockResolvedValueOnce({
      address: '0xabc',
      eliza: {
        tokens: {
          accessToken: 'token',
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
      },
    })

    ;(getCharacter as jest.Mock).mockResolvedValueOnce(null)

    const response = await chatHandler(createNextRequest({ tokenId: '999', message: 'Hello' }))
    expect(response.status).toBe(404)

    const data = await (response as any).json()
    expect(data.error).toBe('NOT_FOUND')
    expect(data.message).toContain('WAGDIE character not found')
  })

  it('should return 400 for non-canonical token IDs', async () => {
    ;(getSession as jest.Mock).mockResolvedValueOnce({
      address: '0xabc',
      eliza: {
        tokens: {
          accessToken: 'token',
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
      },
    })

    const response = await chatHandler(createNextRequest({ tokenId: '00123', message: 'Hello' }))
    expect(response.status).toBe(400)

    const data = await (response as any).json()
    expect(data.error).toBe('INVALID_TOKEN_ID')
    expect(getCharacter).not.toHaveBeenCalled()
    expect(getElizaClient).not.toHaveBeenCalled()
  })

  it('should return 409 when the canonical AI persona is missing', async () => {
    ;(getSession as jest.Mock).mockResolvedValueOnce({
      address: '0xabc',
      eliza: {
        tokens: {
          accessToken: 'token',
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
      },
    })

    ;(getCharacter as jest.Mock).mockResolvedValueOnce({
      name: 'Test Character',
      background_story: 'Backstory',
    })

    const serverClient = {
      chat: { sendMessageStream: jest.fn() },
      characters: { createRecord: jest.fn() },
    }

    ;(getElizaClient as jest.Mock).mockReturnValue(serverClient)
    ;(getCharacterByTokenId as jest.Mock).mockResolvedValueOnce(null)

    const response = await chatHandler(createNextRequest({ tokenId: '4073', message: 'Hello' }))
    expect(response.status).toBe(409)

    const data = await (response as any).json()
    expect(data.error).toBe('AI_PERSONA_REQUIRED')
    expect(data.message).toContain('Save AI Persona')
    expect(getCharacterByTokenId).toHaveBeenCalledWith(expect.objectContaining({
      elizaClient: serverClient,
      tokenId: '4073',
    }))
    expect(serverClient.characters.createRecord).not.toHaveBeenCalled()
    expect(serverClient.chat.sendMessageStream).not.toHaveBeenCalled()
  })

  it('passes stable wallet-derived official user id to chat stream in official mode', async () => {
    elizaConfig.mode = 'official'

    const address = '0x0000000000000000000000000000000000000abc'
    const officialUserId = getOfficialElizaUserIdForWallet(address)

    ;(getSession as jest.Mock).mockResolvedValueOnce({
      address,
      eliza: {
        tokens: {
          accessToken: 'wagdie_eliza_token',
          expiresAt: Date.now() + 60 * 60 * 1000,
          mode: 'official',
          officialUserId,
        },
      },
    })

    ;(getCharacter as jest.Mock).mockResolvedValueOnce({
      name: 'Test Character',
      background_story: 'Backstory',
    })

    const sendMessageStream = jest.fn(async (_payload: any, callbacks: any) => {
      callbacks.onComplete(
        { id: 'msg-1', content: 'Hi', createdAt: new Date().toISOString() },
        'conv-1'
      )
    })

    ;(getElizaClient as jest.Mock).mockReturnValue({ chat: { sendMessageStream } })
    ;(getCharacterByTokenId as jest.Mock).mockResolvedValueOnce({
      id: 'record-1',
      character: { name: 'Test Character', bio: ['Bio'] },
    })

    const response = await chatHandler(createNextRequest({ tokenId: '1', message: 'Hello' }))
    await drainStream(response.body as any)

    expect(sendMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: 'record-1',
        message: 'Hello',
        userId: officialUserId,
      }),
      expect.any(Object)
    )
  })

  it('normalizes null conversation IDs to first-turn undefined before streaming', async () => {
    ;(getSession as jest.Mock).mockResolvedValueOnce({
      address: '0xabc',
      eliza: {
        tokens: {
          accessToken: 'user-access-token',
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
      },
    })
    ;(getCharacter as jest.Mock).mockResolvedValueOnce({ name: 'Test Character' })
    const sendMessageStream = jest.fn(async (_payload: any, callbacks: any) => {
      callbacks.onComplete({ id: 'msg-1', content: 'Hi', createdAt: new Date().toISOString() }, 'conv-1')
    })
    ;(getElizaClient as jest.Mock).mockReturnValue({ chat: { sendMessageStream } })
    ;(getCharacterByTokenId as jest.Mock).mockResolvedValueOnce({
      id: 'record-1',
      character: { name: 'Test Character', bio: ['Bio'] },
    })

    const response = await chatHandler(createNextRequest({ tokenId: '1', message: 'Hello', conversationId: null }))
    await drainStream(response.body as any)

    expect(sendMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: undefined }),
      expect.any(Object)
    )
  })

  it('emits SSE error instead of complete when gateway completion is blank', async () => {
    ;(getSession as jest.Mock).mockResolvedValueOnce({
      address: '0xabc',
      eliza: {
        tokens: {
          accessToken: 'user-access-token',
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
      },
    })
    ;(getCharacter as jest.Mock).mockResolvedValueOnce({ name: 'Test Character' })
    const sendMessageStream = jest.fn(async (_payload: any, callbacks: any) => {
      callbacks.onComplete({ id: 'msg-1', content: '', createdAt: new Date().toISOString() }, 'conv-1')
    })
    ;(getElizaClient as jest.Mock).mockReturnValue({ chat: { sendMessageStream } })
    ;(getCharacterByTokenId as jest.Mock).mockResolvedValueOnce({
      id: 'record-1',
      character: { name: 'Test Character', bio: ['Bio'] },
    })

    const response = await chatHandler(createNextRequest({ tokenId: '1', message: 'Hello' }))
    const streamText = await readStreamText(response.body as any)

    expect(streamText).toContain('event: error')
    expect(streamText).toContain('EMPTY_ASSISTANT_MESSAGE')
    expect(streamText).not.toContain('event: complete')
  })

  it('emits SSE error instead of complete when gateway omits conversation ID', async () => {
    ;(getSession as jest.Mock).mockResolvedValueOnce({
      address: '0xabc',
      eliza: {
        tokens: {
          accessToken: 'user-access-token',
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
      },
    })
    ;(getCharacter as jest.Mock).mockResolvedValueOnce({ name: 'Test Character' })
    const sendMessageStream = jest.fn(async (_payload: any, callbacks: any) => {
      callbacks.onComplete({ id: 'msg-1', content: 'Hi', createdAt: new Date().toISOString() }, '')
    })
    ;(getElizaClient as jest.Mock).mockReturnValue({ chat: { sendMessageStream } })
    ;(getCharacterByTokenId as jest.Mock).mockResolvedValueOnce({
      id: 'record-1',
      character: { name: 'Test Character', bio: ['Bio'] },
    })

    const response = await chatHandler(createNextRequest({ tokenId: '1', message: 'Hello' }))
    const streamText = await readStreamText(response.body as any)

    expect(streamText).toContain('event: error')
    expect(streamText).toContain('MISSING_CONVERSATION_ID')
    expect(streamText).not.toContain('event: complete')
  })

  it('should use server gateway for character resolution and Venice-backed chat streaming', async () => {
    ;(getSession as jest.Mock).mockResolvedValueOnce({
      address: '0xabc',
      eliza: {
        tokens: {
          accessToken: 'user-access-token',
          expiresAt: Date.now() + 60 * 60 * 1000,
        },
      },
    })

    ;(getCharacter as jest.Mock).mockResolvedValueOnce({
      name: 'Test Character',
      background_story: 'Backstory',
    })

    const sendMessageStream = jest.fn(async (_payload: any, callbacks: any) => {
      callbacks.onChunk('H')
      callbacks.onChunk('i')
      callbacks.onComplete(
        { id: 'msg-1', content: 'Hi', createdAt: new Date().toISOString() },
        'conv-1'
      )
    })

    const serverClient = {
      __type: 'server-client',
      chat: { sendMessageStream },
    }

    ;(getElizaClient as jest.Mock).mockReturnValue(serverClient)

    ;(getCharacterByTokenId as jest.Mock).mockResolvedValueOnce({
      id: 'record-1',
      character: { name: 'Test Character', bio: ['Bio'] },
    })

    const response = await chatHandler(createNextRequest({ tokenId: '1', message: 'Hello' }))

    expect(getElizaClient).toHaveBeenCalledTimes(1)

    expect(getCharacterByTokenId).toHaveBeenCalledTimes(1)
    expect(getCharacterByTokenId).toHaveBeenCalledWith(
      expect.objectContaining({
        elizaClient: serverClient,
        tokenId: '1',
      })
    )

    // Ensure stream is actually consumed so the ReadableStream start() runs
    await drainStream(response.body as any)

    expect(sendMessageStream).toHaveBeenCalledTimes(1)
    expect(sendMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: 'record-1',
        character: { name: 'Test Character', bio: ['Bio'] },
        message: 'Hello',
        conversationId: undefined,
        signal: expect.any(AbortSignal),
      }),
      expect.any(Object)
    )
  })
})