/**
 * @jest-environment node
 */

import { elizaConfig } from '@/lib/eliza/config'
import { rollDiceFormula } from '@/lib/eliza/locationRooms/gameplay/dice'
import {
  DefaultGameplayCharacterSheetResolver,
  normalizeGameplaySourceStats,
  type GameplayCharacterSheet,
} from '@/lib/eliza/locationRooms/gameplay/characterSheetResolver'
import { resolveGameplayModifiers } from '@/lib/eliza/locationRooms/gameplay/modifiers'
import { updateGameplayPerformanceCountersFromTurn } from '@/lib/eliza/locationRooms/gameplay/performance'
import { sanitizeGameplayStoredError } from '@/lib/eliza/locationRooms/gameplay/repository'
import {
  GAMEPLAY_ACTION_TYPES,
  GAMEPLAY_DEATH_REVIEW_STATUSES,
  GAMEPLAY_TURN_STATUSES,
  type GameplayCharacterState,
} from '@/lib/eliza/locationRooms/gameplay/types'
import {
  applyCharacterHpDelta,
  calculateActionDamage,
  normalizeEncounterProposal,
  normalizeRewardPlan,
  resolveActionRoll,
  resolveGameplayTurnMechanics,
  validateGameplayActionEnvelope,
} from '@/lib/eliza/locationRooms/gameplay/rules'

function gameplaySheet(overrides: Partial<GameplayCharacterSheet> = {}): GameplayCharacterSheet {
  return {
    tokenId: 1,
    name: 'Ash',
    sourceStats: normalizeGameplaySourceStats({ token_id: 1 }),
    equipment: null,
    metadata: null,
    metadataTraits: [],
    concords: [],
    ownerAddress: null,
    stakerAddress: null,
    sheetSnapshotAt: '2026-05-22T12:00:00.000Z',
    ...overrides,
  }
}

function gameplayCharacter(overrides: Partial<GameplayCharacterState> = {}): GameplayCharacterState {
  return {
    tokenId: 1,
    name: 'Ash',
    hp: 10,
    maxHp: 10,
    status: 'alive',
    xp: 0,
    temporaryBoons: [],
    wounds: [],
    ...overrides,
  }
}

const testEncounter = {
  status: 'active' as const,
  difficulty: 'normal' as const,
  roundNumber: 1,
  monsterState: [{
    id: 'monster-1',
    name: 'Bell Maw',
    archetype: 'bell horror',
    hp: 20,
    maxHp: 20,
    ac: 12,
    attackBonus: 4,
    damageFormula: '1d6',
    status: 'alive' as const,
  }],
  rewardPlan: { xpPerCharacter: 0, temporaryBoons: [], narrativeRewards: [], victoryText: null, metadata: {} },
  metadata: {},
}

