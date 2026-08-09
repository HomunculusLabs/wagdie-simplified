import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

function constantTimeEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)

  if (actualBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(actualBuffer, expectedBuffer)
}

/**
 * Verify the sync secret key for authorization.
 * Supports Authorization bearer tokens and ?secret= query parameters.
 */
export function verifySyncAuthorization(request: NextRequest): boolean {
  const syncSecret = process.env.SYNC_SECRET_KEY

  if (!syncSecret) {
    console.error('SYNC_SECRET_KEY not configured')
    return false
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length)
    if (constantTimeEquals(token, syncSecret)) {
      return true
    }
  }

  const querySecret = request.nextUrl.searchParams.get('secret')
  if (querySecret !== null && constantTimeEquals(querySecret, syncSecret)) {
    return true
  }

  return false
}
