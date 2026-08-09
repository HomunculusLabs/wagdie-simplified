import { NextRequest } from 'next/server'
import { SiweMessage } from 'siwe'
import { verifySiweMessage, upsertUser } from '@/lib/auth/siwe'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth/session'
import { jsonRaw, jsonRawError } from '@/lib/api/responses'
import { getTrustedSiweConfig } from '@/lib/auth/siwe-config'
import { withCsrfProtection } from '@/lib/middleware/csrf'
import { withRateLimit } from '@/lib/middleware/rate-limit'

interface VerifyBody {
  message?: unknown
  signature?: unknown
}

function parseRequiredString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function extractNonce(message: string): string | null {
  try {
    return new SiweMessage(message).nonce || null
  } catch {
    return null
  }
}

async function handlePost(request: NextRequest) {
  try {
    const body = await request.json() as VerifyBody
    const message = parseRequiredString(body.message)
    const signature = parseRequiredString(body.signature)

    if (!message || !signature) {
      return jsonRawError('Missing message or signature', 400)
    }

    // Get nonce from cookie
    const cookieStore = await cookies()
    const nonce = cookieStore.get('siwe-nonce')?.value

    if (!nonce) {
      return jsonRawError('No nonce found. Please request a new one.', 400)
    }

    const messageNonce = extractNonce(message)
    if (!messageNonce || messageNonce !== nonce) {
      return jsonRawError('Invalid nonce', 401)
    }

    // Verify the SIWE message against trusted app configuration
    const siweConfig = getTrustedSiweConfig(request)
    const verification = await verifySiweMessage(message, signature, {
      nonce,
      domain: siweConfig.domain,
      uri: siweConfig.uri,
      chainId: siweConfig.chainId,
    })

    if (!verification.success || !verification.address) {
      return jsonRawError(verification.error || 'Verification failed', 401)
    }

    // Create or update user in database
    const { data: user, error: dbError } = await upsertUser(verification.address)

    if (dbError) {
      console.error('Database error:', dbError)
      return jsonRawError('Failed to save user data', 500)
    }

    // Clear the nonce cookie
    cookieStore.delete('siwe-nonce')

    // Set iron-session with user data
    const session = await getSession()
    session.address = verification.address
    session.siwe = {
      message,
      signature,
      nonce,
    }
    session.expires = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    await session.save()

    // Also set the simple siwe-session cookie for backwards compatibility
    cookieStore.set('siwe-session', verification.address, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })

    return jsonRaw({
      success: true,
      address: verification.address,
      user,
    })
  } catch (error) {
    console.error('Verification error:', error)
    return jsonRawError('Verification failed', 500)
  }
}

export const POST = withRateLimit(withCsrfProtection(handlePost))
