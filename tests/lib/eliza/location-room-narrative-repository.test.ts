/**
 * @jest-environment node
 */

import { sanitizeNarrativeStoredError } from '@/lib/eliza/locationRooms/narrativeRepository'
import {
  normalizeNarrativeOpenThreads,
  toNarrativeStateSnapshot,
  type LocationRoomNarrativeBeatStatus,
  type LocationRoomNarrativeState,
} from '@/lib/eliza/locationRooms/narrativeTypes'

describe('location room narrative repository helpers', () => {
  it('normalizes open threads to non-empty strings', () => {
    expect(normalizeNarrativeOpenThreads([' thread one ', '', 42, 'thread two'])).toEqual([
      'thread one',
      'thread two',
    ])
    expect(normalizeNarrativeOpenThreads({ bad: true })).toEqual([])
  })

  it('creates stable narrative state snapshots without aliasing open thread arrays', () => {
    const state: LocationRoomNarrativeState = {
      id: 'state-1',
      roomId: 'room-1',
      locationId: 'loc-1',
      stateSummary: 'The bell keeps ringing.',
      currentObjective: 'Find the source.',
      openThreads: ['Who rang it?'],
      metadata: {},
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    }

    const snapshot = toNarrativeStateSnapshot(state)
    state.openThreads.push('What wakes beneath?')

    expect(snapshot).toEqual({
      stateSummary: 'The bell keeps ringing.',
      currentObjective: 'Find the source.',
      openThreads: ['Who rang it?'],
    })
  })

  it('sanitizes stored narrative errors consistently', () => {
    expect(sanitizeNarrativeStoredError(new Error('  bad beat  '))).toBe('bad beat')
    expect(sanitizeNarrativeStoredError('  failed state update  ')).toBe('failed state update')
    expect(sanitizeNarrativeStoredError('x'.repeat(1100))).toHaveLength(1000)
    expect(sanitizeNarrativeStoredError(null)).toBe('Location room narrative operation failed')
  })

  it('keeps beat lifecycle statuses explicit for generation retries', () => {
    const statuses: LocationRoomNarrativeBeatStatus[] = [
      'planned',
      'game_master_message_appended',
      'character_appended',
      'completed',
      'failed',
      'dead',
    ]

    expect(statuses).toContain('game_master_message_appended')
    expect(statuses).toContain('dead')
  })
})
