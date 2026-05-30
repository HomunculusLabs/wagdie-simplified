export const MIN_ELIGIBLE_PARTICIPANTS = 2
export const MAX_TICK_ATTEMPTS = 3
export const MAX_STORED_ERROR_LENGTH = 1000
export const OWNER_MANUAL_TICK_COOLDOWN_MS = 5 * 60_000

export function routeSafeError(error: unknown): string {
  const message = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : 'Location room tick failed'
  return message.slice(0, MAX_STORED_ERROR_LENGTH)
}

export function isActiveTickConstraintError(error: unknown): boolean {
  return error instanceof Error && /idx_eliza_location_room_ticks_one_active|duplicate key/i.test(error.message)
}

export function nextRetryAt(attempts: number, now: Date): string {
  const delayMinutes = Math.min(60, 5 * 2 ** Math.max(0, attempts - 1))
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString()
}

export function normalizeWallet(value: string): string {
  return value.trim().toLowerCase()
}
