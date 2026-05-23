import { NextResponse } from 'next/server'
import { jsonNoStoreError } from '@/lib/api/responses'
import { gameMasterAgentService } from '@/lib/eliza/gameMasterAgent/service'
import {
  gameMasterAgentErrorResponse,
  gameMasterAgentSyncResponse,
  requireAdminNoStore,
} from '../../../shared'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ documentId: string }>
}

export async function POST(_request: Request, context: RouteContext): Promise<NextResponse> {
  const auth = await requireAdminNoStore()
  if (auth instanceof NextResponse) return auth

  const { documentId } = await context.params
  if (!documentId) {
    return jsonNoStoreError('Document ID is required', 400)
  }

  try {
    const sync = await gameMasterAgentService.retryGameMasterKnowledgeSync(documentId)
    return await gameMasterAgentSyncResponse(sync)
  } catch (error) {
    return gameMasterAgentErrorResponse(error, 'Failed to retry game-master knowledge sync')
  }
}
