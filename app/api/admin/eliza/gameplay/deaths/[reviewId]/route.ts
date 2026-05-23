import { NextRequest, NextResponse } from 'next/server'
import { jsonNoStore, jsonNoStoreError, parseJsonBodyResult } from '@/lib/api/responses'
import {
  GAMEPLAY_DEATH_REVIEW_OUTCOMES,
  locationRoomGameplayAdminService,
} from '@/lib/eliza/locationRooms/gameplay/adminService'
import {
  gameplayAdminErrorResponse,
  requireAdminNoStore,
  serializeDeathReview,
} from '../../shared'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ reviewId: string }>
}

type UpdateDeathReviewBody = {
  outcome?: unknown
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await requireAdminNoStore()
  if (auth instanceof NextResponse) return auth

  const parsed = await parseJsonBodyResult<UpdateDeathReviewBody>(request)
  if (!parsed.ok) {
    return jsonNoStoreError('Invalid JSON body', 400)
  }

  if (!locationRoomGameplayAdminService.isDeathReviewOutcome(parsed.data.outcome)) {
    return jsonNoStore({
      error: 'Invalid death review outcome',
      allowed: GAMEPLAY_DEATH_REVIEW_OUTCOMES,
    }, { status: 400 })
  }

  const { reviewId } = await context.params

  try {
    const review = await locationRoomGameplayAdminService.updateDeathReviewOutcome({
      reviewId,
      outcome: parsed.data.outcome,
      adminWallet: auth.address,
    })

    return jsonNoStore({ review: serializeDeathReview(review) })
  } catch (error) {
    return gameplayAdminErrorResponse(error, 'Failed to update gameplay death review')
  }
}
