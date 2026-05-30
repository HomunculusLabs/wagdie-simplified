import { NextResponse } from 'next/server'
import { isAuthError, requireAdmin, type AuthResult } from '@/lib/api/auth'
import { jsonNoStore, jsonNoStoreError } from '@/lib/api/responses'
import {
  GameMasterAgentNotBootstrappedError,
  GameMasterCanonicalReviewConflictError,
  GameMasterKnowledgeValidationError,
  gameMasterAgentService,
  type ApplyCanonicalGameMasterContentResult,
  type GameMasterAgentAdminState,
  type GameMasterKnowledgeDocumentWithSync,
  type ServiceKnowledgeSyncResult,
} from '@/lib/eliza/gameMasterAgent/service'
import type { ServiceAgentKnowledgeSyncState } from '@/lib/eliza/gameMasterAgent/repository'

const SAFE_SYNC_ERROR_MESSAGE = 'Knowledge sync failed. Retry after checking ElizaOS availability.'
const SAFE_SERVER_ERROR_MESSAGE = 'Failed to manage game-master agent'

type SafeKnowledgeSyncState = Omit<ServiceAgentKnowledgeSyncState, 'sourcePointer' | 'lastError'> & {
  lastError: string | null
}

type SafeKnowledgeDocumentWithSync = Omit<GameMasterKnowledgeDocumentWithSync, 'syncState'> & {
  syncState: SafeKnowledgeSyncState | null
}

export type AdminGameMasterAgentStateResponse = Omit<GameMasterAgentAdminState, 'knowledge'> & {
  knowledge: SafeKnowledgeDocumentWithSync[]
}

export type AdminGameMasterAgentSyncResponse = {
  state: AdminGameMasterAgentStateResponse
  sync: {
    attempted: boolean
    ok: boolean
    state?: SafeKnowledgeSyncState
    error: string | null
  }
}

export type AdminGameMasterAgentCanonicalApplyResponse = {
  state: AdminGameMasterAgentStateResponse
  result: Omit<ApplyCanonicalGameMasterContentResult, 'knowledge'> & {
    knowledge?: Omit<NonNullable<ApplyCanonicalGameMasterContentResult['knowledge']>, 'documents'> & {
      documents: Array<Omit<NonNullable<ApplyCanonicalGameMasterContentResult['knowledge']>['documents'][number], 'sync'> & {
        sync: AdminGameMasterAgentSyncResponse['sync'] | null
      }>
    }
  }
}

export async function requireAdminNoStore(): Promise<AuthResult | NextResponse> {
  const auth = await requireAdmin()
  if (isAuthError(auth)) {
    auth.headers.set('Cache-Control', 'no-store')
  }

  return auth
}

function sanitizeSyncState(state: ServiceAgentKnowledgeSyncState | null | undefined): SafeKnowledgeSyncState | null {
  if (!state) return null

  return {
    serviceAgentKey: state.serviceAgentKey,
    documentId: state.documentId,
    officialAgentId: state.officialAgentId,
    officialMemoryId: state.officialMemoryId,
    contentHash: state.contentHash,
    status: state.status,
    lastError: state.lastError ? SAFE_SYNC_ERROR_MESSAGE : null,
    lastSyncedAt: state.lastSyncedAt,
    deletedAt: state.deletedAt,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  }
}

export function serializeGameMasterAgentState(
  state: GameMasterAgentAdminState
): AdminGameMasterAgentStateResponse {
  return {
    ...state,
    knowledge: state.knowledge.map((document) => ({
      ...document,
      syncState: sanitizeSyncState(document.syncState),
    })),
  }
}

export function sanitizeSyncResult(sync: ServiceKnowledgeSyncResult): AdminGameMasterAgentSyncResponse['sync'] {
  return {
    attempted: sync.attempted,
    ok: sync.ok,
    state: sanitizeSyncState(sync.state) ?? undefined,
    error: sync.error ? SAFE_SYNC_ERROR_MESSAGE : null,
  }
}

export function sanitizeCanonicalApplyResult(
  result: ApplyCanonicalGameMasterContentResult
): AdminGameMasterAgentCanonicalApplyResponse['result'] {
  return {
    ...result,
    knowledge: result.knowledge
      ? {
          ...result.knowledge,
          documents: result.knowledge.documents.map((document) => ({
            ...document,
            sync: document.sync ? sanitizeSyncResult(document.sync) : null,
          })),
        }
      : undefined,
  }
}

export async function gameMasterAgentStateResponse(status = 200): Promise<NextResponse<AdminGameMasterAgentStateResponse>> {
  const state = await gameMasterAgentService.getAdminGameMasterAgentState()
  return jsonNoStore(serializeGameMasterAgentState(state), { status })
}

export async function gameMasterAgentSyncResponse(
  sync: ServiceKnowledgeSyncResult,
  status = sync.ok ? 200 : 502
): Promise<NextResponse<AdminGameMasterAgentSyncResponse>> {
  const state = await gameMasterAgentService.getAdminGameMasterAgentState()
  return jsonNoStore(
    {
      state: serializeGameMasterAgentState(state),
      sync: sanitizeSyncResult(sync),
    },
    { status }
  )
}

export function gameMasterAgentErrorResponse(error: unknown, fallback = SAFE_SERVER_ERROR_MESSAGE): NextResponse {
  if (error instanceof GameMasterAgentNotBootstrappedError) {
    return jsonNoStoreError('Create or adopt a game-master agent before editing persona or knowledge', 409)
  }

  if (error instanceof GameMasterCanonicalReviewConflictError) {
    return jsonNoStoreError('Canonical game-master content preview is stale. Refresh and try again.', 409)
  }

  if (error instanceof GameMasterKnowledgeValidationError) {
    const status = error.message === 'Knowledge document not found' ? 404 : 400
    const details = (error as Error & { issues?: unknown }).issues
    if (details) {
      return jsonNoStore({ error: error.message, details }, { status })
    }

    return jsonNoStoreError(error.message, status)
  }

  console.error('[Admin Game Master Agent API] Error:', error)
  return jsonNoStoreError(fallback, 500)
}
