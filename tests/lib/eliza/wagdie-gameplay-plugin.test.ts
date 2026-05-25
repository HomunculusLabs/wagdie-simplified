/**
 * @jest-environment node
 */

import { wagdieGameplayPlugin } from '../../../services/elizaos/src/wagdie-gameplay-plugin'

describe('WAGDIE gameplay ElizaOS plugin guidance', () => {
  it('documents rollChoice and scene-check proposal guidance without claiming mechanical authority', async () => {
    const provider = wagdieGameplayPlugin.providers[0]
    const context = await provider.get()

    expect(context.text).toContain('"rollChoice"')
    expect(context.text).toContain('contextualCheckId')
    expect(context.text).toContain('sceneCheckProposal')
    expect(context.text).toContain('backend may ignore, sanitize, or override proposals')
    expect(context.text).toContain('cannot assign stats, rewards, claim status, HP changes, dice results, DCs, or death/finality outcomes')
    expect(context.data.actionEnvelope).toEqual(expect.objectContaining({
      rollChoice: expect.objectContaining({
        source: 'fixed|contextual',
      }),
    }))
  })

  it('returns helper examples with rollChoice while keeping mechanics backend-authoritative', async () => {
    const action = wagdieGameplayPlugin.actions[0]
    const callback = jest.fn(async () => [])
    const result = await action.handler({}, {}, undefined, {}, callback)

    expect(result.success).toBe(true)
    expect(result.text).toContain('"rollChoice"')
    expect(result.text).toContain('sceneCheckProposal')
    expect(result.text).toContain('does not resolve mechanics')
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('"rollChoice"'),
      actions: ['DECLARE_WAGDIE_GAMEPLAY_ACTION'],
    }))
    expect(action.examples[0][1].content.text).toContain('"rollChoice"')
  })
})
