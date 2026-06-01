'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { config } from '@/lib/wagmi'
import { TransactionProvider } from '@/contexts/TransactionContext'
import { AuthProvider } from '@/contexts/AuthContext'
import '@rainbow-me/rainbowkit/styles.css'

import { ChatDockProvider, useChatDock } from '@/contexts/ChatDockContext'
import {
  ChatDock,
  ChatToggleButton,
  PersonaAssistantDockSlot,
  PERSONA_ASSISTANT_DOCK_VISIBLE_EVENT,
  CHAT_DOCK_VISIBLE_EVENT,
} from '@/components/chat'
import { DOCK_DEFAULT_WIDTH, type RightEdgeDockVisibilityDetail } from '@/components/chat/dockShell'

function ChatDockContentWrapper({ children }: { children: React.ReactNode }) {
  const { isOpen, target } = useChatDock()
  const [isPersonaAssistantDockVisible, setIsPersonaAssistantDockVisible] = useState(false)
  const [personaAssistantDockWidth, setPersonaAssistantDockWidth] = useState(DOCK_DEFAULT_WIDTH)
  const [chatDockWidth, setChatDockWidth] = useState(DOCK_DEFAULT_WIDTH)
  const [isChatDockCollapsed, setIsChatDockCollapsed] = useState(false)
  const shouldPushForChat = isOpen && !!target && !isChatDockCollapsed
  const shouldPushContent = shouldPushForChat || isPersonaAssistantDockVisible
  const contentOffset = shouldPushForChat
    ? chatDockWidth
    : isPersonaAssistantDockVisible
      ? personaAssistantDockWidth
      : DOCK_DEFAULT_WIDTH

  useEffect(() => {
    const handlePersonaAssistantDockVisibility = (event: Event) => {
      const { visible, width } = (event as CustomEvent<{ visible?: boolean; width?: number }>).detail ?? {}
      setIsPersonaAssistantDockVisible(Boolean(visible))
      if (typeof width === 'number') {
        setPersonaAssistantDockWidth(width)
      }
    }

    const handleChatDockVisibility = (event: Event) => {
      const { width, collapsed } = (event as CustomEvent<RightEdgeDockVisibilityDetail>).detail ?? {}
      setIsChatDockCollapsed(Boolean(collapsed))
      if (typeof width === 'number') {
        setChatDockWidth(width)
      }
    }

    window.addEventListener(PERSONA_ASSISTANT_DOCK_VISIBLE_EVENT, handlePersonaAssistantDockVisibility)
    window.addEventListener(CHAT_DOCK_VISIBLE_EVENT, handleChatDockVisibility)

    return () => {
      window.removeEventListener(PERSONA_ASSISTANT_DOCK_VISIBLE_EVENT, handlePersonaAssistantDockVisibility)
      window.removeEventListener(CHAT_DOCK_VISIBLE_EVENT, handleChatDockVisibility)
    }
  }, [])

  return (
    <div
      className={`transition-[margin] duration-300 ${shouldPushContent ? 'md:mr-[var(--chat-dock-offset)]' : ''}`}
      style={{ '--chat-dock-offset': `${contentOffset}px` } as CSSProperties}
    >
      {children}
    </div>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Initialize QueryClient inside component to avoid issues with React Fast Refresh
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#8b2635', // Gothic blood red
            accentColorForeground: 'white',
            borderRadius: 'medium',
          })}
        >
          <AuthProvider>
            <TransactionProvider>
              <ChatDockProvider>
                <ChatDockContentWrapper>
                  {children}
                </ChatDockContentWrapper>
                <PersonaAssistantDockSlot />
                <ChatDock />
                <ChatToggleButton />
              </ChatDockProvider>
            </TransactionProvider>
          </AuthProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
