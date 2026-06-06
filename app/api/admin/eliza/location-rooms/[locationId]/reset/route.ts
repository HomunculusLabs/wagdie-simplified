import { NextRequest, NextResponse } from 'next/server'
import { jsonNoStore, jsonNoStoreError } from '@/lib/api/responses'
import {
  LocationRoomAdminResetLocationNotFoundError,
  locationRoomAdminResetService,
  type LocationRoomAdminResetResult,
} from '@/lib/eliza/locationRooms/adminReset'
import { requireAdminNoStore } from '../../../gameplay/shared'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ locationId: string }>
}

function serializeResetResult(result: LocationRoomAdminResetResult) {
  return {
    message: 'Location room reset and reseeded successfully',
    location: result.location,
    previousRoomId: result.previousRoomId,
    room: {
      id: result.room.id,
      locationId: result.room.locationId,
      tickEnabled: result.room.tickEnabled,
      lastTickAt: result.room.lastTickAt,
      nextTickAt: result.room.nextTickAt,
      tickCount: result.room.tickCount,
      createdAt: result.room.createdAt,
      updatedAt: result.room.updatedAt,
    },
    narrativeState: {
      roomId: result.narrativeState.roomId,
      locationId: result.narrativeState.locationId,
      stateSummary: result.narrativeState.stateSummary,
      currentObjective: result.narrativeState.currentObjective,
      openThreads: result.narrativeState.openThreads,
      updatedAt: result.narrativeState.updatedAt,
    },
    adventure: {
      arcSummary: result.adventure.arcSummary,
      currentStakes: result.adventure.currentStakes,
      activeDecision: result.adventure.activeDecision,
      discoveries: result.adventure.discoveries,
      clocks: result.adventure.clocks,
    },
    catalogPresent: result.catalogPresent,
  }
}

export async function POST(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await requireAdminNoStore()
  if (!('address' in auth)) return auth

  const { locationId } = await context.params

  try {
    const result = await locationRoomAdminResetService.resetLocationRoom(locationId)
    return jsonNoStore(serializeResetResult(result))
  } catch (error) {
    if (error instanceof LocationRoomAdminResetLocationNotFoundError) {
      return jsonNoStoreError('Location not found', 404)
    }

    console.error('[Eliza Location Rooms] admin reset failed', error)
    return jsonNoStoreError('Failed to reset location room', 500)
  }
}
