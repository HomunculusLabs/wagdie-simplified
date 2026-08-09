/**
 * CSRF Protection Middleware
 * Implements double-submit cookie pattern for state-changing requests
 *
 * T035-T042: CSRF protection implementation for US4
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateSecureToken } from '@/lib/utils/crypto'
import { logCsrfFailure, getClientIp } from '@/lib/utils/audit-logger'

export const CSRF_COOKIE_NAME = 'csrf-token'
export const CSRF_HEADER_NAME = 'X-CSRF-Token'

/**
 * T035: Generate a CSRF token using secure random generation
 */
export function generateCsrfToken(): string {
  return generateSecureToken()
}

/**
 * T036: Validate CSRF token by comparing cookie vs header
 * Uses the double-submit cookie pattern
 */
export function validateCsrfToken(request: NextRequest): boolean {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value
  const headerToken = request.headers.get(CSRF_HEADER_NAME)

  if (!cookieToken || !headerToken) {
    return false
  }

  // Constant-time comparison would be ideal here, but since we're
  // comparing tokens we generated and they're random, timing attacks
  // aren't as critical. Still, use strict equality.
  return cookieToken === headerToken
}

/**
 * T037: Check if CSRF should be bypassed for API clients
 * Requests with Authorization header are considered API requests
 * and bypass CSRF (they have their own auth mechanism)
 */
export function shouldBypassCsrf(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization')
  return !!authHeader && authHeader.length > 0
}

/**
 * T038: Middleware wrapper for route handlers with CSRF protection
 */
export type CsrfProtectionOptions = {
  bypassAuthorizationHeader?: boolean
}

export function withCsrfProtection<P extends Record<string, string> = Record<string, string>>(
  handler: (
    request: NextRequest,
    context?: { params: Promise<P> }
  ) => Promise<NextResponse>,
  options: CsrfProtectionOptions = {}
) {
  return async (
    request: NextRequest,
    context?: { params: Promise<P> }
  ): Promise<NextResponse> => {
    // T037: Bypass CSRF only for routes that explicitly validate Authorization credentials.
    if (options.bypassAuthorizationHeader && shouldBypassCsrf(request)) {
      return handler(request, context)
    }

    // Validate CSRF token
    if (!validateCsrfToken(request)) {
      const ip = getClientIp(request.headers)

      // T042: Audit logging for CSRF validation failures
      logCsrfFailure(ip, request.nextUrl.pathname, {
        reason: 'token_invalid_or_missing',
        hasHeader: !!request.headers.get(CSRF_HEADER_NAME),
        hasCookie: !!request.cookies.get(CSRF_COOKIE_NAME),
      })

      return new NextResponse(
        JSON.stringify({ error: 'Invalid or missing CSRF token' }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    }

    return handler(request, context)
  }
}

/**
 * Cookie options for setting CSRF token
 */
export const csrfCookieOptions = {
  httpOnly: false, // Must be readable by JavaScript to send in header
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24, // 24 hours
}