describe('location room gameplay foundation rules', () => {
  it('keeps gameplay stats and death rewards gated off by default', () => {
    expect(elizaConfig.locationRooms.gameplay.stats).toMatchObject({
      enabled: false,
      refreshSheetOnReconcile: true,
      modifiers: expect.objectContaining({
        maxEquipmentModifierPerRoll: 1,
        maxNftTraitModifierPerRoll: 1,
        maxSearedConcordModifierPerRoll: 1,
        maxTotalNonStatModifierPerRoll: 2,
        maxEffectiveAcBonus: 2,
        concordAllowlist: [],
      }),
    })
    expect(elizaConfig.locationRooms.gameplay.deathRewards).toMatchObject({
      enabled: false,
      policyVersion: 'death-rewards-v1',
      pointsMultiplier: 1,
      pointsCap: 100,
      concordEntitlementTiers: [],
    })
  })

  it('normalizes gameplay source stats to schema/editor defaults', () => {
    expect(normalizeGameplaySourceStats({ token_id: 1, str: 99, hp: 30, max_hp: 12, speed: -5 })).toMatchObject({
      str: 30,
      dex: 10,
      hp: 12,
      maxHp: 12,
      ac: 10,
      speed: 0,
      level: 1,
      experience: 0,
    })
    expect(normalizeGameplaySourceStats(null)).toMatchObject({
      str: 10,
      hp: 10,
      maxHp: 10,
      ac: 10,
      speed: 30,
    })
  })

  it('hydrates gameplay sheets in batch with defaults, wallets, traits, and seared concord context', async () => {
    const resolver = new DefaultGameplayCharacterSheetResolver({
      findCharactersByTokenIds: jest.fn(async () => [{
        token_id: 7,
        name: 'Bell Ash',
        owner_address: '0xOWNER',
        staker_address: '0xSTAKER',
        str: 14,
        hp: 8,
        max_hp: 16,
        equipment: { weapons: ['blade'] },
        metadata: { attributes: [{ trait_type: 'Armor', value: 'Bell Plate' }] },
      }]),
      findCharacterConcords: jest.fn(async () => [{
        id: 'cc-1',
        token_id: 7,
        concord_id: 48,
        quantity: 1,
        is_seared: true,
        seared_at: '2026-05-22T00:00:00.000Z',
        created_at: '2026-05-22T00:00:00.000Z',
        concord: {
          concord_id: 48,
          name: 'Seared Bell',
          description: 'Structured test concord',
          image_url: '/concord.png',
          is_consumable: false,
          effect_type: 'passive',
          created_at: '2026-05-22T00:00:00.000Z',
        },
      }]),
    })

    const sheets = await resolver.resolveSheets([7, 7], { now: new Date('2026-05-22T12:00:00.000Z') })
    expect(sheets.get(7)).toMatchObject({
      tokenId: 7,
      name: 'Bell Ash',
      ownerAddress: '0xowner',
      stakerAddress: '0xstaker',
      sourceStats: expect.objectContaining({ str: 14, hp: 8, maxHp: 16 }),
      equipment: { weapons: ['blade'], armor: undefined, items: undefined, gold: undefined },
      metadataTraits: [{ trait_type: 'Armor', value: 'Bell Plate' }],
      concords: [expect.objectContaining({ concordId: 48, isSeared: true })],
    })
  })

  it('caps negative action modifiers symmetrically', () => {
    const sheet = gameplaySheet({
      concords: [
        { id: 'cc-1', concordId: 21, quantity: 1, isSeared: true, searedAt: 'now', concord: { concord_id: 21, name: 'Burden 1', description: '', image_url: '', is_consumable: false, effect_type: 'passive', created_at: '' } },
        { id: 'cc-2', concordId: 22, quantity: 1, isSeared: true, searedAt: 'now', concord: { concord_id: 22, name: 'Burden 2', description: '', image_url: '', is_consumable: false, effect_type: 'passive', created_at: '' } },
      ],
    })

    const resolved = resolveGameplayModifiers(sheet, {
      maxEquipmentModifierPerRoll: 1,
      maxNftTraitModifierPerRoll: 1,
      maxSearedConcordModifierPerRoll: 2,
      maxTotalNonStatModifierPerRoll: 2,
      maxEffectiveAcBonus: 2,
      concordAllowlist: [
        { concordId: 21, target: 'attack', value: -2 },
        { concordId: 22, target: 'attack', value: -2 },
      ],
    })

    expect(resolved.modifierSources
      .filter((source) => source.target === 'attack')
      .reduce((sum, source) => sum + source.value, 0)).toBe(-2)
  })

  it('records bounded deterministic modifiers and ignores unknown or unseared concord sources', () => {
    const sheet = gameplaySheet({
      sourceStats: normalizeGameplaySourceStats({ token_id: 1, ac: 10 }),
      equipment: { weapons: ['blade'], armor: ['plate'] },
      metadataTraits: [
        { trait_type: 'Weapon', value: 'Trait blade' },
        { trait_type: 'Armor', value: 'Trait armor' },
        { trait_type: 'Freeform Power', value: '+99 attack' },
      ],
      concords: [
        {
          id: 'cc-1',
          concordId: 10,
          quantity: 1,
          isSeared: false,
          searedAt: null,
          concord: { concord_id: 10, name: 'Unseared', description: '', image_url: '', is_consumable: false, effect_type: 'stat_boost', created_at: '', metadata: { target: 'attack', value: 5 } },
        },
        {
          id: 'cc-2',
          concordId: 11,
          quantity: 1,
          isSeared: true,
          searedAt: 'now',
          concord: { concord_id: 11, name: 'Structured', description: '', image_url: '', is_consumable: false, effect_type: 'stat_boost', created_at: '', metadata: { target: 'attack', value: 5 } },
        },
        {
          id: 'cc-3',
          concordId: 12,
          quantity: 1,
          isSeared: true,
          searedAt: 'now',
          concord: { concord_id: 12, name: 'Freeform', description: '+99 attack', image_url: '', is_consumable: false, effect_type: 'ability', created_at: '' },
        },
      ],
    })

    const resolved = resolveGameplayModifiers(sheet, {
      maxEquipmentModifierPerRoll: 1,
      maxNftTraitModifierPerRoll: 1,
      maxSearedConcordModifierPerRoll: 1,
      maxTotalNonStatModifierPerRoll: 2,
      maxEffectiveAcBonus: 2,
      concordAllowlist: [],
    })

    expect(resolved.effectiveStats.ac).toBe(12)
    expect(resolved.modifierSources.filter((source) => source.target === 'attack'))
      .toEqual([
        expect.objectContaining({ source: 'equipment', value: 1 }),
        expect.objectContaining({ source: 'nft_trait', value: 1 }),
      ])
    expect(resolved.modifierSources).toEqual(expect.not.arrayContaining([
      expect.objectContaining({ key: '10' }),
      expect.objectContaining({ key: '12' }),
    ]))
  })

  it('rolls supported dice formulas with injectable RNG', () => {
    const values = [0, 0.5, 0.999]
    const rng = jest.fn(() => values.shift() ?? 0)

    expect(rollDiceFormula('d20', rng)).toMatchObject({ formula: 'd20', total: 1 })
    expect(rollDiceFormula('2d6', rng)).toMatchObject({
      formula: '2d6',
      rolls: [{ sides: 6, value: 4 }, { sides: 6, value: 6 }],
      total: 10,
    })
    expect(() => rollDiceFormula('3d6', rng)).toThrow('Unsupported gameplay dice formula')
  })

  it('validates the V1 action envelope before dice resolve', () => {
    expect(validateGameplayActionEnvelope({ actionType: 'sing', publicSpeech: 'No.' })).toEqual({
      ok: false,
      error: 'Unsupported gameplay action type',
    })
    expect(validateGameplayActionEnvelope({ actionType: 'attack', publicSpeech: 'I strike.' })).toEqual({
      ok: false,
      error: 'Attack actions require a legal monster target',
    })
    expect(validateGameplayActionEnvelope({
      actionType: 'attack',
      target: { kind: 'character', tokenId: 2 },
      publicSpeech: 'I strike Bone.',
    }, {
      legalMonsterIds: ['monster-1'],
      legalCharacterTokenIds: [1, 2],
    })).toEqual({
      ok: false,
      error: 'Attack actions require a legal monster target',
    })
    expect(validateGameplayActionEnvelope({
      actionType: 'attack',
      target: { kind: 'monster', id: 'monster-1' },
      publicSpeech: 'I strike the horror.',
      intentSummary: ' keep it off balance ',
    }, {
      legalMonsterIds: ['monster-1'],
      legalCharacterTokenIds: [1, 2],
    })).toMatchObject({
      ok: true,
      action: {
        actionType: 'attack',
        target: { kind: 'monster', id: 'monster-1' },
        publicSpeech: 'I strike the horror.',
        intentSummary: 'keep it off balance',
      },
    })
  })

  it('derives rolls, tiers, and attack damage server-side', () => {
    const roll = resolveActionRoll(
      { actionType: 'attack', target: { kind: 'monster', id: 'monster-1' } },
      { rng: () => 0.999 }
    )
    const damage = calculateActionDamage({ actionType: 'attack' }, roll.tier, () => 0.5)

    expect(roll).toMatchObject({ formula: 'd20', dc: 12, modifier: 2, total: 22, tier: 'critical_success' })
    expect(damage).toMatchObject({ amount: 8, roll: { formula: '2d6', total: 8 } })
  })

  it('keeps legacy fixed action modifiers when stats are disabled', () => {
    const roll = resolveActionRoll(
      { actionType: 'attack', target: { kind: 'monster', id: 'monster-1' } },
      {
        statsEnabled: false,
        effectiveStats: { str: 30, dex: 30, con: 30, int: 30, wis: 30, cha: 30, maxHp: 30, ac: 30, speed: 30, level: 1, experience: 0 },
        modifierSources: [{ source: 'equipment', key: 'weapon', target: 'attack', value: 2, label: 'test' }],
        rng: () => 0.5,
      }
    )

    expect(roll).toMatchObject({ modifier: 2, modifierBreakdown: expect.objectContaining({ mode: 'legacy_fixed' }) })
  })

  it('uses effective stats and bounded action modifiers in stat-aware rolls', () => {
    const roll = resolveActionRoll(
      { actionType: 'attack', target: { kind: 'monster', id: 'monster-1' } },
      {
        statsEnabled: true,
        effectiveStats: { str: 16, dex: 14, con: 10, int: 10, wis: 10, cha: 10, maxHp: 10, ac: 10, speed: 30, level: 1, experience: 0 },
        modifierSources: [
          { source: 'equipment', key: 'weapon', target: 'attack', value: 1, label: 'weapon' },
          { source: 'nft_trait', key: 'Weapon', target: 'attack', value: 1, label: 'trait' },
          { source: 'concord_allowlist', key: '99', target: 'attack', value: 1, label: 'capped out' },
        ],
        rng: () => 0.5,
      }
    )

    expect(roll).toMatchObject({
      modifier: 5,
      total: 16,
      modifierBreakdown: expect.objectContaining({
        mode: 'stat_aware',
        primaryStats: ['str', 'dex'],
        primaryStatValue: 16,
        statModifier: 3,
        nonStatModifier: 2,
        legacyModifier: 2,
      }),
    })
  })

  it('rolls monster retaliation against effective AC instead of automatic damage', () => {
    const values = [0, 0]
    const result = resolveGameplayTurnMechanics({
      actorTokenId: 1,
      action: { actionType: 'investigate', target: null, publicSpeech: 'I inspect the bell.', metadata: {} },
      encounter: testEncounter,
      characters: {
        '1': gameplayCharacter({
          hp: 6,
          effectiveStats: { str: 10, dex: 10, con: 10, int: 8, wis: 8, cha: 10, maxHp: 10, ac: 20, speed: 30, level: 1, experience: 0 },
          modifierSources: [],
        }),
      },
      statsEnabled: true,
      rng: () => values.shift() ?? 0,
    })

    expect(result.mechanicalDeltas.actionRoll).toMatchObject({ tier: 'critical_failure' })
    expect(result.mechanicalDeltas.monsterRetaliation).toMatchObject({ targetAc: 20, hit: false, amount: 0 })
    expect(result.mechanicalDeltas.charactersAfter['1']).toMatchObject({ hp: 6, status: 'alive' })
  })

  it('adds bounded stat contributions to attack damage and rest healing', () => {
    const attackValues = [0.999, 0, 0]
    const attack = resolveGameplayTurnMechanics({
      actorTokenId: 1,
      action: { actionType: 'attack', target: { kind: 'monster', id: 'monster-1' }, publicSpeech: 'I strike.', metadata: {} },
      encounter: testEncounter,
      characters: {
        '1': gameplayCharacter({
          effectiveStats: { str: 18, dex: 10, con: 10, int: 10, wis: 10, cha: 10, maxHp: 10, ac: 10, speed: 30, level: 1, experience: 0 },
          modifierSources: [],
        }),
      },
      statsEnabled: true,
      rng: () => attackValues.shift() ?? 0,
    })

    expect(attack.mechanicalDeltas.actionDamage).toMatchObject({
      amount: 5,
      statContribution: expect.objectContaining({ stat: 'str', modifier: 4, applied: 3, capped: true }),
    })

    const restValues = [0.999, 0]
    const rest = resolveGameplayTurnMechanics({
      actorTokenId: 1,
      action: { actionType: 'rest', target: null, publicSpeech: 'I bind my wounds.', metadata: {} },
      encounter: testEncounter,
      characters: {
        '1': gameplayCharacter({
          hp: 5,
          effectiveStats: { str: 10, dex: 10, con: 16, int: 10, wis: 10, cha: 10, maxHp: 10, ac: 10, speed: 30, level: 1, experience: 0 },
          modifierSources: [],
        }),
      },
      statsEnabled: true,
      rng: () => restValues.shift() ?? 0,
    })

    expect(rest.mechanicalDeltas.healing).toMatchObject({
      amount: 5,
      statContribution: expect.objectContaining({ stat: 'con', modifier: 3, applied: 3 }),
    })
  })

  it('updates performance counters from backend mechanical deltas only', () => {
    const result = resolveGameplayTurnMechanics({
      actorTokenId: 1,
      action: { actionType: 'attack', target: { kind: 'monster', id: 'monster-1' }, publicSpeech: 'I strike.', metadata: {} },
      encounter: { ...testEncounter, monsterState: [{ ...testEncounter.monsterState[0], hp: 3, maxHp: 3 }] },
      characters: {
        '1': gameplayCharacter(),
        '2': gameplayCharacter({ tokenId: 2, name: 'Bone' }),
      },
      rng: () => 0.999,
    })
    const performance = updateGameplayPerformanceCountersFromTurn(result.mechanicalDeltas)

    expect(performance.characters['1'].performance).toMatchObject({
      roundsActed: 1,
      roundsSurvived: 1,
      damageDealt: 12,
      successfulAttacks: 1,
      criticalSuccesses: 1,
      objectiveContributions: 1,
    })
    expect(performance.characters['2'].performance).toMatchObject({
      roundsActed: 0,
      roundsSurvived: 1,
      objectiveContributions: 1,
    })
    expect(performance.performanceUpdates).toHaveLength(2)
  })

  it('normalizes GM encounter and reward numeric proposals by clamping mechanics', () => {
    const encounter = normalizeEncounterProposal({
      title: '  Impossible Bell Maw  ',
      difficulty: 'hard',
      monsterCount: 99,
      totalMonsterHp: 9999,
      monsterAc: 99,
      monsterAttackBonus: 99,
      monsterDamageFormula: '99d99',
      sceneDc: 99,
      rewardXpPerCharacter: 9999,
      temporaryBoons: ['first', 'second', 'third'],
      narrativeRewards: ['ash-key', 'bell-memory', 'bone-map', 'extra'],
    }, {
      partySize: 2,
      averageLevel: 1,
      difficulty: 'hard',
      maxMonsterCount: 3,
      maxTotalMonsterHp: 40,
      maxXpPerCharacter: 30,
      maxTemporaryBoons: 1,
      maxNarrativeRewards: 2,
    })

    expect(encounter.publicTitle).toBe('Impossible Bell Maw')
    expect(encounter.monsters).toHaveLength(3)
    expect(encounter.monsters.reduce((sum, monster) => sum + monster.maxHp, 0)).toBe(40)
    expect(encounter.monsters[0]).toMatchObject({ ac: 18, attackBonus: 8, damageFormula: '1d6' })
    expect(encounter.mechanics.sceneDc).toBe(20)
    expect(encounter.rewardPlan).toMatchObject({
      xpPerCharacter: 30,
      temporaryBoons: ['first'],
      narrativeRewards: ['ash-key', 'bell-memory'],
    })
  })

  it('falls back when a GM proposal contains an invalid runtime difficulty', () => {
    const encounter = normalizeEncounterProposal({
      difficulty: 'impossible' as never,
      monsterCount: 1,
    }, { partySize: 2 })

    expect(encounter.difficulty).toBe('normal')
    expect(encounter.mechanics.budget).toBe(50)
  })

  it('keeps rewards gameplay-local and bounded', () => {
    expect(normalizeRewardPlan({
      rewardXpPerCharacter: -10,
      temporaryBoons: [' boon ', '', 42],
      narrativeRewards: ['room-visible reward'],
      victoryText: 'Victory text',
    }, { partySize: 2 })).toEqual({
      xpPerCharacter: 0,
      temporaryBoons: ['boon'],
      narrativeRewards: ['room-visible reward'],
      victoryText: 'Victory text',
      metadata: {},
    })
  })

  it('applies HP transitions and immediate gameplay death', () => {
    const character: GameplayCharacterState = {
      tokenId: 7,
      name: 'Ash',
      hp: 3,
      maxHp: 10,
      status: 'alive',
      xp: 0,
      temporaryBoons: [],
      wounds: [],
    }

    const result = applyCharacterHpDelta(character, -5)
    expect(result).toMatchObject({ died: true, revived: false })
    expect(result.character).toMatchObject({ hp: 0, status: 'dead' })
  })

  it('exposes explicit repository-backed gameplay shapes and bounded stored errors', () => {
    expect(GAMEPLAY_ACTION_TYPES).toEqual(['attack', 'defend', 'help', 'investigate', 'negotiate', 'flee', 'rest'])
    expect(GAMEPLAY_TURN_STATUSES).toContain('resolved')
    expect(GAMEPLAY_DEATH_REVIEW_STATUSES).toContain('pending')
    expect(sanitizeGameplayStoredError(new Error('  bad gameplay turn  '))).toBe('bad gameplay turn')
    expect(sanitizeGameplayStoredError('x'.repeat(1100))).toHaveLength(1000)
    expect(sanitizeGameplayStoredError(null)).toBe('Location room gameplay operation failed')
  })
})
