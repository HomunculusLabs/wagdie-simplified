/**
 * @jest-environment node
 */

jest.mock('@/lib/eliza/client', () => ({
  createOfficialServerClient: jest.fn(() => ({})),
}))

import { elizaConfig } from '@/lib/eliza/config'
import {
  GameMasterAgentConfigError,
  GameMasterAgentService,
  GameMasterCanonicalReviewConflictError,
  GameMasterKnowledgeValidationError,
} from '@/lib/eliza/gameMasterAgent/service'
import {
  GAME_MASTER_AGENT_EXTERNAL_ID,
  GAME_MASTER_AGENT_SETTING_KEY,
} from '@/lib/eliza/gameMasterAgent/constants'
import {
  GAME_MASTER_CANONICAL_CONTENT,
  buildCanonicalGameMasterAgentCharacter,
  toStoredCanonicalKnowledgeDocument,
} from '@/lib/eliza/gameMasterAgent/canonicalContent'
import type {
  GameMasterAgentSetting,
  GameMasterAgentSettingsRepository,
  ServiceAgentKnowledgeSyncState,
  ServiceAgentKnowledgeSyncStateRepository,
} from '@/lib/eliza/gameMasterAgent/repository'
import type { CharacterRecord, WagdieElizaClient } from '@/lib/eliza/gateway/types'
import type { OfficialKnowledgeClient } from '@/lib/eliza/official/knowledge-client'
import { FIELD_LIMITS } from '@/types/eliza'

const originalGameMasterAgentId = elizaConfig.locationRooms.narrative.gameMasterAgentId

type MutableNarrativeConfig = typeof elizaConfig.locationRooms.narrative & {
  gameMasterAgentId: string
}

function setEnvFallback(value: string): void {
  ;(elizaConfig.locationRooms.narrative as MutableNarrativeConfig).gameMasterAgentId = value
}

function setting(overrides: Partial<GameMasterAgentSetting> = {}): GameMasterAgentSetting {
  return {
    settingKey: GAME_MASTER_AGENT_SETTING_KEY,
    officialAgentId: 'gm-db-1',
    externalId: GAME_MASTER_AGENT_EXTERNAL_ID,
    source: 'deterministic_created',
    createdBy: null,
    updatedBy: null,
    lastValidatedAt: null,
    validationError: null,
    validationErrorAt: null,
    metadata: {},
    createdAt: '2026-05-22T12:00:00.000Z',
    updatedAt: '2026-05-22T12:00:00.000Z',
    ...overrides,
  }
}

function record(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: 'gm-db-1',
    externalId: GAME_MASTER_AGENT_EXTERNAL_ID,
    character: {
      name: 'WAGDIE Game Master',
      knowledge: [],
    },
    createdAt: '2026-05-22T12:00:00.000Z',
    updatedAt: '2026-05-22T12:00:00.000Z',
    ...overrides,
  }
}

function makeSettingsRepository(active: GameMasterAgentSetting | null = null): jest.Mocked<GameMasterAgentSettingsRepository> {
  let current = active
  return {
    findActive: jest.fn(async () => current),
    upsertActive: jest.fn(async (input) => {
      current = setting({
        officialAgentId: input.officialAgentId,
        externalId: input.externalId ?? null,
        source: input.source,
        createdBy: input.createdBy ?? null,
        updatedBy: input.updatedBy ?? null,
        lastValidatedAt: input.lastValidatedAt ?? null,
        validationError: input.validationError ?? null,
        validationErrorAt: input.validationErrorAt ?? null,
        metadata: input.metadata ?? {},
      })
      return current
    }),
    clearActive: jest.fn(async () => {
      current = null
    }),
  }
}

