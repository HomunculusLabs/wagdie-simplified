/**
 * Chat Message Proxy Endpoint (Streaming)
 * POST /api/eliza/chat
 *
 * Sends message to an AI character and streams gateway output via Server-Sent Events.
 * Legacy/dual mode uses the app-owned gateway; official mode streams from the
 * WAGDIE-hosted ElizaOS adapter. The route preserves the existing frontend
 * `token`/`complete`/`error` SSE event contract.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getElizaClient } from '@/lib/eliza/client'
import { requireWalletSession, requireElizaUserToken } from '@/lib/eliza/sessionAuth'
import { getCharacterByTokenId } from '@/lib/eliza/characterResolver'
import { parseCanonicalElizaTokenId } from '@/lib/eliza/routeAuth'
import { AI_PERSONA_REQUIRED_ERROR, AI_PERSONA_REQUIRED_MESSAGE } from '@/lib/eliza/chatReadiness'
import { getCharacter } from '@/lib/services/character-service'
import type { StreamCallbacks, ChatMessage } from '@/lib/eliza/gateway/types'
import { isWagdieElizaError } from '@/lib/eliza/gateway/errors'

export const runtime = 'nodejs'

interface ChatRequest {
  tokenId: string
  message: string
  conversationId?: string
}

function toStreamErrorPayload(error: unknown): { code: string; message: string } {
  if (isWagdieElizaError(error) && error.code === 'NOT_FOUND') {
    return {
      code: AI_PERSONA_REQUIRED_ERROR,
      message: AI_PERSONA_REQUIRED_MESSAGE,
    }
  }

  if (isWagdieElizaError(error)) {
    return {
      code: error.code,
      message: error.message,
    }
  }

  return {
    code: 'CHAT_ERROR',
    message: error instanceof Error ? error.message : 'Chat failed',
  }
}

export async function POST(request: NextRequest): Promise<Response> {
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

    // Keep the existing route contract: callers must complete the Eliza auth
    // token flow before chatting. In official mode this is a WAGDIE app gate,
    // not an ElizaOS credential.

    // Parse request body
    const body: ChatRequest = await request.json()

    // Validate request
    if (!body.tokenId || !body.message) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'tokenId and message are required' },
        { status: 400 }
      )
    }

    const parsedToken = parseCanonicalElizaTokenId(body.tokenId)
    if (!parsedToken) {
      return NextResponse.json(
        { error: 'INVALID_TOKEN_ID', message: 'Invalid token ID' },
        { status: 400 }
      )
    }

    const normalizedConversationId = typeof body.conversationId === 'string' && body.conversationId.trim()
      ? body.conversationId.trim()
      : undefined

    console.info('[Eliza Chat] Request accepted', {
      tokenId: parsedToken.externalId,
      hasConversationId: Boolean(normalizedConversationId),
    })

    // Verify character exists in WAGDIE database
    const wagdieCharacter = await getCharacter(parsedToken.tokenId)
    if (!wagdieCharacter) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'WAGDIE character not found' },
        { status: 404 }
      )
    }

    const serverClient = getElizaClient()

    // Public chat must use a no-side-effect canonical lookup. Persona creation
    // happens through PUT /api/eliza/characters/[tokenId] after the owner saves.
    const record = await getCharacterByTokenId({
      elizaClient: serverClient,
      tokenId: parsedToken.externalId,
    })

    if (!record) {
      return NextResponse.json(
        { error: AI_PERSONA_REQUIRED_ERROR, message: AI_PERSONA_REQUIRED_MESSAGE },
        { status: 409 }
      )
    }

    // Create SSE stream
    const encoder = new TextEncoder()
    let upstreamAbortController: AbortController | null = null
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Use gateway StreamCallbacks interface
          const callbacks: StreamCallbacks = {
            onChunk: (chunk: string) => {
              // Map gateway onChunk to existing 'token' event format for frontend compatibility
              const event = `event: token\ndata: ${JSON.stringify({ token: chunk })}\n\n`
              controller.enqueue(encoder.encode(event))
            },
            onComplete: (message: ChatMessage, conversationId: string) => {
              const content = typeof message.content === 'string' ? message.content : ''
              const completedConversationId = typeof conversationId === 'string' ? conversationId.trim() : ''

              if (!content.trim() || !completedConversationId) {
                const payload = !content.trim()
                  ? {
                    code: 'EMPTY_ASSISTANT_MESSAGE',
                    message: 'The assistant response was empty. Please try again.',
                  }
                  : {
                    code: 'MISSING_CONVERSATION_ID',
                    message: 'The chat response did not include a conversation ID. Please try again.',
                  }

                console.error('[Eliza Chat] Empty or invalid stream completion blocked', {
                  tokenId: parsedToken.externalId,
                  conversationId: completedConversationId || undefined,
                  hasContent: Boolean(content.trim()),
                  contentLength: content.length,
                  code: payload.code,
                })

                const event = `event: error\ndata: ${JSON.stringify(payload)}\n\n`
                controller.enqueue(encoder.encode(event))
                controller.close()
                return
              }

              console.info('[Eliza Chat] Stream complete', {
                tokenId: parsedToken.externalId,
                conversationId: completedConversationId,
                hasContent: true,
                contentLength: content.length,
              })

              // Include message.id and message.createdAt for improved client fidelity
              const event = `event: complete\ndata: ${JSON.stringify({
                id: message.id,
                content,
                conversationId: completedConversationId,
                createdAt: message.createdAt,
              })}\n\n`
              controller.enqueue(encoder.encode(event))
              controller.close()
            },
            onError: (error) => {
              const payload = toStreamErrorPayload(error)

              console.error('[Eliza Chat] Stream error', {
                tokenId: parsedToken.externalId,
                hasConversationId: Boolean(normalizedConversationId),
                code: payload.code,
                message: payload.message,
              })

              const event = `event: error\ndata: ${JSON.stringify(payload)}\n\n`
              controller.enqueue(encoder.encode(event))
              controller.close()
            },
          }

          upstreamAbortController = new AbortController()

          // The gateway adapter owns upstream streaming. In legacy/dual mode this
          // may call the app-owned Venice-backed path; in official mode it calls
          // the hosted ElizaOS service and normalizes official SSE chunks to this
          // route's existing frontend event contract.
          await serverClient.chat.sendMessageStream(
            {
              characterId: record.id,
              character: record.character,
              message: body.message,
              conversationId: normalizedConversationId,
              userId: tokenResult.officialUserId,
              walletAddress: walletResult.address,
              tokenId: parsedToken.externalId,
              signal: upstreamAbortController.signal,
            },
            callbacks
          )
        } catch (error) {
          const payload = toStreamErrorPayload(error)
          console.error('[Eliza Chat] Stream setup failed', {
            tokenId: parsedToken.externalId,
            hasConversationId: Boolean(normalizedConversationId),
            code: payload.code,
            message: payload.message,
            details: error && typeof error === 'object' && 'details' in error
              ? (error as { details?: unknown }).details
              : undefined,
          })
          const event = `event: error\ndata: ${JSON.stringify(payload)}\n\n`
          controller.enqueue(encoder.encode(event))
          controller.close()
        }
      },
      cancel() {
        upstreamAbortController?.abort()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[Eliza Chat] Streaming failed:', error)

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Chat request failed' },
      { status: 500 }
    )
  }
}
