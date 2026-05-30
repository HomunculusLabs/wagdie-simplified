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

jest.mock('@/lib/eliza/gameMasterAgent/service', () => {
  class GameMasterAgentNotBootstrappedError extends Error {
    constructor() {
      super('Create or adopt a game-master agent before editing persona or knowledge')
      this.name = 'GameMasterAgentNotBootstrappedError'
    }
  }

  class GameMasterKnowledgeValidationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'GameMasterKnowledgeValidationError'
    }
  }

  class GameMasterCanonicalReviewConflictError extends Error {
    constructor() {
      super('Canonical game-master content preview is stale; refresh and try again')
      this.name = 'GameMasterCanonicalReviewConflictError'
    }
  }

  return {
    GameMasterAgentNotBootstrappedError,
    GameMasterCanonicalReviewConflictError,
    GameMasterKnowledgeValidationError,
    gameMasterAgentService: {
      getAdminGameMasterAgentState: jest.fn(),
      bootstrapGameMasterAgent: jest.fn(),
      updateActiveGameMasterPersona: jest.fn(),
      clearActiveGameMasterAgentSetting: jest.fn(),
      uploadGameMasterKnowledgeDocument: jest.fn(),
      deleteGameMasterKnowledgeDocument: jest.fn(),
      retryGameMasterKnowledgeSync: jest.fn(),
      applyCanonicalGameMasterContent: jest.fn(),
    },
  }
})

const { GET, POST, PATCH, DELETE } = require('@/app/api/admin/eliza/game-master-agent/route')
const { POST: POST_KNOWLEDGE } = require('@/app/api/admin/eliza/game-master-agent/knowledge/route')
const { DELETE: DELETE_KNOWLEDGE } = require('@/app/api/admin/eliza/game-master-agent/knowledge/[documentId]/route')
const { POST: RETRY_KNOWLEDGE_SYNC } = require('@/app/api/admin/eliza/game-master-agent/knowledge/[documentId]/sync/route')
const { POST: APPLY_CANONICAL } = require('@/app/api/admin/eliza/game-master-agent/canonical/apply/route')
const { requireAdmin } = require('@/lib/api/auth')
const {
  GameMasterAgentNotBootstrappedError,
  GameMasterCanonicalReviewConflictError,
  GameMasterKnowledgeValidationError,
  gameMasterAgentService,
} = require('@/lib/eliza/gameMasterAgent/service')

const mockedService = gameMasterAgentService as jest.Mocked<typeof gameMasterAgentService>

function adminState(overrides: Record<string, unknown> = {}) {
  return {
    effectiveSource: 'admin',
    envFallback: {
      configured: true,
      officialAgentId: 'gm-env-1',
    },
    activeSetting: {
      settingKey: 'location-room-game-master',
      officialAgentId: 'gm-admin-1',
      externalId: 'wagdie:service:location-room-game-master',
      source: 'deterministic_created',
      createdBy: '0xAdmin',
      updatedBy: '0xAdmin',
      lastValidatedAt: '2026-05-22T12:00:00.000Z',
      validationError: null,
      validationErrorAt: null,
      metadata: {},
      createdAt: '2026-05-22T12:00:00.000Z',
      updatedAt: '2026-05-22T12:00:00.000Z',
    },
    officialAgentId: 'gm-admin-1',
    officialRecordStatus: {
      available: true,
      error: null,
    },
    aiCharacter: {
      id: 'gm-admin-1',
      externalId: 'wagdie:service:location-room-game-master',
      name: 'WAGDIE Game Master',
      backstory: null,
      systemPrompt: null,
      exampleMessages: [],
      createdAt: '2026-05-22T12:00:00.000Z',
      updatedAt: '2026-05-22T12:00:00.000Z',
    },
    knowledge: [
      {
        id: 'doc-1',
        path: 'gm-notes.md',
        preview: 'The bell waits.',
        size: 15,
        syncState: {
          serviceAgentKey: 'location-room-game-master',
          documentId: 'doc-1',
          officialAgentId: 'gm-admin-1',
          officialMemoryId: 'mem-1',
          contentHash: 'hash-1',
          sourcePointer: { secretish: 'do-not-return' },
          status: 'error',
          lastError: 'raw upstream stack with provider details',
          lastSyncedAt: null,
          deletedAt: null,
          createdAt: '2026-05-22T12:00:00.000Z',
          updatedAt: '2026-05-22T12:00:00.000Z',
        },
      },
    ],
    canonicalContent: {
      schemaVersion: 1,
      bundleId: 'wagdie-location-room-game-master',
      contentVersion: '2026-05-30.1',
      reviewToken: 'review-token',
      canApply: true,
      unavailableReason: null,
      persona: {
        status: 'drifted',
        canonicalHash: 'persona-hash-new',
        liveHash: 'persona-hash-old',
        changedFields: ['systemPrompt'],
        lastApplied: null,
      },
      knowledge: {
        status: 'drifted',
        documentLimit: {
          max: 5,
          liveCount: 1,
          canonicalCount: 1,
          preservedLiveCount: 0,
          resultingCount: 1,
          conflict: false,
        },
        documents: [],
        obsoletePreservedDocuments: [],
        syncStateLookupFailed: false,
        lastApplied: null,
      },
    },
    ...overrides,
  }
}

