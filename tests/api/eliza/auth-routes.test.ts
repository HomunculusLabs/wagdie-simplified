/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { POST as nonceHandler } from '@/app/api/eliza/auth/nonce/route'
import { POST as verifyHandler } from '@/app/api/eliza/auth/verify/route'
import { GET as authStatusHandler } from '@/app/api/eliza/auth/route'
import { getSession } from '@/lib/auth/session'
import { getElizaClient } from '@/lib/eliza/client'
import { elizaConfig } from '@/lib/eliza/config'
import { validateSiweMessageFields, verifySiweMessage } from '@/lib/auth/siwe'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/lib/middleware/csrf'
import { getOfficialElizaUserIdForWallet } from '@/lib/eliza/authBridge'

jest.mock('@/lib/auth/session', () => ({
  getSession: jest.fn(),
  generateNonce: jest.fn(() => 'app-nonce-1'),
}))
jest.mock('@/lib/eliza/client', () => ({ getElizaClient: jest.fn() }))
jest.mock('@/lib/auth/siwe', () => ({
  validateSiweMessageFields: jest.fn(() => ({ ok: true })),
  verifySiweMessage: jest.fn(),
}))

function request(url: string, body?: unknown) {
  const csrfToken = 'valid-csrf-token'
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      host: 'wagdie.example',
      [CSRF_HEADER_NAME]: csrfToken,
      Cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

describe('Eliza auth routes', () => {
  const originalMode = elizaConfig.mode

  beforeEach(() => {
    jest.clearAllMocks()
    elizaConfig.mode = 'legacy'
  })

  afterAll(() => {
    elizaConfig.mode = originalMode
  })

  it('nonce route calls gateway auth.getNonce and stores app-owned SIWE state', async () => {
    const save = jest.fn()
    const session: any = { address: '0x0000000000000000000000000000000000000abc', save }
    ;(getSession as jest.Mock).mockResolvedValueOnce(session)
    ;(getElizaClient as jest.Mock).mockReturnValue({
      auth: { getNonce: jest.fn().mockResolvedValueOnce({ nonce: 'nonce-1', sessionId: 'session-1' }) },
    })

    const response = await nonceHandler(request('https://wagdie.example/api/eliza/auth/nonce'))

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toMatchObject({ nonce: 'nonce-1', sessionId: 'session-1' })
    expect(data.message).toContain('wagdie.example wants you to sign in')
    expect(session.eliza.siwe).toMatchObject({ nonce: 'nonce-1', sessionId: 'session-1' })
    expect(session.eliza.tokens).toBeUndefined()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('verify route calls gateway auth.verify and persists normalized tokens', async () => {
    const save = jest.fn()
    const session: any = {
      address: '0x0000000000000000000000000000000000000abc',
      eliza: { siwe: { message: 'siwe-message', sessionId: 'session-1', nonce: 'nonce-1', issuedAt: '2026-05-10T00:00:00.000Z' } },
      save,
    }
    const verify = jest.fn().mockResolvedValueOnce({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 60_000,
    })

    ;(getSession as jest.Mock).mockResolvedValueOnce(session)
    ;(getElizaClient as jest.Mock).mockReturnValue({ auth: { verify } })

    const response = await verifyHandler(request('https://wagdie.example/api/eliza/auth/verify', { signature: '0xsig' }))

    expect(response.status).toBe(200)
    expect(validateSiweMessageFields).toHaveBeenCalledWith('siwe-message', {
      nonce: 'nonce-1',
      domain: 'wagdie.example',
      uri: 'https://wagdie.example',
      chainId: 1,
      address: session.address,
    })
    expect(verify).toHaveBeenCalledWith('siwe-message', '0xsig', 'session-1')
    expect(session.eliza.tokens).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      mode: 'legacy',
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('official nonce route creates WAGDIE-owned SIWE state without calling ElizaOS auth', async () => {
    elizaConfig.mode = 'official'

    const save = jest.fn()
    const session: any = { address: '0x0000000000000000000000000000000000000abc', save }
    ;(getSession as jest.Mock).mockResolvedValueOnce(session)

    const response = await nonceHandler(request('https://wagdie.example/api/eliza/auth/nonce'))

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toMatchObject({ nonce: 'app-nonce-1' })
    expect(data.sessionId).toMatch(/^wagdie-official-/)
    expect(data.message).toContain('wagdie.example wants you to sign in')
    expect(session.eliza.siwe).toMatchObject({ nonce: 'app-nonce-1', sessionId: data.sessionId })
    expect(session.eliza.tokens).toBeUndefined()
    expect(getElizaClient).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('official verify route issues an opaque WAGDIE app token and stores wallet-derived official user id', async () => {
    elizaConfig.mode = 'official'

    const save = jest.fn()
    const address = '0x0000000000000000000000000000000000000abc'
    const session: any = {
      address,
      expires: Date.now() + 60 * 60 * 1000,
      eliza: {
        siwe: {
          message: 'siwe-message',
          sessionId: 'wagdie-official-session',
          nonce: 'app-nonce-1',
          issuedAt: '2026-05-10T00:00:00.000Z',
        },
      },
      save,
    }

    ;(getSession as jest.Mock).mockResolvedValueOnce(session)
    ;(verifySiweMessage as jest.Mock).mockResolvedValueOnce({ success: true, address })

    const response = await verifyHandler(request('https://wagdie.example/api/eliza/auth/verify', { signature: '0xsig' }))

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.accessToken).toMatch(/^wagdie_eliza_/)
    expect(data).not.toHaveProperty('officialUserId')
    expect(getElizaClient).not.toHaveBeenCalled()
    expect(verifySiweMessage).toHaveBeenCalledWith('siwe-message', '0xsig', {
      nonce: 'app-nonce-1',
      domain: 'wagdie.example',
      uri: 'https://wagdie.example',
      chainId: 1,
      address,
    })
    expect(session.eliza.tokens).toMatchObject({
      accessToken: data.accessToken,
      mode: 'official',
      officialUserId: getOfficialElizaUserIdForWallet(address),
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('official auth status returns the app token without exposing official credentials', async () => {
    elizaConfig.mode = 'official'

    const address = '0x0000000000000000000000000000000000000abc'
    ;(getSession as jest.Mock).mockResolvedValueOnce({
      address,
      eliza: {
        tokens: {
          accessToken: 'wagdie_eliza_token',
          expiresAt: Date.now() + 60 * 60 * 1000,
          mode: 'official',
          officialUserId: getOfficialElizaUserIdForWallet(address),
        },
      },
    })

    const response = await authStatusHandler()

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toMatchObject({ accessToken: 'wagdie_eliza_token' })
    expect(data).not.toHaveProperty('officialUserId')
    expect(data).not.toHaveProperty('apiKey')
  })

  it('official auth status rejects stale legacy tokens', async () => {
    elizaConfig.mode = 'official'

    ;(getSession as jest.Mock).mockResolvedValueOnce({
      address: '0x0000000000000000000000000000000000000abc',
      eliza: {
        tokens: {
          accessToken: 'legacy-token',
          expiresAt: Date.now() + 60 * 60 * 1000,
          mode: 'legacy',
        },
      },
    })

    const response = await authStatusHandler()

    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toBe('NO_TOKEN')
  })
})
