import { LocationRoomAdminResetLocationNotFoundError, LocationRoomAdminResetService } from '@/lib/eliza/locationRooms/adminReset'
import { normalizeAdventureMemory, refreshAdventureCatalogMetadataFromLocation } from '@/lib/eliza/locationRooms/narrativeTypes'
import { makeNarrativeRepository, makeRepository, room } from './locationRooms/fixtures/builders'

const crowsDenMetadata = {
  adventureCatalog: {
    defaults: {
      arcSummary: 'The Crow\'s Den gathers stranded pilgrims beneath listening rafters.',
      currentStakes: 'The first oath decides who the room will shelter.',
      openingDecision: {
        id: 'crows-den-first-oath',
        prompt: 'Who receives the first whispered oath?',
        options: [{ id: 'innkeeper', label: 'The innkeeper' }],
      },
      discoveries: ['The rafters repeat careless promises.'],
      clocks: [{ id: 'last-call', label: 'Last call', value: 0, max: 6, summary: 'The room closes when the last candle gutters.' }],
    },
    sections: {
      '00_setting': [{ id: '00.10.crows-den', title: 'The Crow\'s Den', summary: 'A soot-dark tavern where vows carry weight.', tags: ['tavern'] }],
    },
  },
}

describe('LocationRoomAdminResetService', () => {
  it('deletes the existing room and reseeds narrative state from current location catalog defaults', async () => {
    const oldRoom = room({
      id: 'room-old',
      locationId: '11',
      tickCount: 9,
      lastTickAt: '2026-06-04T12:00:00.000Z',
      nextTickAt: '2026-06-04T18:00:00.000Z',
      lastError: 'stale failure',
    })
    const resetRoom = room({ id: 'room-reset', locationId: '11', tickCount: 0, lastTickAt: null, nextTickAt: null })
    const repository = makeRepository({
      getLocationDetails: jest.fn(async () => ({
        id: '11',
        name: 'The Crow\'s Den',
        chainLocationId: '11',
        active: true,
        metadata: crowsDenMetadata,
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      })),
      findRoomByLocationId: jest.fn(async () => oldRoom),
      deleteRoomById: jest.fn(async () => undefined),
      ensureRoomForLocation: jest.fn(async () => resetRoom),
    })
    const narrativeRepository = makeNarrativeRepository()

    const service = new LocationRoomAdminResetService(repository, narrativeRepository)
    const result = await service.resetLocationRoom('11')

    expect(repository.getLocationDetails).toHaveBeenCalledWith('11')
    expect(repository.findRoomByLocationId).toHaveBeenCalledWith('11')
    expect(repository.deleteRoomById).toHaveBeenCalledWith('room-old')
    expect(repository.ensureRoomForLocation).toHaveBeenCalledWith('11')
    expect(narrativeRepository.ensureStateForRoom).toHaveBeenCalledWith(expect.objectContaining({
      room: expect.objectContaining({ id: 'room-reset', tickCount: 0, lastTickAt: null, nextTickAt: null }),
      initialStateSummary: '',
      initialCurrentObjective: null,
      initialOpenThreads: [],
      metadata: expect.objectContaining({ adventureCatalog: expect.any(Object) }),
    }))
    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-reset' }), expect.objectContaining({
      stateSummary: '',
      currentObjective: null,
      openThreads: [],
      metadata: expect.objectContaining({ adventureCatalog: expect.any(Object) }),
    }))

    expect(result.previousRoomId).toBe('room-old')
    expect(result.room).toMatchObject({ id: 'room-reset', tickCount: 0, lastTickAt: null, nextTickAt: null })
    expect(result.catalogPresent).toBe(true)
    expect(result.adventure).toMatchObject({
      arcSummary: 'The Crow\'s Den gathers stranded pilgrims beneath listening rafters.',
      currentStakes: 'The first oath decides who the room will shelter.',
      activeDecision: expect.objectContaining({ id: 'crows-den-first-oath' }),
      discoveries: ['The rafters repeat careless promises.'],
    })
  })

  it('creates a reset room without delete when the location has no prior room', async () => {
    const resetRoom = room({ id: 'room-new', locationId: '11' })
    const repository = makeRepository({
      getLocationDetails: jest.fn(async () => ({
        id: '11',
        name: 'The Crow\'s Den',
        chainLocationId: '11',
        active: true,
        metadata: crowsDenMetadata,
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      })),
      findRoomByLocationId: jest.fn(async () => null),
      deleteRoomById: jest.fn(async () => undefined),
      ensureRoomForLocation: jest.fn(async () => resetRoom),
    })
    const narrativeRepository = makeNarrativeRepository()
    const service = new LocationRoomAdminResetService(repository, narrativeRepository)

    const result = await service.resetLocationRoom('11')

    expect(repository.deleteRoomById).not.toHaveBeenCalled()
    expect(repository.ensureRoomForLocation).toHaveBeenCalledWith('11')
    expect(result.previousRoomId).toBeNull()
    expect(result.room.id).toBe('room-new')
  })

  it('throws a reset-specific not found error without creating a room when location metadata is missing', async () => {
    const repository = makeRepository({
      getLocationDetails: jest.fn(async () => null),
      findRoomByLocationId: jest.fn(),
      deleteRoomById: jest.fn(),
      ensureRoomForLocation: jest.fn(),
    })
    const service = new LocationRoomAdminResetService(repository, makeNarrativeRepository())

    await expect(service.resetLocationRoom('missing')).rejects.toBeInstanceOf(LocationRoomAdminResetLocationNotFoundError)
    expect(repository.findRoomByLocationId).not.toHaveBeenCalled()
    expect(repository.ensureRoomForLocation).not.toHaveBeenCalled()
  })

  it('does not delete an existing room if catalog reseed metadata cannot be built', async () => {
    const metadata: Record<string, unknown> = {}
    Object.defineProperty(metadata, 'adventureCatalog', {
      enumerable: true,
      get() {
        throw new Error('bad catalog metadata')
      },
    })
    const repository = makeRepository({
      getLocationDetails: jest.fn(async () => ({
        id: '11',
        name: 'The Crow\'s Den',
        chainLocationId: '11',
        active: true,
        metadata,
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      })),
      findRoomByLocationId: jest.fn(),
      deleteRoomById: jest.fn(),
      ensureRoomForLocation: jest.fn(),
    })
    const service = new LocationRoomAdminResetService(repository, makeNarrativeRepository())

    await expect(service.resetLocationRoom('11')).rejects.toThrow('bad catalog metadata')
    expect(repository.findRoomByLocationId).not.toHaveBeenCalled()
    expect(repository.deleteRoomById).not.toHaveBeenCalled()
    expect(repository.ensureRoomForLocation).not.toHaveBeenCalled()
  })

  it('normal catalog refresh still preserves live adventure memory outside explicit reset', () => {
    const refreshed = refreshAdventureCatalogMetadataFromLocation({
      adventure: {
        arcSummary: 'Live room arc must survive normal ticks.',
        currentStakes: 'Live stakes must survive normal ticks.',
      },
    }, crowsDenMetadata)

    expect(normalizeAdventureMemory(refreshed.metadata)).toMatchObject({
      arcSummary: 'Live room arc must survive normal ticks.',
      currentStakes: 'Live stakes must survive normal ticks.',
    })
  })
})
