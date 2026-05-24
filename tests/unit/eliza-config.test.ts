describe('elizaConfig location room settings', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    delete process.env.ELIZA_LOCATION_ROOMS_ENABLED
    delete process.env.ELIZA_LOCATION_ROOM_TICK_INTERVAL_MINUTES
    delete process.env.ELIZA_LOCATION_ROOM_MAX_TICKS_PER_RUN
    delete process.env.ELIZA_LOCATION_ROOM_TRANSCRIPT_WINDOW
    delete process.env.ELIZA_LOCATION_ROOM_NARRATIVE_ENABLED
    delete process.env.ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID
    delete process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_MAX_ENCOUNTER_ROUNDS
    delete process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_AUTOMATION_TARGET_TURNS
    delete process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_AUTOMATION_MAX_ACTIVE_RUNS_PER_WORKER
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('defaults location rooms and narrative mode to disabled with conservative scheduler settings', async () => {
    const { elizaConfig } = await import('@/lib/eliza/config')

    expect(elizaConfig.locationRooms).toMatchObject({
      enabled: false,
      tickIntervalMinutes: 360,
      maxTicksPerRun: 5,
      transcriptWindow: 20,
      narrative: {
        enabled: false,
        gameMasterAgentId: '',
      },
      gameplay: {
        maxEncounterRounds: 12,
        automation: {
          targetCompletedTurns: 100,
          maxActiveRunsPerWorker: 10,
        },
      },
    })
  })

  it('accepts valid location room and narrative environment overrides', async () => {
    process.env.ELIZA_LOCATION_ROOMS_ENABLED = 'true'
    process.env.ELIZA_LOCATION_ROOM_TICK_INTERVAL_MINUTES = '120'
    process.env.ELIZA_LOCATION_ROOM_MAX_TICKS_PER_RUN = '3'
    process.env.ELIZA_LOCATION_ROOM_TRANSCRIPT_WINDOW = '12'
    process.env.ELIZA_LOCATION_ROOM_NARRATIVE_ENABLED = 'true'
    process.env.ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID = ' gm-agent-1 '
    process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_MAX_ENCOUNTER_ROUNDS = '100'
    process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_AUTOMATION_TARGET_TURNS = '150'
    process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_AUTOMATION_MAX_ACTIVE_RUNS_PER_WORKER = '7'

    const { elizaConfig } = await import('@/lib/eliza/config')

    expect(elizaConfig.locationRooms).toMatchObject({
      enabled: true,
      tickIntervalMinutes: 120,
      maxTicksPerRun: 3,
      transcriptWindow: 12,
      narrative: {
        enabled: true,
        gameMasterAgentId: 'gm-agent-1',
      },
      gameplay: {
        maxEncounterRounds: 100,
        automation: {
          targetCompletedTurns: 150,
          maxActiveRunsPerWorker: 7,
        },
      },
    })
  })

  it('falls back to safe defaults for invalid numeric and boolean overrides', async () => {
    process.env.ELIZA_LOCATION_ROOMS_ENABLED = 'not-a-boolean'
    process.env.ELIZA_LOCATION_ROOM_TICK_INTERVAL_MINUTES = '0'
    process.env.ELIZA_LOCATION_ROOM_MAX_TICKS_PER_RUN = '1.5'
    process.env.ELIZA_LOCATION_ROOM_TRANSCRIPT_WINDOW = '-1'
    process.env.ELIZA_LOCATION_ROOM_NARRATIVE_ENABLED = 'not-a-boolean'
    process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_MAX_ENCOUNTER_ROUNDS = '201'
    process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_AUTOMATION_TARGET_TURNS = '0'
    process.env.ELIZA_LOCATION_ROOM_GAMEPLAY_AUTOMATION_MAX_ACTIVE_RUNS_PER_WORKER = '1.5'

    const { elizaConfig } = await import('@/lib/eliza/config')

    expect(elizaConfig.locationRooms).toMatchObject({
      enabled: false,
      tickIntervalMinutes: 360,
      maxTicksPerRun: 5,
      transcriptWindow: 20,
      narrative: {
        enabled: false,
        gameMasterAgentId: '',
      },
      gameplay: {
        maxEncounterRounds: 12,
        automation: {
          targetCompletedTurns: 100,
          maxActiveRunsPerWorker: 10,
        },
      },
    })
  })
})
