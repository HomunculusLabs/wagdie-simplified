'use client'

import { memo, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useChatDock } from '@/contexts/ChatDockContext'

export const PERSONA_ASSISTANT_DOCK_PORTAL_ID = 'persona-assistant-dock-portal'
export const PERSONA_ASSISTANT_DOCK_VISIBLE_EVENT = 'persona-assistant-dock-visible-change'
export const PERSONA_ASSISTANT_DOCK_TARGET_EVENT = 'persona-assistant-dock-target-change'

interface PersonaAssistantDockTarget {
  tokenId: string
  characterName: string
  characterId?: string
}

const DEFAULT_DRAWER_WIDTH = 500
const MIN_DRAWER_WIDTH = 340
const MAX_DRAWER_WIDTH = 720
const COLLAPSED_DRAWER_WIDTH = 56
const MOBILE_EDGE_GUTTER = 16

function PersonaAssistantDockSlotComponent() {
  const { isOpen, target, openChat } = useChatDock()
  const portalTargetRef = useRef<HTMLDivElement | null>(null)
  const [hasAssistantContent, setHasAssistantContent] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [assistantTarget, setAssistantTarget] = useState<PersonaAssistantDockTarget | null>(null)
  const [drawerWidth, setDrawerWidth] = useState(DEFAULT_DRAWER_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 767px)')
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const getClampedDrawerWidth = useCallback((width: number) => {
    const viewportLimit = typeof window === 'undefined'
      ? MAX_DRAWER_WIDTH
      : Math.max(MIN_DRAWER_WIDTH, window.innerWidth - MOBILE_EDGE_GUTTER)

    return Math.min(Math.max(width, MIN_DRAWER_WIDTH), Math.min(MAX_DRAWER_WIDTH, viewportLimit))
  }, [])

  const currentDrawerWidth = isCollapsed ? COLLAPSED_DRAWER_WIDTH : drawerWidth
  // On mobile the drawer is a full-screen sheet (width handled by classes),
  // so we skip the inline width that would otherwise pin it to a desktop size.
  const drawerStyle = isMobile
    ? undefined
    : {
        width: currentDrawerWidth,
        maxWidth: `calc(100vw - ${MOBILE_EDGE_GUTTER}px)`,
      }

  const isSuppressedByChat = isOpen && !!target
  const isDrawerAvailable = hasAssistantContent && !isSuppressedByChat && !isDismissed
  const isDrawerVisible = isDrawerAvailable && !isCollapsed
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
      setIsCollapsed(false)
    }

    window.addEventListener(PERSONA_ASSISTANT_DOCK_TARGET_EVENT, handleTargetChange)

    return () => {
      window.removeEventListener(PERSONA_ASSISTANT_DOCK_TARGET_EVENT, handleTargetChange)
    }
  }, [])

  useEffect(() => {
    const handleWindowResize = () => {
      setDrawerWidth((width) => getClampedDrawerWidth(width))
    }

    window.addEventListener('resize', handleWindowResize)

    return () => {
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [getClampedDrawerWidth])

  useEffect(() => {
    if (!isResizing) return

    const handlePointerMove = (event: PointerEvent) => {
      setDrawerWidth(getClampedDrawerWidth(window.innerWidth - event.clientX))
    }

    const stopResizing = () => {
      setIsResizing(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResizing)
    window.addEventListener('pointercancel', stopResizing)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResizing)
      window.removeEventListener('pointercancel', stopResizing)
    }
  }, [getClampedDrawerWidth, isResizing])

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setIsCollapsed(false)
    setIsResizing(true)
  }

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(PERSONA_ASSISTANT_DOCK_VISIBLE_EVENT, {
      detail: { visible: isDrawerVisible, width: currentDrawerWidth },
    }))
  }, [currentDrawerWidth, isDrawerVisible])

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent(PERSONA_ASSISTANT_DOCK_VISIBLE_EVENT, {
        detail: { visible: false, width: DEFAULT_DRAWER_WIDTH },
      }))
    }
  }, [])

  return (
    <aside
      aria-label="Persona assistant dock"
      aria-hidden={isHiddenFromAssistiveTech ? true : undefined}
      data-suppressed={isSuppressedByChat ? 'true' : 'false'}
      data-has-content={hasAssistantContent ? 'true' : 'false'}
      data-available={isDrawerAvailable ? 'true' : 'false'}
      data-visible={isDrawerVisible ? 'true' : 'false'}
      data-collapsed={isCollapsed ? 'true' : 'false'}
      data-dismissed={isDismissed ? 'true' : 'false'}
      data-width={String(currentDrawerWidth)}
      data-resizing={isResizing ? 'true' : 'false'}
      className="fixed inset-0 z-[50] pointer-events-none"
    >
      {/* Mobile backdrop — tap to dismiss the full-screen sheet */}
      <div
        onClick={() => setIsDismissed(true)}
        aria-hidden="true"
        className={`
          absolute inset-0 bg-black/60 transition-opacity duration-300 md:hidden
          ${isDrawerVisible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}
        `}
      />
      <div
        data-testid="persona-assistant-drawer-panel"
        className={`
          pointer-events-auto
          absolute top-0 right-0 h-full
          w-full md:w-auto
          bg-soul-950 border-l border-neutral-800
          flex flex-col shadow-2xl md:rounded-l-2xl
          transform transition-[opacity,transform,width] ease-out
          ${isResizing ? 'duration-0' : 'duration-300'}
          ${isDrawerAvailable ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}
        `}
        style={drawerStyle}
      >
        {!isCollapsed && isDrawerAvailable && !isMobile && (
          <button
            type="button"
            onPointerDown={handleResizePointerDown}
            className="absolute left-0 top-0 z-10 hidden h-full w-3 -translate-x-1.5 cursor-ew-resize items-center justify-center rounded-l-xl text-neutral-600 hover:text-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-500 md:flex"
            aria-label="Resize persona assistant sidebar"
            title="Drag to resize persona assistant sidebar"
            data-testid="persona-assistant-resize-handle"
          >
            <span className="h-12 w-px rounded bg-current" aria-hidden="true" />
          </button>
        )}

        {isCollapsed && !isMobile && (
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="flex h-full w-full items-center justify-center border-l border-neutral-800 bg-soul-950 text-xs font-display uppercase tracking-widest text-neutral-400 hover:text-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-500"
            aria-label="Expand persona assistant sidebar"
            title="Expand persona assistant sidebar"
          >
            <span className="-rotate-90 whitespace-nowrap">persona</span>
          </button>
        )}

        <div className={isCollapsed && !isMobile ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
            <header className="flex items-start justify-between gap-3 border-b border-neutral-800 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-display uppercase tracking-widest text-neutral-200">Persona Assistant</h2>
                <p className="mt-1 text-xs text-neutral-500">Draft persona changes, then save them from the editor.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {assistantTarget && (
                  <button
                    type="button"
                    onClick={() => openChat(assistantTarget)}
                    className="rounded-md border border-neutral-700 px-2 py-1 text-xs font-display lowercase text-neutral-300 hover:border-neutral-500 hover:text-neutral-100"
                  >
                    chat
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsCollapsed(true)}
                  className="hidden rounded-md border border-neutral-700 p-1 text-neutral-400 hover:border-neutral-500 hover:text-neutral-100 md:block"
                  aria-label="Collapse persona assistant sidebar"
                  title="Collapse persona assistant sidebar"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H8m0 0l5-5m-5 5l5 5" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setIsDismissed(true)}
                  className="rounded-md border border-neutral-700 p-1 text-neutral-400 hover:border-neutral-500 hover:text-neutral-100"
                  aria-label="Close persona assistant sidebar"
                  title="Close persona assistant sidebar"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </header>
            <div
              id={PERSONA_ASSISTANT_DOCK_PORTAL_ID}
              ref={portalTargetRef}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            />
        </div>
      </div>
    </aside>
  )
}

export const PersonaAssistantDockSlot = memo(PersonaAssistantDockSlotComponent)