function request(url = 'http://localhost/api/admin/eliza/game-master-agent', init?: RequestInit) {
  return new NextRequest(url, init)
}

function params(documentId = 'doc-1') {
  return { params: Promise.resolve({ documentId }) }
}

describe('admin game-master agent routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(requireAdmin as jest.Mock).mockResolvedValue({ address: '0xAdmin' })
    mockedService.getAdminGameMasterAgentState.mockResolvedValue(adminState() as never)
  })

  it('requires admin and adds no-store to auth failures', async () => {
    ;(requireAdmin as jest.Mock).mockResolvedValueOnce(
      NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    )

    const response = await GET()

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mockedService.getAdminGameMasterAgentState).not.toHaveBeenCalled()
  })

  it('returns no-store admin state with sanitized knowledge sync errors', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const body = await response.json()
    expect(body.effectiveSource).toBe('admin')
    expect(body.envFallback).toMatchObject({ configured: true, officialAgentId: 'gm-env-1' })
    expect(body.knowledge[0].syncState.lastError).toBe('Knowledge sync failed. Retry after checking ElizaOS availability.')
    expect(body.knowledge[0].syncState.sourcePointer).toBeUndefined()
  })

  it('bootstraps with the admin wallet and returns the same state shape', async () => {
    const response = await POST()

    expect(mockedService.bootstrapGameMasterAgent).toHaveBeenCalledWith('0xAdmin')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      effectiveSource: 'admin',
      activeSetting: expect.objectContaining({ officialAgentId: 'gm-admin-1' }),
    })
  })

  it('returns 409 when persona update runs before create/adopt', async () => {
    mockedService.updateActiveGameMasterPersona.mockRejectedValueOnce(new GameMasterAgentNotBootstrappedError())

    const response = await PATCH(request(undefined, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'GM' }),
    }))

    expect(response.status).toBe(409)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      error: 'Create or adopt a game-master agent before editing persona or knowledge',
    })
  })

  it('clears only the DB setting and returns fallback state', async () => {
    mockedService.getAdminGameMasterAgentState.mockResolvedValueOnce(adminState({
      effectiveSource: 'env',
      activeSetting: null,
      officialAgentId: 'gm-env-1',
    }) as never)

    const response = await DELETE()

    expect(mockedService.clearActiveGameMasterAgentSetting).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      effectiveSource: 'env',
      activeSetting: null,
      officialAgentId: 'gm-env-1',
    })
  })

  it('uploads .txt/.md knowledge with existing size guard and returns sync status', async () => {
    const formData = new FormData()
    formData.set('file', new File(['# Notes'], 'notes.md', { type: 'text/markdown' }))
    mockedService.uploadGameMasterKnowledgeDocument.mockResolvedValueOnce({
      record: {} as never,
      document: { id: 'doc-1', path: 'notes.md', content: '# Notes' },
      sync: { attempted: true, ok: false, error: 'raw upstream detail' },
    })

    const response = await POST_KNOWLEDGE(request(
      'http://localhost/api/admin/eliza/game-master-agent/knowledge',
      { method: 'POST', body: formData }
    ))

    expect(mockedService.uploadGameMasterKnowledgeDocument).toHaveBeenCalledWith({
      filename: 'notes.md',
      mimeType: 'text/markdown',
      content: '# Notes',
    })
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.sync).toMatchObject({
      attempted: true,
      ok: false,
      error: 'Knowledge sync failed. Retry after checking ElizaOS availability.',
    })
  })

  it('returns 400 for malformed multipart uploads', async () => {
    const response = await POST_KNOWLEDGE(request(
      'http://localhost/api/admin/eliza/game-master-agent/knowledge',
      {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data; boundary=bad-boundary' },
        body: 'not a valid multipart body',
      }
    ))

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ error: 'Invalid form data' })
    expect(mockedService.uploadGameMasterKnowledgeDocument).not.toHaveBeenCalled()
  })

  it('surfaces service-layer upload validation without raw upstream details', async () => {
    const formData = new FormData()
    formData.set('file', new File(['{}'], 'notes.json', { type: 'application/json' }))
    mockedService.uploadGameMasterKnowledgeDocument.mockRejectedValueOnce(
      new GameMasterKnowledgeValidationError('Game-master knowledge uploads support .txt and .md files only')
    )

    const response = await POST_KNOWLEDGE(request(
      'http://localhost/api/admin/eliza/game-master-agent/knowledge',
      { method: 'POST', body: formData }
    ))

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      error: 'Game-master knowledge uploads support .txt and .md files only',
    })
  })

  it('returns sanitized 502 responses for delete and retry sync failures', async () => {
    mockedService.deleteGameMasterKnowledgeDocument.mockResolvedValueOnce({
      record: {} as never,
      sync: { attempted: true, ok: false, error: 'raw delete upstream detail' },
    })
    mockedService.retryGameMasterKnowledgeSync.mockResolvedValueOnce({
      attempted: true,
      ok: false,
      error: 'raw retry upstream detail',
    })

    const deleteResponse = await DELETE_KNOWLEDGE(request(), params())
    const retryResponse = await RETRY_KNOWLEDGE_SYNC(request(), params())

    expect(deleteResponse.status).toBe(502)
    expect(retryResponse.status).toBe(502)
    await expect(deleteResponse.json()).resolves.toMatchObject({
      sync: {
        attempted: true,
        ok: false,
        error: 'Knowledge sync failed. Retry after checking ElizaOS availability.',
      },
    })
    await expect(retryResponse.json()).resolves.toMatchObject({
      sync: {
        attempted: true,
        ok: false,
        error: 'Knowledge sync failed. Retry after checking ElizaOS availability.',
      },
    })
  })

  it('requires admin and adds no-store for canonical apply auth failures', async () => {
    ;(requireAdmin as jest.Mock).mockResolvedValueOnce(
      NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    )

    const response = await APPLY_CANONICAL(request(
      'http://localhost/api/admin/eliza/game-master-agent/canonical/apply',
      {
        method: 'POST',
        body: JSON.stringify({ expectedReviewToken: 'review-token', persona: true }),
      }
    ))

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mockedService.applyCanonicalGameMasterContent).not.toHaveBeenCalled()
  })

  it('applies canonical persona or knowledge with the expected review token', async () => {
    mockedService.applyCanonicalGameMasterContent.mockResolvedValueOnce({
      reviewBefore: adminState().canonicalContent,
      reviewAfter: adminState().canonicalContent,
      persona: {
        applied: true,
        changedFields: ['systemPrompt'],
        hash: 'persona-hash-new',
      },
    })

    const response = await APPLY_CANONICAL(request(
      'http://localhost/api/admin/eliza/game-master-agent/canonical/apply',
      {
        method: 'POST',
        body: JSON.stringify({ expectedReviewToken: 'review-token', persona: true }),
      }
    ))

    expect(mockedService.applyCanonicalGameMasterContent).toHaveBeenCalledWith(
      { expectedReviewToken: 'review-token', persona: true },
      '0xAdmin'
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const body = await response.json()
    expect(body).toMatchObject({
      state: { effectiveSource: 'admin' },
      result: { persona: { applied: true, hash: 'persona-hash-new' } },
    })
    expect(body.state.knowledge[0].syncState.lastError).toBe('Knowledge sync failed. Retry after checking ElizaOS availability.')
    expect(body.state.knowledge[0].syncState.sourcePointer).toBeUndefined()
  })

  it('validates canonical apply body before calling the service', async () => {
    const invalidJsonResponse = await APPLY_CANONICAL(request(
      'http://localhost/api/admin/eliza/game-master-agent/canonical/apply',
      {
        method: 'POST',
        body: 'not valid json',
      }
    ))
    const missingTokenResponse = await APPLY_CANONICAL(request(
      'http://localhost/api/admin/eliza/game-master-agent/canonical/apply',
      {
        method: 'POST',
        body: JSON.stringify({ persona: true }),
      }
    ))
    const missingSelectionResponse = await APPLY_CANONICAL(request(
      'http://localhost/api/admin/eliza/game-master-agent/canonical/apply',
      {
        method: 'POST',
        body: JSON.stringify({ expectedReviewToken: 'review-token' }),
      }
    ))

    expect(invalidJsonResponse.status).toBe(400)
    expect(invalidJsonResponse.headers.get('Cache-Control')).toBe('no-store')
    await expect(invalidJsonResponse.json()).resolves.toEqual({ error: 'Invalid JSON in request body' })
    expect(missingTokenResponse.status).toBe(400)
    expect(missingTokenResponse.headers.get('Cache-Control')).toBe('no-store')
    await expect(missingTokenResponse.json()).resolves.toEqual({ error: 'expectedReviewToken is required' })
    expect(missingSelectionResponse.status).toBe(400)
    expect(missingSelectionResponse.headers.get('Cache-Control')).toBe('no-store')
    await expect(missingSelectionResponse.json()).resolves.toEqual({
      error: 'Choose canonical persona, knowledge, or both to apply',
    })
    expect(mockedService.applyCanonicalGameMasterContent).not.toHaveBeenCalled()
  })

  it('maps not-bootstrapped canonical applies to 409', async () => {
    mockedService.applyCanonicalGameMasterContent.mockRejectedValueOnce(new GameMasterAgentNotBootstrappedError())

    const response = await APPLY_CANONICAL(request(
      'http://localhost/api/admin/eliza/game-master-agent/canonical/apply',
      {
        method: 'POST',
        body: JSON.stringify({ expectedReviewToken: 'review-token', persona: true }),
      }
    ))

    expect(response.status).toBe(409)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      error: 'Create or adopt a game-master agent before editing persona or knowledge',
    })
  })

  it('maps stale canonical previews to 409', async () => {
    mockedService.applyCanonicalGameMasterContent.mockRejectedValueOnce(new GameMasterCanonicalReviewConflictError())

    const response = await APPLY_CANONICAL(request(
      'http://localhost/api/admin/eliza/game-master-agent/canonical/apply',
      {
        method: 'POST',
        body: JSON.stringify({ expectedReviewToken: 'stale-token', knowledge: true }),
      }
    ))

    expect(response.status).toBe(409)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      error: 'Canonical game-master content preview is stale. Refresh and try again.',
    })
  })

  it('sanitizes canonical knowledge apply sync failures', async () => {
    mockedService.applyCanonicalGameMasterContent.mockResolvedValueOnce({
      reviewBefore: adminState().canonicalContent,
      reviewAfter: adminState().canonicalContent,
      knowledge: {
        applied: true,
        documentLimit: adminState().canonicalContent.knowledge.documentLimit,
        documents: [
          {
            id: 'canonical-doc',
            path: 'canonical.md',
            action: 'failed',
            sync: {
              attempted: true,
              ok: false,
              error: 'raw upstream provider detail',
            },
          },
        ],
      },
    })

    const response = await APPLY_CANONICAL(request(
      'http://localhost/api/admin/eliza/game-master-agent/canonical/apply',
      {
        method: 'POST',
        body: JSON.stringify({ expectedReviewToken: 'review-token', knowledge: true }),
      }
    ))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      state: {
        knowledge: [
          {
            syncState: {
              lastError: 'Knowledge sync failed. Retry after checking ElizaOS availability.',
            },
          },
        ],
      },
      result: {
        knowledge: {
          documents: [
            {
              id: 'canonical-doc',
              sync: {
                attempted: true,
                ok: false,
                error: 'Knowledge sync failed. Retry after checking ElizaOS availability.',
              },
            },
          ],
        },
      },
    })
    expect(body.state.knowledge[0].syncState.sourcePointer).toBeUndefined()
  })
})
