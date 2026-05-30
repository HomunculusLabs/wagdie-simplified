/**
 * Eliza Conversations List Proxy
 * GET /api/eliza/conversations
 *
 * Returns list of conversations for the authenticated user.
 * Optionally filtered by character.
 *
 * Query params:
 * - characterId: Filter by specific Eliza character record ID
 * - tokenId: Filter by WAGDIE token ID (auto-translated to characterId via canonical lookup)
 * - page: Page number (default: 1)
 * - pageSize: Items per page (default: 20, max: 50)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getElizaClient, createUserClient } from '@/lib/eliza/client'
import { elizaConfig } from '@/lib/eliza/config'
import { requireWalletSession, requireElizaUserToken } from '@/lib/eliza/sessionAuth'
import { getRecordIdByTokenId } from '@/lib/eliza/characterResolver'
import { AI_PERSONA_REQUIRED_ERROR, AI_PERSONA_REQUIRED_MESSAGE } from '@/lib/eliza/chatReadiness'
import type { Conversation, ErrorResponse } from '@/types/eliza'

interface ConversationsListResponse {
  conversations: Conversation[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<ConversationsListResponse | ErrorResponse>> {
  try {
    // Get user session
    const session = await getSession()

    const walletResult = requireWalletSession(session)
    if (walletResult instanceof NextResponse) {
      return walletResult
    }

    const tokenResult = requireElizaUserToken(session)
    if (tokenResult instanceof NextResponse) {
      return tokenResult
    }

    const userAddress = walletResult.address
    const userClient = createUserClient(
      elizaConfig.mode === 'official'
        ? {
            accessToken: tokenResult.accessToken,
            officialUserId: tokenResult.officialUserId,
            walletAddress: userAddress,
          }
        : tokenResult.accessToken
    )

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    let characterId = searchParams.get('characterId')
    const tokenId = searchParams.get('tokenId')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)))

    // Translate tokenId to characterId if provided (canonical record lookup)
    // IMPORTANT: use server client only for tokenId -> recordId translation
    if (!characterId && tokenId) {
      const recordId = await getRecordIdByTokenId(getElizaClient(), tokenId)
      if (recordId) {
        characterId = recordId
      } else {
        return NextResponse.json(
          { error: AI_PERSONA_REQUIRED_ERROR, message: AI_PERSONA_REQUIRED_MESSAGE },
          { status: 409 }
        )
      }
    }

    // Fetch conversations from Eliza API using user-scoped auth
    const response = characterId
      ? await userClient.conversations.listForCharacter(characterId, { page, pageSize })
      : await userClient.conversations.list({ page, pageSize })

    // Map SDK response to our types
    // SDK returns { items, total, page, pageSize, hasMore }
    const conversations: Conversation[] = response.items.map((conv: { id: string; characterId: string; messageCount: number; createdAt: string; lastMessageAt: string }) => ({
      id: conv.id,
      characterId: conv.characterId,
      userId: userAddress, // User is always current user (SDK scopes by auth)
      title: null, // SDK Conversation type doesn't have title
      messageCount: conv.messageCount,
      createdAt: conv.createdAt,
      updatedAt: conv.lastMessageAt, // SDK uses lastMessageAt
    }))

    return NextResponse.json({
      conversations,
      total: response.total,
      page: response.page,
      pageSize: response.pageSize,
      hasMore: response.hasMore,
    })
  } catch (error) {
    console.error('[Eliza Conversations] List failed:', error)

    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('unauthorized')) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'Authentication failed' },
          { status: 401 }
        )
      }
    }

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to fetch conversations' },
      { status: 500 }
    )
  }
}
