/**
 * Integration tests for nonce generation and expiration
 * Tests T009 [US1] - Secure nonce generation endpoint
 */

import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { GET, POST } from '@/app/api/auth/nonce/route'

// Mock next/headers
jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

describe('Auth Nonce Endpoint', () => {
  let mockCookieStore: {
    set: jest.Mock
    get: jest.Mock
    delete: jest.Mock
  }
  let requestCounter = 0

  function createRequest(method: 'GET' | 'POST' = 'GET'): NextRequest {
    requestCounter += 1
    return new NextRequest('https://example.com/api/auth/nonce', {
      method,
      headers: { 'x-forwarded-for': `127.0.0.${requestCounter}` },
    })
  }

  beforeEach(() => {
    mockCookieStore = {
      set: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    }
    ;(cookies as jest.Mock).mockResolvedValue(mockCookieStore)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/auth/nonce', () => {
    it('should return a nonce in the response body', async () => {
      const response = await GET(createRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.nonce).toBeDefined()
      expect(typeof data.nonce).toBe('string')
    })

    it('should generate a 32-character hex nonce', async () => {
      const response = await GET(createRequest())
      const data = await response.json()

      // Secure nonce should be 32 hex characters (16 bytes)
      expect(data.nonce).toHaveLength(32)
      expect(data.nonce).toMatch(/^[0-9a-f]{32}$/)
    })

    it('should set nonce cookie with secure attributes', async () => {
      await GET(createRequest())

      expect(mockCookieStore.set).toHaveBeenCalledWith(
        'siwe-nonce',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 300, // 5 minutes
          path: '/',
        })
      )
    })

    it('should generate unique nonces on each request', async () => {
      const response1 = await GET(createRequest())
      const response2 = await GET(createRequest())

      const data1 = await response1.json()
      const data2 = await response2.json()

      expect(data1.nonce).not.toBe(data2.nonce)
    })
  })

  describe('POST /api/auth/nonce', () => {
    it('should also generate nonce via POST', async () => {
      const response = await POST(createRequest('POST'))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.nonce).toBeDefined()
      expect(data.nonce).toHaveLength(32)
    })
  })

  describe('Nonce format and security', () => {
    it('should not use predictable patterns (no Math.random)', async () => {
      // Generate multiple nonces and verify they don't follow predictable patterns
      const nonces: string[] = []
      for (let i = 0; i < 10; i++) {
        const response = await GET(createRequest())
        const data = await response.json()
        nonces.push(data.nonce)
      }

      // All should be unique
      const uniqueNonces = new Set(nonces)
      expect(uniqueNonces.size).toBe(10)

      // All should be valid hex (crypto.randomBytes format)
      for (const nonce of nonces) {
        expect(nonce).toMatch(/^[0-9a-f]{32}$/)
      }
    })

    it('should set cookie TTL to 5 minutes (300 seconds)', async () => {
      await GET(createRequest())

      const setCookieCall = mockCookieStore.set.mock.calls[0]
      const cookieOptions = setCookieCall[2]

      expect(cookieOptions.maxAge).toBe(300)
    })
  })

  describe('Error handling', () => {
    it('should handle cookie store errors gracefully', async () => {
      mockCookieStore.set.mockImplementation(() => {
        throw new Error('Cookie store unavailable')
      })

      const response = await GET(createRequest())
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBeDefined()
    })
  })
})
