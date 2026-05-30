import { NextRequest, NextResponse } from 'next/server'
import { jsonNoStore, jsonNoStoreError } from '@/lib/api/responses'
import { locationRoomAdminDiagnosticsService } from '@/lib/eliza/locationRooms/adminDiagnostics'
import { requireAdminNoStore } from '../../../gameplay/shared'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ locationId: string }>
}

export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await requireAdminNoStore()
  if (!('address' in auth)) return auth

  const { locationId } = await context.params

  try {
    const diagnostics = await locationRoomAdminDiagnosticsService.inspectLocation(locationId)
    return jsonNoStore(diagnostics)
  } catch (error) {
    console.error('[Eliza Location Rooms] admin health diagnostics failed', error)
    return jsonNoStoreError('Failed to load location room health diagnostics', 500)
  }
}
