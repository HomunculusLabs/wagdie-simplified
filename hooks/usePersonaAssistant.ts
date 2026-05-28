/**
 * usePersonaAssistant Hook
 * Manages ephemeral owner-facing persona assistant chat and pending proposals.
 *
 * This hook intentionally does not save persona data. Approved proposals should be
 * staged through useAIPersonaEditor.applyAssistantDraft() and persisted through
 * the existing editor save flow.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, readApiRaw } from '@/lib/api/client-response'
import type {
  PersonaAssistantEditableDraft,
  PersonaAssistantMessage,
  PersonaAssistantRequest,
  PersonaAssistantResponse,
} from '@/types/eliza'

interface PersonaAssistantErrorPayload {
  error?: string
  code?: string
  message?: string
}

export interface UsePersonaAssistantOptions {
  tokenId: string
  getAssistantSnapshot: () => PersonaAssistantEditableDraft
}

export interface UsePersonaAssistantReturn {
  /** Ephemeral assistant transcript for the current tab/session */
  messages: PersonaAssistantMessage[]
  /** Pending proposal returned by generate mode; not applied automatically */
  pendingProposal: PersonaAssistantEditableDraft | null
  /** Server warnings for the latest accepted response */
  warnings: string[]
  /** Whether any assistant request is in flight */
  isLoading: boolean
  /** Whether a chat request is in flight */
  isSending: boolean
  /** Whether a draft generation request is in flight */
  isGenerating: boolean
  /** Latest human-readable error */
  error: string | null
  /** Latest machine-readable error code when available */
  errorCode: string | null
  /** Send a chat-mode user message */
  sendMessage: (content: string) => Promise<void>
  /** Ask the assistant to generate a pending draft from the transcript/snapshot */
  generateDraft: (instruction?: string) => Promise<void>
  /** Drop the pending proposal without mutating editor state */
  discardProposal: () => void
  /** Clear transcript, pending proposal, warnings, and errors */
  clearConversation: () => void
  /** Clear only the latest error */
  clearError: () => void
}

function createUserMessage(content: string): PersonaAssistantMessage {
  const timestamp = new Date().toISOString()

  return {
    id: globalThis.crypto?.randomUUID?.() || `persona-user-${Date.now()}`,
    role: 'user',
    content,
    createdAt: timestamp,
  }
}

function getApiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null

  const data = error.data as PersonaAssistantErrorPayload | undefined
  return data?.error || data?.code || null
}

export function usePersonaAssistant({
  tokenId,
  getAssistantSnapshot,
}: UsePersonaAssistantOptions): UsePersonaAssistantReturn {
  const [messages, setMessages] = useState<PersonaAssistantMessage[]>([])
  const [pendingProposal, setPendingProposal] = useState<PersonaAssistantEditableDraft | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [activeMode, setActiveMode] = useState<PersonaAssistantRequest['mode'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const requestSequenceRef = useRef(0)

  useEffect(() => () => {
    requestSequenceRef.current += 1
    abortControllerRef.current?.abort()
  }, [])

  const clearError = useCallback(() => {
    setError(null)
    setErrorCode(null)
  }, [])

  const submitAssistantRequest = useCallback(async (
    mode: PersonaAssistantRequest['mode'],
    requestMessages: PersonaAssistantMessage[],
    optimisticMessage?: PersonaAssistantMessage
  ) => {
    abortControllerRef.current?.abort()

    const requestId = requestSequenceRef.current + 1
    requestSequenceRef.current = requestId
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setActiveMode(mode)
    setError(null)
    setErrorCode(null)
    setWarnings([])

    try {
      const body: PersonaAssistantRequest = {
        mode,
        messages: requestMessages,
        editorSnapshot: getAssistantSnapshot(),
      }

      const response = await fetch(`/api/eliza/characters/${tokenId}/persona-assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
        signal: abortController.signal,
      })

      const data = await readApiRaw<PersonaAssistantResponse>(
        response,
        mode === 'generate' ? 'Failed to generate persona draft' : 'Persona assistant chat failed'
      )

      if (requestSequenceRef.current !== requestId) return

      setMessages([...requestMessages, data.assistantMessage])
      setWarnings(data.warnings)

      if (mode === 'generate') {
        const nextProposal = data.proposal || null
        setPendingProposal(nextProposal)
        if (!nextProposal) {
          setError('The assistant responded, but did not return an editable draft. Try Generate draft again or add a more specific instruction.')
          setErrorCode('ASSISTANT_EMPTY_PROPOSAL')
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (requestSequenceRef.current !== requestId) return

      const message = err instanceof Error ? err.message : 'Persona assistant request failed'
      setError(message)
      setErrorCode(getApiErrorCode(err) || 'PERSONA_ASSISTANT_ERROR')

      if (optimisticMessage) {
        setMessages((current) => current.filter((message) => message.id !== optimisticMessage.id))
      }

      console.error('[usePersonaAssistant] Request failed:', err)
    } finally {
      if (requestSequenceRef.current === requestId) {
        setActiveMode(null)
        abortControllerRef.current = null
      }
    }
  }, [getAssistantSnapshot, tokenId])

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed) return

    const userMessage = createUserMessage(trimmed)
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)

    await submitAssistantRequest('chat', nextMessages, userMessage)
  }, [messages, submitAssistantRequest])

  const generateDraft = useCallback(async (instruction?: string) => {
    const trimmed = instruction?.trim()
    const userMessage = trimmed ? createUserMessage(trimmed) : undefined
    const nextMessages = userMessage ? [...messages, userMessage] : messages

    if (userMessage) {
      setMessages(nextMessages)
    }

    await submitAssistantRequest('generate', nextMessages, userMessage)
  }, [messages, submitAssistantRequest])

  const discardProposal = useCallback(() => {
    setPendingProposal(null)
    setWarnings([])
  }, [])

  const clearConversation = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    requestSequenceRef.current += 1

    setMessages([])
    setPendingProposal(null)
    setWarnings([])
    setActiveMode(null)
    setError(null)
    setErrorCode(null)
  }, [])

  return {
    messages,
    pendingProposal,
    warnings,
    isLoading: activeMode !== null,
    isSending: activeMode === 'chat',
    isGenerating: activeMode === 'generate',
    error,
    errorCode,
    sendMessage,
    generateDraft,
    discardProposal,
    clearConversation,
    clearError,
  }
}
