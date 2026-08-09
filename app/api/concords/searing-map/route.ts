import { NextRequest } from 'next/server'
import { jsonRaw, jsonRawError } from '@/lib/api/responses'
import { parseCsvNumberList, parseLimitOffsetParams, parseTokenIdParam } from '@/lib/api/params'
import { requireAdmin, isAuthError } from '@/lib/api/auth'
import { concordSearingMapService } from '@/lib/services/concord-searing-map-service'
import { parseConcordSearingMapUpsert } from '@/lib/domain/searing'

function parseConcordTokenIds(searchParams: URLSearchParams): number[] | undefined {
  const tokenId = searchParams.get('token_id') ?? searchParams.get('concord_id')
  if (tokenId) {
    const parsed = parseTokenIdParam(tokenId, { min: 0 })
    return parsed === null ? [] : [parsed]
  }

  const tokenIds = searchParams.get('token_ids') ?? searchParams.get('concord_ids')
  if (tokenIds) {
    return [...new Set(parseCsvNumberList(tokenIds, { min: 0 }))]
  }

  return undefined
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const concordTokenIds = parseConcordTokenIds(searchParams)

  if (concordTokenIds && concordTokenIds.length === 0) {
    return jsonRawError('Invalid concord token ID filter', 400)
  }

  const { limit, offset } = parseLimitOffsetParams(searchParams, {
    defaultLimit: 500,
    maxLimit: 2000,
  })
  const tokenName = searchParams.get('token_name') || undefined

  try {
    const result = await concordSearingMapService.getSearingMap({
      concordTokenIds,
      tokenName,
      limit,
      offset,
    })

    return jsonRaw({
      searingMap: result.entries,
      total: result.total,
      count: result.entries.length,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Failed to fetch concord searing map:', error)
    return jsonRawError('Failed to fetch concord searing map', 500)
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (isAuthError(auth)) return auth

  const parsed = parseConcordSearingMapUpsert(await readJson(request))
  if (!parsed.entry) {
    return jsonRawError(parsed.error ?? 'Invalid Concord searing map', 400)
  }

  try {
    const entry = await concordSearingMapService.upsertSearingMap(parsed.entry)
    return jsonRaw({ searingMap: entry }, { status: 201 })
  } catch (error) {
    console.error('Failed to save concord searing map:', error)
    return jsonRawError('Failed to save concord searing map', 500)
  }
}
