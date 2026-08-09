/**
 * Integration tests for rate limiting on auth endpoints
 * Tests T023 [US3] - Rate limiting on auth endpoints
 */

import { NextRequest } from 'next/server'
import { GET as getNonce } from '@/app/api/auth/nonce/route'
import { POST as postVerify } from '@/app/api/auth/verify/route'
import { cookies } from 'next/headers'
import { authRateLimiter } from '@/lib/middleware/rate-limit'

// Mock next/headers
jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

jest.mock('@/lib/auth/session', () => ({
  getSession: jest.fn(),
}))

describe('Rate Limiting on Auth Endpoints', () => {
  let mockCookieStore: {
    set: jest.Mock
    get: jest.Mock
    delete: jest.Mock
  }

  function createRequest(path: string, method: 'GET' | 'POST' = 'GET', ip = '198.51.100.10'): NextRequest {
    return new NextRequest(`https://example.com${path}`, {
      method,
      headers: { 'x-forwarded-for': ip },
    })
  }

  beforeEach(() => {
    ;(authRateLimiter as any).store.clear()
    mockCookieStore = {
      set: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    }
    ;(cookies as jest.Mock).mockResolvedValue(mockCookieStore)
  })

  afterEach(() => {
    ;(authRateLimiter as any).store.clear()
    jest.clearAllMocks()
  })

  describe('GET /api/auth/nonce', () => {
    it('should allow requests under rate limit', async () => {
      const response = await getNonce(createRequest('/api/auth/nonce', 'GET', '198.51.100.11'))
      expect(response.status).toBe(200)
      expect(response.headers.get('X-RateLimit-Limit')).toBe('10')
    })

    it('should return 429 when rate limit exceeded', async () => {
      const ip = '198.51.100.12'
      for (let i = 0; i < 10; i++) {
        const response = await getNonce(createRequest('/api/auth/nonce', 'GET', ip))
        expect(response.status).toBe(200)
      }

      const response = await getNonce(createRequest('/api/auth/nonce', 'GET', ip))
      const data = await response.json()

      expect(response.status).toBe(429)
      expect(data.error).toContain('Too many requests')
      expect(response.headers.get('Retry-After')).toBeTruthy()
    })
  })

  describe('POST /api/auth/verify', () => {
    it('should return 429 before CSRF/body validation when rate limit exceeded', async () => {
      const ip = '198.51.100.13'
      for (let i = 0; i < 10; i++) {
        const response = await postVerify(createRequest('/api/auth/verify', 'POST', ip))
        expect(response.status).toBe(403)
      }

      const response = await postVerify(createRequest('/api/auth/verify', 'POST', ip))
      const data = await response.json()

      expect(response.status).toBe(429)
      expect(data.error).toContain('Too many requests')
    })
  })

  describe('Rate limit headers', () => {
    it('should include rate limit headers in response', async () => {
      const response = await getNonce(createRequest('/api/auth/nonce', 'GET', '198.51.100.14'))

      expect(response.headers.get('X-RateLimit-Limit')).toBe('10')
      expect(response.headers.get('X-RateLimit-Remaining')).toBeTruthy()
      expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy()
    })
  })
})
