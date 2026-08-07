import { NextRequest } from 'next/server'
import { jsonNoStore, jsonNoStoreError } from '@/lib/api/responses'
import { verifySyncAuthorization } from '@/lib/api/sync-auth'
import { searingMaterializationService } from '@/lib/services/searing-materialization-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50
const MAX_TOKEN_IDS = 50

type BulkSyncBody = {
  limit?: unknown
  includeFailed?: unknown
  retryFailed?: unknown
  tokenIds?: unknown
}

function parseLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return DEFAULT_LIMIT
  return Math.min(Math.max(value, 1), MAX_LIMIT)
}

function parseTokenIds(value: unknown): number[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) return []

  const seen = new Set<number>()
  const tokenIds: number[] = []
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isInteger(item) || item <= 0) return []
    if (seen.has(item)) continue
    seen.add(item)
    tokenIds.push(item)
  }

  return tokenIds
}

export async function POST(request: NextRequest) {
  if (!verifySyncAuthorization(request)) {
    return jsonNoStoreError('Unauthorized', 401)
  }

  let body: BulkSyncBody = {}
  try {
    const parsed = await request.json()
    body = parsed && typeof parsed === 'object' ? parsed as BulkSyncBody : {}
  } catch {
    body = {}
  }

  const tokenIds = parseTokenIds(body.tokenIds)
  if (tokenIds && tokenIds.length === 0 && body.tokenIds !== undefined) {
    return jsonNoStoreError('tokenIds must be an array of positive integers', 400)
  }

  if (tokenIds && tokenIds.length > MAX_TOKEN_IDS) {
    return jsonNoStoreError(`Maximum ${MAX_TOKEN_IDS} tokenIds per request`, 400)
  }

  const limit = parseLimit(body.limit)
  const includeFailed = body.includeFailed === true || body.retryFailed === true

  try {
    const results = await searingMaterializationService.materializePendingBatch({
      limit,
      includeFailed,
      retryFailed: includeFailed,
      tokenIds,
    })

    return jsonNoStore({
      success: results.every((result) => result.status !== 'failed'),
      count: results.length,
      limit,
      includeFailed,
      results,
    })
  } catch (error) {
    return jsonNoStoreError(error instanceof Error ? error.message : 'Failed to sync searing events', 500)
  }
}
