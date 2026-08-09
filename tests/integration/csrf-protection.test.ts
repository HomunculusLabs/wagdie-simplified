/**
 * Integration tests for CSRF protection on character update endpoint
 * Tests T034 [US4] - CSRF protection on state-changing endpoints
 */

import { NextRequest } from 'next/server'
import { PATCH } from '@/app/api/characters/[tokenId]/route'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/lib/middleware/csrf'

// Mock session
jest.mock('@/lib/auth/session', () => ({
  getSession: jest.fn().mockResolvedValue({
    address: '0x1234567890123456789012345678901234567890',
  }),
}))

// Mock character service
jest.mock('@/lib/services/character-service', () => ({
  getCharacter: jest.fn().mockResolvedValue({
    token_id: 123,
    owner_address: '0x1234567890123456789012345678901234567890',
    name: 'Test Character',
  }),
  updateCharacter: jest.fn().mockResolvedValue({
    token_id: 123,
    name: 'Updated Character',
  }),
}))

describe('CSRF Protection on Character Updates', () => {
  const validToken = 'valid-csrf-token-12345678'

  function createMockRequest(
    body: object,
    csrfCookie?: string,
    csrfHeader?: string,
    authHeader?: string
  ): NextRequest {
    const headers = new Headers()
    headers.set('Content-Type', 'application/json')

    const cookieParts: string[] = []
    if (csrfHeader) {
      headers.set(CSRF_HEADER_NAME, csrfHeader)
    }
    if (csrfCookie) {
      cookieParts.push(`${CSRF_COOKIE_NAME}=${csrfCookie}`)
    }
    if (authHeader) {
      headers.set('Authorization', authHeader)
    }
    if (cookieParts.length > 0) {
      headers.set('Cookie', cookieParts.join('; '))
    }

    return new NextRequest('https://example.com/api/characters/123', {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    })
  }

  const context = { params: Promise.resolve({ tokenId: '123' }) }

  it('should reject PATCH request without CSRF token', async () => {
    const request = createMockRequest({ name: 'New Name' })

    const response = await PATCH(request, context)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toContain('CSRF')
  })

  it('should reject PATCH request with mismatched CSRF tokens', async () => {
    const request = createMockRequest(
      { name: 'New Name' },
      'cookie-token',
      'different-header-token'
    )

    const response = await PATCH(request, context)

    expect(response.status).toBe(403)
  })

  it('should allow PATCH request with valid matching CSRF tokens', async () => {
    const request = createMockRequest(
      { name: 'New Name' },
      validToken,
      validToken
    )

    const response = await PATCH(request, context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.name).toBe('Updated Character')
  })

  it('should not bypass CSRF for cookie-authenticated routes just because Authorization is present', async () => {
    const request = createMockRequest(
      { name: 'New Name' },
      undefined,
      undefined,
      'Bearer api-token-12345'
    )

    const response = await PATCH(request, context)

    expect(response.status).toBe(403)
  })
})
