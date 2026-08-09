import { NextRequest } from 'next/server'
import { syncStakingState } from '@/lib/services/sync/staking-state-sync'
import { parsePositiveIntArrayParam, uniqueNumbers } from '@/lib/api/params'
import { getErrorMessage, jsonNoStore, parseJsonBodyResult } from '@/lib/api/responses'
import { verifySyncAuthorization } from '@/lib/api/sync-auth'

export const dynamic = 'force-dynamic'

const MAX_TOKEN_IDS = 50

type SyncResult = {
  tokenId: number
  success: boolean
  locationId: string | null
  chainLocationId: string
  error?: string
}

export async function POST(request: NextRequest) {
  if (!verifySyncAuthorization(request)) {
    return jsonNoStore(
      { results: [], error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const bodyResult = await parseJsonBodyResult<unknown>(request)

  if (!bodyResult.ok) {
    return jsonNoStore(
      { results: [], error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const body = bodyResult.data
  const tokenIdParseResult = parsePositiveIntArrayParam((body as { tokenIds?: unknown })?.tokenIds, {
    fieldName: 'tokenIds',
    maxItems: MAX_TOKEN_IDS,
  })

  if (tokenIdParseResult.error) {
    return jsonNoStore(
      { results: [], error: tokenIdParseResult.error },
      { status: 400 }
    )
  }

  const uniqueTokenIds = uniqueNumbers(tokenIdParseResult.values)

  try {
    const { results: sharedResults } = await syncStakingState({
      tokenIds: uniqueTokenIds,
    })

    const results: SyncResult[] = sharedResults.map((r) => ({
      tokenId: r.tokenId,
      success: r.success,
      locationId: r.locationId,
      chainLocationId: r.chainLocationId,
      ...(r.error ? { error: r.error } : {}),
    }))

    return jsonNoStore({ results })
  } catch (err) {
    const message = getErrorMessage(err, 'Failed to sync staking status')
    return jsonNoStore(
      { results: [], error: message },
      { status: 500 }
    )
  }
}
