/**
 * TabNavigation Component
 * Tabbed interface navigation with keyboard support and ARIA attributes
 */

'use client'

import { memo, useCallback, useRef, KeyboardEvent } from 'react'

export interface Tab {
  /** Unique identifier for the tab */
  id: string
  /** Display label for the tab */
  label: string
  /** Optional icon component */
  icon?: React.ReactNode
  /** Whether the tab has validation errors */
  hasError?: boolean
  /** Whether the tab has unsaved changes */
  hasChanges?: boolean
}

interface TabNavigationProps {
  /** Array of tab configurations */
  tabs: Tab[]
  /** ID of the currently active tab */
  activeTab: string
  /** Callback when tab is changed */
  onTabChange: (tabId: string) => void
  /** Additional CSS classes */
  className?: string
  /** Disabled tabs */
  disabledTabs?: string[]
}

function TabNavigationComponent({
  tabs,
  activeTab,
  onTabChange,
  className = '',
  disabledTabs = [],
}: TabNavigationProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const enabledTabs = tabs.filter((tab) => !disabledTabs.includes(tab.id))
      const enabledIndex = enabledTabs.findIndex((tab) => tab.id === activeTab)

      let nextIndex: number | null = null

      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault()
          nextIndex = enabledIndex > 0 ? enabledIndex - 1 : enabledTabs.length - 1
          break
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault()
          nextIndex = enabledIndex < enabledTabs.length - 1 ? enabledIndex + 1 : 0
          break
        case 'Home':
          e.preventDefault()
          nextIndex = 0
          break
        case 'End':
          e.preventDefault()
          nextIndex = enabledTabs.length - 1
          break
      }

      if (nextIndex !== null) {
        const nextTab = enabledTabs[nextIndex]
        onTabChange(nextTab.id)
        const tabIndex = tabs.findIndex((t) => t.id === nextTab.id)
        tabRefs.current[tabIndex]?.focus()
      }
    },
    [tabs, activeTab, onTabChange, disabledTabs]
  )

  return (
    <div
      role="tablist"
      aria-label="AI Persona editor sections"
      className={`flex overflow-x-auto border-b border-neutral-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTab
        const isDisabled = disabledTabs.includes(tab.id)

        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[index] = el
            }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            disabled={isDisabled}
            onClick={() => !isDisabled && onTabChange(tab.id)}
            className={`
              relative flex shrink-0 items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3
              text-base sm:text-lg font-medium transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900
              ${
                isActive
                  ? 'text-soul-400'
                  : isDisabled
                    ? 'text-neutral-600 cursor-not-allowed'
                    : 'text-neutral-400 hover:text-neutral-200'
              }
            `}
          >
            {/* Icon */}
            {tab.icon && <span className="w-4 h-4">{tab.icon}</span>}

            {/* Label */}
            <span>{tab.label}</span>

            {/* Error indicator */}
            {tab.hasError && (
              <span
                className="w-2 h-2 bg-red-500 rounded-full"
                aria-label="Has validation errors"
              />
            )}

            {/* Changes indicator */}
            {tab.hasChanges && !tab.hasError && (
              <span
                className="w-2 h-2 bg-amber-500 rounded-full"
                aria-label="Has unsaved changes"
              />
            )}

            {/* Active indicator */}
            {isActive && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-soul-500"
                aria-hidden="true"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

export const TabNavigation = memo(TabNavigationComponent)
