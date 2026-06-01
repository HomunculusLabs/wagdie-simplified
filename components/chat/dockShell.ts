/**
 * Shared geometry for the right-edge slide-out docks (chat + persona assistant).
 *
 * Both docks are mounted simultaneously and are mutually exclusive (the persona
 * dock is suppressed while chat is open). Sharing these constants guarantees they
 * occupy the exact same space and animate identically, so switching between them
 * never looks "layered".
 */

/** Default panel width in px (desktop). */
export const DOCK_DEFAULT_WIDTH = 500

/** Minimum resizable panel width in px (desktop). */
export const DOCK_MIN_WIDTH = 340

/** Maximum resizable panel width in px (desktop). */
export const DOCK_MAX_WIDTH = 720

/** Width of the collapsed right-edge rail in px (desktop). */
export const DOCK_COLLAPSED_WIDTH = 56

/** Minimum viewport gutter to preserve beside desktop docks. */
export const DOCK_MOBILE_EDGE_GUTTER = 16

/** Visibility event for the normal chat dock geometry. */
export const CHAT_DOCK_VISIBLE_EVENT = 'chat-dock-visible-change'

export interface RightEdgeDockVisibilityDetail {
  visible: boolean
  width: number
  available?: boolean
  collapsed?: boolean
  resizing?: boolean
}

/** Shared stacking context for both docks. They are mutually exclusive, so same z. */
export const DOCK_Z_INDEX = 60

/** Full-viewport, click-through overlay that hosts the panel. */
export const DOCK_OVERLAY_CLASS = 'fixed inset-0 pointer-events-none'

/** The visible panel shell, pinned to the right edge, full height. */
export const DOCK_PANEL_SHELL_CLASS =
  'pointer-events-auto absolute top-0 right-0 h-full bg-soul-950 border-l border-neutral-800 flex flex-col shadow-2xl md:rounded-l-2xl'

/** Shared slide transition. Use with translate-x-0 / translate-x-full. */
export const DOCK_PANEL_TRANSITION_CLASS = 'transform transition-transform duration-300 ease-out'
