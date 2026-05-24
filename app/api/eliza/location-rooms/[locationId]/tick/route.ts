import { NextRequest } from 'next/server'
import type { LocationRoomTurnIntent } from '@/lib/eliza/locationRooms/types'
import { requireAuth, isAuthError } from '@/lib/api/auth'
import { isAdmin } from '@/lib/auth/admin'
import { jsonNoStore, jsonNoStoreError } from '@/lib/api/responses'
import {
  LocationRoomFeatureDisabledError,
  LocationRoomForbiddenError,
  LocationRoomGameplayConfigError,
  LocationRoomInsufficientParticipantsError,
  LocationRoomManualCooldownError,
  LocationRoomManualTickIntentForbiddenError,
  LocationRoomNarrativeConfigError,
  LocationRoomNotFoundError,
  LocationRoomOfficialServiceDisabledError,
  LocationRoomTickDisabledError,
  locationRoomService,
} from '@/lib/eliza/locationRooms/service'

interface RouteContext {
  params: Promise<{ locationId: string }>
}

const TICK_INTENTS = new Set<LocationRoomTurnIntent>(['auto', 'story', 'combat'])

async function readTickIntent(request: NextRequest): Promise<LocationRoomTurnIntent> {
  const body = await request.text()
  if (!body.trim()) return 'auto'

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new Error('invalid_json')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid_body')
  }

  const intent = (parsed as { intent?: unknown }).intent
  if (intent == null) return 'auto'
  if (typeof intent === 'string' && TICK_INTENTS.has(intent as LocationRoomTurnIntent)) {
    return intent as LocationRoomTurnIntent
  }

  throw new Error('invalid_intent')
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth

  const { locationId } = await context.params
  const actor = isAdmin(auth.address) ? 'admin' : 'owner'

  let intent: LocationRoomTurnIntent
  try {
    intent = await readTickIntent(request)
  } catch {
    return jsonNoStoreError('Manual tick body must be JSON with optional intent: auto, story, or combat', 400)
  }

  try {
    const result = await locationRoomService.requestTickAndProcess(locationId, {
      actor,
      walletAddress: auth.address,
      intent,
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

    if (error instanceof LocationRoomManualTickIntentForbiddenError) {
      return jsonNoStoreError('Combat tick intent is admin-only', 403)
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
