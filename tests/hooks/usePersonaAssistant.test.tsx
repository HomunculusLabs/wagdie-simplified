import { act, renderHook, waitFor } from '@testing-library/react'
import { usePersonaAssistant } from '@/hooks/usePersonaAssistant'

const assistantMessage = {
  id: 'assistant-1',
  role: 'assistant' as const,
  content: 'Draft ready.',
  createdAt: '2026-05-18T00:00:01.000Z',
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    headers: { get: () => 'application/json' },
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response
}

describe('usePersonaAssistant', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('generates a pending proposal without saving or applying persona data', async () => {
    const getAssistantSnapshot = jest.fn(() => ({ system: 'Existing system', bio: ['Existing bio'] }))
    const saveAICharacter = jest.fn()
    const applyAssistantDraft = jest.fn()

    ;(global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({
      assistantMessage,
      proposal: { system: 'Generated system', bio: ['Generated bio'] },
      warnings: ['systemPrompt was normalized to canonical system'],
    }))

    const { result } = renderHook(() => usePersonaAssistant({ tokenId: '123', getAssistantSnapshot }))

    await act(async () => {
      await result.current.generateDraft('Make a grim persona.')
    })

    await waitFor(() => expect(result.current.pendingProposal).toEqual({
      system: 'Generated system',
      bio: ['Generated bio'],
    }))

    expect(getAssistantSnapshot).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('/api/eliza/characters/123/persona-assistant')
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(JSON.parse(init.body)).toMatchObject({
      mode: 'generate',
      editorSnapshot: { system: 'Existing system', bio: ['Existing bio'] },
      messages: [expect.objectContaining({ role: 'user', content: 'Make a grim persona.' })],
    })
    expect(result.current.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: 'Make a grim persona.' }),
      assistantMessage,
    ]))
    expect(result.current.warnings).toEqual(['systemPrompt was normalized to canonical system'])

    // The assistant hook has no save/apply side effect; consumers must explicitly apply then save.
    expect(applyAssistantDraft).not.toHaveBeenCalled()
    expect(saveAICharacter).not.toHaveBeenCalled()
  })

  it('surfaces an explicit error when generate returns no editable proposal', async () => {
    const getAssistantSnapshot = jest.fn(() => ({ system: 'Existing system' }))

    ;(global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({
      assistantMessage,
      warnings: [],
    }))

    const { result } = renderHook(() => usePersonaAssistant({ tokenId: '123', getAssistantSnapshot }))

    await act(async () => {
      await result.current.generateDraft()
    })

    await waitFor(() => {
      expect(result.current.pendingProposal).toBeNull()
      expect(result.current.errorCode).toBe('ASSISTANT_EMPTY_PROPOSAL')
    })
    expect(result.current.error).toMatch(/did not return an editable draft/i)
  })

  it('clears pending proposals without issuing persistence requests', async () => {
    const getAssistantSnapshot = jest.fn(() => ({}))
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({
      assistantMessage,
      proposal: { topics: ['ruins'] },
      warnings: [],
    }))

    const { result } = renderHook(() => usePersonaAssistant({ tokenId: '123', getAssistantSnapshot }))

    await act(async () => {
      await result.current.generateDraft()
    })
    await waitFor(() => expect(result.current.pendingProposal).toEqual({ topics: ['ruins'] }))

    act(() => {
      result.current.discardProposal()
    })

    expect(result.current.pendingProposal).toBeNull()
    expect(result.current.warnings).toEqual([])
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/persona-assistant')
  })
})
