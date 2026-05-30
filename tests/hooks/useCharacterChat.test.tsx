/**
 * @jest-environment jsdom
 */

import { TextDecoder, TextEncoder } from 'util'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useCharacterChat } from '@/hooks/useCharacterChat'

global.TextEncoder = TextEncoder as typeof global.TextEncoder
global.TextDecoder = TextDecoder as typeof global.TextDecoder

const mockUseAccount = jest.fn()

jest.mock('wagmi', () => ({
  useAccount: () => mockUseAccount(),
}))

function sseResponse(events: string[]): Response {
  const encoder = new TextEncoder()
  const chunks = events.map((event) => encoder.encode(event))
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        let index = 0
        return {
          async read() {
            if (index >= chunks.length) {
              return { done: true, value: undefined }
            }
            return { done: false, value: chunks[index++] }
          },
        }
      },
    },
  } as unknown as Response
}

describe('useCharacterChat', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAccount.mockReturnValue({ isConnected: true })
    global.fetch = jest.fn()
  })

  it('sends first-turn chat without generating a conversation id and stores the returned WAGDIE id', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(sseResponse([
      'event: token\ndata: {"token":"Hi"}\n\n',
      'event: complete\ndata: {"id":"assistant-1","content":"Hi","conversationId":"conv-1","createdAt":"2026-05-30T00:00:00.000Z"}\n\n',
    ]))

    const { result } = renderHook(() => useCharacterChat('4073'))

    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(JSON.parse(init.body as string)).toMatchObject({
      tokenId: '4073',
      message: 'Hello',
      conversationId: null,
    })

    await waitFor(() => expect(result.current.conversationId).toBe('conv-1'))
    expect(result.current.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', content: 'Hi', conversationId: 'conv-1' }),
    ]))
  })

  it('rejects blank complete events without storing a conversation id', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(sseResponse([
      'event: complete\ndata: {"id":"assistant-1","content":"","conversationId":"conv-1"}\n\n',
    ]))

    const { result } = renderHook(() => useCharacterChat('4073'))

    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    await waitFor(() => expect(result.current.errorCode).toBe('EMPTY_ASSISTANT_MESSAGE'))
    expect(result.current.conversationId).toBeNull()
    expect(result.current.messages).toEqual([])
  })

  it('rejects complete events without a WAGDIE conversation id', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(sseResponse([
      'event: complete\ndata: {"id":"assistant-1","content":"Hi","conversationId":""}\n\n',
    ]))

    const { result } = renderHook(() => useCharacterChat('4073'))

    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    await waitFor(() => expect(result.current.errorCode).toBe('MISSING_CONVERSATION_ID'))
    expect(result.current.conversationId).toBeNull()
    expect(result.current.messages).toEqual([])
  })

  it('keeps the current conversation id when a route error event is received', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(sseResponse([
        'event: complete\ndata: {"id":"assistant-1","content":"Hi","conversationId":"conv-1"}\n\n',
      ]))
      .mockResolvedValueOnce(sseResponse([
        'event: error\ndata: {"code":"CHAT_ERROR","message":"failed"}\n\n',
      ]))

    const { result } = renderHook(() => useCharacterChat('4073'))

    await act(async () => {
      await result.current.sendMessage('Hello')
    })
    await waitFor(() => expect(result.current.conversationId).toBe('conv-1'))

    await act(async () => {
      await result.current.sendMessage('Again')
    })

    await waitFor(() => expect(result.current.errorCode).toBe('CHAT_ERROR'))
    expect(result.current.conversationId).toBe('conv-1')
    expect(result.current.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', content: 'Hi', conversationId: 'conv-1' }),
    ]))
  })
})
