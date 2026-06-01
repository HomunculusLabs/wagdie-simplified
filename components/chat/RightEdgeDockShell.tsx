'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui'
import {
  DOCK_COLLAPSED_WIDTH,
  DOCK_DEFAULT_WIDTH,
  DOCK_MAX_WIDTH,
  DOCK_MIN_WIDTH,
  DOCK_MOBILE_EDGE_GUTTER,
  DOCK_OVERLAY_CLASS,
  DOCK_PANEL_SHELL_CLASS,
  DOCK_Z_INDEX,
  type RightEdgeDockVisibilityDetail,
} from './dockShell'

interface RightEdgeDockShellRenderControls {
  collapseButton: ReactNode
  isCollapsed: boolean
  width: number
}

interface RightEdgeDockShellProps {
  ariaLabel: string
  isAvailable: boolean
  onRequestClose: () => void
  children: (controls: RightEdgeDockShellRenderControls) => ReactNode
  ariaHidden?: boolean
  panelRole?: 'dialog'
  panelAriaLabelledBy?: string
  visibilityEventName?: string
  onGeometryChange?: (geometry: Required<RightEdgeDockVisibilityDetail>) => void
  initialWidth?: number
  minWidth?: number
  maxWidth?: number
  collapsedWidth?: number
  mobileEdgeGutter?: number
  collapseResetKey?: string | number | null
  panelTestId?: string
  resizeHandleTestId?: string
  resizeHandleLabel?: string
  dataAttributes?: Record<string, string>
  collapsedRailLabel: string
  collapseButtonLabel: string
  expandButtonLabel?: string
}

