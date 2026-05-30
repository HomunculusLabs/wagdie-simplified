import {
  evaluateCharacterSheetCompleteness,
  sanitizePersonaAssistantProposal,
} from '@/lib/eliza/character-sheet-policy'

describe('persona assistant proposal policy', () => {
  it('evaluates sparse and default personas as warnings only', () => {
    const result = evaluateCharacterSheetCompleteness({
      id: 'record-123',
      externalId: '123',
      character: {
        name: 'Character #123',
        bio: ['A mysterious character whose story is still being written. Character #123.'],
      },
      createdAt: 'created-at',
      updatedAt: 'updated-at',
    }, '123')

    expect(result.persisted).toBe(true)
    expect(result.defaultNeutralPersona).toBe(true)
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining([
      'default_neutral_persona',
      'missing_message_examples',
      'missing_style',
      'missing_lore',
      'missing_topics',
    ]))
  })

  it('flags legacy generated default persona copy as neutral default', () => {
    const result = evaluateCharacterSheetCompleteness({
      id: 'record-4040',
      externalId: '4040',
      character: {
        name: 'Character #4040',
        bio: ['A mysterious character from the world of WAGDIE. Character #4040.'],
      },
      createdAt: 'created-at',
      updatedAt: 'updated-at',
    }, '4040')

    expect(result.defaultNeutralPersona).toBe(true)
    expect(result.warnings.map((warning) => warning.code)).toContain('default_neutral_persona')
  })

  it('evaluates missing persisted personas without throwing readiness blockers', () => {
    const result = evaluateCharacterSheetCompleteness(null, '4040')

    expect(result.persisted).toBe(false)
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining([
      'missing_persisted_persona',
      'missing_message_examples',
      'missing_style',
      'missing_lore',
      'missing_topics',
    ]))
  })

  it('accepts allowed proposal fields and safe settings only', () => {
    const result = sanitizePersonaAssistantProposal({
      username: 'Ash',
      backstory: 'A haunted knight.',
      system: 'Stay in a grim fantasy tone.',
      bio: ['Undead', 'Owner-authored persona'],
      lore: ['Rose from ash'],
      topics: ['curses', 'ruins'],
      adjectives: ['grim', 'loyal'],
      style: { all: ['Be concise'], chat: ['Ask one question'], post: [] },
      exampleMessages: [{ userMessage: 'Who are you?', assistantMessage: 'A blade in the dark.' }],
      postExamples: ['The grave still speaks.'],
      templates: { greeting: 'Speak, traveler.' },
      settings: {
        avatar: 'https://example.com/avatar.png',
        metadata: { wagdieUser: { tone: 'grim', public: true, score: 7, note: null } },
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.proposal).toMatchObject({
      username: 'Ash',
      system: 'Stay in a grim fantasy tone.',
      settings: {
        avatar: 'https://example.com/avatar.png',
        metadata: { wagdieUser: { tone: 'grim', public: true, score: 7, note: null } },
      },
    })
    expect(result.warnings).toEqual([])
  })

  it('rejects backend-owned and hard-excluded fields instead of stripping them', () => {
    const result = sanitizePersonaAssistantProposal({
      name: 'Do not rename me',
      personality: 'Deprecated field',
      knowledge: [{ id: 'doc-1' }],
      plugins: ['@elizaos/plugin-bootstrap'],
      secrets: { apiKey: 'secret' },
      externalId: '123',
      settings: {
        secrets: { token: 'secret' },
        metadata: { officialAgentId: 'agent-1' },
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'name', reason: 'unsupported' }),
      expect.objectContaining({ path: 'personality', reason: 'unsupported' }),
      expect.objectContaining({ path: 'knowledge', reason: 'unsupported' }),
      expect.objectContaining({ path: 'plugins', reason: 'backend_owned' }),
      expect.objectContaining({ path: 'secrets', reason: 'backend_owned' }),
      expect.objectContaining({ path: 'externalId', reason: 'backend_owned' }),
      expect.objectContaining({ path: 'settings.secrets', reason: 'backend_owned' }),
      expect.objectContaining({ path: 'settings.metadata.officialAgentId', reason: 'backend_owned' }),
    ]))
  })

  it('rejects unsupported settings paths while allowing wagdieUser metadata', () => {
    const result = sanitizePersonaAssistantProposal({
      settings: {
        avatar: 'https://example.com/avatar.png',
        modelProvider: 'openai',
        metadata: {
          wagdieUser: { tone: 'grim' },
          arbitrary: 'not allowed',
        },
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'settings.modelProvider', reason: 'unsupported' }),
      expect.objectContaining({ path: 'settings.metadata.arbitrary', reason: 'unsupported' }),
    ]))
    expect(result.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'settings.metadata.wagdieUser', reason: 'unsupported' }),
    ]))
  })

  it('normalizes supported aliases with warnings when unambiguous', () => {
    const result = sanitizePersonaAssistantProposal({
      systemPrompt: 'Use canonical system internally.',
      messageExamples: [
        [
          { user: 'user', content: { text: 'What do you remember?' } },
          { user: 'assistant', content: { text: 'Only the ash.' } },
        ],
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.proposal).toMatchObject({
      system: 'Use canonical system internally.',
      exampleMessages: [{ userMessage: 'What do you remember?', assistantMessage: 'Only the ash.' }],
    })
    expect(result.warnings).toEqual(expect.arrayContaining([
      'systemPrompt was normalized to canonical system',
      'messageExamples was normalized to app-facing exampleMessages',
    ]))
  })

  it('rejects ambiguous or malformed aliases', () => {
    const result = sanitizePersonaAssistantProposal({
      system: 'Canonical',
      systemPrompt: 'Conflicting alias',
      exampleMessages: [{ userMessage: 'Hi', assistantMessage: 'Hello' }],
      messageExamples: [[{ content: { text: 'missing pair' } }]],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'systemPrompt', reason: 'invalid' }),
      expect.objectContaining({ path: 'messageExamples', reason: 'invalid' }),
    ]))
  })
})
