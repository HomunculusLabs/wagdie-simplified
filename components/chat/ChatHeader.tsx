/**
 * ChatHeader Component
 * Header for chat sidebar with character name, history toggle, and close button
 */

import { memo, type ReactNode } from 'react'
import { Button } from '@/components/ui'

interface ChatHeaderProps {
  characterName: string
  tokenId: string
  onClose: () => void
  onToggleHistory?: () => void
  onNewConversation?: () => void
  showHistoryToggle?: boolean
  isHistoryOpen?: boolean
  dockControls?: ReactNode
}

function ChatHeaderComponent({
  characterName,
  tokenId,
  onClose,
  onToggleHistory,
  onNewConversation,
  showHistoryToggle = false,
  isHistoryOpen = false,
  dockControls,
}: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between p-4 border-b border-neutral-800 bg-black/50">
      <div className="flex-1 min-w-0">
        <h2
          id="chat-sidebar-title"
          className="text-xl font-display text-neutral-200 truncate"
        >
          Chat with {characterName}
        </h2>
        <p className="text-md text-neutral-500">
          Character #{tokenId}
        </p>
      </div>

      <div className="flex items-center gap-2 ml-4">
        {/* New conversation button */}
        {onNewConversation && (
          <Button
            variant="secondary"
            size="icon"
            onClick={onNewConversation}
            aria-label="Start new conversation"
            title="New conversation"
          >
            <NewChatIcon />
          </Button>
        )}

        {/* History toggle button */}
        {showHistoryToggle && onToggleHistory && (
          <Button
            variant={isHistoryOpen ? 'primary' : 'secondary'}
            size="icon"
            onClick={onToggleHistory}
            aria-label={isHistoryOpen ? 'Hide conversation history' : 'Show conversation history'}
            aria-expanded={isHistoryOpen}
            title="Conversation history"
          >
            <HistoryIcon />
          </Button>
        )}

        {dockControls}

        {/* Close button */}
        <Button
          variant="secondary"
          size="icon"
          onClick={onClose}
          aria-label="Close chat"
        >
          <CloseIcon />
        </Button>
      </div>
    </header>
  )
}

function NewChatIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v16m8-8H4"
      />
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  )
}

export const ChatHeader = memo(ChatHeaderComponent)
