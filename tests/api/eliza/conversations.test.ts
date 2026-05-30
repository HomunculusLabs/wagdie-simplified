/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { GET as listHandler } from '@/app/api/eliza/conversations/route'
import { GET as getHandler, DELETE as deleteHandler } from '@/app/api/eliza/conversations/[conversationId]/route'
import { getSession } from '@/lib/auth/session'
import { getElizaClient, createUserClient } from '@/lib/eliza/client'
import { getRecordIdByTokenId } from '@/lib/eliza/characterResolver'
import { elizaConfig } from '@/lib/eliza/config'
import { getOfficialElizaUserIdForWallet } from '@/lib/eliza/authBridge'

jest.mock('@/lib/auth/session', () => ({ getSession: jest.fn() }))
jest.mock('@/lib/eliza/client', () => ({ getElizaClient: jest.fn(), createUserClient: jest.fn() }))
jest.mock('@/lib/eliza/characterResolver', () => ({ getRecordIdByTokenId: jest.fn() }))

function createListRequest(url: string) {
  return new NextRequest(url, { method: 'GET' })
}

describe('Eliza Conversations API Routes', () => {
  const originalMode = elizaConfig.mode

  beforeEach(() => {
    jest.clearAllMocks()
    elizaConfig.mode = 'legacy'
  })

  afterAll(() => {
    elizaConfig.mode = originalMode
  })

  describe('401 when wallet missing', () => {
    it('list should return 401', async () => {
      ;(getSession as jest.Mock).mockResolvedValueOnce({ address: undefined })

      const response = await listHandler(createListRequest('http://localhost/api/eliza/conversations?page=1&pageSize=20'))
      expect(response.status).toBe(401)

      const data = await (response as any).json()
      expect(data.error).toBe('UNAUTHORIZED')
    })

    it('get should return 401', async () => {
      ;(getSession as jest.Mock).mockResolvedValueOnce({ address: undefined })

      const response = await getHandler(
        createListRequest('http://localhost/api/eliza/conversations/conv-1'),
        { params: Promise.resolve({ conversationId: 'conv-1' }) }
      )
      expect(response.status).toBe(401)

      const data = await (response as any).json()
      expect(data.error).toBe('UNAUTHORIZED')
    })

    it('delete should return 401', async () => {
      ;(getSession as jest.Mock).mockResolvedValueOnce({ address: undefined })

      const response = await deleteHandler(
        createListRequest('http://localhost/api/eliza/conversations/conv-1'),
        { params: Promise.resolve({ conversationId: 'conv-1' }) }
      )
      expect(response.status).toBe(401)

      const data = await (response as any).json()
      expect(data.error).toBe('UNAUTHORIZED')
    })
  })

  describe('401 when Eliza token missing', () => {
    it('list should return 401', async () => {
      ;(getSession as jest.Mock).mockResolvedValueOnce({ address: '0xAbC', eliza: { tokens: undefined } })

      const response = await listHandler(createListRequest('http://localhost/api/eliza/conversations?page=1&pageSize=20'))
      expect(response.status).toBe(401)

      const data = await (response as any).json()
      expect(data.error).toBe('NO_TOKEN')
    })

    it('get should return 401', async () => {
      ;(getSession as jest.Mock).mockResolvedValueOnce({ address: '0xAbC', eliza: { tokens: undefined } })

      const response = await getHandler(
        createListRequest('http://localhost/api/eliza/conversations/conv-1'),
        { params: Promise.resolve({ conversationId: 'conv-1' }) }
      )
      expect(response.status).toBe(401)

      const data = await (response as any).json()
      expect(data.error).toBe('NO_TOKEN')
    })

    it('delete should return 401', async () => {
      ;(getSession as jest.Mock).mockResolvedValueOnce({ address: '0xAbC', eliza: { tokens: undefined } })

      const response = await deleteHandler(
        createListRequest('http://localhost/api/eliza/conversations/conv-1'),
        { params: Promise.resolve({ conversationId: 'conv-1' }) }
      )
      expect(response.status).toBe(401)

      const data = await (response as any).json()
      expect(data.error).toBe('NO_TOKEN')
    })
  })

  describe('uses user client for conversation operations', () => {
    it('list should call createUserClient(accessToken) and list()', async () => {
      ;(getSession as jest.Mock).mockResolvedValueOnce({
        address: '0xAbC',
        eliza: { tokens: { accessToken: 'user-token', expiresAt: Date.now() + 60 * 60 * 1000 } },
      })

      const userClient = {
        conversations: {
          list: jest.fn().mockResolvedValueOnce({
            items: [
              {
                id: 'conv-1',
                characterId: 'char-1',
                messageCount: 2,
                createdAt: new Date().toISOString(),
                lastMessageAt: new Date().toISOString(),
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
            hasMore: false,
          }),
          listForCharacter: jest.fn(),
          get: jest.fn(),
          delete: jest.fn(),
        },
      }

      ;(createUserClient as jest.Mock).mockReturnValue(userClient)

      const response = await listHandler(createListRequest('http://localhost/api/eliza/conversations?page=1&pageSize=20'))
      expect(response.status).toBe(200)

      expect(createUserClient).toHaveBeenCalledWith('user-token')
      expect(userClient.conversations.list).toHaveBeenCalledWith({ page: 1, pageSize: 20 })
    })

    it('get should call createUserClient(accessToken) and conversations.get(conversationId)', async () => {
      ;(getSession as jest.Mock).mockResolvedValueOnce({
        address: '0xAbC',
        eliza: { tokens: { accessToken: 'user-token', expiresAt: Date.now() + 60 * 60 * 1000 } },
      })

      const userClient = {
        conversations: {
          get: jest.fn().mockResolvedValueOnce({
            id: 'conv-1',
            characterId: 'char-1',
            characterName: 'Char',
            messageCount: 2,
            createdAt: new Date().toISOString(),
            lastMessageAt: new Date().toISOString(),
            messages: [
              { id: 'm1', role: 'user', content: 'Hi', createdAt: new Date().toISOString() },
              { id: 'm2', role: 'assistant', content: 'Hello', createdAt: new Date().toISOString() },
            ],
          }),
          delete: jest.fn(),
          list: jest.fn(),
          listForCharacter: jest.fn(),
        },
      }

      ;(createUserClient as jest.Mock).mockReturnValue(userClient)

      const response = await getHandler(
        createListRequest('http://localhost/api/eliza/conversations/conv-1'),
        { params: Promise.resolve({ conversationId: 'conv-1' }) }
      )

      expect(response.status).toBe(200)
      expect(createUserClient).toHaveBeenCalledWith('user-token')
      expect(userClient.conversations.get).toHaveBeenCalledWith('conv-1')
    })

    it('delete should call createUserClient(accessToken) and conversations.delete(conversationId)', async () => {
      ;(getSession as jest.Mock).mockResolvedValueOnce({
        address: '0xAbC',
        eliza: { tokens: { accessToken: 'user-token', expiresAt: Date.now() + 60 * 60 * 1000 } },
      })

      const userClient = {
        conversations: {
          delete: jest.fn().mockResolvedValueOnce(undefined),
          get: jest.fn(),
          list: jest.fn(),
          listForCharacter: jest.fn(),
        },
      }

      ;(createUserClient as jest.Mock).mockReturnValue(userClient)

      const response = await deleteHandler(
        createListRequest('http://localhost/api/eliza/conversations/conv-1'),
        { params: Promise.resolve({ conversationId: 'conv-1' }) }
      )

      expect(response.status).toBe(200)
      expect(createUserClient).toHaveBeenCalledWith('user-token')
      expect(userClient.conversations.delete).toHaveBeenCalledWith('conv-1')
    })
  })

  describe('official mode route wiring', () => {
    it('list/get/delete pass wallet-derived official identity into the user client', async () => {
      elizaConfig.mode = 'official'
      const officialUserId = getOfficialElizaUserIdForWallet('0xAbC')
      ;(getSession as jest.Mock)
        .mockResolvedValueOnce({
          address: '0xAbC',
          eliza: {
            tokens: {
              accessToken: 'wagdie_eliza_token',
              expiresAt: Date.now() + 60 * 60 * 1000,
              mode: 'official',
              officialUserId,
            },
          },
        })
        .mockResolvedValueOnce({
          address: '0xAbC',
          eliza: {
            tokens: {
              accessToken: 'wagdie_eliza_token',
              expiresAt: Date.now() + 60 * 60 * 1000,
              mode: 'official',
              officialUserId,
            },
          },
        })
        .mockResolvedValueOnce({
          address: '0xAbC',
          eliza: {
            tokens: {
              accessToken: 'wagdie_eliza_token',
              expiresAt: Date.now() + 60 * 60 * 1000,
              mode: 'official',
              officialUserId,
            },
          },
        })

      const userClient = {
        conversations: {
          list: jest.fn().mockResolvedValueOnce({
            items: [],
            total: 0,
            page: 1,
            pageSize: 20,
            hasMore: false,
          }),
          get: jest.fn().mockResolvedValueOnce({
            id: 'conv-1',
            characterId: 'char-1',
            messageCount: 0,
            createdAt: '2026-05-10T00:00:00.000Z',
            lastMessageAt: '2026-05-10T00:00:00.000Z',
            messages: [],
          }),
          delete: jest.fn().mockResolvedValueOnce(undefined),
          listForCharacter: jest.fn(),
        },
      }

      ;(createUserClient as jest.Mock).mockReturnValue(userClient)

      await listHandler(createListRequest('http://localhost/api/eliza/conversations?page=1&pageSize=20'))
      await getHandler(createListRequest('http://localhost/api/eliza/conversations/conv-1'), {
        params: Promise.resolve({ conversationId: 'conv-1' }),
      })
      await deleteHandler(createListRequest('http://localhost/api/eliza/conversations/conv-1'), {
        params: Promise.resolve({ conversationId: 'conv-1' }),
      })

      expect(createUserClient).toHaveBeenCalledTimes(3)
      expect(createUserClient).toHaveBeenNthCalledWith(1, {
        accessToken: 'wagdie_eliza_token',
        officialUserId,
        walletAddress: '0xabc',
      })
      expect(createUserClient).toHaveBeenNthCalledWith(2, {
        accessToken: 'wagdie_eliza_token',
        officialUserId,
        walletAddress: '0xabc',
      })
      expect(createUserClient).toHaveBeenNthCalledWith(3, {
        accessToken: 'wagdie_eliza_token',
        officialUserId,
        walletAddress: '0xabc',
      })
    })
  })

  describe('tokenId translation uses server client', () => {
    it('list should call getElizaClient for tokenId→recordId translation and then listForCharacter(recordId)', async () => {
      ;(getSession as jest.Mock).mockResolvedValueOnce({
        address: '0xAbC',
        eliza: { tokens: { accessToken: 'user-token', expiresAt: Date.now() + 60 * 60 * 1000 } },
      })

      const serverClient = { __type: 'server-client' }
      ;(getElizaClient as jest.Mock).mockReturnValue(serverClient)
      ;(getRecordIdByTokenId as jest.Mock).mockResolvedValueOnce('record-1')

      const userClient = {
        conversations: {
          listForCharacter: jest.fn().mockResolvedValueOnce({
            items: [],
            total: 0,
            page: 1,
            pageSize: 20,
            hasMore: false,
          }),
          list: jest.fn(),
          get: jest.fn(),
          delete: jest.fn(),
        },
      }

      ;(createUserClient as jest.Mock).mockReturnValue(userClient)

      const response = await listHandler(
        createListRequest('http://localhost/api/eliza/conversations?tokenId=123&page=1&pageSize=20')
      )

      expect(response.status).toBe(200)

      expect(getElizaClient).toHaveBeenCalledTimes(1)
      expect(getRecordIdByTokenId).toHaveBeenCalledTimes(1)
      expect(getRecordIdByTokenId).toHaveBeenCalledWith(serverClient, '123')

      expect(userClient.conversations.listForCharacter).toHaveBeenCalledWith('record-1', { page: 1, pageSize: 20 })
    })

    it('list should return AI_PERSONA_REQUIRED when tokenId has no record', async () => {
      ;(getSession as jest.Mock).mockResolvedValueOnce({
        address: '0xAbC',
        eliza: { tokens: { accessToken: 'user-token', expiresAt: Date.now() + 60 * 60 * 1000 } },
      })

      const serverClient = { __type: 'server-client' }
      ;(getElizaClient as jest.Mock).mockReturnValue(serverClient)
      ;(getRecordIdByTokenId as jest.Mock).mockResolvedValueOnce(null)

      const userClient = {
        conversations: {
          listForCharacter: jest.fn(),
          list: jest.fn(),
          get: jest.fn(),
          delete: jest.fn(),
        },
      }

      ;(createUserClient as jest.Mock).mockReturnValue(userClient)

      const response = await listHandler(
        createListRequest('http://localhost/api/eliza/conversations?tokenId=123&page=1&pageSize=20')
      )

      expect(response.status).toBe(409)
      const data = await (response as any).json()
      expect(data.error).toBe('AI_PERSONA_REQUIRED')
      expect(data.message).toContain('Save AI Persona')

      expect(getElizaClient).toHaveBeenCalledTimes(1)
      expect(getRecordIdByTokenId).toHaveBeenCalledWith(serverClient, '123')

      expect(userClient.conversations.listForCharacter).not.toHaveBeenCalled()
      expect(userClient.conversations.list).not.toHaveBeenCalled()
    })
  })
})
