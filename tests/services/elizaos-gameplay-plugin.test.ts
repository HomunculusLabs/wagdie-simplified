/**
 * @jest-environment node
 */

import { wagdieGameplayPlugin } from '../../services/elizaos/src/wagdie-gameplay-plugin'

describe('wagdie gameplay ElizaOS plugin', () => {
  it('provides gameplay vocabulary while keeping backend mechanics authoritative', async () => {
    expect(wagdieGameplayPlugin).toMatchObject({
      name: 'wagdie-gameplay-plugin',
      providers: expect.any(Array),
      actions: expect.any(Array),
    })

    const provider = wagdieGameplayPlugin.providers[0]
    const context = await provider.get()

    expect(context.text).toContain('backend-authoritative')
    expect(context.text).toContain('watch-facing scene direction, not character dialogue')
    expect(context.text).toContain('Stats, rewards, reward claims, death, and finality are backend-authoritative')
    expect(context.text).toContain('cannot assign stats, rewards, claim status')
    expect(context.values).toMatchObject({
      wagdieGameplayBackendAuthoritative: true,
      wagdieGameplayActionTypes: ['attack', 'defend', 'help', 'investigate', 'negotiate', 'flee', 'rest'],
      wagdieGameMasterNoCharacterDialogue: true,
    })
    expect(context.data.authoritativeBackendResponsibilities).toEqual(expect.arrayContaining([
      'action validation',
      'dice rolls',
      'mechanical deltas',
      'death state',
      'stats',
      'rewards',
      'reward claims',
      'persistence',
    ]))
    expect(wagdieGameplayPlugin.providers.map((provider) => provider.name)).toEqual([
      'WAGDIE_GAMEPLAY_CONTEXT',
      'WAGDIE_NARRATIVE_CONTEXT',
    ])
    expect(wagdieGameplayPlugin.actions.map((action) => action.name)).toEqual([
      'DECLARE_WAGDIE_GAMEPLAY_ACTION',
      'PLAN_WAGDIE_SCENE_BEAT',
      'PROPOSE_WAGDIE_SCENE_CHECK',
    ])
  })

  it('declares only no-op action guidance and does not resolve mechanics', async () => {
    const callback = jest.fn(async () => [])
    const action = wagdieGameplayPlugin.actions[0]

    const result = await action.handler(null, null, undefined, undefined, callback)

    expect(result).toMatchObject({
      success: true,
      values: {
        wagdieGameplayActionTypes: ['attack', 'defend', 'help', 'investigate', 'negotiate', 'flee', 'rest'],
      },
      data: {
        noOp: true,
        backendAuthoritative: true,
      },
    })
    expect(result.text).toContain('JSON only')
    expect(result.text).toContain('Choose an action that changes the scene')
    expect(result.text).toContain('backend validation remains authoritative')
    expect(result.text).toContain('does not resolve mechanics or assign stats, rewards, reward claims')
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      actions: ['DECLARE_WAGDIE_GAMEPLAY_ACTION'],
      source: 'wagdie-gameplay-plugin',
    }))
    expect(JSON.stringify(result)).not.toContain('claimStatus')
    expect(JSON.stringify(result)).not.toContain('rewardAmount')
    expect(JSON.stringify(result)).not.toContain('statDelta')
    expect(JSON.stringify(result)).not.toContain('hpDelta')
    expect(JSON.stringify(result)).not.toContain('diceResult')
    expect(JSON.stringify(result)).not.toContain('burnTransaction')
  })

  it('exposes no-op GM beat and scene-check tools without claiming mechanics', async () => {
    const callback = jest.fn(async () => [])
    const sceneBeat = wagdieGameplayPlugin.actions[1]
    const sceneCheck = wagdieGameplayPlugin.actions[2]

    const beatResult = await sceneBeat.handler(null, null, undefined, undefined, callback)
    const checkResult = await sceneCheck.handler(null, null, undefined, undefined, callback)

    expect(beatResult).toMatchObject({
      success: true,
      values: {
        wagdieGameMasterNoCharacterDialogue: true,
        wagdieLocation11Focus: 'crows-den',
      },
      data: {
        noOp: true,
        backendAuthoritative: true,
      },
    })
    expect(beatResult.text).toContain('Never narrate character dialogue')
    expect(beatResult.text).toContain('black bell')
    expect(checkResult).toMatchObject({
      success: true,
      values: {
        wagdieSceneActionIntents: ['inspect', 'search', 'examine', 'decipher', 'negotiate', 'protect', 'force', 'move'],
      },
      data: {
        noOp: true,
        backendAuthoritative: true,
      },
    })
    expect(checkResult.text).toContain('Never invent contextual ids, DCs, labels, dice, results, HP, rewards, death, or finality')
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      actions: ['PLAN_WAGDIE_SCENE_BEAT'],
      source: 'wagdie-gameplay-plugin',
    }))
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      actions: ['PROPOSE_WAGDIE_SCENE_CHECK'],
      source: 'wagdie-gameplay-plugin',
    }))
  })
})
