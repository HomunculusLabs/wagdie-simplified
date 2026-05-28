'use client'

import { useEffect, useState } from 'react'
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
} from '@/components/chat'

function ChatDockContentWrapper({ children }: { children: React.ReactNode }) {
  const { isOpen, target } = useChatDock()
  const [isPersonaAssistantDockVisible, setIsPersonaAssistantDockVisible] = useState(false)
  const shouldPushContent = (isOpen && !!target) || isPersonaAssistantDockVisible

  useEffect(() => {
    const handlePersonaAssistantDockVisibility = (event: Event) => {
      const { visible } = (event as CustomEvent<{ visible?: boolean }>).detail ?? {}
      setIsPersonaAssistantDockVisible(Boolean(visible))
    }

    window.addEventListener(PERSONA_ASSISTANT_DOCK_VISIBLE_EVENT, handlePersonaAssistantDockVisibility)

    return () => {
      window.removeEventListener(PERSONA_ASSISTANT_DOCK_VISIBLE_EVENT, handlePersonaAssistantDockVisibility)
    }
  }, [])

  return (
    <div
      className={`transition-[margin] duration-300 ${shouldPushContent ? 'md:mr-[500px]' : ''}`}
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
