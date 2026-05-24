/**
 * @jest-environment node
 */

const primitives = require('next/dist/compiled/@edge-runtime/primitives')
Object.assign(globalThis, {
  Blob: primitives.Blob,
  File: primitives.File,
  FormData: primitives.FormData,
  Headers: primitives.Headers,
  Request: primitives.Request,
  Response: primitives.Response,
})

const { NextRequest, NextResponse } = require('next/server')

jest.mock('@/lib/api/auth', () => ({
  requireAdmin: jest.fn(),
  isAuthError: (result: unknown) => result instanceof NextResponse,
}))

jest.mock('@/lib/eliza/locationRooms/gameplay/adminService', () => {
  const outcomes = ['reject_death', 'gameplay_only', 'approve_finality'] as const

  class AdminGameplayLocationNotFoundError extends Error {}
  class GameplayDeathReviewNotFoundError extends Error {}
  class GameplayDeathReviewConflictError extends Error {}

  return {
    GAMEPLAY_DEATH_REVIEW_OUTCOMES: outcomes,
    AdminGameplayLocationNotFoundError,
    GameplayDeathReviewNotFoundError,
    GameplayDeathReviewConflictError,
    locationRoomGameplayAdminService: {
      isDeathReviewOutcome: jest.fn((value: unknown) => typeof value === 'string' && outcomes.includes(value as never)),
      inspectRoomGameplay: jest.fn(),
      listDeathReviews: jest.fn(),
      updateDeathReviewOutcome: jest.fn(),
    },
  }
})

const { GET: GET_ROOM_GAMEPLAY } = require('@/app/api/admin/eliza/location-rooms/[locationId]/gameplay/route')
const { GET: LIST_DEATHS } = require('@/app/api/admin/eliza/gameplay/deaths/route')
const { PATCH: UPDATE_DEATH } = require('@/app/api/admin/eliza/gameplay/deaths/[reviewId]/route')
const { requireAdmin } = require('@/lib/api/auth')
const {
  AdminGameplayLocationNotFoundError,
  GameplayDeathReviewConflictError,
  GameplayDeathReviewNotFoundError,
  locationRoomGameplayAdminService,
} = require('@/lib/eliza/locationRooms/gameplay/adminService')

const mockedService = locationRoomGameplayAdminService as jest.Mocked<typeof locationRoomGameplayAdminService>

function params(value: Record<string, string>) {
  return { params: Promise.resolve(value) }
}

function request(url: string, init?: RequestInit) {
  return new NextRequest(url, init)
}

function claim(overrides: Record<string, unknown> = {}) {
  return {
    id: 'claim-1',
    deathReviewId: 'review-1',
    tokenId: 7,
    beneficiaryWallet: '0xowner',
    beneficiarySource: 'owner_address',
    status: 'pending_review',
    performanceScore: 42,
    scoreBreakdown: {
      combat: 10,
      assist: 0,
      survival: 2,
      objective: 0,
      noncombat: 0,
      critical: 0,
      penalty: 0,
      rawScore: 12,
      difficultyMultiplier: 1,
      finalScore: 12,
      counters: {},
    },
    lineItems: [{ assetType: 'gameplay_reward_points', amount: 42 }],
    policyVersion: 'death-rewards-v1',
    releaseAdminWallet: null,
    releasedAt: null,
    lastError: null,
    createdAt: '2026-05-22T12:00:00.000Z',
    updatedAt: '2026-05-22T12:00:00.000Z',
    ...overrides,
  }
}

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    status: 'active',
    targetCompletedTurns: 100,
    completedTurns: 12,
    startedByActor: 'admin',
    startedByWallet: '0xsecretadminwallet',
    startedByTokenId: 7,
    lastTickId: 'tick-12',
    lastAdvancedAt: '2026-05-22T12:12:00.000Z',
    completedAt: null,
    stopReason: null,
    lastError: null,
    metadata: { private: 'hidden' },
    createdAt: '2026-05-22T12:00:00.000Z',
    updatedAt: '2026-05-22T12:12:00.000Z',
    ...overrides,
  }
}

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: 'review-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    encounterId: 'encounter-1',
    turnId: 'turn-1',
    tokenId: 7,
    gameplayDeathStatus: 'dead',
    reviewStatus: 'pending',
    adminWallet: null,
    decidedAt: null,
    burnSyncStatus: 'not_applicable',
    context: { mechanicalSummary: { deaths: [7] } },
    metadata: { source: 'location-room-gameplay' },
    lastError: null,
    createdAt: '2026-05-22T12:00:00.000Z',
    updatedAt: '2026-05-22T12:00:00.000Z',
    rewardClaim: claim(),
    ...overrides,
  }
}

