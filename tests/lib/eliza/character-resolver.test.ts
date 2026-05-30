import { elizaConfig } from '@/lib/eliza/config'
import { resolveCharacterByTokenId } from '@/lib/eliza/characterResolver'
import { recordLegacyPersonaProfileLink } from '@/lib/eliza/personaMigration'

jest.mock('@/lib/eliza/sessionAuth', () => ({
  normalizeExpiresAt: jest.fn(),
}))

jest.mock('@/lib/eliza/personaMigration', () => ({
  recordLegacyPersonaProfileLink: jest.fn().mockResolvedValue(null),
  recordPersonaMigrationSuccess: jest.fn().mockResolvedValue(null),
  syncOfficialPersonaShadow: jest.fn().mockResolvedValue(null),
}))

describe('resolveCharacterByTokenId', () => {
  const originalMode = elizaConfig.mode

  beforeEach(() => {
    jest.clearAllMocks()
    elizaConfig.mode = 'legacy'
  })

  afterAll(() => {
    elizaConfig.mode = originalMode
  })

  it('auto-creates missing records with neutral default persona copy', async () => {
    const createRecord = jest.fn(async (input) => ({
      id: 'record-123',
      externalId: input.externalId,
      character: input.character,
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    }))
    const elizaClient = {
      characters: {
        getRecordByExternalId: jest.fn().mockResolvedValueOnce(null),
        createRecord,
      },
    }

    const record = await resolveCharacterByTokenId({
      elizaClient: elizaClient as never,
      tokenId: '123',
      wagdieDefaults: { name: null, backgroundStory: null },
    })

    expect(createRecord).toHaveBeenCalledWith(expect.objectContaining({ externalId: '123' }))
    expect(record.character.bio).toContain(
      'A mysterious character whose story is still being written. Character #123.'
    )
    expect(JSON.stringify(record.character)).not.toContain('world of WAGDIE')
    expect(record.character.settings).toMatchObject({
      metadata: {
        wagdieUser: {
          personaSource: 'neutral_default',
          defaultNeutralPersona: true,
        },
      },
    })
    expect(recordLegacyPersonaProfileLink).toHaveBeenCalledWith({
      tokenId: '123',
      legacyCharacterId: 'record-123',
    })
  })
})
