import { NextRequest } from 'next/server'
import { generateNonce } from '@/lib/auth/siwe'
import { cookies } from 'next/headers'
import { jsonRaw, jsonRawError } from '@/lib/api/responses'
import { getTrustedSiweConfig } from '@/lib/auth/siwe-config'
import { withRateLimit } from '@/lib/middleware/rate-limit'
import { CSRF_COOKIE_NAME, csrfCookieOptions, generateCsrfToken } from '@/lib/middleware/csrf'

async function handleNonceRequest(request: NextRequest) {
  try {
    const nonce = generateNonce()
    const siweConfig = getTrustedSiweConfig(request)

    // Store nonce in cookie for verification
    const cookieStore = await cookies()
    cookieStore.set('siwe-nonce', nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 5, // 5 minutes
      path: '/',
    })

    const csrfToken = cookieStore.get(CSRF_COOKIE_NAME)?.value || generateCsrfToken()
    cookieStore.set(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions)

    return jsonRaw({ nonce, ...siweConfig })
  } catch (error) {
    console.error('Nonce generation error:', error)
    return jsonRawError('Failed to generate nonce', 500)
  }
}

// Support both GET and POST requests
export const GET = withRateLimit(handleNonceRequest)
export const POST = withRateLimit(handleNonceRequest)
