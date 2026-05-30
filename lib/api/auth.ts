/**
 * API Authentication Helpers
 * Server-side auth utilities for Next.js API routes
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { isAdmin } from '@/lib/auth/admin'
import { jsonUnauthorized, jsonForbidden, type ApiResponse } from './responses'

export interface AuthResult {
  address: string
}

export type AuthError = NextResponse<ApiResponse>

/**
 * Require authenticated session
 * Returns the wallet address or an error response
 */
export async function requireAuth(): Promise<AuthResult | AuthError> {
  const session = await getSession()

  if (!session.address) {
    return jsonUnauthorized()
  }

  return { address: session.address }
}

/**
 * Require admin authentication
 * Returns the wallet address or an error response
 */
export async function requireAdmin(): Promise<AuthResult | AuthError> {
  const session = await getSession()

  if (!session.address) {
    return jsonUnauthorized()
  }

  if (!isAdmin(session.address)) {
    return jsonForbidden()
  }

  return { address: session.address }
}

/**
 * Type guard to check if result is an error response
 */
export function isAuthError(result: AuthResult | AuthError): result is AuthError {
  return !result || typeof result !== 'object' || !('address' in result)
}
