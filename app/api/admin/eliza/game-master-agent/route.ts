import { NextRequest, NextResponse } from 'next/server'
import { gameMasterAgentService } from '@/lib/eliza/gameMasterAgent/service'
import {
  gameMasterAgentErrorResponse,
  gameMasterAgentStateResponse,
  requireAdminNoStore,
} from './shared'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  const auth = await requireAdminNoStore()
  if (!('address' in auth)) return auth

  try {
    return await gameMasterAgentStateResponse()
  } catch (error) {
    return gameMasterAgentErrorResponse(error, 'Failed to fetch game-master agent state')
  }
}

export async function POST(): Promise<NextResponse> {
  const auth = await requireAdminNoStore()
  if (!('address' in auth)) return auth

  try {
    await gameMasterAgentService.bootstrapGameMasterAgent(auth.address)
    return await gameMasterAgentStateResponse()
  } catch (error) {
    return gameMasterAgentErrorResponse(error, 'Failed to bootstrap game-master agent')
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdminNoStore()
  if (!('address' in auth)) return auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  }

  try {
    await gameMasterAgentService.updateActiveGameMasterPersona(body, auth.address)
    return await gameMasterAgentStateResponse()
  } catch (error) {
    return gameMasterAgentErrorResponse(error, 'Failed to update game-master persona')
  }
}

export async function DELETE(): Promise<NextResponse> {
  const auth = await requireAdminNoStore()
  if (!('address' in auth)) return auth

  try {
    await gameMasterAgentService.clearActiveGameMasterAgentSetting()
    return await gameMasterAgentStateResponse()
  } catch (error) {
    return gameMasterAgentErrorResponse(error, 'Failed to clear game-master agent setting')
  }
}
