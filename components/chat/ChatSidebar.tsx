/**
 * ChatSidebar Component
 * Slide-out chat panel for character conversations with history support
 */

'use client'

import { useEffect, useCallback, useState, memo, useRef } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { ChatHeader } from './ChatHeader'
import { ChatMessages } from './ChatMessages'
import { ChatInput } from './ChatInput'
import { ConversationList } from './ConversationList'
import { useCharacterChat } from '@/hooks/useCharacterChat'
import { useConversations } from '@/hooks/useConversations'
import { useElizaAuth } from '@/hooks/useElizaAuth'
import { Button, Spinner } from '@/components/ui'
import {
  DOCK_DEFAULT_WIDTH,
  DOCK_OVERLAY_CLASS,
  DOCK_PANEL_SHELL_CLASS,
  DOCK_PANEL_TRANSITION_CLASS,
  DOCK_Z_INDEX,
} from './dockShell'

interface ChatSidebarProps {
  tokenId: string
  characterName: string
  characterId?: string // Eliza character ID (if known)
  isOpen: boolean
  onClose: () => void
}

// Local storage key for persisting current conversation
const getStorageKey = (tokenId: string, address: string) =>
  `wagdie-chat-conversation-${tokenId}-${address}`

function ChatSidebarComponent({
  tokenId,
  characterName,
  characterId,
  isOpen,
  onClose,
}: ChatSidebarProps) {
  const { isConnected, address } = useAccount()
  const [showHistory, setShowHistory] = useState(false)

  const { getToken, isAuthenticated, isAuthenticating, error: authError, clearAuth } = useElizaAuth()

  const panelRef = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setVisible(true)
      return
    }
    const timer = window.setTimeout(() => setVisible(false), 300)
    return () => window.clearTimeout(timer)
  }, [isOpen])

  const {
    messages,
    sendMessage,
    isStreaming,
    streamingContent,
    conversationId,
    newConversation,
    setConversationId,
    loadMessages,
    error: chatError,
    errorCode: chatErrorCode,
    clearError: clearChatError,
  } = useCharacterChat(tokenId)

  const {
    conversations,
    activeConversation,
    isLoading: isLoadingConversations,
    isLoadingMore,
    isLoadingConversation,
    hasMore,
    selectConversation,
    deleteConversation,
    loadMore,
    error: conversationsError,
    clearError: clearConversationsError,
  } = useConversations({
    characterId,
    tokenId,
    autoFetch: isOpen && isConnected && isAuthenticated,
    pageSize: 20,
  })

  // Combined error
  const error = chatError || conversationsError || authError
  const isPersonaRequired = chatErrorCode === 'AI_PERSONA_REQUIRED'
  const clearError = useCallback(() => {
    clearChatError()
    clearConversationsError()
    clearAuth()
  }, [clearChatError, clearConversationsError, clearAuth])

  // Persist conversation ID on change
  useEffect(() => {
    if (conversationId && address) {
      localStorage.setItem(getStorageKey(tokenId, address), conversationId)
    }
  }, [conversationId, tokenId, address])

  // Sync activeConversation messages to chat state
  useEffect(() => {
    if (activeConversation?.messages) {
      loadMessages(activeConversation.messages)
    }
  }, [activeConversation, loadMessages])

  // Restore conversation on open
  useEffect(() => {
    if (!isAuthenticated) return

    if (isOpen && isConnected && address && !conversationId && !isLoadingConversations) {
      const savedId = localStorage.getItem(getStorageKey(tokenId, address))
      if (savedId) {
        // Check if conversation still exists
        const exists = conversations.some(c => c.id === savedId)
        if (exists) {
          handleSelectConversation(savedId)
        } else {
          // Clear invalid saved ID
          localStorage.removeItem(getStorageKey(tokenId, address))
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isConnected, address, isLoadingConversations, conversations, isAuthenticated])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isOpen) return

      e.preventDefault()

      if (showHistory) {
        setShowHistory(false)
      } else {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, showHistory, onClose])

  // Handle selecting a conversation from history
  const handleSelectConversation = useCallback(async (id: string) => {
    // selectConversation fetches the conversation and loads messages into activeConversation
    await selectConversation(id)
    // Update local chat state with the conversation
    setConversationId(id)
    // Note: Messages are loaded in activeConversation state from useConversations hook
    // The parent ChatContainer should sync these states
    setShowHistory(false)
  }, [selectConversation, setConversationId])

  // Handle starting new conversation
  const handleNewConversation = useCallback(() => {
    newConversation()
    if (address) {
      localStorage.removeItem(getStorageKey(tokenId, address))
    }
    setShowHistory(false)
  }, [newConversation, tokenId, address])

  // Handle deleting a conversation
  const handleDeleteConversation = useCallback(async (id: string) => {
    const success = await deleteConversation(id)
    if (success && id === conversationId) {
      // If we deleted the active conversation, start fresh
      newConversation()
      if (address) {
        localStorage.removeItem(getStorageKey(tokenId, address))
      }
    }
  }, [deleteConversation, conversationId, newConversation, tokenId, address])

  const handleLoadHistory = useCallback(() => {
    void (async () => {
      const token = await getToken()
      if (!token) {
        return
      }
      setShowHistory(true)
    })()
  }, [getToken])

  const handleSend = useCallback(
    async (content: string): Promise<boolean> => {
      const token = await getToken()
      if (!token) {
        return false
      }

      await sendMessage(content)
      return true
    },
    [getToken, sendMessage]
  )

  const toggleHistory = useCallback(() => {
    setShowHistory(prev => !prev)
  }, [])

  if (!visible && !isOpen) return null

  return (
    <div className={DOCK_OVERLAY_CLASS} style={{ zIndex: DOCK_Z_INDEX }}>
      {/* Drawer Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-labelledby="chat-sidebar-title"
        className={`
          ${DOCK_PANEL_SHELL_CLASS}
          w-full
          ${DOCK_PANEL_TRANSITION_CLASS}
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{ maxWidth: `min(100vw, ${DOCK_DEFAULT_WIDTH}px)` }}
      >
        <ChatHeader
          characterName={characterName}
          tokenId={tokenId}
          onClose={onClose}
          onToggleHistory={toggleHistory}
          onNewConversation={handleNewConversation}
          showHistoryToggle={isConnected && (showHistory || conversations.length > 0)}
          isHistoryOpen={showHistory}
        />

        {/* Wallet connection gate */}
        {!isConnected ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="text-4xl mb-4 opacity-30">🔒</div>
            <h3 className="text-lg font-display text-neutral-200 mb-2">
              Wallet Required
            </h3>
            <p className="text-sm text-neutral-500 mb-4">
              Connect your wallet to chat with {characterName}
            </p>
          </div>
        ) : (
          <>
            {/* Error display */}
            {error && (
              <div className={`px-4 py-3 border-b ${isPersonaRequired ? 'bg-amber-900/20 border-amber-800/50' : 'bg-red-900/20 border-red-800/50'}`}>
                <div className="flex items-start justify-between gap-3">
                  {isPersonaRequired ? (
                    <div className="min-w-0 space-y-2">
                      <p className="text-sm font-medium text-amber-300">AI persona required before chat</p>
                      <p className="text-sm text-amber-100/80">
                        {error}
                      </p>
                      <ol className="list-decimal pl-4 text-xs text-amber-100/70 space-y-1">
                        <li>Open this character&apos;s AI persona tab.</li>
                        <li>Connect the owner wallet.</li>
                        <li>Review or edit the persona fields.</li>
                        <li>Click Save AI Persona, then try chat again.</li>
                      </ol>
                      <Link
                        href={`/characters/${tokenId}?tab=ai-persona`}
                        onClick={onClose}
                        className="inline-flex text-xs font-display text-amber-200 underline underline-offset-4 hover:text-amber-100"
                      >
                        Open AI persona editor
                      </Link>
                    </div>
                  ) : (
                    <p className="text-sm text-red-400">{error}</p>
                  )}
                  <button
                    onClick={clearError}
                    className={isPersonaRequired ? 'text-amber-300 hover:text-amber-200' : 'text-red-400 hover:text-red-300'}
                    aria-label="Dismiss error"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Conversation history panel */}
            {showHistory && (
              <div className="border-b border-neutral-800 bg-neutral-900/50">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-display text-neutral-300">
                      Conversation History
                    </h3>
                    <Button
                      variant="secondary"
                      onClick={handleNewConversation}
                      size="sm"
                    >
                      New Chat
                    </Button>
                  </div>
                  <ConversationList
                    conversations={conversations}
                    activeConversationId={conversationId || undefined}
                    isLoading={isLoadingConversations}
                    isLoadingMore={isLoadingMore}
                    hasMore={hasMore}
                    onSelect={handleSelectConversation}
                    onDelete={handleDeleteConversation}
                    onLoadMore={loadMore}
                  />
                </div>
              </div>
            )}

            {/* Loading conversation indicator */}
            {isLoadingConversation && (
              <div className="flex items-center justify-center py-4 border-b border-neutral-800">
                <Spinner size="sm" />
                <span className="ml-2 text-sm text-neutral-500">Loading conversation...</span>
              </div>
            )}

            {isConnected && !isAuthenticated && (
              <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-neutral-300">
                      Sign in to load conversation history.
                    </p>
                    <p className="text-xs text-neutral-500">
                      This will request a wallet signature.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleLoadHistory}
                    disabled={isAuthenticating}
                  >
                    Load history
                  </Button>
                </div>
              </div>
            )}

            {/* Messages area */}
            <ChatMessages
              messages={messages}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              characterName={characterName}
            />

            {/* Input */}
            <ChatInput
              onSend={handleSend}
              disabled={(isLoadingConversations || isLoadingConversation) || isStreaming || isAuthenticating}
              placeholder={`Message ${characterName}...`}
            />
          </>
        )}
      </div>
    </div>
  )
}

export const ChatSidebar = memo(ChatSidebarComponent)