export function RightEdgeDockShell({
  ariaLabel,
  isAvailable,
  onRequestClose,
  children,
  ariaHidden,
  panelRole,
  panelAriaLabelledBy,
  visibilityEventName,
  onGeometryChange,
  initialWidth = DOCK_DEFAULT_WIDTH,
  minWidth = DOCK_MIN_WIDTH,
  maxWidth = DOCK_MAX_WIDTH,
  collapsedWidth = DOCK_COLLAPSED_WIDTH,
  mobileEdgeGutter = DOCK_MOBILE_EDGE_GUTTER,
  collapseResetKey,
  panelTestId,
  resizeHandleTestId,
  resizeHandleLabel,
  dataAttributes,
  collapsedRailLabel,
  collapseButtonLabel,
  expandButtonLabel,
}: RightEdgeDockShellProps) {
  const [drawerWidth, setDrawerWidth] = useState(initialWidth)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setIsMobile(false)
      return
    }

    const mq = window.matchMedia('(max-width: 767px)')
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const getClampedDrawerWidth = useCallback((width: number) => {
    const viewportLimit = typeof window === 'undefined'
      ? maxWidth
      : Math.max(minWidth, window.innerWidth - mobileEdgeGutter)

    return Math.min(Math.max(width, minWidth), Math.min(maxWidth, viewportLimit))
  }, [maxWidth, minWidth, mobileEdgeGutter])

  useEffect(() => {
    setDrawerWidth((width) => getClampedDrawerWidth(width))
  }, [getClampedDrawerWidth])

  useEffect(() => {
    setIsCollapsed(false)
  }, [collapseResetKey])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleWindowResize = () => {
      setDrawerWidth((width) => getClampedDrawerWidth(width))
    }

    window.addEventListener('resize', handleWindowResize)

    return () => {
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [getClampedDrawerWidth])

  useEffect(() => {
    if (!isResizing || typeof window === 'undefined') return

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

  const isEffectivelyCollapsed = isCollapsed && !isMobile
  const currentDrawerWidth = isEffectivelyCollapsed ? collapsedWidth : drawerWidth
  const isVisible = isAvailable && !isEffectivelyCollapsed
  const drawerStyle = isMobile
    ? undefined
    : {
        width: currentDrawerWidth,
        maxWidth: `calc(100vw - ${mobileEdgeGutter}px)`,
      }

  const geometry = useMemo<Required<RightEdgeDockVisibilityDetail>>(() => ({
    visible: isVisible,
    width: currentDrawerWidth,
    available: isAvailable,
    collapsed: isEffectivelyCollapsed,
    resizing: isResizing,
  }), [currentDrawerWidth, isAvailable, isEffectivelyCollapsed, isResizing, isVisible])

  useEffect(() => {
    onGeometryChange?.(geometry)

    if (visibilityEventName && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(visibilityEventName, { detail: geometry }))
    }
  }, [geometry, onGeometryChange, visibilityEventName])

  useEffect(() => {
    return () => {
      if (!visibilityEventName || typeof window === 'undefined') return

      window.dispatchEvent(new CustomEvent(visibilityEventName, {
        detail: {
          visible: false,
          width: initialWidth,
          available: false,
          collapsed: false,
          resizing: false,
        },
      }))
    }
  }, [initialWidth, visibilityEventName])

  const collapseButton = (
    <Button
      variant="secondary"
      size="icon"
      onClick={() => setIsCollapsed(true)}
      className="hidden md:inline-flex"
      aria-label={collapseButtonLabel}
      title="Collapse"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H8m0 0l5-5m-5 5l5 5" />
      </svg>
    </Button>
  )

  return (
    <aside
      aria-label={ariaLabel}
      aria-hidden={ariaHidden ? true : undefined}
      data-available={isAvailable ? 'true' : 'false'}
      data-visible={isVisible ? 'true' : 'false'}
      data-collapsed={isEffectivelyCollapsed ? 'true' : 'false'}
      data-width={String(currentDrawerWidth)}
      data-resizing={isResizing ? 'true' : 'false'}
      {...dataAttributes}
      className={DOCK_OVERLAY_CLASS}
      style={{ zIndex: DOCK_Z_INDEX }}
    >
      <div
        onClick={onRequestClose}
        aria-hidden="true"
        className={`
          absolute inset-0 bg-black/60 transition-opacity duration-300 md:hidden
          ${isVisible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}
        `}
      />
      <div
        data-testid={panelTestId}
        role={panelRole}
        aria-labelledby={panelAriaLabelledBy}
        className={`
          ${DOCK_PANEL_SHELL_CLASS}
          w-full md:w-auto
          transform transition-transform ease-out
          ${isResizing ? 'duration-0' : 'duration-300'}
          ${isAvailable ? 'translate-x-0' : 'translate-x-full pointer-events-none'}
        `}
        style={drawerStyle as CSSProperties | undefined}
      >
        {!isCollapsed && isAvailable && !isMobile && (
          <button
            type="button"
            onPointerDown={handleResizePointerDown}
            className="absolute left-0 top-0 z-10 hidden h-full w-3 -translate-x-1.5 cursor-ew-resize items-center justify-center rounded-l-xl text-neutral-600 hover:text-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-500 md:flex"
            aria-label={resizeHandleLabel ?? `Resize ${ariaLabel}`}
            title={`Drag to resize ${ariaLabel}`}
            data-testid={resizeHandleTestId}
          >
            <span className="h-12 w-px rounded bg-current" aria-hidden="true" />
          </button>
        )}

        {isEffectivelyCollapsed && (
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="flex h-full w-full items-center justify-center border-l border-neutral-800 bg-soul-950 text-xs font-display uppercase tracking-widest text-neutral-400 hover:text-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-500"
            aria-label={expandButtonLabel ?? `Expand ${ariaLabel}`}
            title={expandButtonLabel ?? `Expand ${ariaLabel}`}
          >
            <span className="-rotate-90 whitespace-nowrap">{collapsedRailLabel}</span>
          </button>
        )}

        <div className={isEffectivelyCollapsed ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
          {children({ collapseButton, isCollapsed: isEffectivelyCollapsed, width: currentDrawerWidth })}
        </div>
      </div>
    </aside>
  )
}
