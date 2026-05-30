import { NextResponse } from 'next/server'
import { jsonNoStoreError } from '@/lib/api/responses'
import { gameMasterAgentService } from '@/lib/eliza/gameMasterAgent/service'
import {
  gameMasterAgentErrorResponse,
  gameMasterAgentStateResponse,
  gameMasterAgentSyncResponse,
  requireAdminNoStore,
} from '../../shared'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ documentId: string }>
}

export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireAdminNoStore()
  if (!('address' in auth)) return auth

  const { documentId } = await context.params
  if (!documentId) {
    return jsonNoStoreError('Document ID is required', 400)
  }

  try {
    const result = await gameMasterAgentService.deleteGameMasterKnowledgeDocument(documentId)
    if (!result.sync.ok) {
      return await gameMasterAgentSyncResponse(result.sync, 502)
    }

    return await gameMasterAgentStateResponse()
  } catch (error) {
    return gameMasterAgentErrorResponse(error, 'Failed to delete game-master knowledge document')
  }
}
