import { elizaConfig } from '@/lib/eliza/config'
import { locationRoomService } from './service'

type WorkerAutostartState = {
  started: boolean
  running: boolean
  timer: ReturnType<typeof setInterval> | null
}

declare global {
  // eslint-disable-next-line no-var
  var __wagdieLocationRoomWorkerAutostart: WorkerAutostartState | undefined
}

function parseBoolean(value: string | undefined): boolean | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return null
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return parsed
}

function shouldAutostartLocationRoomWorker(): boolean {
  const explicit = parseBoolean(process.env.ELIZA_LOCATION_ROOM_WORKER_AUTOSTART)
  if (explicit !== null) return explicit

  // Vercel/serverless should use vercel.json cron. Long-lived Node containers can safely run
  // the lightweight poll loop so location-room turns do not depend on a human pressing a button.
  return elizaConfig.locationRooms.enabled && process.env.VERCEL !== '1'
}

export function startLocationRoomWorkerAutostart(): void {
  if (!shouldAutostartLocationRoomWorker()) return

  if (globalThis.__wagdieLocationRoomWorkerAutostart?.started) return

  const pollIntervalSeconds = parsePositiveInteger(
    process.env.ELIZA_LOCATION_ROOM_WORKER_POLL_INTERVAL_SECONDS,
    60
  )
  const state: WorkerAutostartState = {
    started: true,
    running: false,
    timer: null,
  }
  globalThis.__wagdieLocationRoomWorkerAutostart = state

  const runOnce = async () => {
    if (state.running) return
    state.running = true
    try {
      const result = await locationRoomService.runScheduledWorker()
      if (result.enqueued > 0 || result.processed > 0 || result.failed > 0 || result.dead > 0) {
        console.info('[LocationRoomWorker] processed scheduled turn batch', {
          enqueued: result.enqueued,
          deduped: result.deduped,
          processed: result.processed,
          completed: result.completed,
          skipped: result.skipped,
          failed: result.failed,
          dead: result.dead,
        })
      }
    } catch (error) {
      console.error('[LocationRoomWorker] scheduled worker loop failed', error)
    } finally {
      state.running = false
    }
  }

  state.timer = setInterval(runOnce, pollIntervalSeconds * 1000)
  state.timer.unref?.()
  setTimeout(runOnce, 5_000).unref?.()
  console.info('[LocationRoomWorker] autostart enabled', { pollIntervalSeconds })
}
