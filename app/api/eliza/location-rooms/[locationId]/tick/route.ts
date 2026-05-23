import { NextRequest } from 'next/server'
import { requireAuth, isAuthError } from '@/lib/api/auth'
import { isAdmin } from '@/lib/auth/admin'
import { jsonNoStore, jsonNoStoreError } from '@/lib/api/responses'
import {
  LocationRoomFeatureDisabledError,
  LocationRoomForbiddenError,
  LocationRoomGameplayConfigError,
  LocationRoomInsufficientParticipantsError,
  LocationRoomManualCooldownError,
  LocationRoomNarrativeConfigError,
  LocationRoomNotFoundError,
  LocationRoomOfficialServiceDisabledError,
  LocationRoomTickDisabledError,
  locationRoomService,
} from '@/lib/eliza/locationRooms/service'

interface RouteContext {
  params: Promise<{ locationId: string }>
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth

  const { locationId } = await context.params
  const actor = isAdmin(auth.address) ? 'admin' : 'owner'

  try {
    const result = await locationRoomService.requestTickAndProcess(locationId, {
      actor,
      walletAddress: auth.address,
    })

    const status = result.processing.attempted ? 200 : 202
    return jsonNoStore({
      success: true,
      queued: true,
      ...result,
    }, { status })
  } catch (error) {
    if (error instanceof LocationRoomNotFoundError) {
      return jsonNoStoreError('Location not found', 404)
    }

    if (error instanceof LocationRoomForbiddenError) {
      return jsonNoStoreError('Wallet does not own an eligible participant at this location', 403)
    }

    if (error instanceof LocationRoomInsufficientParticipantsError) {
      return jsonNoStoreError('At least two eligible participants are required', 409)
    }

    if (error instanceof LocationRoomManualCooldownError) {
      return jsonNoStoreError('Location room manual trigger is cooling down', 429, {
        headers: { 'Retry-After': String(error.retryAfterSeconds) },
      })
    }

    if (error instanceof LocationRoomFeatureDisabledError) {
      return jsonNoStoreError('Eliza location rooms are disabled', 503)
    }

    if (error instanceof LocationRoomOfficialServiceDisabledError) {
      return jsonNoStoreError('Official ElizaOS service is not configured', 503)
    }

    if (error instanceof LocationRoomNarrativeConfigError) {
      return jsonNoStoreError('Location room narrative game-master agent is not configured', 503)
    }

    if (error instanceof LocationRoomGameplayConfigError) {
      return jsonNoStoreError(error.message, 503)
    }

    if (error instanceof LocationRoomTickDisabledError) {
      return jsonNoStoreError('Location room ticks are disabled', 503)
    }

    console.error('[Eliza Location Rooms] manual tick request failed', error)
    return jsonNoStoreError('Failed to queue or process location room tick', 500)
  }
}
