/**
 * Eliza Auth (User-Scoped SIWE) - Verify Step
 * POST /api/eliza/auth/verify
 *
 * 1) Requires an authenticated Wagdie session (session.address)
 * 2) Requires session.eliza.siwe to exist (set by /api/eliza/auth/nonce)
 * 3) Accepts POST body with { signature }
 * 4) Legacy mode calls elizaClient.auth.verify(); official mode verifies SIWE in WAGDIE
 * 5) Stores returned legacy tokens or an official-mode WAGDIE app gate token in session.eliza.tokens
 * 6) Returns { accessToken, expiresAt } (TokenResponse)
 *
 * If verification fails, clears the stored Eliza SIWE state to avoid replay / stale sessions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getElizaClient } from '@/lib/eliza/client'
import { elizaConfig } from '@/lib/eliza/config'
import { normalizeExpiresAt } from '@/lib/eliza/sessionAuth'
import { validateSiweMessageFields, verifySiweMessage } from '@/lib/auth/siwe'
import { getTrustedSiweConfig } from '@/lib/auth/siwe-config'
import { withCsrfProtection } from '@/lib/middleware/csrf'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import {
  createWagdieElizaAppAccessToken,
  getOfficialElizaAppTokenExpiresAt,
  getOfficialElizaUserIdForWallet,
} from '@/lib/eliza/authBridge'
import type { TokenResponse, ErrorResponse } from '@/types/eliza'

type VerifyRequestBody = {
  signature: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

async function handlePost(
  request: NextRequest
): Promise<NextResponse<TokenResponse | ErrorResponse>> {
  let session: Awaited<ReturnType<typeof getSession>> | null = null
  let attemptedVerify = false

  try {
    session = await getSession()

    if (!session.address) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Wallet not connected' },
        { status: 401 }
      )
    }

    if (!session.eliza?.siwe) {
      return NextResponse.json(
        {
          error: 'MISSING_SIWE_STATE',
          message: 'Eliza SIWE state not found. Call /api/eliza/auth/nonce first.',
        },
        { status: 409 }
      )
    }

    const body: unknown = await request.json()
    const signature = (body as VerifyRequestBody | undefined)?.signature

    if (!isNonEmptyString(signature)) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'signature is required' },
        { status: 400 }
      )
    }

    const { message, sessionId, nonce } = session.eliza.siwe
    const siweConfig = getTrustedSiweConfig(request)
    const expectedSiweFields = {
      nonce,
      domain: siweConfig.domain,
      uri: siweConfig.uri,
      chainId: siweConfig.chainId,
      address: session.address,
    }

    attemptedVerify = true

    if (elizaConfig.mode === 'official') {
      const verification = await verifySiweMessage(message, signature, expectedSiweFields)
      const verifiedAddress = verification.address?.toLowerCase()
      const sessionAddress = session.address.toLowerCase()

      if (!verification.success || !verifiedAddress || verifiedAddress !== sessionAddress) {
        session.eliza = undefined
        await session.save()

        return NextResponse.json(
          { error: 'AUTH_FAILED', message: 'Authentication with Eliza failed' },
          { status: 401 }
        )
      }

      const expiresAtMs = getOfficialElizaAppTokenExpiresAt(session.expires)

      if (!expiresAtMs) {
        return NextResponse.json(
          { error: 'TOKEN_EXPIRED', message: 'Eliza token expired. Please re-authenticate.' },
          { status: 401 }
        )
      }

      const accessToken = createWagdieElizaAppAccessToken()
      const officialUserId = getOfficialElizaUserIdForWallet(session.address)

      session.eliza = {
        ...(session.eliza || {}),
        siwe: session.eliza.siwe,
        tokens: {
          accessToken,
          expiresAt: expiresAtMs,
          mode: 'official',
          officialUserId,
        },
      }

      await session.save()

      return NextResponse.json({
        accessToken,
        expiresAt: new Date(expiresAtMs).toISOString(),
      })
    }

    const fieldValidation = validateSiweMessageFields(message, expectedSiweFields)
    if (!fieldValidation.ok) {
      session.eliza = undefined
      await session.save()

      return NextResponse.json(
        { error: 'AUTH_FAILED', message: 'Authentication with Eliza failed' },
        { status: 401 }
      )
    }

    const elizaClient = getElizaClient()
    const tokens = await elizaClient.auth.verify(message, signature, sessionId)

    // Normalize expiresAt to ms epoch
    const expiresAtMs = normalizeExpiresAt(tokens.expiresAt)

    session.eliza = {
      ...(session.eliza || {}),
      siwe: session.eliza.siwe,
      tokens: {
        accessToken: tokens.accessToken,
        expiresAt: expiresAtMs,
        mode: 'legacy',
        // Persist refreshToken when present for future refresh support
        ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
      },
    }

    await session.save()

    return NextResponse.json({
      accessToken: tokens.accessToken,
      expiresAt: new Date(expiresAtMs).toISOString(),
    })
  } catch (error) {
    console.error('[Eliza Auth] Verify step failed:', error)

    // IMPORTANT: Clear SIWE state if verification failed (avoid replay/stale state)
    if (session && attemptedVerify && session.eliza?.siwe) {
      try {
        session.eliza = undefined
        await session.save()
      } catch (saveError) {
        console.error('[Eliza Auth] Failed to clear SIWE state after verify error:', saveError)
      }
    }

    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.toLowerCase().includes('unauthorized')) {
        return NextResponse.json(
          { error: 'AUTH_FAILED', message: 'Authentication with Eliza failed' },
          { status: 401 }
        )
      }
    }

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to verify Eliza SIWE signature' },
      { status: 500 }
    )
  }
}

export const POST = withRateLimit(withCsrfProtection(handlePost))