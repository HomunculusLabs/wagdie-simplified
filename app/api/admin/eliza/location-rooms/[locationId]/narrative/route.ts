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

function safeObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

const SAFE_GM_GENERATION_ERROR_CATEGORIES = new Set([
  'empty_response',
  'missing_json_object',
  'invalid_json',
  'speaker_constraint',
  'token_constraint',
  'progression_contract',
  'missing_required_field',
  'validation_error',
  'repair_transport_error',
])

const SAFE_GM_GENERATION_TRANSPORT_STAGES = new Set([
  'start_agent',
  'create_session',
  'send_message',
  'collect_stream',
  'create_repair_session',
  'repair_send_message',
  'repair_collect_stream',
])

const SAFE_GM_GENERATION_RECOVERIES = new Set([
  'adventure_patch_defaulted_from_model_prose',
  'scene_check_request_dropped_invalid_optional',
  'scene_check_adventure_patch_defaulted_from_model_prose',
  'scene_check_escalation_normalized',
])

function safeKnownValue(value: unknown, allowed: Set<string>): string | null {
  return typeof value === 'string' && allowed.has(value) ? value : null
}

function safeRecoveryList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value
    .map((item) => safeKnownValue(item, SAFE_GM_GENERATION_RECOVERIES))
    .filter((item): item is string => Boolean(item))))
    .slice(0, 8)
}

function summarizeBeatGeneration(beat: LocationRoomNarrativeBeat) {
  const sceneCheck = safeObject(beat.metadata.sceneCheck)
  const gmOutcome = safeObject(sceneCheck?.gmOutcome)
  const gmOutcomeMetadata = safeObject(gmOutcome?.metadata)
  const gmGeneration = safeObject(gmOutcomeMetadata?.gmGeneration) ?? safeObject(beat.metadata.gmGeneration)
  const status = gmGeneration?.status === 'accepted' || gmGeneration?.status === 'repaired' || gmGeneration?.status === 'repair_failed'
    ? gmGeneration.status
    : 'not_available'

  return {
    status,
    repairAttempted: gmGeneration?.repairAttempted === true,
    repaired: gmGeneration?.repaired === true,
    fallbackUsed: gmGeneration?.fallbackUsed === true || beat.metadata.fallbackUsed === true || gmOutcomeMetadata?.fallbackUsed === true,
    recoveries: safeRecoveryList(gmGeneration?.recoveries),
    initialErrorCategory: safeKnownValue(gmGeneration?.initialErrorCategory, SAFE_GM_GENERATION_ERROR_CATEGORIES),
    repairErrorCategory: safeKnownValue(gmGeneration?.repairErrorCategory, SAFE_GM_GENERATION_ERROR_CATEGORIES),
    transportStage: safeKnownValue(gmGeneration?.transportStage, SAFE_GM_GENERATION_TRANSPORT_STAGES),
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
        publicNarrationPresent: Boolean(beat.publicNarration?.trim()),
        gmGeneration: summarizeBeatGeneration(beat),
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
