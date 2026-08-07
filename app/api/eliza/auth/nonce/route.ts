/**
 * Eliza Auth (User-Scoped SIWE) - Nonce Step
 * POST /api/eliza/auth/nonce
 *
 * 1) Requires an authenticated Wagdie session (session.address)
 * 2) Requests { nonce, sessionId } from legacy Eliza, or creates app-owned state in official mode
 * 3) Builds a SIWE message using app-owned createSIWEMessage()
 * 4) Stores SIWE state in session.eliza.siwe
 * 5) Returns { sessionId, nonce, message, issuedAt } for the client to sign
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSession, generateNonce } from '@/lib/auth/session'
import { getElizaClient } from '@/lib/eliza/client'
import { elizaConfig } from '@/lib/eliza/config'
import { createSIWEMessage } from '@/lib/eliza/siwe'
import { getTrustedSiweConfig } from '@/lib/auth/siwe-config'
import { withCsrfProtection } from '@/lib/middleware/csrf'
import { withRateLimit } from '@/lib/middleware/rate-limit'

type ElizaAuthNonceResponse = {
  sessionId: string
  nonce: string
  message: string
  issuedAt: string
}

type ErrorResponse = {
  error: string
  message: string
}

async function handlePost(
  request: NextRequest
): Promise<NextResponse<ElizaAuthNonceResponse | ErrorResponse>> {
  try {
    const session = await getSession()

    if (!session.address) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Wallet not connected' },
        { status: 401 }
      )
    }

    const isOfficialMode = elizaConfig.mode === 'official'

    // Step 1: get nonce/sessionId from legacy Eliza, or create WAGDIE-owned state
    // in official mode. The official ElizaOS service is server-to-server only and
    // is not part of the browser-facing SIWE challenge.
    const { nonce, sessionId } = isOfficialMode
      ? { nonce: generateNonce(), sessionId: `wagdie-official-${randomUUID()}` }
      : await getElizaClient().auth.getNonce()

    // Step 2: build the SIWE message for Eliza (client will sign this exact string)
    const issuedAt = new Date().toISOString()

    const siweConfig = getTrustedSiweConfig(request)

    // Note: `elizaConfig.baseUrl` is the Eliza API URL, but SIWE domain/uri should represent
    // the trusted requesting application, not request-spoofable host headers.
    void elizaConfig.baseUrl

    const message = createSIWEMessage({
      domain: siweConfig.domain,
      address: session.address,
      statement: 'Sign in to Eliza AI',
      uri: siweConfig.uri,
      chainId: siweConfig.chainId,
      nonce,
      issuedAt,
    })

    // Step 3: persist SIWE state in the Wagdie session for the verify step
    // Clear any stale tokens when generating a new nonce to ensure SIWE flow is authoritative
    session.eliza = {
      siwe: {
        nonce,
        sessionId,
        message,
        issuedAt,
      },
      tokens: undefined, // Clear stale tokens - user must complete SIWE flow
    }

    await session.save()

    return NextResponse.json({
      sessionId,
      nonce,
      message,
      issuedAt,
    })
  } catch (error) {
    console.error('[Eliza Auth] Nonce step failed:', error)

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to create Eliza SIWE nonce' },
      { status: 500 }
    )
  }
}

export const POST = withRateLimit(withCsrfProtection(handlePost))