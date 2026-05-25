/**
 * @jest-environment node
 */

import {
  isPublicGameplayRolls,
  projectPublicGameplayRolls,
  sanitizePublicGameplayRolls,
} from '@/lib/eliza/locationRooms/gameplay/publicRolls'
import type { GameplayMechanicalOutcomeSummary } from '@/lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator'

function summary(overrides: Partial<GameplayMechanicalOutcomeSummary> = {}): GameplayMechanicalOutcomeSummary {
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
        modifierBreakdown: { private: 'not public' },
      },
    },
    ...overrides,
  }
}

describe('public gameplay roll projection', () => {
  it('projects action rolls without private modifier breakdowns or raw roll faces', () => {
    const projected = projectPublicGameplayRolls(summary())

    expect(projected).toEqual({
      action: {
        actionType: 'attack',
        actor: { kind: 'character', id: '7', tokenId: 7, name: null },
        target: { kind: 'unknown', id: null, name: null },
        roll: { formula: '1d20', total: 14 },
        modifier: 3,
        total: 17,
        dc: 12,
        tier: 'success',
        outcome: 'success',
      },
      publicEffects: [],
      retaliation: null,
      deaths: [],
      encounterStatusAfter: 'active',
    })
    expect(JSON.stringify(projected)).not.toContain('modifierBreakdown')
    expect(JSON.stringify(projected)).not.toContain('rolls')
  })

  it('projects selected check display fields from mechanical summaries', () => {
    const projected = projectPublicGameplayRolls(summary({
      mechanicalDeltas: {
        actorTokenId: 7,
        actionType: 'investigate',
        actionRoll: {
          formula: 'd20',
          dc: 13,
          modifier: 5,
          targetKind: 'scene',
          roll: { formula: '1d20+5', rolls: [{ sides: 20, value: 14 }], total: 19 },
          total: 19,
          tier: 'success',
          checkType: 'arcana',
          checkLabel: 'Read the Runes',
          checkSource: 'contextual',
          contextualCheckId: 'read-the-runes',
          modifierBreakdown: { private: 'not public' },
        },
      },
    }))

    expect(projected?.action).toEqual(expect.objectContaining({
      actionType: 'investigate',
      checkType: 'arcana',
      checkLabel: 'Read the Runes',
      checkSource: 'contextual',
      contextualCheckId: 'read-the-runes',
      target: { kind: 'environment', id: null, name: null },
    }))
    expect(JSON.stringify(projected)).not.toContain('modifierBreakdown')
  })

  it('projects damage, healing, and retaliation effects', () => {
    const projected = projectPublicGameplayRolls(summary({
      mechanicalDeltas: {
        actorTokenId: 7,
        actionType: 'rest',
        actionRoll: {
          formula: 'd20',
          dc: 10,
          modifier: 1,
          targetKind: 'none',
          roll: { formula: '1d20', rolls: [{ sides: 20, value: 18 }], total: 18 },
          total: 19,
          tier: 'critical_success',
        },
        actionDamage: { monsterId: 'monster-1', amount: 6, statContribution: { hidden: true } },
        healing: { tokenId: 7, amount: 4, statContribution: { hidden: true } },
        monsterRetaliation: {
          monsterId: 'monster-1',
          tokenId: 7,
          amount: 3,
          targetAc: 13,
          hit: true,
          attackRoll: {
            formula: 'd20',
            dc: 13,
            modifier: 2,
            targetKind: 'character',
            roll: { formula: '1d20', rolls: [{ sides: 20, value: 12 }], total: 12 },
            total: 14,
            tier: 'success',
          },
          damageRoll: { formula: '1d6', rolls: [{ sides: 6, value: 3 }], total: 3 },
        },
      },
    }))

    expect(projected?.publicEffects).toEqual([
      {
        kind: 'damage',
        target: { kind: 'monster', id: 'monster-1', name: null },
        amount: 6,
        status: null,
        summary: 'Damage dealt to monster-1: 6',
      },
      {
        kind: 'healing',
        target: { kind: 'character', id: '7', tokenId: 7, name: null },
        amount: 4,
        status: null,
        summary: 'Healing restored to #7: 4',
      },
    ])
    expect(projected?.retaliation).toEqual({
      actor: { kind: 'monster', id: 'monster-1', name: null },
      target: { kind: 'character', id: '7', tokenId: 7, name: null },
      attackRoll: { formula: '1d20', total: 12 },
      damageRoll: { formula: '1d6', total: 3 },
      targetAc: 13,
      hit: true,
      amount: 3,
      summary: 'Retaliation from monster-1 against #7 vs AC 13 hit for 3 damage',
    })
    expect(JSON.stringify(projected)).not.toContain('statContribution')
  })

  it('projects deaths and encounter status after', () => {
    const projected = projectPublicGameplayRolls(summary({
      encounterStatusAfter: 'defeat',
      deaths: [7, 8],
    }))

    expect(projected?.encounterStatusAfter).toBe('defeat')
    expect(projected?.deaths).toEqual([
      { target: { kind: 'character', id: '7', tokenId: 7, name: null }, summary: 'Character #7 died' },
      { target: { kind: 'character', id: '8', tokenId: 8, name: null }, summary: 'Character #8 died' },
    ])
  })

  it('sanitizes stored metadata and rejects malformed publicRolls', () => {
    const valid = sanitizePublicGameplayRolls({
      action: {
        actionType: 'attack',
        checkType: 'arcana',
        checkLabel: 'Read the Runes',
        checkSource: 'contextual',
        contextualCheckId: 'read-the-runes',
        privateCheckNote: 'drop',
        actor: { kind: 'character', id: '7', tokenId: 7, name: 'Ash', private: 'drop' },
        target: { kind: 'monster', id: 'monster-1', name: 'Bell Maw' },
        roll: { formula: '1d20', rolls: [20], total: 20 },
        modifier: '2',
        total: 22,
        dc: 12,
        outcome: 'critical_success',
      },
      publicEffects: [
        { kind: 'damage', target: { kind: 'monster', id: 'monster-1' }, amount: 9, status: null, summary: 'Damage dealt' },
        { kind: 'debug', summary: 'drop me' },
      ],
      retaliation: { actor: { kind: 'monster', id: 'monster-1' }, targetAc: '13', hit: false, summary: 'Miss' },
      deaths: [{ target: { kind: 'character', id: '7', tokenId: 7 }, summary: 'Character #7 died' }],
      encounterStatusAfter: 'victory',
      mechanicalDeltas: { private: true },
    })

    expect(valid).toEqual({
      action: {
        actionType: 'attack',
        checkType: 'arcana',
        checkLabel: 'Read the Runes',
        checkSource: 'contextual',
        contextualCheckId: 'read-the-runes',
        actor: { kind: 'character', id: '7', tokenId: 7, name: 'Ash' },
        target: { kind: 'monster', id: 'monster-1', tokenId: undefined, name: 'Bell Maw' },
        roll: { formula: '1d20', total: 20 },
        modifier: 2,
        total: 22,
        dc: 12,
        tier: 'critical_success',
        outcome: 'critical_success',
      },
      publicEffects: [{
        kind: 'damage',
        target: { kind: 'monster', id: 'monster-1', tokenId: undefined, name: null },
        amount: 9,
        status: null,
        summary: 'Damage dealt',
      }],
      retaliation: {
        actor: { kind: 'monster', id: 'monster-1', tokenId: undefined, name: null },
        target: null,
        attackRoll: null,
        damageRoll: null,
        targetAc: 13,
        hit: false,
        amount: null,
        summary: 'Miss',
      },
      deaths: [{
        target: { kind: 'character', id: '7', tokenId: 7, name: null },
        summary: 'Character #7 died',
      }],
      encounterStatusAfter: 'victory',
    })
    expect(JSON.stringify(valid)).not.toContain('privateCheckNote')
    expect(isPublicGameplayRolls(valid)).toBe(true)
    expect(sanitizePublicGameplayRolls(null)).toBeNull()
    expect(sanitizePublicGameplayRolls({ action: { actor: null } })).toBeNull()
  })
})
