/**
 * @jest-environment node
 */

import { projectPublicGameplayRolls, sanitizePublicGameplayRolls } from '@/lib/eliza/locationRooms/gameplay/publicRolls'
import type { GameplayMechanicalOutcomeSummary } from '@/lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator'
import type { GameplayEffectiveStats } from '@/lib/eliza/locationRooms/gameplay/types'
import { projectPublicSceneCheckRolls } from '@/lib/eliza/locationRooms/sceneChecks/publicRolls'
import {
  adjudicateSceneCheck,
  mapSceneCheckIntentToGameplayActionType,
  normalizeSceneCheckProposal,
  normalizeSceneCheckRequest,
  resolveSceneCheck,
} from '@/lib/eliza/locationRooms/sceneChecks/rules'

const effectiveStats: GameplayEffectiveStats = {
  str: 10,
  dex: 12,
  con: 10,
  int: 16,
  wis: 14,
  cha: 8,
  maxHp: 10,
  ac: 10,
  speed: 30,
  level: 1,
  experience: 0,
}

function combatSummary(): GameplayMechanicalOutcomeSummary {
  return {
    diceResults: [],
    encounterStatusAfter: 'active',
    deaths: [],
    mechanicalDeltas: {
      actorTokenId: 7,
      actionType: 'attack',
      actionRoll: {
        formula: 'd20',
        dc: 12,
        modifier: 3,
        targetKind: 'monster',
        roll: { formula: '1d20', rolls: [{ sides: 20, value: 14 }], total: 14 },
        total: 17,
        tier: 'success',
      },
    },
  }
}

describe('location room scene-check rules', () => {
  it('normalizes scene-check action intents separately from gameplay check types', () => {
    const request = normalizeSceneCheckRequest({
      id: ' Read Runes! ',
      source: 'game_master',
      actionIntent: 'examine',
      summary: 'Read the ash runes without touching the bell.',
      rollChoice: { source: 'fixed', checkType: 'arcana' },
      difficulty: 'hard',
    })

    expect(request).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: 'read-runes',
        source: 'game_master',
        actionIntent: 'examine',
        gameplayActionType: 'investigate',
        difficulty: 'hard',
        rollChoice: expect.objectContaining({
          source: 'fixed',
          checkType: 'arcana',
          label: 'Arcana',
        }),
      }),
    })
    expect(mapSceneCheckIntentToGameplayActionType('persuade')).toBe('negotiate')
  })

  it('allows GM contextual scene-check requests with bounded public-safe options', () => {
    const request = normalizeSceneCheckRequest({
      actionIntent: 'search',
      contextualChecks: [
        { id: ' blood sigil ', label: 'Read the Blood Sigil', checkType: 'religion', dc: 99, description: 'Interpret the mark.' },
      ],
      rollChoice: { source: 'contextual', contextualCheckId: 'blood-sigil' },
    })

    expect(request).toEqual({
      ok: true,
      value: expect.objectContaining({
        contextualChecks: [{
          id: 'blood-sigil',
          label: 'Read the Blood Sigil',
          description: 'Interpret the mark.',
          checkType: 'religion',
          dc: 20,
        }],
        rollChoice: expect.objectContaining({
          source: 'contextual',
          contextualCheckId: 'blood-sigil',
          checkType: 'religion',
          label: 'Read the Blood Sigil',
        }),
      }),
    })
  })

  it('adjudicates GM request over a valid character proposal', () => {
    const request = normalizeSceneCheckRequest({
      actionIntent: 'persuade',
      rollChoice: { source: 'fixed', checkType: 'persuasion' },
    })
    const proposal = normalizeSceneCheckProposal({
      actionIntent: 'investigate',
      rollChoice: { source: 'fixed', checkType: 'arcana' },
    })

    const adjudication = adjudicateSceneCheck({
      actorTokenId: 7,
      actorName: 'Ash',
      request,
      proposal,
    })

    expect(adjudication).toEqual(expect.objectContaining({
      decision: 'run',
      source: 'game_master',
      reason: 'gm_request',
      actorTokenId: 7,
      actionIntent: 'persuade',
      gameplayActionType: 'negotiate',
      rollChoice: expect.objectContaining({ checkType: 'persuasion' }),
      proposal: expect.objectContaining({ rollChoice: expect.objectContaining({ checkType: 'arcana' }) }),
    }))
  })

  it('skips invalid character proposals or uses backend fallback when supplied', () => {
    expect(normalizeSceneCheckProposal({
      actionIntent: 'invent_spell',
      rollChoice: { source: 'fixed', checkType: 'arcana' },
    })).toEqual({ ok: false, error: 'Unsupported scene-check action intent' })

    const invalidProposal = normalizeSceneCheckProposal({
      actionIntent: 'investigate',
      rollChoice: { source: 'fixed', checkType: 'unsupported_check' },
    })

    expect(invalidProposal).toEqual({ ok: false, error: 'Unsupported gameplay roll check type' })

    const skipped = adjudicateSceneCheck({ actorTokenId: 7, proposal: invalidProposal })
    expect(skipped).toEqual({
      decision: 'skip',
      source: 'backend',
      reason: 'invalid_proposal',
      request: null,
      proposal: null,
      skippedProposalError: 'Unsupported gameplay roll check type',
    })

    const fallback = adjudicateSceneCheck({
      actorTokenId: 7,
      actorName: 'Ash',
      proposal: invalidProposal,
      fallback: { actionIntent: 'search', rollChoice: { source: 'fixed', checkType: 'perception' } },
    })

    expect(fallback).toEqual(expect.objectContaining({
      decision: 'run',
      source: 'backend',
      reason: 'backend_fallback',
      actionIntent: 'search',
      rollChoice: expect.objectContaining({ checkType: 'perception' }),
      skippedProposalError: 'Unsupported gameplay roll check type',
    }))
  })

  it('carries character contextual proposals into resolution', () => {
    const contextualChecks = [{
      id: 'ash-rune',
      label: 'Read the Ash Rune',
      description: 'Interpret the rune without touching it.',
      checkType: 'history' as const,
      dc: 17,
    }]
    const proposal = normalizeSceneCheckProposal({
      actionIntent: 'recall_lore',
      rollChoice: { source: 'contextual', contextualCheckId: 'ash-rune' },
    }, { contextualChecks })

    const adjudication = adjudicateSceneCheck({ actorTokenId: 7, actorName: 'Ash', proposal })
    expect(adjudication).toEqual(expect.objectContaining({
      decision: 'run',
      source: 'character',
      requestSource: null,
      adjudicationSource: 'character',
      contextualChecks,
    }))
    if (adjudication.decision !== 'run') throw new Error('expected runnable scene check')

    const resolved = resolveSceneCheck({ adjudication, rng: () => 0.5, effectiveStats, statsEnabled: true })
    expect(resolved).toEqual(expect.objectContaining({
      requestSource: null,
      adjudicationSource: 'character',
      adjudicationReason: 'character_proposal',
      roll: expect.objectContaining({
        checkType: 'history',
        checkLabel: 'Read the Ash Rune',
        contextualCheckId: 'ash-rune',
        dc: 17,
      }),
    }))
  })

  it('resolves scene checks server-side with existing d20/stat rules and safe missing-stat fallback', () => {
    const request = normalizeSceneCheckRequest({
      actionIntent: 'recall_lore',
      rollChoice: { source: 'fixed', checkType: 'arcana' },
    })
    const adjudication = adjudicateSceneCheck({ actorTokenId: 7, actorName: 'Ash', request })
    expect(adjudication.decision).toBe('run')
    if (adjudication.decision !== 'run') throw new Error('expected runnable scene check')

    const resolved = resolveSceneCheck({
      adjudication,
      rng: () => 0.7,
      effectiveStats,
      statsEnabled: true,
    })

    expect(resolved.roll).toMatchObject({
      checkType: 'arcana',
      roll: { formula: 'd20', total: 15 },
      modifier: 3,
      total: 18,
      tier: 'critical_success',
    })

    const withoutStats = resolveSceneCheck({
      adjudication,
      rng: () => 0.7,
      effectiveStats: null,
      statsEnabled: true,
    })
    expect(withoutStats.roll.modifierBreakdown?.mode).toBe('legacy_fixed')
    expect(withoutStats.roll.modifier).toBe(0)
  })
})

