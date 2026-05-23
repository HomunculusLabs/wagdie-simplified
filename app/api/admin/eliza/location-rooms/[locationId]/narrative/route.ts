import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, requireAdmin } from '@/lib/api/auth'
import { jsonNoStore, jsonNoStoreError } from '@/lib/api/responses'
import { locationRoomRepository } from '@/lib/eliza/locationRooms/repository'
import { locationRoomNarrativeRepository } from '@/lib/eliza/locationRooms/narrativeRepository'
import {
  normalizeNarrativeOpenThreads,
  type LocationRoomNarrativeBeat,
  type LocationRoomNarrativeStateSnapshot,
} from '@/lib/eliza/locationRooms/narrativeTypes'

interface RouteContext {
  params: Promise<{ locationId: string }>
}

const DEFAULT_BEAT_LIMIT = 10
const MAX_BEAT_LIMIT = 50
const SAFE_NARRATIVE_ERROR_MESSAGE = 'Narrative beat failed. Check server logs for details.'

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_BEAT_LIMIT
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return DEFAULT_BEAT_LIMIT
  return Math.max(1, Math.min(MAX_BEAT_LIMIT, parsed))
}

function isNarrativeStateSnapshot(value: unknown): value is LocationRoomNarrativeStateSnapshot {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.stateSummary === 'string'
}

function withNoStoreAuthError<T>(response: NextResponse<T>): NextResponse<T> {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function summarizeBeatState(beat: LocationRoomNarrativeBeat) {
  const snapshot = isNarrativeStateSnapshot(beat.stateAfter)
    ? beat.stateAfter
    : isNarrativeStateSnapshot(beat.stateBefore)
      ? beat.stateBefore
      : null

  return {
    stateSummary: snapshot?.stateSummary ?? '',
    currentObjective: snapshot?.currentObjective ?? null,
    openThreads: normalizeNarrativeOpenThreads(snapshot?.openThreads),
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin()
  if (isAuthError(auth)) return withNoStoreAuthError(auth)

  const { locationId } = await context.params
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'))

  try {
    const location = await locationRoomRepository.getLocation(locationId)
    if (!location) {
      return jsonNoStoreError('Location not found', 404)
    }

    const room = await locationRoomRepository.findRoomByLocationId(locationId)
    if (!room) {
      return jsonNoStore({
        room: null,
        location: {
          id: location.id,
          name: location.name,
        },
        state: null,
        beats: [],
        count: 0,
      })
    }

    const [state, beats] = await Promise.all([
      locationRoomNarrativeRepository.findStateByRoomId(room.id),
      locationRoomNarrativeRepository.listRecentBeatsByRoomId(room.id, limit),
    ])

    return jsonNoStore({
      room: {
        id: room.id,
        locationId: room.locationId,
        locationName: location.name,
        tickEnabled: room.tickEnabled,
        lastTickAt: room.lastTickAt,
        nextTickAt: room.nextTickAt,
        tickCount: room.tickCount,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      },
      state: state ? {
        roomId: state.roomId,
        locationId: state.locationId,
        stateSummary: state.stateSummary,
        currentObjective: state.currentObjective,
        openThreads: state.openThreads,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      } : null,
      beats: beats.map((beat) => ({
        roomId: beat.roomId,
        locationId: beat.locationId,
        status: beat.status,
        selectedTokenId: beat.selectedTokenId,
        publicNarration: beat.publicNarration,
        ...summarizeBeatState(beat),
        lastError: beat.lastError ? SAFE_NARRATIVE_ERROR_MESSAGE : null,
        createdAt: beat.createdAt,
        updatedAt: beat.updatedAt,
        completedAt: beat.completedAt,
      })),
      count: beats.length,
    })
  } catch (error) {
    console.error('[Eliza Location Rooms] admin narrative inspection failed', error)
    return jsonNoStoreError('Failed to load location room narrative state', 500)
  }
}
