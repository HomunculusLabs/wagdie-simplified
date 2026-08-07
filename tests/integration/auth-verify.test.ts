/**
 * @jest-environment node
 *
 * Integration tests for nonce verification and replay prevention
 * Tests T010 [US1] - Secure nonce verification in SIWE flow
 */

import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { POST } from '@/app/api/auth/verify/route'
import { getSession } from '@/lib/auth/session'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/lib/middleware/csrf'

// Mock next/headers
jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

// Mock lib/auth/session
jest.mock('@/lib/auth/session', () => ({
  getSession: jest.fn().mockResolvedValue({
    address: null,
    siwe: null,
    expires: null,
    save: jest.fn(),
    destroy: jest.fn(),
  }),
}))

// Mock siwe
jest.mock('siwe', () => ({
  SiweMessage: jest.fn().mockImplementation((message: string) => {
    // Parse a simplified SIWE message for testing
    const nonceMatch = message.match(/Nonce: ([a-f0-9]+)/i)
    const addressMatch = message.match(/0x[a-fA-F0-9]{40}/)
    const domainMatch = message.trimStart().match(/^([^\n]+) wants you to sign in/)
    const uriMatch = message.match(/URI: ([^\n]+)/)
    const chainIdMatch = message.match(/Chain ID: (\d+)/)

    return {
      nonce: nonceMatch ? nonceMatch[1] : null,
      address: addressMatch ? addressMatch[0] : '0x1234567890123456789012345678901234567890',
      domain: domainMatch ? domainMatch[1] : 'example.com',
      uri: uriMatch ? uriMatch[1] : 'https://example.com',
      chainId: chainIdMatch ? Number(chainIdMatch[1]) : 1,
      verify: jest.fn().mockResolvedValue({
        data: {
          address: addressMatch ? addressMatch[0] : '0x1234567890123456789012345678901234567890',
        },
      }),
    }
  }),
}))

describe('Auth Verify Endpoint', () => {
  let mockCookieStore: {
    set: jest.Mock
    get: jest.Mock
    delete: jest.Mock
  }

  const validAddress = '0x1234567890123456789012345678901234567890'
  const validNonce = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4' // 32 hex chars
  const csrfToken = 'valid-csrf-token'
  let requestCounter = 0

  function createMockMessage(
    nonce: string,
    address: string = validAddress,
    overrides: { domain?: string; uri?: string; chainId?: number } = {}
  ): string {
    const domain = overrides.domain ?? 'example.com'
    const uri = overrides.uri ?? 'https://example.com'
    const chainId = overrides.chainId ?? 1

    return `${domain} wants you to sign in with your Ethereum account:
${address}

Sign in to WAGDIE

URI: ${uri}
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: 2025-01-01T00:00:00.000Z`
  }

  function createMockRequest(body: object, options: { csrf?: boolean } = { csrf: true }): NextRequest {
    requestCounter += 1
    const headers = new Headers({
      'Content-Type': 'application/json',
      'x-forwarded-for': `127.0.1.${requestCounter}`,
    })

    if (options.csrf !== false) {
      headers.set(CSRF_HEADER_NAME, csrfToken)
      headers.set('Cookie', `${CSRF_COOKIE_NAME}=${csrfToken}`)
    }

    return new NextRequest('https://example.com/api/auth/verify', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
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

  describe('CSRF protection', () => {
    it('should reject requests without a CSRF token before verification', async () => {
      const request = createMockRequest(
        { message: createMockMessage(validNonce), signature: '0xvalidsignature' },
        { csrf: false }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('CSRF')
    })
  })

  describe('Nonce verification', () => {
    it('should verify nonce matches cookie before signature verification', async () => {
      mockCookieStore.get.mockReturnValue({ value: validNonce })

      const message = createMockMessage(validNonce)
      const request = createMockRequest({
        message,
        signature: '0xvalidsignature',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.address).toBeDefined()
    })

    it('should reject when nonce in message does not match cookie', async () => {
      const storedNonce = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'
      const differentNonce = 'ffffffffffffffffffffffffffffffff'

      mockCookieStore.get.mockReturnValue({ value: storedNonce })

      const message = createMockMessage(differentNonce)
      const request = createMockRequest({
        message,
        signature: '0xvalidsignature',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('nonce')
    })

    it('should reject when no nonce cookie exists', async () => {
      mockCookieStore.get.mockReturnValue(undefined)

      const message = createMockMessage(validNonce)
      const request = createMockRequest({
        message,
        signature: '0xvalidsignature',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBeDefined()
    })

    it('should reject when SIWE domain does not match trusted config', async () => {
      mockCookieStore.get.mockReturnValue({ value: validNonce })

      const message = createMockMessage(validNonce, validAddress, { domain: 'evil.example' })
      const request = createMockRequest({
        message,
        signature: '0xvalidsignature',
      })

      const response = await POST(request)

      expect(response.status).toBe(401)
    })
  })

  describe('Replay prevention', () => {
    it('should delete nonce cookie immediately after successful verification', async () => {
      mockCookieStore.get.mockReturnValue({ value: validNonce })

      const message = createMockMessage(validNonce)
      const request = createMockRequest({
        message,
        signature: '0xvalidsignature',
      })

      await POST(request)

      expect(mockCookieStore.delete).toHaveBeenCalledWith('siwe-nonce')
    })

    it('should prevent replay by requiring fresh nonce for each verification', async () => {
      // First request succeeds
      mockCookieStore.get.mockReturnValue({ value: validNonce })

      const message = createMockMessage(validNonce)
      const request1 = createMockRequest({
        message,
        signature: '0xvalidsignature',
      })

      const response1 = await POST(request1)
      expect(response1.status).toBe(200)

      // Nonce cookie was deleted
      expect(mockCookieStore.delete).toHaveBeenCalledWith('siwe-nonce')

      // Second request with same nonce fails (cookie no longer exists)
      mockCookieStore.get.mockReturnValue(undefined)

      const request2 = createMockRequest({
        message,
        signature: '0xvalidsignature',
      })

      const response2 = await POST(request2)
      const data2 = await response2.json()

      expect(response2.status).toBe(400)
      expect(data2.error).toBeDefined()
    })
  })

  describe('Input validation', () => {
    it('should reject missing message', async () => {
      mockCookieStore.get.mockReturnValue({ value: validNonce })

      const request = createMockRequest({
        signature: '0xvalidsignature',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('message')
    })

    it('should reject missing signature', async () => {
      mockCookieStore.get.mockReturnValue({ value: validNonce })

      const request = createMockRequest({
        message: createMockMessage(validNonce),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('signature')
    })
  })

  describe('Session creation', () => {
    it('should create session with address after successful verification', async () => {
      mockCookieStore.get.mockReturnValue({ value: validNonce })

      const message = createMockMessage(validNonce)
      const request = createMockRequest({
        message,
        signature: '0xvalidsignature',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.address).toBe(validAddress)
    })

    it('should store the exact signed message without trimming', async () => {
      mockCookieStore.get.mockReturnValue({ value: validNonce })
      const session = {
        address: null,
        siwe: null,
        expires: null,
        save: jest.fn(),
        destroy: jest.fn(),
      }
      ;(getSession as jest.Mock).mockResolvedValueOnce(session)

      const message = ` ${createMockMessage(validNonce)} `
      const request = createMockRequest({
        message,
        signature: '0xvalidsignature',
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(session.siwe).toEqual({
        message,
        signature: '0xvalidsignature',
        nonce: validNonce,
      })
    })
  })
})
