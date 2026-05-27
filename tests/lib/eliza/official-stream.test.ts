/**
 * @jest-environment node
 */

import { WagdieElizaError } from '@/lib/eliza/gateway/errors'
import { streamOfficialElizaSse } from '@/lib/eliza/official/stream'

function sseResponse(events: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event))
      }
      controller.close()
    },
  }), { status: 200 })
}

describe('streamOfficialElizaSse', () => {
  it('throws retryable WagdieElizaError on SSE error after partial chunks', async () => {
    const onChunk = jest.fn()
    const onComplete = jest.fn()
    const onError = jest.fn()

    await expect(streamOfficialElizaSse(sseResponse([
      'event: chunk\ndata: {"chunk":"{\\"publicNarration\\":"}\n\n',
      'event: error\ndata: {"message":"upstream unavailable","status":503}\n\n',
    ]), { onChunk, onComplete, onError }, 'session-1')).rejects.toMatchObject({
      name: 'WagdieElizaError',
      message: 'upstream unavailable',
      statusCode: 503,
      isRetryable: true,
    })

    expect(onChunk).toHaveBeenCalledWith('{"publicNarration":')
    expect(onError).toHaveBeenCalledWith(expect.any(WagdieElizaError))
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('throws on SSE error events even when the error has no data payload', async () => {
    const onChunk = jest.fn()
    const onComplete = jest.fn()

    await expect(streamOfficialElizaSse(sseResponse([
      'event: chunk\ndata: {"chunk":"partial"}\n\n',
      'event: error\n\n',
    ]), { onChunk, onComplete }, 'session-1')).rejects.toMatchObject({
      name: 'WagdieElizaError',
      message: 'Official ElizaOS stream failed',
      statusCode: 502,
      isRetryable: true,
    })

    expect(onChunk).toHaveBeenCalledWith('partial')
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('uses streamed chunks as complete content when final event also has prose content', async () => {
    const onComplete = jest.fn()

    await streamOfficialElizaSse(sseResponse([
      'event: chunk\ndata: {"chunk":"{\\"publicNarration\\":\\"Ash moves.\\"}"}\n\n',
      'event: complete\ndata: {"content":"Here is your answer"}\n\n',
    ]), { onComplete }, 'session-1')

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      content: '{"publicNarration":"Ash moves."}',
    }), 'session-1')
  })

  it('uses final complete content when no chunks were streamed', async () => {
    const onComplete = jest.fn()

    await streamOfficialElizaSse(sseResponse([
      'event: complete\ndata: {"content":"{\\"publicNarration\\":\\"Ash moves.\\"}"}\n\n',
    ]), { onComplete }, 'session-1')

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      content: '{"publicNarration":"Ash moves."}',
    }), 'session-1')
  })
})
