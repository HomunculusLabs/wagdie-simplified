import { NextRequest } from 'next/server'
import { jsonRaw, jsonRawError } from '@/lib/api/responses'
import { verifySyncAuthorization } from '@/lib/api/sync-auth'
import {
  LocationRoomFeatureDisabledError,
  LocationRoomGameplayConfigError,
  LocationRoomNarrativeConfigError,
  LocationRoomOfficialServiceDisabledError,
  locationRoomService,
} from '@/lib/eliza/locationRooms/service'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  return handleSync(request)
}

export async function POST(request: NextRequest) {
  return handleSync(request)
}

async function handleSync(request: NextRequest) {
  if (!verifySyncAuthorization(request)) {
    return jsonRawError('Unauthorized', 401)
  }

  try {
    const result = await locationRoomService.runScheduledWorker()
    return jsonRaw({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    if (error instanceof LocationRoomFeatureDisabledError) {
      return jsonRaw(
        { success: false, error: 'Eliza location rooms are disabled' },
        { status: 503 }
      )
    }

    if (error instanceof LocationRoomOfficialServiceDisabledError) {
      return jsonRaw(
        { success: false, error: 'Official ElizaOS service is not configured' },
        { status: 503 }
      )
    }

    if (error instanceof LocationRoomNarrativeConfigError) {
      return jsonRaw(
        { success: false, error: 'Location room narrative game-master agent is not configured' },
        { status: 503 }
      )
    }

    if (error instanceof LocationRoomGameplayConfigError) {
      return jsonRaw(
        { success: false, error: error.message },
        { status: 503 }
      )
    }

    console.error('[Eliza Location Rooms Sync] Error:', error)
    return jsonRaw(
      {
        success: false,
        error: 'Eliza location room sync failed',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