describe('location room scene-check public roll projection', () => {
  it('projects scene-check rolls onto the existing public gameplay-roll compatibility surface', () => {
    const request = normalizeSceneCheckRequest({
      id: 'sigil-check',
      actionIntent: 'search',
      rollChoice: { source: 'fixed', checkType: 'perception' },
    })
    const adjudication = adjudicateSceneCheck({ actorTokenId: 7, actorName: 'Ash', request })
    if (adjudication.decision !== 'run') throw new Error('expected runnable scene check')

    const resolution = resolveSceneCheck({ adjudication, rng: () => 0.95, effectiveStats, statsEnabled: true })
    const projected = projectPublicSceneCheckRolls(resolution, { sceneCheckId: 'sigil-check' })

    expect(projected).toEqual(expect.objectContaining({
      rollContext: 'scene_check',
      sceneCheck: {
        sceneCheckId: 'sigil-check',
        actionIntent: 'search',
        requestSource: 'game_master',
        adjudicationSource: 'game_master',
        adjudicationReason: 'gm_request',
      },
      action: expect.objectContaining({
        actionType: 'search',
        checkType: 'perception',
        checkLabel: 'Perception',
        checkSource: 'fixed',
        actor: { kind: 'character', id: '7', tokenId: 7, name: 'Ash' },
        target: { kind: 'environment', id: null, name: null },
        roll: { formula: 'd20', total: 20 },
        modifier: 2,
        total: 22,
        dc: 12,
        tier: 'critical_success',
        outcome: 'critical_success',
      }),
    }))

    const sanitized = sanitizePublicGameplayRolls({
      ...projected,
      privateMechanics: { hidden: true },
      sceneCheck: { ...projected.sceneCheck, privateNote: 'drop' },
    })
    expect(sanitized).toEqual(expect.objectContaining({
      rollContext: 'scene_check',
      sceneCheck: projected.sceneCheck,
      action: expect.objectContaining({
        actionType: 'search',
        checkType: 'perception',
        roll: { formula: 'd20', total: 20 },
      }),
    }))
    expect(JSON.stringify(sanitized)).not.toContain('private')
  })

  it('preserves existing combat roll compatibility while accepting additive rollContext metadata', () => {
    const combat = projectPublicGameplayRolls(combatSummary())
    expect(combat).not.toHaveProperty('rollContext')

    const sanitizedCombat = sanitizePublicGameplayRolls({
      ...combat,
      rollContext: 'combat',
      sceneCheck: { sceneCheckId: 'drop-for-combat-but-safe' },
    })
    expect(sanitizedCombat).toEqual(expect.objectContaining({
      rollContext: 'combat',
      action: expect.objectContaining({ actionType: 'attack' }),
    }))
    expect(sanitizedCombat).not.toHaveProperty('sceneCheck')
  })
})
