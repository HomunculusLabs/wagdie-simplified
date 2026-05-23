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
    expect(context.text).toContain('Stats, rewards, reward claims, death, and finality are backend-authoritative')
    expect(context.text).toContain('cannot assign stats, rewards, claim status')
    expect(context.values).toMatchObject({
      wagdieGameplayBackendAuthoritative: true,
      wagdieGameplayActionTypes: ['attack', 'defend', 'help', 'investigate', 'negotiate', 'flee', 'rest'],
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
})
