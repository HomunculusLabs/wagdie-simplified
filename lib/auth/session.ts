/**
 * Session Configuration
 * Iron session setup for SIWE authentication
 */

import { randomBytes } from 'crypto'
import { getIronSession, IronSession } from 'iron-session'
import { cookies } from 'next/headers'
import type { UserSession } from '@/types/wallet'

const DEV_SESSION_SECRET = 'development_session_secret_at_least_32_characters_long'
const MIN_SESSION_SECRET_LENGTH = 32

function resolveSessionSecret(): string {
  const configuredSecret = process.env.SESSION_SECRET
  const hasConfiguredSecret = typeof configuredSecret === 'string' && configuredSecret.length > 0

  if (!hasConfiguredSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET is required in production')
    }

    return DEV_SESSION_SECRET
  }

  if (configuredSecret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters long`)
  }

  return configuredSecret
}

export const sessionOptions = {
  password: resolveSessionSecret(),
  cookieName: 'wagdie_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  },
}

export async function getSession(): Promise<IronSession<UserSession>> {
  const cookieStore = await cookies()
  return getIronSession<UserSession>(cookieStore, sessionOptions)
}

export function generateNonce(): string {
  return randomBytes(16).toString('hex')
}
