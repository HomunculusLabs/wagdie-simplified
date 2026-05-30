/**
 * useCharacterChat Hook
 * Manages chat state and streaming responses for character conversations
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ApiError, readApiRaw } from '@/lib/api/client-response'
import type { ChatMessage } from '@/types/eliza'

interface ChatErrorPayload {
  code?: string
  message?: string
  error?: string
}

class CharacterChatError extends Error {
  readonly code: string

  constructor(payload: ChatErrorPayload) {
    super(payload.message || payload.error || 'Chat failed')
    this.name = 'CharacterChatError'
    this.code = payload.code || payload.error || 'CHAT_ERROR'
  }
}

function asChatErrorPayload(data: unknown): ChatErrorPayload {
  if (typeof data === 'object' && data !== null) {
    return data as ChatErrorPayload
  }

  return {}
}

interface UseCharacterChatReturn {
  /** All messages in current conversation */
  messages: ChatMessage[]
  /** Send a new message */
  sendMessage: (content: string) => Promise<void>
  /** Whether a message is currently streaming */
  isStreaming: boolean
  /** Current streaming content (partial response) */
  streamingContent: string
  /** Current conversation ID */
  conversationId: string | null
  /** Start a new conversation */
  newConversation: () => void
  /** Set conversation ID (for loading history) */
  setConversationId: (id: string | null) => void
  /** Load messages for a conversation */
  loadMessages: (messages: ChatMessage[]) => void
  /** Error message if chat failed */
  error: string | null
  /** Machine-readable error code if chat failed */
  errorCode: string | null
  /** Clear error */
  clearError: () => void
}

export function useCharacterChat(tokenId: string): UseCharacterChatReturn {
  const { isConnected } = useAccount()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortControllerRef.current?.abort(), [])

  // Send a message and handle streaming response
  const sendMessage = useCallback(async (content: string) => {
    if (!isConnected) {
      setError('Please connect your wallet to chat')
      setErrorCode('WALLET_REQUIRED')
      return
    }

    if (isStreaming) {
      return
    }

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      conversationId: conversationId || '',
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMessage])

    setIsStreaming(true)
    setStreamingContent('')
    setError(null)
    setErrorCode(null)

    // Create abort controller for this request
    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch('/api/eliza/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tokenId,
          message: content,
          conversationId,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        try {
          await readApiRaw<never>(response, 'Chat request failed')
        } catch (chatError) {
          if (chatError instanceof ApiError) {
            const errorData = asChatErrorPayload(chatError.data)
            throw new CharacterChatError({
              code: errorData.code || errorData.error,
              message: errorData.message || 'Chat request failed',
            })
          }

          throw chatError
        }
      }

      // Handle SSE stream
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response stream')
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete events in buffer
        const events = buffer.split('\n\n')
        buffer = events.pop() || '' // Keep incomplete event in buffer

        for (const event of events) {
          if (!event.trim()) continue

          const lines = event.split('\n')
          let eventType = ''
          let eventData = ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7)
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6)
            }
          }

          if (!eventData) continue

          let data: any
          try {
            data = JSON.parse(eventData)
          } catch (parseError) {
            console.error('[useCharacterChat] Failed to parse event:', parseError)
            continue
          }

          switch (eventType) {
            case 'token':
              fullContent += data.token
              setStreamingContent(fullContent)
              break

            case 'complete': {
              const streamedContent = fullContent.trim() ? fullContent : ''
              const completedContent = streamedContent || (
                typeof data.content === 'string' && data.content.trim() ? data.content : ''
              )
              const completedConversationId = typeof data.conversationId === 'string'
                ? data.conversationId.trim()
                : ''

              if (!completedContent.trim()) {
                throw new CharacterChatError({
                  code: 'EMPTY_ASSISTANT_MESSAGE',
                  message: 'The assistant response was empty. Please try again.',
                })
              }

              if (!completedConversationId) {
                throw new CharacterChatError({
                  code: 'MISSING_CONVERSATION_ID',
                  message: 'The chat response did not include a conversation ID. Please try again.',
                })
              }

              if (!streamedContent) {
                fullContent = completedContent
                setStreamingContent(fullContent)
              }

              // Add assistant message (use server createdAt when available)
              const assistantMessage: ChatMessage = {
                id: typeof data.id === 'string' && data.id ? data.id : `assistant-${Date.now()}`,
                conversationId: completedConversationId,
                role: 'assistant',
                content: completedContent,
                createdAt: data.createdAt ?? new Date().toISOString(),
              }
              setMessages(prev => [...prev, assistantMessage])
              setConversationId(completedConversationId)
              break
            }

            case 'error':
              throw new CharacterChatError(data)
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled
        return
      }

      const message = err instanceof Error ? err.message : 'Chat failed'
      setError(message)
      setErrorCode(err instanceof CharacterChatError ? err.code : 'CHAT_ERROR')
      console.error('[useCharacterChat] Error:', err)

      // Remove optimistic user message on error
      setMessages(prev => prev.filter(m => m.id !== userMessage.id))
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
      abortControllerRef.current = null
    }
  }, [isConnected, isStreaming, conversationId, tokenId])

  // Start a new conversation
  const newConversation = useCallback(() => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    setMessages([])
    setConversationId(null)
    setIsStreaming(false)
    setStreamingContent('')
    setError(null)
    setErrorCode(null)
  }, [])

  // Load messages for a conversation
  const loadMessages = useCallback((newMessages: ChatMessage[]) => {
    setMessages(newMessages)
  }, [])

  // Clear error
  const clearError = useCallback(() => {
    setError(null)
    setErrorCode(null)
  }, [])

  return {
    messages,
    sendMessage,
    isStreaming,
    streamingContent,
    conversationId,
    newConversation,
    setConversationId,
    loadMessages,
    error,
    errorCode,
    clearError,
  }
}
