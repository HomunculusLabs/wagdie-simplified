import { NextRequest } from 'next/server'
import { jsonRaw, jsonRawError } from '@/lib/api/responses'
import { parseTokenIdParam } from '@/lib/api/params'
import { requireAdmin, isAuthError } from '@/lib/api/auth'
import { concordSearingMapService } from '@/lib/services/concord-searing-map-service'
import { parseConcordSearingMapUpsert } from '@/lib/domain/searing'

type RouteContext = {
  params: Promise<{ concordId: string }>
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

async function parseConcordId(context: RouteContext): Promise<number | null> {
  const params = await context.params
  return parseTokenIdParam(params.concordId, { min: 1 })
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin()
  if (isAuthError(auth)) return auth

  const concordId = await parseConcordId(context)
  if (concordId === null) {
    return jsonRawError('Invalid Concord token ID', 400)
  }

  const parsed = parseConcordSearingMapUpsert(await readJson(request), concordId)
  if (!parsed.entry) {
    return jsonRawError(parsed.error ?? 'Invalid Concord searing map', 400)
  }

  if (parsed.entry.concord_token_id !== concordId) {
    return jsonRawError('Body Concord token ID must match route Concord token ID', 400)
  }

  try {
    const entry = await concordSearingMapService.upsertSearingMap(parsed.entry)
    return jsonRaw({ searingMap: entry })
  } catch (error) {
    console.error('Failed to update concord searing map:', error)
    return jsonRawError('Failed to update concord searing map', 500)
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin()
  if (isAuthError(auth)) return auth

  const concordId = await parseConcordId(context)
  if (concordId === null) {
    return jsonRawError('Invalid Concord token ID', 400)
  }

  try {
    await concordSearingMapService.deleteSearingMap(concordId)
    return jsonRaw({ message: 'Concord searing map deleted successfully' })
  } catch (error) {
    console.error('Failed to delete concord searing map:', error)
    return jsonRawError('Failed to delete concord searing map', 500)
  }
}
