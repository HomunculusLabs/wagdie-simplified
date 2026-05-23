import { NextRequest, NextResponse } from 'next/server'
import { jsonNoStore } from '@/lib/api/responses'
import { locationRoomGameplayAdminService } from '@/lib/eliza/locationRooms/gameplay/adminService'
import {
  gameplayAdminErrorResponse,
  requireAdminNoStore,
  serializeGameplayInspection,
} from '../../../gameplay/shared'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ locationId: string }>
}

const DEFAULT_TURN_LIMIT = 10
const MAX_TURN_LIMIT = 50

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_TURN_LIMIT
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return DEFAULT_TURN_LIMIT
  return Math.max(1, Math.min(MAX_TURN_LIMIT, parsed))
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await requireAdminNoStore()
  if (auth instanceof NextResponse) return auth

  const { locationId } = await context.params
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'))

  try {
    const inspection = await locationRoomGameplayAdminService.inspectRoomGameplay(locationId, limit)
    return jsonNoStore(serializeGameplayInspection(inspection))
  } catch (error) {
    return gameplayAdminErrorResponse(error, 'Failed to load location room gameplay state')
  }
}
