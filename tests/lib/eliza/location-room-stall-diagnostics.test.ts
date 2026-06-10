/**
 * @jest-environment node
 */

import {
  evaluateLocationRoomStallDiagnostics,
  locationRoomStallWarnings,
} from '@/lib/eliza/locationRooms/service/stallDiagnostics'
import {
  createLocationRoomRouteDiagnosticEvent,
  shouldLogLocationRoomRouteDecision,
  type LocationRoomRouteDiagnostic,
} from '@/lib/eliza/locationRooms/service/routeDiagnostics'

const baseDiagnostic: LocationRoomRouteDiagnostic = {
  tickId: 'tick-1',
  roomId: 'room-1',
  locationId: '11',
  turnIntent: 'auto',
  triggerType: 'scheduled',
  gameplayGateResult: 'enabled',
  activeEncounterId: null,
  combatTriggerId: null,
  sceneCheckRequestPresent: false,
  sceneCheckProposalPresent: false,
  sceneCheckProposalErrorPresent: false,
  selectedRoute: 'skip',
  skipReason: 'insufficient_participants',
  publicOutputOutcome: 'blocked_waiting_for_participants',
}

function diagnostic(overrides: Partial<LocationRoomRouteDiagnostic>): LocationRoomRouteDiagnostic {
  return { ...baseDiagnostic, ...overrides }
}

describe('location room route diagnostic events', () => {
  it('normalizes route decisions into structured queryable events', () => {
    const event = createLocationRoomRouteDiagnosticEvent(baseDiagnostic, new Date('2026-06-10T12:00:00.000Z'))

    expect(event).toMatchObject({
      schemaVersion: 1,
      eventType: 'location_room.route_decision',
      occurredAt: '2026-06-10T12:00:00.000Z',
      severity: 'warn',
      labels: {
        locationId: '11',
        roomId: 'room-1',
        tickId: 'tick-1',
        route: 'skip',
        publicOutputOutcome: 'blocked_waiting_for_participants',
        skipReason: 'insufficient_participants',
      },
      observability: {
        requiresPublicOutputAttention: true,
        blockedParticipantSignal: true,
      },
    })
  })

  it('keeps ordinary narrative decisions quiet unless scene-check signals are present', () => {
    expect(shouldLogLocationRoomRouteDecision(diagnostic({
      selectedRoute: 'narrative',
      skipReason: null,
      publicOutputOutcome: undefined,
    }))).toBe(false)

    expect(shouldLogLocationRoomRouteDecision(diagnostic({
      selectedRoute: 'narrative',
      skipReason: null,
      sceneCheckRequestPresent: true,
    }))).toBe(true)
  })
})

describe('location room stall diagnostics', () => {
  it('detects silent advancement and skip streaks from route diagnostics', () => {
    const findings = evaluateLocationRoomStallDiagnostics({
      messages: [],
      routeDiagnostics: [1, 2, 3].map((index) => diagnostic({ tickId: `tick-${index}` })),
    })

    expect(findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'silent_advancement',
      'skip_streak',
    ]))
    expect(locationRoomStallWarnings(findings).join('\n')).toContain('silent_advancement')
  })

  it('does not count silent advancement across a public output tick', () => {
    const findings = evaluateLocationRoomStallDiagnostics({
      messages: [],
      routeDiagnostics: [
        diagnostic({ tickId: 'tick-1' }),
        diagnostic({ tickId: 'tick-2', selectedRoute: 'combat', skipReason: null, publicOutputOutcome: 'public_message_appended' }),
        diagnostic({ tickId: 'tick-3' }),
        diagnostic({ tickId: 'tick-4' }),
      ],
    })

    expect(findings.some((finding) => finding.code === 'silent_advancement')).toBe(false)
  })

  it('does not count skip streaks across intervening public output', () => {
    const findings = evaluateLocationRoomStallDiagnostics({
      messages: [],
      routeDiagnostics: [
        diagnostic({ tickId: 'tick-1' }),
        diagnostic({ tickId: 'tick-2', selectedRoute: 'narrative', skipReason: null, publicOutputOutcome: 'public_message_appended' }),
        diagnostic({ tickId: 'tick-3' }),
        diagnostic({ tickId: 'tick-4' }),
      ],
    })

    expect(findings.some((finding) => finding.code === 'skip_streak')).toBe(false)
  })

  it('detects terminal state mismatch and missing aftermath', () => {
    const findings = evaluateLocationRoomStallDiagnostics({
      messages: [{ authorKind: 'agent', content: 'We wait.' }],
      gameplay: { status: 'active_encounter', encounterStatus: 'victory', encounterTitle: 'Rafter Crow-Wight' },
    })

    expect(findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'terminal_mismatch',
      'missing_aftermath',
    ]))
  })

  it('detects target resurrection after terminal prose', () => {
    const findings = evaluateLocationRoomStallDiagnostics({
      terminalThreatNames: ['Rafter Crow-Wight'],
      messages: [
        { id: 'm1', authorKind: 'game_master', content: 'The Rafter Crow-Wight collapses dead across the beam.' },
        { id: 'm2', authorKind: 'agent', content: 'I look for a way down.' },
        { id: 'm3', authorKind: 'game_master', content: 'The Rafter Crow-Wight lunges again and claws at the nearest torch.' },
      ],
    })

    expect(findings).toContainEqual(expect.objectContaining({
      code: 'target_resurrection',
      severity: 'failure',
    }))
  })

  it('does not treat terminal monster body parts as post-terminal attacks', () => {
    const findings = evaluateLocationRoomStallDiagnostics({
      terminalThreatNames: ['Rafter Crow-Wight'],
      messages: [
        { id: 'm1', authorKind: 'game_master', content: 'The Rafter Crow-Wight collapses dead across the beam.' },
        { id: 'm2', authorKind: 'game_master', content: 'The Rafter Crow-Wight\'s claws lie still beside the cold torch.' },
      ],
    })

    expect(findings.some((finding) => finding.code === 'target_resurrection')).toBe(false)
  })
})
