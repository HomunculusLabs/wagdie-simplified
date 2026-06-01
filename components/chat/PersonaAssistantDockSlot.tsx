'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { useChatDock } from '@/contexts/ChatDockContext'
import { Button } from '@/components/ui'
import { RightEdgeDockShell } from './RightEdgeDockShell'

export const PERSONA_ASSISTANT_DOCK_PORTAL_ID = 'persona-assistant-dock-portal'
export const PERSONA_ASSISTANT_DOCK_VISIBLE_EVENT = 'persona-assistant-dock-visible-change'
export const PERSONA_ASSISTANT_DOCK_TARGET_EVENT = 'persona-assistant-dock-target-change'

interface PersonaAssistantDockTarget {
  tokenId: string
  characterName: string
  characterId?: string
}

function PersonaAssistantDockSlotComponent() {
  const { isOpen, target, openChat } = useChatDock()
  const portalTargetRef = useRef<HTMLDivElement | null>(null)
  const [hasAssistantContent, setHasAssistantContent] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [assistantTarget, setAssistantTarget] = useState<PersonaAssistantDockTarget | null>(null)

  const isSuppressedByChat = isOpen && !!target
  const isDrawerAvailable = hasAssistantContent && !isSuppressedByChat && !isDismissed
  const isHiddenFromAssistiveTech = !hasAssistantContent || isSuppressedByChat

  useEffect(() => {
    const portalTarget = portalTargetRef.current
    if (!portalTarget) return

    const syncContentState = () => {
      setHasAssistantContent(portalTarget.childNodes.length > 0)
    }

    syncContentState()

    const observer = new MutationObserver(syncContentState)
    observer.observe(portalTarget, { childList: true })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handleTargetChange = (event: Event) => {
      const nextTarget = (event as CustomEvent<PersonaAssistantDockTarget | null>).detail ?? null
      setAssistantTarget(nextTarget)
      setIsDismissed(false)
    }

    window.addEventListener(PERSONA_ASSISTANT_DOCK_TARGET_EVENT, handleTargetChange)

    return () => {
      window.removeEventListener(PERSONA_ASSISTANT_DOCK_TARGET_EVENT, handleTargetChange)
    }
  }, [])

  return (
    <RightEdgeDockShell
      ariaLabel="Persona assistant dock"
      ariaHidden={isHiddenFromAssistiveTech}
      isAvailable={isDrawerAvailable}
      onRequestClose={() => setIsDismissed(true)}
      visibilityEventName={PERSONA_ASSISTANT_DOCK_VISIBLE_EVENT}
      collapseResetKey={assistantTarget ? `${assistantTarget.tokenId}:${assistantTarget.characterId ?? ''}` : 'none'}
      panelTestId="persona-assistant-drawer-panel"
      resizeHandleTestId="persona-assistant-resize-handle"
      resizeHandleLabel="Resize persona assistant sidebar"
      collapsedRailLabel="persona"
      collapseButtonLabel="Collapse persona assistant sidebar"
      expandButtonLabel="Expand persona assistant sidebar"
      dataAttributes={{
        'data-suppressed': isSuppressedByChat ? 'true' : 'false',
        'data-has-content': hasAssistantContent ? 'true' : 'false',
        'data-dismissed': isDismissed ? 'true' : 'false',
      }}
    >
      {({ collapseButton }) => (
        <>
          <header className="flex items-center justify-between gap-3 p-4 border-b border-neutral-800 bg-black/50">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-display text-neutral-200 truncate">Persona Assistant</h2>
              <p className="text-md text-neutral-500">Draft, then save from the editor</p>
            </div>
            <div className="flex items-center gap-2 ml-4">
              {assistantTarget && (
                assistantTarget.characterId ? (
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => openChat({
                      tokenId: assistantTarget.tokenId,
                      characterName: assistantTarget.characterName,
                      characterId: assistantTarget.characterId!,
                    })}
                    aria-label="Open chat with this character"
                    title="Chat"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="icon"
                    disabled
                    aria-label="Save AI Persona before public chat"
                    title="Save AI Persona before public chat"
                  >
                    <svg className="w-5 h-5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </Button>
                )
              )}
              {collapseButton}
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setIsDismissed(true)}
                aria-label="Close persona assistant sidebar"
                title="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
          </header>
          <div
            id={PERSONA_ASSISTANT_DOCK_PORTAL_ID}
            ref={portalTargetRef}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          />
        </>
      )}
    </RightEdgeDockShell>
  )
}

export const PersonaAssistantDockSlot = memo(PersonaAssistantDockSlotComponent)
