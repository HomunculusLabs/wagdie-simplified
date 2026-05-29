/**
 * Shared geometry for the right-edge slide-out docks (chat + persona assistant).
 *
 * Both docks are mounted simultaneously and are mutually exclusive (the persona
 * dock is suppressed while chat is open). Sharing these constants guarantees they
 * occupy the exact same space and animate identically, so switching between them
 * never looks "layered".
 */

/** Default panel width in px (desktop). Persona dock may resize from this baseline. */
export const DOCK_DEFAULT_WIDTH = 500

/** Shared stacking context for both docks. They are mutually exclusive, so same z. */
export const DOCK_Z_INDEX = 60

/** Full-viewport, click-through overlay that hosts the panel. */
export const DOCK_OVERLAY_CLASS = 'fixed inset-0 pointer-events-none'

/** The visible panel shell, pinned to the right edge, full height. */
export const DOCK_PANEL_SHELL_CLASS =
  'pointer-events-auto absolute top-0 right-0 h-full bg-soul-950 border-l border-neutral-800 flex flex-col shadow-2xl md:rounded-l-2xl'

/** Shared slide transition. Use with translate-x-0 / translate-x-full. */
export const DOCK_PANEL_TRANSITION_CLASS = 'transform transition-transform duration-300 ease-out'
