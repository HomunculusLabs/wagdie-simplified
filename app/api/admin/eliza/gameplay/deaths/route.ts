import { NextRequest, NextResponse } from 'next/server'
import { jsonNoStore } from '@/lib/api/responses'
import { locationRoomGameplayAdminService } from '@/lib/eliza/locationRooms/gameplay/adminService'
import { GAMEPLAY_DEATH_REVIEW_STATUSES, type GameplayDeathReviewStatus } from '@/lib/eliza/locationRooms/gameplay/types'
import {
  gameplayAdminErrorResponse,
  requireAdminNoStore,
  serializeDeathReview,
} from '../shared'

export const runtime = 'nodejs'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, parsed))
}

function parseReviewStatus(value: string | null): GameplayDeathReviewStatus | 'all' | null {
  if (!value) return null
  if (value === 'all') return 'all'
  return (GAMEPLAY_DEATH_REVIEW_STATUSES as readonly string[]).includes(value)
    ? value as GameplayDeathReviewStatus
    : null
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdminNoStore()
  if (!('address' in auth)) return auth

  const reviewStatus = parseReviewStatus(request.nextUrl.searchParams.get('status'))
  if (request.nextUrl.searchParams.has('status') && !reviewStatus) {
    return jsonNoStore({
      error: 'Invalid death review status',
      allowed: ['all', ...GAMEPLAY_DEATH_REVIEW_STATUSES],
    }, { status: 400 })
  }

  try {
    const reviews = await locationRoomGameplayAdminService.listDeathReviews({
      reviewStatus: reviewStatus ?? undefined,
      locationId: request.nextUrl.searchParams.get('locationId'),
      limit: parseLimit(request.nextUrl.searchParams.get('limit')),
    })

    return jsonNoStore({
      reviews: reviews.map(serializeDeathReview),
      count: reviews.length,
    })
  } catch (error) {
    return gameplayAdminErrorResponse(error, 'Failed to list gameplay death reviews')
  }
}
