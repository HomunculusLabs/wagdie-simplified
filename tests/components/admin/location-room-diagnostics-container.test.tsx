import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LocationRoomDiagnosticsContainer } from '@/components/admin/location-rooms/LocationRoomDiagnosticsContainer'
import type { LocationRoomHealthDiagnostics } from '@/lib/eliza/locationRooms/adminDiagnostics'

function diagnostics(overrides: Partial<LocationRoomHealthDiagnostics> = {}): LocationRoomHealthDiagnostics {
  return {
    generatedAt: '2026-05-23T12:00:00.000Z',
    location: { id: '11', name: "The Crow's Den", chainLocationId: '11', active: true, exists: true },
    canonical: { requestedLocationId: '11', canonicalLocationId: '11', isCanonical: true, hints: [] },
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
      id: 'room-11',
      tickEnabled: true,
      lastTickAt: '2026-05-23T11:00:00.000Z',
      nextTickAt: '2026-05-23T13:00:00.000Z',
      tickCount: 3,
      lastError: null,
      createdAt: '2026-05-11T00:00:00.000Z',
      updatedAt: '2026-05-23T11:00:00.000Z',
    },
    ticks: { active: [], recent: [] },
    publicTranscript: { messageCount: 1, latestSequence: 4, latestCreatedAt: '2026-05-23T11:01:00.000Z' },
    narrative: {
      enabled: true,
      link: '/api/admin/eliza/location-rooms/11/narrative',
      stateExists: true,
      stateUpdatedAt: '2026-05-23T11:01:00.000Z',
      currentObjective: 'Answer the toll',
      latestBeat: null,
    },
    gameplay: {
      enabled: false,
      link: '/api/admin/eliza/location-rooms/11/gameplay',
      stateStatus: null,
      activeEncounterStatus: null,
      recentTurnCount: 0,
      latestTurnStatus: null,
      rewardClaimCount: 0,
    },
    recommendedNextAction: 'healthy',
    ...overrides,
  }
}

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(body),
}) as unknown as Response

describe('LocationRoomDiagnosticsContainer', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('loads canonical location 11 by default and renders the recommended action', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(diagnostics()))
    global.fetch = fetchMock

    render(<LocationRoomDiagnosticsContainer />)

    expect(await screen.findByText('healthy')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/eliza/location-rooms/11/health', { cache: 'no-store' })
    expect(screen.getByText("11 The Crow's Den")).toBeInTheDocument()
    expect(screen.getByText('#7 Ash')).toBeInTheDocument()
  })

  it('queries an operator-entered location id', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(diagnostics()))
      .mockResolvedValueOnce(jsonResponse(diagnostics({
        location: { id: 'crows_den', name: "Crow's Den", chainLocationId: null, active: false, exists: true },
        canonical: {
          requestedLocationId: 'crows_den',
          canonicalLocationId: '11',
          isCanonical: false,
          hints: ["The legacy crows_den location is not chain-backed; use canonical location 11 for The Crow's Den."],
        },
        recommendedNextAction: 'use_canonical_location_11',
      })))
    global.fetch = fetchMock

    render(<LocationRoomDiagnosticsContainer />)
    await screen.findByText('healthy')

    fireEvent.change(screen.getByLabelText(/location id/i), { target: { value: 'crows_den' } })
    fireEvent.click(screen.getByRole('button', { name: /load diagnostics/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin/eliza/location-rooms/crows_den/health', { cache: 'no-store' })
    expect(await screen.findByText('use_canonical_location_11')).toBeInTheDocument()
  })
})
