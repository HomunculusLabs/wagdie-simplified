import { NextRequest, NextResponse } from 'next/server'
import { jsonNoStoreError } from '@/lib/api/responses'
import { gameMasterAgentService } from '@/lib/eliza/gameMasterAgent/service'
import { FIELD_LIMITS } from '@/types/eliza'
import {
  gameMasterAgentErrorResponse,
  gameMasterAgentStateResponse,
  gameMasterAgentSyncResponse,
  requireAdminNoStore,
} from '../shared'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  const auth = await requireAdminNoStore()
  if (!('address' in auth)) return auth

  try {
    return await gameMasterAgentStateResponse()
  } catch (error) {
    return gameMasterAgentErrorResponse(error, 'Failed to fetch game-master knowledge')
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdminNoStore()
  if (!('address' in auth)) return auth

  try {
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return jsonNoStoreError('Invalid form data', 400)
    }

    const file = formData.get('file')

    if (!(file instanceof File)) {
      return jsonNoStoreError('No file provided', 400)
    }

    if (file.size > FIELD_LIMITS.maxKnowledgeSize) {
      return jsonNoStoreError(`File too large. Maximum size is ${FIELD_LIMITS.maxKnowledgeSize / 1024}KB`, 400)
    }

    const result = await gameMasterAgentService.uploadGameMasterKnowledgeDocument({
      filename: file.name,
      mimeType: file.type,
      content: await file.text(),
    })

    return await gameMasterAgentSyncResponse(result.sync, 201)
  } catch (error) {
    return gameMasterAgentErrorResponse(error, 'Failed to upload game-master knowledge document')
  }
}
