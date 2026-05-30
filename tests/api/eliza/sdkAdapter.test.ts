/**
 * @jest-environment node
 */

import {
  applyWagdieUpdateToAgentCharacter,
  extractBackstory,
  fromElizaExportMessageExamples,
  mergeAgentCharacter,
  toAgentCharacterFromAICharacter,
  toAICharacterFromRecord,
  toElizaExportMessageExamples,
  type AgentCharacter,
  type CharacterRecord,
} from '@/lib/eliza/sdkAdapter'

describe('Eliza SDK adapter facade', () => {
  it('maps WAGDIE AICharacter input into canonical AgentCharacter shape', () => {
    const character = toAgentCharacterFromAICharacter({
      name: '  The Herald  ',
      personality: 'Ominous and formal.',
      backstory: 'Born beneath a broken banner.',
      systemPrompt: 'Speak in prophecy.',
      exampleMessages: [
        { userMessage: 'What comes next?', assistantMessage: 'Ash, then silence.' },
      ],
      topics: ['omens'],
      adjectives: ['grim'],
      postExamples: ['The gate opens at dusk.'],
      style: { all: ['Be concise'], chat: ['Be direct'] },
    })

    expect(character).toEqual(
      expect.objectContaining({
        name: 'The Herald',
        system: 'Speak in prophecy.',
        bio: ['Ominous and formal.'],
        topics: ['omens'],
        backstory: 'Born beneath a broken banner.',
        lore: ['Born beneath a broken banner.'],
        adjectives: ['grim'],
        postExamples: ['The gate opens at dusk.'],
        style: { all: ['Be concise'], chat: ['Be direct'] },
      })
    )
    expect(character.messageExamples).toEqual([
      [
        { name: '{{user1}}', content: { text: 'What comes next?' } },
        { name: '{{char}}', content: { text: 'Ash, then silence.' } },
      ],
    ])
  })

  it('merges agent character patches without overwriting existing values with undefined', () => {
    const existing: AgentCharacter = {
      name: 'Existing',
      bio: ['old bio'],
      topics: ['old topic'],
      style: {
        all: ['old all'],
        chat: ['old chat'],
        post: ['old post'],
      },
      settings: {
        avatar: 'old.png',
        secrets: { token: 'keep' },
      },
    }

    const merged = mergeAgentCharacter(existing, {
      name: undefined,
      bio: [],
      style: {
        chat: ['new chat'],
        post: undefined as unknown as string[],
      },
      settings: {
        avatar: undefined as unknown as string,
      },
    })

    expect(merged.name).toBe('Existing')
    expect(merged.bio).toEqual([])
    expect(merged.topics).toEqual(['old topic'])
    expect(merged.style).toEqual({
      all: ['old all'],
      chat: ['new chat'],
      post: ['old post'],
    })
    expect(merged.settings).toEqual({
      avatar: 'old.png',
      secrets: { token: 'keep' },
    })
  })

  it('applies WAGDIE updates while preserving custom agent keys', () => {
    const existing: AgentCharacter = {
      name: 'Original',
      system: 'Old prompt',
      bio: ['old bio'],
      lore: ['old lore'],
      customKey: 'keep-me',
    }

    const updated = applyWagdieUpdateToAgentCharacter(existing, {
      personality: 'New bio from legacy personality.',
      backstory: 'New backstory.',
      topics: ['curses'],
    })

    expect(updated).toEqual(
      expect.objectContaining({
        name: 'Original',
        system: 'Old prompt',
        bio: ['New bio from legacy personality.'],
        lore: ['old lore'],
        backstory: 'New backstory.',
        topics: ['curses'],
        customKey: 'keep-me',
      })
    )
  })

  it('extracts backstory from custom key before falling back to lore', () => {
    expect(extractBackstory({ name: 'A', backstory: 'Custom backstory', lore: ['Lore'] })).toBe(
      'Custom backstory'
    )
    expect(extractBackstory({ name: 'B', lore: ['Lore backstory'] })).toBe('Lore backstory')
    expect(extractBackstory({ name: 'C', backstory: null, lore: ['Ignored lore'] })).toBeNull()
  })

  it('reads official-mode WAGDIE backstory and lore from settings.wagdie', () => {
    const record: CharacterRecord = {
      id: 'official-agent-123',
      externalId: '123',
      character: {
        name: 'Official Character',
        bio: ['Official bio'],
        settings: {
          wagdie: {
            externalId: '123',
            backstory: 'Official backstory',
            lore: ['Official lore one', 'Official lore two'],
          },
        },
      } as unknown as AgentCharacter,
      createdAt: 'created-at',
      updatedAt: 'updated-at',
    }

    expect(extractBackstory(record.character)).toBe('Official backstory')
    expect(toAICharacterFromRecord('123', record)).toMatchObject({
      backstory: 'Official backstory',
      lore: ['Official lore one', 'Official lore two'],
    })
  })

  it('preserves official-mode WAGDIE lore when only backstory changes', () => {
    const existing = {
      name: 'Official Character',
      bio: ['Official bio'],
      settings: {
        wagdie: {
          externalId: '123',
          lore: ['Existing official lore'],
        },
      },
    } as unknown as AgentCharacter

    const updated = applyWagdieUpdateToAgentCharacter(existing, {
      backstory: 'New official backstory',
    }) as AgentCharacter & { backstory?: string; lore?: string[] }

    expect(updated.backstory).toBe('New official backstory')
    expect(updated.lore).toBeUndefined()
    expect((updated.settings as Record<string, unknown>).wagdie).toMatchObject({
      lore: ['Existing official lore'],
    })
  })

  it('maps CharacterRecord into stable WAGDIE AICharacter DTO shape', () => {
    const record: CharacterRecord = {
      id: 'record-1',
      externalId: null,
      character: {
        name: 'Record Character',
        system: 'System prompt',
        bio: ['Bio one', 'Bio two'],
        lore: ['Lore one'],
        topics: ['topic'],
        adjectives: ['grave'],
        style: { all: ['style'] },
        postExamples: ['post'],
        messageExamples: [
          [
            { name: '{{user1}}', content: { text: 'Hello' } },
            { name: '{{char}}', content: { text: 'Goodbye' } },
          ],
        ],
      },
      createdAt: 'created-at',
      updatedAt: 'updated-at',
    }

    expect(toAICharacterFromRecord('123', record)).toEqual({
      id: 'record-1',
      externalId: '123',
      name: 'Record Character',
      personality: 'Bio one\n\nBio two',
      backstory: 'Lore one',
      system: 'System prompt',
      systemPrompt: 'System prompt',
      exampleMessages: [{ userMessage: 'Hello', assistantMessage: 'Goodbye' }],
      bio: ['Bio one', 'Bio two'],
      lore: ['Lore one'],
      topics: ['topic'],
      adjectives: ['grave'],
      style: { all: ['style'] },
      postExamples: ['post'],
      knowledge: undefined,
      username: null,
      templates: undefined,
      settings: undefined,
      createdAt: 'created-at',
      updatedAt: 'updated-at',
    })
  })

  it('round-trips Official AgentCharacter persona fields through the app DTO', () => {
    const original: AgentCharacter = {
      name: 'Round Trip',
      username: 'round-trip',
      system: 'Keep the oath short.',
      bio: ['Keeps a brass oath-token under one glove.'],
      lore: ['Owes the bellkeeper a debt that wakes at dusk.'],
      topics: ['bell debts', 'crow omens'],
      adjectives: ['wary', 'flint-voiced'],
      style: { all: ['No meta talk'], chat: ['Use concrete verbs'] },
      messageExamples: [
        [
          { name: '{{user1}}', content: { text: 'The bell is moving.' } },
          { name: '{{char}}', content: { text: 'I pin the rope with my dagger before it names us.' } },
        ],
      ],
      postExamples: ['The rope twitches; I cut first.'],
      templates: { chat: 'Speak from the room.' },
    }

    const dto = toAICharacterFromRecord('77', {
      id: 'record-77',
      externalId: '77',
      character: original,
      createdAt: 'created-at',
      updatedAt: 'updated-at',
    })
    const roundTripped = toAgentCharacterFromAICharacter(dto)

    expect(roundTripped).toEqual(expect.objectContaining({
      name: 'Round Trip',
      username: 'round-trip',
      system: 'Keep the oath short.',
      bio: original.bio,
      lore: original.lore,
      topics: original.topics,
      adjectives: original.adjectives,
      style: original.style,
      postExamples: original.postExamples,
      templates: original.templates,
    }))
    expect(roundTripped.messageExamples).toEqual(original.messageExamples)
  })

  it('preserves an explicit empty templates object on create mapping', () => {
    const character = toAgentCharacterFromAICharacter({
      name: 'Template Empty',
      templates: {},
    })

    expect(character.templates).toEqual({})
  })

  it('re-exports Eliza export message conversion helpers from the facade', () => {
    const exported = toElizaExportMessageExamples([
      [
        { name: '{{user1}}', content: { text: 'Question' } },
        { name: '{{char}}', content: { text: 'Answer' } },
      ],
    ])

    expect(exported).toEqual([
      [
        { user: '{{user1}}', content: { text: 'Question' } },
        { user: '{{char}}', content: { text: 'Answer' } },
      ],
    ])
    expect(fromElizaExportMessageExamples(exported)).toEqual([
      [
        { name: '{{user1}}', content: { text: 'Question' } },
        { name: '{{char}}', content: { text: 'Answer' } },
      ],
    ])
  })
})
