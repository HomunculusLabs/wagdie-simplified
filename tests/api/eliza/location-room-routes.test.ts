/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { GET as getPublicRoom } from '@/app/api/eliza/location-rooms/[locationId]/route'
import { POST as postManualTick } from '@/app/api/eliza/location-rooms/[locationId]/tick/route'
import { GET as getAdminNarrative } from '@/app/api/admin/eliza/location-rooms/[locationId]/narrative/route'
import { GET as getAdminHealth } from '@/app/api/admin/eliza/location-rooms/[locationId]/health/route'
import { GET as syncGet, POST as syncPost } from '@/app/api/sync/eliza-location-rooms/route'
import { requireAdmin, requireAuth } from '@/lib/api/auth'
import { isAdmin } from '@/lib/auth/admin'
import {
  LocationRoomFeatureDisabledError,
  LocationRoomForbiddenError,
  LocationRoomGameplayConfigError,
  LocationRoomInsufficientParticipantsError,
  LocationRoomManualCooldownError,
  LocationRoomNarrativeConfigError,
  LocationRoomNotFoundError,
  LocationRoomOfficialServiceDisabledError,
  locationRoomService,
} from '@/lib/eliza/locationRooms/service'
import { locationRoomRepository } from '@/lib/eliza/locationRooms/repository'
import { locationRoomNarrativeRepository } from '@/lib/eliza/locationRooms/narrativeRepository'
import { locationRoomAdminDiagnosticsService } from '@/lib/eliza/locationRooms/adminDiagnostics'

const requireAuthMock = requireAuth as jest.Mock
const requireAdminMock = requireAdmin as jest.Mock
const isAdminMock = isAdmin as jest.Mock
const locationRoomServiceMock = locationRoomService as jest.Mocked<typeof locationRoomService>
const locationRoomRepositoryMock = locationRoomRepository as jest.Mocked<typeof locationRoomRepository>
const locationRoomNarrativeRepositoryMock = locationRoomNarrativeRepository as jest.Mocked<typeof locationRoomNarrativeRepository>
const locationRoomAdminDiagnosticsServiceMock = locationRoomAdminDiagnosticsService as jest.Mocked<typeof locationRoomAdminDiagnosticsService>

jest.mock('@/lib/api/auth', () => {
  const { NextResponse: MockNextResponse } = jest.requireActual('next/server')

  return {
    requireAuth: jest.fn(),
    requireAdmin: jest.fn(),
    isAuthError: (result: unknown) => result instanceof MockNextResponse,
  }
})

jest.mock('@/lib/eliza/locationRooms/repository', () => ({
  locationRoomRepository: {
    getLocation: jest.fn(),
    findRoomByLocationId: jest.fn(),
  },
}))

jest.mock('@/lib/eliza/locationRooms/narrativeRepository', () => ({
  locationRoomNarrativeRepository: {
    findStateByRoomId: jest.fn(),
    listRecentBeatsByRoomId: jest.fn(),
  },
}))

jest.mock('@/lib/eliza/locationRooms/adminDiagnostics', () => ({
  locationRoomAdminDiagnosticsService: {
    inspectLocation: jest.fn(),
  },
}))

jest.mock('@/lib/auth/admin', () => ({
  isAdmin: jest.fn(),
}))

jest.mock('@/lib/eliza/locationRooms/service', () => {
  class LocationRoomNotFoundError extends Error {}
  class LocationRoomFeatureDisabledError extends Error {}
  class LocationRoomOfficialServiceDisabledError extends Error {}
  class LocationRoomNarrativeConfigError extends Error {}
  class LocationRoomForbiddenError extends Error {}
  class LocationRoomGameplayConfigError extends Error {}
  class LocationRoomInsufficientParticipantsError extends Error {}
  class LocationRoomManualCooldownError extends Error {
    constructor(public readonly retryAfterSeconds: number) {
      super('cooldown')
    }
  }
  class LocationRoomTickDisabledError extends Error {}

  return {
    LocationRoomNotFoundError,
    LocationRoomFeatureDisabledError,
    LocationRoomOfficialServiceDisabledError,
    LocationRoomNarrativeConfigError,
    LocationRoomForbiddenError,
    LocationRoomGameplayConfigError,
    LocationRoomInsufficientParticipantsError,
    LocationRoomManualCooldownError,
    LocationRoomTickDisabledError,
    locationRoomService: {
      getPublicRoom: jest.fn(),
      requestTick: jest.fn(),
      requestTickAndProcess: jest.fn(),
      runScheduledWorker: jest.fn(),
    },
  }
})

