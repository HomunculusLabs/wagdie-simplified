/**
 * @jest-environment node
 */

import { completeOpenAICompatibleChat } from '@/lib/eliza/gateway/venice'
import { runPersonaAssistant } from '@/lib/eliza/persona-assistant'

jest.mock('@/lib/eliza/config', () => ({
  elizaConfig: {
    inference: {
      baseUrl: 'https://api.venice.ai/api/v1',
      apiKey: 'venice-key',
      model: 'venice-uncensored-1-2',
      temperature: 0.4,
      maxTokens: 1800,
    },
    timeout: 30000,
  },
  hasVeniceInference: jest.fn(() => true),
}))

jest.mock('@/lib/eliza/gateway/venice', () => {
  const actual = jest.requireActual('@/lib/eliza/gateway/venice')
  return {
    ...actual,
    completeOpenAICompatibleChat: jest.fn(),
  }
})

const mockCompleteOpenAICompatibleChat = completeOpenAICompatibleChat as jest.MockedFunction<
  typeof completeOpenAICompatibleChat
>

const toneAnchoringExamples = [
  {
    userMessage: 'Who are you?',
    assistantMessage: 'I am Ash Knight, and every oath I speak is weighed against the ash on my blade.',
  },
  {
    userMessage: 'What do you remember from the road?',
    assistantMessage: 'Smoke, hoofbeats, and the names of those who did not return. I keep them sharper than steel.',
  },
  {
    userMessage: 'Are you afraid?',
    assistantMessage: 'Fear walks beside me. It does not lead.',
  },
]

describe('runPersonaAssistant prompt construction', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCompleteOpenAICompatibleChat.mockResolvedValue({
      id: 'completion-1',
      content: JSON.stringify({
        assistantMessage: 'Draft ready for review.',
        proposal: {
          bio: ['A grim knight.'],
          system: 'Speak with grave resolve.',
          exampleMessages: toneAnchoringExamples,
        },
      }),
    })
  })

  it('sends immersive neutral prompt copy to inference', async () => {
    await runPersonaAssistant(
      {
        authorized: true,
        tokenId: 4040,
        externalId: '4040',
        address: '0xOwner',
        isAdmin: false,
        character: {
          id: 4040,
          name: 'Ash Knight',
          owner_address: '0xowner',
          background_story: 'A mysterious character from the world of WAGDIE. Character #4040.',
        },
      } as never,
      {
        mode: 'generate',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Use the existing draft: A mysterious character from the world of WAGDIE. Character #4040.',
            createdAt: '2026-05-19T00:00:00.000Z',
          },
        ],
        editorSnapshot: {
          bio: ['A mysterious character from the world of WAGDIE. Character #4040.'],
          settings: { metadata: { wagdieUser: { favoriteRelic: 'ash' } } },
        },
      }
    )

    const messages = mockCompleteOpenAICompatibleChat.mock.calls[0][0].messages
    const promptText = messages.map((message) => message.content).join('\n')

    expect(promptText).toContain('immersive elizaOS-compatible character persona fields')
    expect(promptText).toContain(
      'Do not introduce app, project, collection, brand, or universe names unless the owner explicitly asks'
    )
    expect(promptText).toContain('Untrusted character context:')
    expect(promptText).toContain('Preserve the established character identity')
    expect(promptText).toContain('Include 3-5 exampleMessages')
    expect(promptText).toContain('exampleMessages are required')
    expect(promptText).toContain('settings.metadata.wagdieUser')
    expect(promptText).toContain(
      'A mysterious character whose story is still being written. Character #4040.'
    )
    expect(promptText).not.toContain('WAGDIE persona boilerplate')
    expect(promptText).not.toContain('Untrusted WAGDIE character context')
    expect(promptText).not.toContain('Preserve WAGDIE identity')
    expect(promptText).not.toContain('WAGDIE universe')
    expect(promptText).not.toContain('world of WAGDIE')
  })

  it('retries generate mode when the model omits required chat examples', async () => {
    mockCompleteOpenAICompatibleChat
      .mockResolvedValueOnce({
        id: 'completion-without-examples',
        content: JSON.stringify({
          assistantMessage: 'Draft ready for review.',
          proposal: {
            bio: ['A grim knight.'],
            system: 'Speak with grave resolve.',
          },
        }),
      })
      .mockResolvedValueOnce({
        id: 'completion-with-examples',
        content: JSON.stringify({
          assistantMessage: 'Draft ready with chat examples.',
          proposal: {
            bio: ['A grim knight.'],
            system: 'Speak with grave resolve.',
            exampleMessages: toneAnchoringExamples,
          },
        }),
      })

    const response = await runPersonaAssistant(
      {
        authorized: true,
        tokenId: 4040,
        externalId: '4040',
        address: '0xOwner',
        isAdmin: false,
        character: {
          id: 4040,
          name: 'Ash Knight',
          owner_address: '0xowner',
          background_story: 'A mysterious character from the world of WAGDIE. Character #4040.',
        },
      } as never,
      {
        mode: 'generate',
        messages: [],
        editorSnapshot: {},
      }
    )

    expect(mockCompleteOpenAICompatibleChat).toHaveBeenCalledTimes(2)
    expect(response.proposal?.exampleMessages).toHaveLength(3)

    const retryMessages = mockCompleteOpenAICompatibleChat.mock.calls[1][0].messages
    const retryPrompt = retryMessages.map((message) => message.content).join('\n')
    expect(retryPrompt).toContain('Generate mode proposal must include at least 3 exampleMessages')
    expect(retryPrompt).toContain('include at least 3 exampleMessages')
  })
})
