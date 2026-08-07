/**
 * Backwards-compatible Character Detail API Route (singular)
 *
 * Alias for `/api/characters/[tokenId]` to support older clients expecting `/api/character/:tokenId`.
 * Uses the same shared handler to ensure consistent behavior.
 */

import { NextRequest } from 'next/server'
import { handleCharacterGet, handleCharacterPatch } from '@/lib/api/handlers/character-update'
import { withCsrfProtection } from '@/lib/middleware/csrf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ tokenId: string }> }
) {
  const params = await context.params
  const tokenId = parseInt(params.tokenId, 10)
  return handleCharacterGet(tokenId)
}

async function handlePatch(
  request: NextRequest,
  context?: { params: Promise<{ tokenId: string }> }
) {
  const params = await context!.params
  const tokenId = parseInt(params.tokenId, 10)
  return handleCharacterPatch(request, tokenId)
}

const protectedPatch = withCsrfProtection(handlePatch)

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tokenId: string }> }
) {
  return protectedPatch(request, context)
}