function makeKnowledgeRepository(): jest.Mocked<ServiceAgentKnowledgeSyncStateRepository> {
  const states = new Map<string, ServiceAgentKnowledgeSyncState>()
  return {
    findByDocument: jest.fn(async (_serviceAgentKey, documentId) => states.get(documentId) ?? null),
    listByServiceAgent: jest.fn(async () => [...states.values()]),
    upsert: jest.fn(async (input) => {
      const state: ServiceAgentKnowledgeSyncState = {
        serviceAgentKey: input.serviceAgentKey,
        documentId: input.documentId,
        officialAgentId: input.officialAgentId ?? null,
        officialMemoryId: input.officialMemoryId ?? null,
        contentHash: input.contentHash ?? null,
        sourcePointer: input.sourcePointer ?? {},
        status: input.status,
        lastError: input.lastError ?? null,
        lastSyncedAt: input.lastSyncedAt ?? null,
        deletedAt: input.deletedAt ?? null,
      }
      states.set(input.documentId, state)
      return state
    }),
  }
}

function makeClient(overrides: {
  getRecord?: jest.Mock
  getRecordByExternalId?: jest.Mock
  createRecord?: jest.Mock
  replaceRecord?: jest.Mock
} = {}): jest.Mocked<WagdieElizaClient> {
  return {
    auth: {
      getNonce: jest.fn(),
      verify: jest.fn(),
    },
    characters: {
      getRecord: overrides.getRecord ?? jest.fn(async (id: string) => record({ id, externalId: 'existing-official-external-id' })),
      getRecordByExternalId: overrides.getRecordByExternalId ?? jest.fn(async () => null),
      createRecord: overrides.createRecord ?? jest.fn(async (input) => record({
        id: 'created-gm-agent',
        externalId: input.externalId ?? null,
        character: input.character,
      })),
      replaceRecord: overrides.replaceRecord ?? jest.fn(async (id, input) => record({ id, character: input.character })),
    },
    chat: { sendMessageStream: jest.fn() },
    conversations: {
      list: jest.fn(),
      listForCharacter: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    },
  }
}

