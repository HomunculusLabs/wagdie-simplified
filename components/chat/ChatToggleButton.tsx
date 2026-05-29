'use client'

import { memo, type CSSProperties } from 'react'
import { useChatDock } from '@/contexts/ChatDockContext'
import { Button } from '@/components/ui'
import { DOCK_DEFAULT_WIDTH } from './dockShell'

/** Gap between the open dock's edge and the floating toggle button. */
const TOGGLE_GUTTER = 20

function ChatToggleButtonComponent() {
  const { isOpen, target, toggleChat } = useChatDock()

  if (!target) return null

  const ariaLabel = isOpen ? 'Close chat drawer' : 'Open chat drawer'

  // On mobile the dock is a full-width sheet, so the button stays near the edge (right-4).
  // On md+, when open, it sits just outside the panel. The offset is derived from the shared
  // dock width via a CSS var so it can't drift; the md:right-[var(...)] class is static so
  // Tailwind's JIT compiles it.
  const style = { '--toggle-open-right': `${DOCK_DEFAULT_WIDTH + TOGGLE_GUTTER}px` } as CSSProperties

  return (
    <div
      style={style}
      className={`fixed top-1/2 -translate-y-1/2 right-4 z-[70] transition-[right] duration-300 ease-out ${isOpen ? 'md:right-[var(--toggle-open-right)]' : ''}`}
    >
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={() => toggleChat()}
        aria-label={ariaLabel}
        title={ariaLabel}
        className="rounded-full shadow-lg bg-black/40 backdrop-blur-sm border-neutral-700 hover:border-neutral-500"
      >
        <ChatToggleIcon isOpen={isOpen} />
      </Button>
    </div>
  )
}

function ChatToggleIcon({ isOpen }: { isOpen: boolean }) {
  if (isOpen) {
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
        d="M8 10h8M8 14h5"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  )
}

export const ChatToggleButton = memo(ChatToggleButtonComponent)