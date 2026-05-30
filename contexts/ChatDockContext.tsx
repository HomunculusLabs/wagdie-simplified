'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export interface ChatDockTarget {
  tokenId: string
  characterName: string
  characterId: string
}

interface ChatDockContextValue {
  isOpen: boolean
  target: ChatDockTarget | null
  openChat: (target: ChatDockTarget) => void
  closeChat: () => void
  toggleChat: (target?: ChatDockTarget) => void
}

const ChatDockContext = createContext<ChatDockContextValue | null>(null)

export function ChatDockProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [target, setTarget] = useState<ChatDockTarget | null>(null)

  const openChat = useCallback((nextTarget: ChatDockTarget) => {
    setTarget(nextTarget)
    setIsOpen(true)
  }, [])

  const closeChat = useCallback(() => {
    setIsOpen(false)
  }, [])

  const toggleChat = useCallback((nextTarget?: ChatDockTarget) => {
    if (isOpen) {
      setIsOpen(false)
      return
    }

    if (nextTarget) {
      setTarget(nextTarget)
      setIsOpen(true)
      return
    }

    if (target) {
      setIsOpen(true)
    }
  }, [isOpen, target])

  const value = useMemo<ChatDockContextValue>(() => ({
    isOpen,
    target,
    openChat,
    closeChat,
    toggleChat,
  }), [isOpen, target, openChat, closeChat, toggleChat])

  return (
    <ChatDockContext.Provider value={value}>
      {children}
    </ChatDockContext.Provider>
  )
}

export function useChatDock(): ChatDockContextValue {
  const context = useContext(ChatDockContext)
  if (!context) {
    throw new Error('useChatDock must be used within a ChatDockProvider')
  }
  return context
}