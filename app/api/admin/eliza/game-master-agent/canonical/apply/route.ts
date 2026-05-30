import { NextRequest, NextResponse } from 'next/server'
import { jsonNoStore, jsonNoStoreError } from '@/lib/api/responses'
import { gameMasterAgentService } from '@/lib/eliza/gameMasterAgent/service'
import {
  gameMasterAgentErrorResponse,
  requireAdminNoStore,
  sanitizeCanonicalApplyResult,
  serializeGameMasterAgentState,
  type AdminGameMasterAgentCanonicalApplyResponse,
} from '../../shared'

export const runtime = 'nodejs'

type CanonicalApplyBody = {
  persona?: boolean
  knowledge?: boolean
  expectedReviewToken: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseCanonicalApplyBody(body: unknown): CanonicalApplyBody | { error: string } {
  if (!isRecord(body)) {
    return { error: 'Request body must be a JSON object' }
  }

  const expectedReviewToken = body.expectedReviewToken
  const persona = body.persona
  const knowledge = body.knowledge

  if (typeof expectedReviewToken !== 'string' || expectedReviewToken.trim().length === 0) {
    return { error: 'expectedReviewToken is required' }
  }

  if (persona !== undefined && typeof persona !== 'boolean') {
    return { error: 'persona must be a boolean when provided' }
  }

  if (knowledge !== undefined && typeof knowledge !== 'boolean') {
    return { error: 'knowledge must be a boolean when provided' }
  }

  if (persona !== true && knowledge !== true) {
    return { error: 'Choose canonical persona, knowledge, or both to apply' }
  }

  return {
    expectedReviewToken,
    ...(persona === true ? { persona: true } : {}),
    ...(knowledge === true ? { knowledge: true } : {}),
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdminNoStore()
  if (auth instanceof NextResponse) return auth

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return jsonNoStoreError('Invalid JSON in request body', 400)
  }

  const body = parseCanonicalApplyBody(rawBody)
  if ('error' in body) {
    return jsonNoStoreError(body.error, 400)
  }

  try {
    const result = await gameMasterAgentService.applyCanonicalGameMasterContent(body, auth.address)
    const state = await gameMasterAgentService.getAdminGameMasterAgentState()

    return jsonNoStore<AdminGameMasterAgentCanonicalApplyResponse>({
      state: serializeGameMasterAgentState(state),
      result: sanitizeCanonicalApplyResult(result),
    })
  } catch (error) {
    return gameMasterAgentErrorResponse(error, 'Failed to apply canonical game-master content')
  }
}