describe('admin Eliza gameplay routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(requireAdmin as jest.Mock).mockResolvedValue({ address: '0xAdmin' })
    mockedService.inspectRoomGameplay.mockResolvedValue({
      location: { id: 'loc-1', name: 'The Abyss' },
      room: {
        id: 'room-1',
        locationId: 'loc-1',
        tickEnabled: true,
        lastTickAt: null,
        nextTickAt: null,
        tickCount: 1,
        createdAt: '2026-05-22T12:00:00.000Z',
        updatedAt: '2026-05-22T12:00:00.000Z',
      },
      state: {
        id: 'state-1',
        roomId: 'room-1',
        locationId: 'loc-1',
        status: 'active_encounter',
        activeEncounterId: 'encounter-1',
        characters: {},
        rewards: {},
        metadata: {},
        createdAt: '2026-05-22T12:00:00.000Z',
        updatedAt: '2026-05-22T12:00:00.000Z',
      },
      activeEncounter: null,
      turns: [],
      rewardClaims: [claim()],
      activeRun: null,
      recentRuns: [],
    })
    mockedService.listDeathReviews.mockResolvedValue([review()])
    mockedService.updateDeathReviewOutcome.mockResolvedValue(review({
      reviewStatus: 'gameplay_only',
      adminWallet: '0xadmin',
      decidedAt: '2026-05-22T12:05:00.000Z',
    }))
  })

  it('requires admin and adds no-store to auth failures', async () => {
    ;(requireAdmin as jest.Mock).mockResolvedValueOnce(
      NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    )

    const response = await LIST_DEATHS(request('http://localhost/api/admin/eliza/gameplay/deaths'))

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mockedService.listDeathReviews).not.toHaveBeenCalled()
  })

  it('lists pending death reviews by default with no-store headers', async () => {
    const response = await LIST_DEATHS(request('http://localhost/api/admin/eliza/gameplay/deaths?limit=5&locationId=loc-1'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mockedService.listDeathReviews).toHaveBeenCalledWith({
      reviewStatus: undefined,
      locationId: 'loc-1',
      limit: 5,
    })
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      reviews: [{
        id: 'review-1',
        tokenId: 7,
        reviewStatus: 'pending',
        rewardClaim: {
          id: 'claim-1',
          status: 'pending_review',
          performanceScore: 42,
          lineItems: [{ assetType: 'gameplay_reward_points', amount: 42 }],
        },
      }],
    })
  })

  it('updates death reviews with explicit finality outcomes and never burns tokens', async () => {
    const statusByOutcome = {
      reject_death: 'rejected',
      gameplay_only: 'gameplay_only',
      approve_finality: 'finality_approved',
    } as const

    for (const outcome of ['reject_death', 'gameplay_only', 'approve_finality'] as const) {
      mockedService.updateDeathReviewOutcome.mockResolvedValueOnce(review({
        reviewStatus: statusByOutcome[outcome],
        adminWallet: '0xadmin',
        decidedAt: '2026-05-22T12:05:00.000Z',
      }))

      const response = await UPDATE_DEATH(
        request(`http://localhost/api/admin/eliza/gameplay/deaths/review-${outcome}`, {
          method: 'PATCH',
          body: JSON.stringify({ outcome }),
        }),
        params({ reviewId: `review-${outcome}` })
      )

      expect(response.status).toBe(200)
      expect(mockedService.updateDeathReviewOutcome).toHaveBeenLastCalledWith({
        reviewId: `review-${outcome}`,
        outcome,
        adminWallet: '0xAdmin',
      })
      const body = await response.json()
      expect(body.review.reviewStatus).toBe(statusByOutcome[outcome])
      expect(JSON.stringify(body)).not.toContain('burnTransaction')
    }
  })

  it('rejects invalid death review outcomes', async () => {
    const response = await UPDATE_DEATH(
      request('http://localhost/api/admin/eliza/gameplay/deaths/review-1', {
        method: 'PATCH',
        body: JSON.stringify({ outcome: 'burn_now' }),
      }),
      params({ reviewId: 'review-1' })
    )

    expect(response.status).toBe(400)
    expect(mockedService.updateDeathReviewOutcome).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid death review outcome',
      allowed: ['reject_death', 'gameplay_only', 'approve_finality'],
    })
  })

  it('maps death review not-found and decided conflicts to bounded errors', async () => {
    mockedService.updateDeathReviewOutcome
      .mockRejectedValueOnce(new GameplayDeathReviewNotFoundError('review-missing'))
      .mockRejectedValueOnce(new GameplayDeathReviewConflictError('Gameplay death review has already been decided'))

    const missing = await UPDATE_DEATH(
      request('http://localhost/api/admin/eliza/gameplay/deaths/review-missing', {
        method: 'PATCH',
        body: JSON.stringify({ outcome: 'reject_death' }),
      }),
      params({ reviewId: 'review-missing' })
    )
    const conflict = await UPDATE_DEATH(
      request('http://localhost/api/admin/eliza/gameplay/deaths/review-1', {
        method: 'PATCH',
        body: JSON.stringify({ outcome: 'approve_finality' }),
      }),
      params({ reviewId: 'review-1' })
    )

    expect(missing.status).toBe(404)
    expect(conflict.status).toBe(409)
  })

  it('returns read-only room gameplay inspection with bounded last errors', async () => {
    mockedService.inspectRoomGameplay.mockResolvedValueOnce({
      location: { id: 'loc-1', name: 'The Abyss' },
      room: {
        id: 'room-1',
        locationId: 'loc-1',
        tickEnabled: true,
        lastTickAt: null,
        nextTickAt: null,
        tickCount: 1,
        createdAt: '2026-05-22T12:00:00.000Z',
        updatedAt: '2026-05-22T12:00:00.000Z',
      },
      state: null,
      activeEncounter: {
        id: 'encounter-1',
        roomId: 'room-1',
        locationId: 'loc-1',
        status: 'active',
        difficulty: 'normal',
        roundNumber: 2,
        publicTitle: 'Bell Horror',
        publicSummary: 'The bell hunts.',
        monsterState: [],
        rewardPlan: {},
        mechanics: {},
        metadata: {},
        lastError: 'raw provider stack',
        createdAt: '2026-05-22T12:00:00.000Z',
        updatedAt: '2026-05-22T12:00:00.000Z',
        completedAt: null,
      },
      turns: [],
      rewardClaims: [claim({ lastError: 'raw claim stack' })],
      activeRun: run({ lastError: 'raw active run stack' }),
      recentRuns: [
        run({ id: 'run-1', status: 'active', completedTurns: 12, lastError: null }),
        run({ id: 'run-stopped', status: 'stopped', completedTurns: 14, stopReason: 'insufficient_participants', completedAt: '2026-05-22T12:20:00.000Z' }),
        run({ id: 'run-completed', status: 'completed', completedTurns: 100, stopReason: 'target_reached', completedAt: '2026-05-22T12:30:00.000Z' }),
        run({ id: 'run-failed', status: 'failed', completedTurns: 2, stopReason: 'tick_dead', lastError: 'raw failed run stack', completedAt: '2026-05-22T12:40:00.000Z' }),
      ],
    })

    const response = await GET_ROOM_GAMEPLAY(
      request('http://localhost/api/admin/eliza/location-rooms/loc-1/gameplay?limit=3'),
      params({ locationId: 'loc-1' })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mockedService.inspectRoomGameplay).toHaveBeenCalledWith('loc-1', 3)
    const body = await response.json()
    expect(body).toMatchObject({
      room: { id: 'room-1', locationName: 'The Abyss' },
      activeEncounter: {
        id: 'encounter-1',
        lastError: 'Gameplay operation failed. Check server logs for details.',
      },
      rewardClaims: [expect.objectContaining({
        id: 'claim-1',
        lastError: 'Gameplay operation failed. Check server logs for details.',
      })],
      activeRun: {
        id: 'run-1',
        status: 'active',
        targetCompletedTurns: 100,
        completedTurns: 12,
        remainingTurns: 88,
        startedByActor: 'admin',
        startedByTokenId: 7,
        lastTickId: 'tick-12',
        lastAdvancedAt: '2026-05-22T12:12:00.000Z',
        stopReason: null,
        lastError: 'Gameplay operation failed. Check server logs for details.',
      },
      recentRuns: [
        expect.objectContaining({ id: 'run-1', status: 'active', remainingTurns: 88, lastError: null }),
        expect.objectContaining({ id: 'run-stopped', status: 'stopped', remainingTurns: 86, stopReason: 'insufficient_participants' }),
        expect.objectContaining({ id: 'run-completed', status: 'completed', remainingTurns: 0, stopReason: 'target_reached' }),
        expect.objectContaining({ id: 'run-failed', status: 'failed', remainingTurns: 98, stopReason: 'tick_dead', lastError: 'Gameplay operation failed. Check server logs for details.' }),
      ],
      count: 0,
    })
    expect(JSON.stringify(body)).not.toContain('raw provider stack')
    expect(JSON.stringify(body)).not.toContain('raw claim stack')
    expect(JSON.stringify(body)).not.toContain('raw active run stack')
    expect(JSON.stringify(body)).not.toContain('raw failed run stack')
    expect(JSON.stringify(body)).not.toContain('startedByWallet')
    expect(JSON.stringify(body)).not.toContain('0xsecretadminwallet')
    expect(JSON.stringify(body)).not.toContain('private')
  })

  it('room gameplay inspection maps missing locations to 404', async () => {
    mockedService.inspectRoomGameplay.mockRejectedValueOnce(new AdminGameplayLocationNotFoundError('missing'))

    const response = await GET_ROOM_GAMEPLAY(
      request('http://localhost/api/admin/eliza/location-rooms/missing/gameplay'),
      params({ locationId: 'missing' })
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Location not found' })
  })
})