function publicRequest(query = '') {
  return new NextRequest(`http://localhost/api/eliza/location-rooms/loc-1${query}`, { method: 'GET' })
}

function publicContext(locationId = 'loc-1') {
  return { params: Promise.resolve({ locationId }) }
}

function manualRequest() {
  return new NextRequest('http://localhost/api/eliza/location-rooms/loc-1/tick', { method: 'POST' })
}

function adminNarrativeRequest(query = '') {
  return new NextRequest(`http://localhost/api/admin/eliza/location-rooms/loc-1/narrative${query}`, { method: 'GET' })
}

function adminHealthRequest() {
  return new NextRequest('http://localhost/api/admin/eliza/location-rooms/loc-1/health', { method: 'GET' })
}

function syncRequest(url = 'http://localhost/api/sync/eliza-location-rooms', method = 'GET', headers?: HeadersInit) {
  return new NextRequest(url, { method, headers })
}

describe('Eliza location room routes', () => {
  const originalSecret = process.env.SYNC_SECRET_KEY

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.SYNC_SECRET_KEY = 'sync-secret'
    requireAuthMock.mockResolvedValue({ address: '0xOwner' })
    requireAdminMock.mockResolvedValue({ address: '0xAdmin' })
    isAdminMock.mockReturnValue(false)
    locationRoomRepositoryMock.getLocation.mockResolvedValue({ id: 'loc-1', name: 'The Abyss' })
    locationRoomRepositoryMock.findRoomByLocationId.mockResolvedValue({
      id: 'room-1',
      locationId: 'loc-1',
      officialRoomId: 'official-room-1',
      officialWorldId: 'official-world-1',
      officialUserId: 'official-user-1',
      channelId: 'wagdie-location-loc-1',
      tickEnabled: true,
      lastTickAt: null,
      nextTickAt: null,
      tickCount: 3,
      lastError: null,
      createdAt: '2026-05-11T12:00:00.000Z',
      updatedAt: '2026-05-11T12:05:00.000Z',
    })
    locationRoomNarrativeRepositoryMock.findStateByRoomId.mockResolvedValue({
      id: 'state-1',
      roomId: 'room-1',
      locationId: 'loc-1',
      stateSummary: 'The bell is awake.',
      currentObjective: 'Answer the toll.',
      openThreads: ['Who rang it?'],
      metadata: { private: 'hidden' },
      createdAt: '2026-05-11T12:00:00.000Z',
      updatedAt: '2026-05-11T12:05:00.000Z',
    })
    locationRoomNarrativeRepositoryMock.listRecentBeatsByRoomId.mockResolvedValue([])
    locationRoomAdminDiagnosticsServiceMock.inspectLocation.mockResolvedValue({
      generatedAt: '2026-05-23T12:00:00.000Z',
      location: { id: 'loc-1', name: 'The Abyss', chainLocationId: null, active: null, exists: true },
      canonical: { requestedLocationId: 'loc-1', canonicalLocationId: null, isCanonical: true, hints: [] },
      config: {
        locationRoomsEnabled: true,
        officialElizaOsConfigured: true,
        narrativeEnabled: true,
        gameplayEnabledForLocation: false,
        tickIntervalMinutes: 360,
        maxTicksPerRun: 5,
      },
      gmReadiness: { required: true, ready: true, source: 'database', officialAgentId: 'gm-agent', safeError: null },
      participants: { count: 2, minimumRequired: 2, sample: [{ tokenId: 7, name: 'Ash' }] },
      room: {
        exists: true,
        id: 'room-1',
        tickEnabled: true,
        lastTickAt: null,
        nextTickAt: '2026-05-23T13:00:00.000Z',
        tickCount: 3,
        lastError: null,
        createdAt: '2026-05-11T12:00:00.000Z',
        updatedAt: '2026-05-11T12:05:00.000Z',
      },
      ticks: { active: [], recent: [] },
      publicTranscript: { messageCount: 1, latestSequence: 1, latestCreatedAt: '2026-05-23T12:00:00.000Z' },
      narrative: {
        enabled: true,
        link: '/api/admin/eliza/location-rooms/loc-1/narrative',
        stateExists: true,
        stateUpdatedAt: '2026-05-23T12:00:00.000Z',
        currentObjective: 'Wait',
        latestBeat: null,
      },
      gameplay: {
        enabled: false,
        link: '/api/admin/eliza/location-rooms/loc-1/gameplay',
        stateStatus: null,
        activeEncounterStatus: null,
        recentTurnCount: 0,
        latestTurnStatus: null,
        rewardClaimCount: 0,
      },
      recommendedNextAction: 'healthy',
    })
  })

  afterAll(() => {
    process.env.SYNC_SECRET_KEY = originalSecret
  })

  it('public read returns no-store room data and forwards pagination', async () => {
    locationRoomServiceMock.getPublicRoom.mockResolvedValueOnce({
      room: { id: 'room-1', locationId: 'loc-1', locationName: 'Bell', tickEnabled: true, lastTickAt: null, nextTickAt: null, tickCount: 0, createdAt: 'now', updatedAt: 'now' },
      participants: [],
      messages: [],
      pagination: { page: 2, pageSize: 5, total: 0, hasMore: false },
    })

    const response = await getPublicRoom(publicRequest('?page=2&pageSize=5'), publicContext())

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(locationRoomService.getPublicRoom).toHaveBeenCalledWith('loc-1', { page: '2', pageSize: '5' })
    await expect(response.json()).resolves.toMatchObject({ room: { id: 'room-1' } })
  })

  it('public read returns 404 when the location does not exist', async () => {
    locationRoomServiceMock.getPublicRoom.mockRejectedValueOnce(new LocationRoomNotFoundError('missing'))

    const response = await getPublicRoom(publicRequest(), publicContext('missing'))

    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ error: 'Location not found' })
  })

  it('manual tick processes owner requests immediately when the room tick is claimed', async () => {
    locationRoomServiceMock.requestTickAndProcess.mockResolvedValueOnce({
      roomId: 'room-1',
      locationId: 'loc-1',
      tickId: 'tick-1',
      triggerType: 'owner',
      deduped: false,
      requestedByTokenId: 7,
      participantCount: 2,
      processing: {
        attempted: true,
        status: 'completed',
        tickId: 'tick-1',
        result: { tickId: 'tick-1', status: 'completed', selectedTokenId: 7, messageId: 'msg-1' },
      },
    })

    const response = await postManualTick(manualRequest(), publicContext())

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(locationRoomService.requestTickAndProcess).toHaveBeenCalledWith('loc-1', {
      actor: 'owner',
      walletAddress: '0xOwner',
    })
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      queued: true,
      tickId: 'tick-1',
      triggerType: 'owner',
      processing: { attempted: true, status: 'completed' },
    })
  })

  it('manual tick returns accepted when an admin request is queued but another worker owns processing', async () => {
    isAdminMock.mockReturnValueOnce(true)
    locationRoomServiceMock.requestTickAndProcess.mockResolvedValueOnce({
      roomId: 'room-1',
      locationId: 'loc-1',
      tickId: null,
      triggerType: 'admin',
      deduped: true,
      requestedByTokenId: null,
      participantCount: 2,
      processing: {
        attempted: false,
        status: 'already_processing',
        tickId: 'tick-existing',
        reason: 'Tick is already owned by another worker',
      },
    })

    const response = await postManualTick(manualRequest(), publicContext())

    expect(response.status).toBe(202)
    expect(locationRoomService.requestTickAndProcess).toHaveBeenCalledWith('loc-1', {
      actor: 'admin',
      walletAddress: '0xOwner',
    })
    await expect(response.json()).resolves.toMatchObject({
      deduped: true,
      triggerType: 'admin',
      processing: { attempted: false, status: 'already_processing', tickId: 'tick-existing' },
    })
  })

  it('manual tick returns auth errors before calling the service', async () => {
    requireAuthMock.mockResolvedValueOnce(NextResponse.json({ error: 'nope' }, { status: 401 }))

    const response = await postManualTick(manualRequest(), publicContext())

    expect(response.status).toBe(401)
    expect(locationRoomService.requestTickAndProcess).not.toHaveBeenCalled()
  })

  it('manual tick maps owner, participant, cooldown, disabled, narrative, and gameplay config errors', async () => {
    locationRoomServiceMock.requestTickAndProcess
      .mockRejectedValueOnce(new LocationRoomForbiddenError())
      .mockRejectedValueOnce(new LocationRoomInsufficientParticipantsError())
      .mockRejectedValueOnce(new LocationRoomManualCooldownError(120))
      .mockRejectedValueOnce(new LocationRoomFeatureDisabledError())
      .mockRejectedValueOnce(new LocationRoomNarrativeConfigError())
      .mockRejectedValueOnce(new LocationRoomGameplayConfigError('Location room gameplay mode requires narrative mode to be enabled'))

    const forbidden = await postManualTick(manualRequest(), publicContext())
    const insufficient = await postManualTick(manualRequest(), publicContext())
    const cooldown = await postManualTick(manualRequest(), publicContext())
    const disabled = await postManualTick(manualRequest(), publicContext())
    const narrativeConfig = await postManualTick(manualRequest(), publicContext())
    const gameplayConfig = await postManualTick(manualRequest(), publicContext())

    expect(forbidden.status).toBe(403)
    expect(insufficient.status).toBe(409)
    expect(cooldown.status).toBe(429)
    expect(cooldown.headers.get('Retry-After')).toBe('120')
    expect(disabled.status).toBe(503)
    expect(narrativeConfig.status).toBe(503)
    expect(gameplayConfig.status).toBe(503)
    await expect(narrativeConfig.json()).resolves.toEqual({
      error: 'Location room narrative game-master agent is not configured',
    })
    await expect(gameplayConfig.json()).resolves.toEqual({
      error: 'Location room gameplay mode requires narrative mode to be enabled',
    })
  })

  it('admin narrative inspection returns sanitized state and recent beat summaries', async () => {
    locationRoomNarrativeRepositoryMock.listRecentBeatsByRoomId.mockResolvedValueOnce([
      {
        id: 'beat-1',
        roomId: 'room-1',
        locationId: 'loc-1',
        tickId: 'tick-1',
        status: 'failed',
        selectedTokenId: 7,
        gameMasterAgentId: 'gm-agent-secret',
        publicNarration: 'The bell rings red.',
        speakerInstruction: 'Private instruction that must stay hidden.',
        stateBefore: { stateSummary: 'Before', currentObjective: null, openThreads: [] },
        stateAfter: { stateSummary: 'After', currentObjective: 'Answer the toll.', openThreads: ['Who rang it?'] },
        metadata: { model: 'hidden-model' },
        lastError: 'Stored operational error',
        createdAt: '2026-05-11T12:01:00.000Z',
        updatedAt: '2026-05-11T12:02:00.000Z',
        completedAt: null,
      },
    ])

    const response = await getAdminNarrative(adminNarrativeRequest('?limit=5'), publicContext())

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(locationRoomRepository.getLocation).toHaveBeenCalledWith('loc-1')
    expect(locationRoomRepository.findRoomByLocationId).toHaveBeenCalledWith('loc-1')
    expect(locationRoomNarrativeRepository.findStateByRoomId).toHaveBeenCalledWith('room-1')
    expect(locationRoomNarrativeRepository.listRecentBeatsByRoomId).toHaveBeenCalledWith('room-1', 5)

    const body = await response.json()
    expect(body).toMatchObject({
      room: { id: 'room-1', locationId: 'loc-1', locationName: 'The Abyss' },
      state: {
        roomId: 'room-1',
        locationId: 'loc-1',
        stateSummary: 'The bell is awake.',
        currentObjective: 'Answer the toll.',
        openThreads: ['Who rang it?'],
      },
      beats: [{
        roomId: 'room-1',
        locationId: 'loc-1',
        status: 'failed',
        selectedTokenId: 7,
        publicNarration: 'The bell rings red.',
        stateSummary: 'After',
        currentObjective: 'Answer the toll.',
        openThreads: ['Who rang it?'],
        lastError: 'Narrative beat failed. Check server logs for details.',
      }],
      count: 1,
    })
    expect(JSON.stringify(body)).not.toContain('Private instruction')
    expect(JSON.stringify(body)).not.toContain('Stored operational error')
    expect(JSON.stringify(body)).not.toContain('gm-agent-secret')
    expect(JSON.stringify(body)).not.toContain('hidden-model')
    expect(JSON.stringify(body)).not.toContain('beat-1')
    expect(JSON.stringify(body)).not.toContain('tick-1')
  })

  it('admin health diagnostics returns no-store diagnostics for admins', async () => {
    const response = await getAdminHealth(adminHealthRequest(), publicContext())

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(locationRoomAdminDiagnosticsService.inspectLocation).toHaveBeenCalledWith('loc-1')
    await expect(response.json()).resolves.toMatchObject({
      location: { id: 'loc-1', exists: true },
      participants: { count: 2 },
      recommendedNextAction: 'healthy',
    })
  })

  it('admin health diagnostics requires admin access and does not inspect on auth failure', async () => {
    requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'nope' }, { status: 403 }))

    const response = await getAdminHealth(adminHealthRequest(), publicContext())

    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(locationRoomAdminDiagnosticsService.inspectLocation).not.toHaveBeenCalled()
  })

  it('admin health diagnostics sanitizes unexpected service errors', async () => {
    locationRoomAdminDiagnosticsServiceMock.inspectLocation.mockRejectedValueOnce(new Error('raw health failure'))

    const response = await getAdminHealth(adminHealthRequest(), publicContext())

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ error: 'Failed to load location room health diagnostics' })
  })

  it('admin narrative inspection requires admin access and does not query room state on auth failure', async () => {
    requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'nope' }, { status: 403 }))

    const response = await getAdminNarrative(adminNarrativeRequest(), publicContext())

    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(locationRoomRepository.getLocation).not.toHaveBeenCalled()
    expect(locationRoomNarrativeRepository.findStateByRoomId).not.toHaveBeenCalled()
  })

  it('admin narrative inspection returns 404 for missing locations without creating a room', async () => {
    locationRoomRepositoryMock.getLocation.mockResolvedValueOnce(null)

    const response = await getAdminNarrative(adminNarrativeRequest(), publicContext('missing'))

    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(locationRoomRepository.findRoomByLocationId).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({ error: 'Location not found' })
  })

  it('admin narrative inspection returns an empty read when the location has no room yet', async () => {
    locationRoomRepositoryMock.findRoomByLocationId.mockResolvedValueOnce(null)

    const response = await getAdminNarrative(adminNarrativeRequest(), publicContext())

    expect(response.status).toBe(200)
    expect(locationRoomNarrativeRepository.findStateByRoomId).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      room: null,
      location: { id: 'loc-1', name: 'The Abyss' },
      state: null,
      beats: [],
      count: 0,
    })
  })

  it('scheduled sync rejects missing or invalid sync secret', async () => {
    const response = await syncGet(syncRequest())

    expect(response.status).toBe(401)
    expect(locationRoomService.runScheduledWorker).not.toHaveBeenCalled()
  })

  it('scheduled sync returns 503 when the feature is disabled', async () => {
    locationRoomServiceMock.runScheduledWorker.mockRejectedValueOnce(new LocationRoomFeatureDisabledError())

    const response = await syncGet(syncRequest('http://localhost/api/sync/eliza-location-rooms?secret=sync-secret'))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ success: false, error: 'Eliza location rooms are disabled' })
  })

  it('scheduled sync returns 503 when the official service is not configured', async () => {
    locationRoomServiceMock.runScheduledWorker.mockRejectedValueOnce(new LocationRoomOfficialServiceDisabledError())

    const response = await syncGet(syncRequest('http://localhost/api/sync/eliza-location-rooms?secret=sync-secret'))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ success: false, error: 'Official ElizaOS service is not configured' })
  })

  it('scheduled sync returns 503 when narrative is enabled without a game-master agent id', async () => {
    locationRoomServiceMock.runScheduledWorker.mockRejectedValueOnce(new LocationRoomNarrativeConfigError())

    const response = await syncGet(syncRequest('http://localhost/api/sync/eliza-location-rooms?secret=sync-secret'))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Location room narrative game-master agent is not configured',
    })
  })

  it('scheduled sync returns 503 when gameplay prerequisites are missing', async () => {
    locationRoomServiceMock.runScheduledWorker.mockRejectedValueOnce(
      new LocationRoomGameplayConfigError('Location room gameplay mode requires ELIZA_INTEGRATION_MODE=official and ELIZAOS_BASE_URL')
    )

    const response = await syncGet(syncRequest('http://localhost/api/sync/eliza-location-rooms?secret=sync-secret'))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Location room gameplay mode requires ELIZA_INTEGRATION_MODE=official and ELIZAOS_BASE_URL',
    })
  })

  it('scheduled sync can be triggered by bearer auth and returns worker counts', async () => {
    locationRoomServiceMock.runScheduledWorker.mockResolvedValueOnce({
      enabled: true,
      enqueued: 1,
      deduped: 0,
      processed: 1,
      completed: 1,
      skipped: 0,
      failed: 0,
      dead: 0,
      results: [{ tickId: 'tick-1', status: 'completed', selectedTokenId: 1, messageId: 'msg-1' }],
    })

    const response = await syncPost(syncRequest('http://localhost/api/sync/eliza-location-rooms', 'POST', {
      authorization: 'Bearer sync-secret',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      enqueued: 1,
      processed: 1,
      completed: 1,
    })
  })
})