describe('GameMasterAgentService', () => {
  afterEach(() => {
    setEnvFallback(originalGameMasterAgentId)
    jest.restoreAllMocks()
  })

  it('resolves runtime id with DB setting before env fallback', async () => {
    setEnvFallback('gm-env-1')
    const service = new GameMasterAgentService({
      settingsRepository: makeSettingsRepository(setting({ officialAgentId: 'gm-db-override' })),
      knowledgeSyncRepository: makeKnowledgeRepository(),
      createClient: () => makeClient(),
    })

    await expect(service.resolveRuntimeGameMasterAgentId()).resolves.toBe('gm-db-override')
  })

  it('falls back to env when no DB setting exists and throws when both are missing', async () => {
    const settingsRepository = makeSettingsRepository(null)
    const service = new GameMasterAgentService({
      settingsRepository,
      knowledgeSyncRepository: makeKnowledgeRepository(),
      createClient: () => makeClient(),
    })

    setEnvFallback('gm-env-1')
    await expect(service.resolveRuntimeGameMasterAgentId()).resolves.toBe('gm-env-1')

    setEnvFallback('')
    await expect(service.resolveRuntimeGameMasterAgentId()).rejects.toBeInstanceOf(GameMasterAgentConfigError)
  })

  it('bootstraps by adopting the exact env official agent record without rewriting its external id', async () => {
    setEnvFallback('official-env-agent-id')
    const settingsRepository = makeSettingsRepository(null)
    const client = makeClient({
      getRecord: jest.fn(async () => record({
        id: 'official-env-agent-id',
        externalId: 'preexisting-official-external-id',
      })),
    })
    const service = new GameMasterAgentService({
      settingsRepository,
      knowledgeSyncRepository: makeKnowledgeRepository(),
      createClient: () => client,
    })

    const result = await service.bootstrapGameMasterAgent('0xadmin')

    expect(result.adoptedEnv).toBe(true)
    expect(result.created).toBe(false)
    expect(result.setting).toMatchObject({
      officialAgentId: 'official-env-agent-id',
      externalId: 'preexisting-official-external-id',
      source: 'env_adopted',
    })
    expect(client.characters.getRecord).toHaveBeenCalledWith('official-env-agent-id')
    expect(client.characters.getRecordByExternalId).not.toHaveBeenCalled()
    expect(client.characters.createRecord).not.toHaveBeenCalled()
  })

  it('creates the deterministic service agent when there is no adoptable env agent', async () => {
    setEnvFallback('')
    const settingsRepository = makeSettingsRepository(null)
    const client = makeClient()
    const service = new GameMasterAgentService({
      settingsRepository,
      knowledgeSyncRepository: makeKnowledgeRepository(),
      createClient: () => client,
    })

    const result = await service.bootstrapGameMasterAgent('0xadmin')

    expect(result.created).toBe(true)
    expect(client.characters.getRecordByExternalId).toHaveBeenCalledWith(GAME_MASTER_AGENT_EXTERNAL_ID)
    expect(client.characters.createRecord).toHaveBeenCalledWith(expect.objectContaining({
      externalId: GAME_MASTER_AGENT_EXTERNAL_ID,
      character: expect.objectContaining({ name: 'WAGDIE Game Master' }),
    }))
    expect(result.setting).toMatchObject({
      officialAgentId: 'created-gm-agent',
      externalId: GAME_MASTER_AGENT_EXTERNAL_ID,
      source: 'deterministic_created',
    })
  })

  it('returns admin state with persona/knowledge even when sync-state lookup fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const knowledgeSyncRepository = makeKnowledgeRepository()
    knowledgeSyncRepository.listByServiceAgent.mockRejectedValueOnce(new Error('sync table unavailable'))
    const service = new GameMasterAgentService({
      settingsRepository: makeSettingsRepository(setting({ officialAgentId: 'gm-db-1' })),
      knowledgeSyncRepository,
      createClient: () => makeClient({
        getRecord: jest.fn(async () => record({
          id: 'gm-db-1',
          character: {
            name: 'GM',
            knowledge: [{ id: 'doc-1', path: 'notes.md', content: 'The bell waits.' }],
          },
        })),
      }),
    })

    const state = await service.getAdminGameMasterAgentState()

    expect(state.officialRecordStatus).toEqual({ available: true, error: null })
    expect(state.aiCharacter).toMatchObject({ id: 'gm-db-1', name: 'GM' })
    expect(state.knowledge).toEqual([
      expect.objectContaining({ id: 'doc-1', path: 'notes.md', syncState: null }),
    ])
    expect(state.canonicalContent.knowledge.syncStateLookupFailed).toBe(true)
    expect(state.canonicalContent.knowledge.documents).toHaveLength(GAME_MASTER_CANONICAL_CONTENT.knowledge.length)
    expect(state.canonicalContent.knowledge.documents).toEqual(expect.arrayContaining(
      GAME_MASTER_CANONICAL_CONTENT.knowledge.map((document) => expect.objectContaining({
        id: document.id,
        syncStatus: 'unknown',
      }))
    ))
    expect(warnSpy).toHaveBeenCalledWith(
      '[Game Master Agent] Failed to fetch knowledge sync state for admin state:',
      expect.any(Error)
    )
  })

  it('detects persona drift when live system is stale even if systemPrompt is canonical', async () => {
    const service = new GameMasterAgentService({
      settingsRepository: makeSettingsRepository(setting({ officialAgentId: 'gm-db-1' })),
      knowledgeSyncRepository: makeKnowledgeRepository(),
      createClient: () => makeClient({
        getRecord: jest.fn(async () => record({
          id: 'gm-db-1',
          character: {
            ...buildCanonicalGameMasterAgentCharacter(),
            system: 'Old instructions',
            systemPrompt: GAME_MASTER_CANONICAL_CONTENT.persona.systemPrompt,
            knowledge: [],
          },
        })),
      }),
    })

    const review = await service.getCanonicalGameMasterContentReview()

    expect(review.persona.status).toBe('drifted')
    expect(review.persona.changedFields).toContain('system')
    expect(review.persona.changedFields).not.toContain('systemPrompt')
  })

  it('computes canonical content review drift for the active official record', async () => {
    const service = new GameMasterAgentService({
      settingsRepository: makeSettingsRepository(setting({ officialAgentId: 'gm-db-1' })),
      knowledgeSyncRepository: makeKnowledgeRepository(),
      createClient: () => makeClient({
        getRecord: jest.fn(async () => record({
          id: 'gm-db-1',
          character: {
            name: 'Legacy GM',
            system: 'Old instructions',
            knowledge: [],
          },
        })),
      }),
    })

    const review = await service.getCanonicalGameMasterContentReview()

    expect(review.bundleId).toBe(GAME_MASTER_CANONICAL_CONTENT.bundleId)
    expect(review.reviewToken).toEqual(expect.any(String))
    expect(review.persona.status).toBe('drifted')
    expect(review.persona.changedFields).toContain('name')
    expect(review.knowledge.documents).toHaveLength(GAME_MASTER_CANONICAL_CONTENT.knowledge.length)
    expect(review.knowledge.documents).toEqual(expect.arrayContaining(
      GAME_MASTER_CANONICAL_CONTENT.knowledge.map((document) => expect.objectContaining({
        id: document.id,
        liveStatus: 'missing',
        shouldSync: true,
      }))
    ))
  })

  it('applies canonical persona through the existing replace-record flow and records metadata', async () => {
    const settingsRepository = makeSettingsRepository(setting({ officialAgentId: 'gm-db-1' }))
    const client = makeClient({
      getRecord: jest.fn(async () => record({
        id: 'gm-db-1',
        character: { name: 'Legacy GM', system: 'Old instructions', knowledge: [] },
      })),
      replaceRecord: jest.fn(async (id, input) => record({ id, character: input.character })),
    })
    const service = new GameMasterAgentService({
      settingsRepository,
      knowledgeSyncRepository: makeKnowledgeRepository(),
      createClient: () => client,
    })
    const review = await service.getCanonicalGameMasterContentReview()

    await expect(service.applyCanonicalGameMasterContent({
      persona: true,
      expectedReviewToken: 'stale-token',
    }, '0xadmin')).rejects.toBeInstanceOf(GameMasterCanonicalReviewConflictError)

    const result = await service.applyCanonicalGameMasterContent({
      persona: true,
      expectedReviewToken: review.reviewToken,
    }, '0xadmin')

    expect(result.persona).toMatchObject({ applied: true, hash: expect.any(String) })
    expect(client.characters.replaceRecord).toHaveBeenCalledWith('gm-db-1', {
      character: expect.objectContaining({
        name: GAME_MASTER_CANONICAL_CONTENT.persona.name,
        system: GAME_MASTER_CANONICAL_CONTENT.persona.systemPrompt,
        bio: GAME_MASTER_CANONICAL_CONTENT.persona.bio,
      }),
    })
    expect(settingsRepository.upsertActive).toHaveBeenLastCalledWith(expect.objectContaining({
      source: 'admin',
      updatedBy: '0xadmin',
      metadata: expect.objectContaining({
        canonicalContent: expect.objectContaining({
          bundleId: GAME_MASTER_CANONICAL_CONTENT.bundleId,
          contentVersion: GAME_MASTER_CANONICAL_CONTENT.contentVersion,
          persona: expect.objectContaining({ appliedBy: '0xadmin' }),
        }),
      }),
    }))
  })

  it('upserts canonical knowledge by deterministic id, preserves admin docs, and syncs with canonical source metadata', async () => {
    const extraDoc = { id: 'admin-doc', path: 'admin-notes.md', content: 'Admin notes remain.' }
    const settingsRepository = makeSettingsRepository(setting({ officialAgentId: 'gm-db-1' }))
    const knowledgeSyncRepository = makeKnowledgeRepository()
    const client = makeClient({
      getRecord: jest.fn(async () => record({
        id: 'gm-db-1',
        character: {
          ...buildCanonicalGameMasterAgentCharacter(),
          knowledge: [extraDoc],
        },
      })),
      replaceRecord: jest.fn(async (id, input) => record({ id, character: input.character })),
    })
    const officialKnowledgeClient: jest.Mocked<OfficialKnowledgeClient> = {
      indexDocument: jest.fn(async () => ({ memoryId: 'memory-1', status: 'indexed' })),
      deleteDocument: jest.fn(),
    }
    const service = new GameMasterAgentService({
      settingsRepository,
      knowledgeSyncRepository,
      createClient: () => client,
      officialKnowledgeClient,
    })
    const review = await service.getCanonicalGameMasterContentReview()

    const result = await service.applyCanonicalGameMasterContent({
      knowledge: true,
      expectedReviewToken: review.reviewToken,
    }, '0xadmin')

    const canonicalDocs = GAME_MASTER_CANONICAL_CONTENT.knowledge.map(toStoredCanonicalKnowledgeDocument)
    expect(result.knowledge?.documents).toHaveLength(canonicalDocs.length)
    expect(result.knowledge?.documents).toEqual(expect.arrayContaining(
      canonicalDocs.map((document) => expect.objectContaining({ id: document.id, action: 'synced' }))
    ))
    expect(client.characters.replaceRecord).toHaveBeenCalledWith('gm-db-1', {
      character: expect.objectContaining({
        knowledge: [extraDoc, ...canonicalDocs],
      }),
    })
    expect(officialKnowledgeClient.indexDocument).toHaveBeenCalledTimes(canonicalDocs.length)
    for (const canonicalDoc of canonicalDocs) {
      expect(officialKnowledgeClient.indexDocument).toHaveBeenCalledWith(expect.objectContaining({
        documentId: canonicalDoc.id,
        path: canonicalDoc.path,
        sourcePointer: expect.objectContaining({
          canonical: expect.objectContaining({
            bundleId: GAME_MASTER_CANONICAL_CONTENT.bundleId,
            contentVersion: GAME_MASTER_CANONICAL_CONTENT.contentVersion,
            documentId: canonicalDoc.id,
          }),
        }),
      }))
    }
  })

  it('rejects canonical knowledge before writing when preserved docs would exceed the document limit', async () => {
    const preservedDocCount = FIELD_LIMITS.maxKnowledgeDocs - GAME_MASTER_CANONICAL_CONTENT.knowledge.length + 1
    const liveDocs = Array.from({ length: preservedDocCount }, (_, index) => ({
      id: `admin-doc-${index}`,
      path: `admin-${index}.md`,
      content: `Admin doc ${index}`,
    }))
    const client = makeClient({
      getRecord: jest.fn(async () => record({
        id: 'gm-db-1',
        character: {
          ...buildCanonicalGameMasterAgentCharacter(),
          knowledge: liveDocs,
        },
      })),
      replaceRecord: jest.fn(async (id, input) => record({ id, character: input.character })),
    })
    const service = new GameMasterAgentService({
      settingsRepository: makeSettingsRepository(setting({ officialAgentId: 'gm-db-1' })),
      knowledgeSyncRepository: makeKnowledgeRepository(),
      createClient: () => client,
    })
    const review = await service.getCanonicalGameMasterContentReview()

    expect(review.knowledge.documentLimit.conflict).toBe(true)
    await expect(service.applyCanonicalGameMasterContent({
      knowledge: true,
      expectedReviewToken: review.reviewToken,
    })).rejects.toBeInstanceOf(GameMasterKnowledgeValidationError)
    expect(client.characters.replaceRecord).not.toHaveBeenCalled()
  })

  it('preserves embedded canonical knowledge when Official indexing fails and records canonical error state', async () => {
    const settingsRepository = makeSettingsRepository(setting({ officialAgentId: 'gm-db-1' }))
    const knowledgeSyncRepository = makeKnowledgeRepository()
    const client = makeClient({
      getRecord: jest.fn(async () => record({ id: 'gm-db-1', character: { name: 'GM', knowledge: [] } })),
      replaceRecord: jest.fn(async (id, input) => record({ id, character: input.character })),
    })
    const officialKnowledgeClient: jest.Mocked<OfficialKnowledgeClient> = {
      indexDocument: jest.fn(async () => {
        throw new Error('canonical upstream unavailable')
      }),
      deleteDocument: jest.fn(),
    }
    const service = new GameMasterAgentService({
      settingsRepository,
      knowledgeSyncRepository,
      createClient: () => client,
      officialKnowledgeClient,
    })
    const review = await service.getCanonicalGameMasterContentReview()

    const result = await service.applyCanonicalGameMasterContent({
      knowledge: true,
      expectedReviewToken: review.reviewToken,
    }, '0xadmin')

    const canonicalDocs = GAME_MASTER_CANONICAL_CONTENT.knowledge.map(toStoredCanonicalKnowledgeDocument)
    expect(client.characters.replaceRecord).toHaveBeenCalledWith('gm-db-1', {
      character: expect.objectContaining({ knowledge: canonicalDocs }),
    })
    expect(result.knowledge?.documents).toHaveLength(canonicalDocs.length)
    expect(result.knowledge?.documents).toEqual(expect.arrayContaining(
      canonicalDocs.map((canonicalDoc) => expect.objectContaining({
        id: canonicalDoc.id,
        path: canonicalDoc.path,
        action: 'failed',
        sync: expect.objectContaining({ attempted: true, ok: false, error: 'canonical upstream unavailable' }),
      }))
    ))
    expect(result.reviewAfter.knowledge.documents).toHaveLength(canonicalDocs.length)
    expect(result.reviewAfter.knowledge.documents).toEqual(expect.arrayContaining(
      canonicalDocs.map((canonicalDoc) => expect.objectContaining({
        id: canonicalDoc.id,
        liveStatus: 'in_sync',
        syncStatus: 'error',
        hasSyncError: true,
        shouldSync: true,
      }))
    ))
    for (const canonicalDoc of canonicalDocs) {
      expect(knowledgeSyncRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
        serviceAgentKey: GAME_MASTER_AGENT_SETTING_KEY,
        documentId: canonicalDoc.id,
        status: 'error',
        sourcePointer: expect.objectContaining({
          canonical: expect.objectContaining({
            bundleId: GAME_MASTER_CANONICAL_CONTENT.bundleId,
            contentVersion: GAME_MASTER_CANONICAL_CONTENT.contentVersion,
            documentId: canonicalDoc.id,
          }),
        }),
      }))
    }
  })

  it('keeps embedded knowledge when official service-agent indexing fails and records error state', async () => {
    setEnvFallback('')
    const settingsRepository = makeSettingsRepository(setting({ officialAgentId: 'gm-db-1' }))
    const knowledgeSyncRepository = makeKnowledgeRepository()
    const client = makeClient({
      getRecord: jest.fn(async () => record({ id: 'gm-db-1', character: { name: 'GM', knowledge: [] } })),
      replaceRecord: jest.fn(async (id, input) => record({ id, character: input.character })),
    })
    const officialKnowledgeClient: jest.Mocked<OfficialKnowledgeClient> = {
      indexDocument: jest.fn(async () => {
        throw new Error('upstream unavailable')
      }),
      deleteDocument: jest.fn(),
    }
    const service = new GameMasterAgentService({
      settingsRepository,
      knowledgeSyncRepository,
      createClient: () => client,
      officialKnowledgeClient,
    })

    const result = await service.uploadGameMasterKnowledgeDocument({
      filename: 'gm-notes.md',
      mimeType: 'text/markdown',
      content: '# Notes\nThe bell waits.',
    })

    expect(result.record.character.knowledge).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: result.document.id, path: 'gm-notes.md' }),
    ]))
    expect(result.sync).toMatchObject({ attempted: true, ok: false, error: 'upstream unavailable' })
    expect(knowledgeSyncRepository.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      serviceAgentKey: GAME_MASTER_AGENT_SETTING_KEY,
      documentId: result.document.id,
      status: 'error',
      sourcePointer: expect.objectContaining({
        serviceAgentKey: GAME_MASTER_AGENT_SETTING_KEY,
        officialAgentId: 'gm-db-1',
      }),
    }))
  })

  it('rejects non-txt/md V1 game-master knowledge uploads in the service layer', async () => {
    const service = new GameMasterAgentService({
      settingsRepository: makeSettingsRepository(setting()),
      knowledgeSyncRepository: makeKnowledgeRepository(),
      createClient: () => makeClient(),
    })

    await expect(service.uploadGameMasterKnowledgeDocument({
      filename: 'data.json',
      mimeType: 'application/json',
      content: '{}',
    })).rejects.toBeInstanceOf(GameMasterKnowledgeValidationError)
  })
})
