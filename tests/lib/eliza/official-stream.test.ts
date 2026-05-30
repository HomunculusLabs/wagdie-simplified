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

  it('preserves whitespace-only chunks inside streamed assistant content', async () => {
    const onChunk = jest.fn()
    const onComplete = jest.fn()

    await streamOfficialElizaSse(sseResponse([
      'event: chunk\ndata: {"chunk":"Ash"}\n\n',
      'event: chunk\ndata: {"data":{"text":" "}}\n\n',
      'event: chunk\ndata: {"chunk":"moves."}\n\n',
      'event: complete\ndata: {"messageId":"agent-message"}\n\n',
    ]), { onChunk, onComplete }, 'session-1')

    expect(onChunk).toHaveBeenNthCalledWith(1, 'Ash')
    expect(onChunk).toHaveBeenNthCalledWith(2, ' ')
    expect(onChunk).toHaveBeenNthCalledWith(3, 'moves.')
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Ash moves.',
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

  it('rejects an empty HTTP 200 stream without completing', async () => {
    const onComplete = jest.fn()

    await expect(streamOfficialElizaSse(sseResponse([]), { onComplete }, 'session-1')).rejects.toMatchObject({
      name: 'WagdieElizaError',
      statusCode: 502,
      isRetryable: true,
    })

    expect(onComplete).not.toHaveBeenCalled()
  })

  it('rejects unsupported-only streams without assistant content', async () => {
    const onComplete = jest.fn()

    await expect(streamOfficialElizaSse(sseResponse([
      'event: user_message\ndata: {"id":"user-message"}\n\n',
    ]), { onComplete }, 'session-1')).rejects.toMatchObject({
      name: 'WagdieElizaError',
      statusCode: 502,
      isRetryable: true,
    })

    expect(onComplete).not.toHaveBeenCalled()
  })

  it('rejects streamed chunks that never receive a terminal event', async () => {
    const onChunk = jest.fn()
    const onComplete = jest.fn()

    await expect(streamOfficialElizaSse(sseResponse([
      'event: chunk\ndata: {"chunk":"partial"}\n\n',
    ]), { onChunk, onComplete }, 'session-1')).rejects.toMatchObject({
      name: 'WagdieElizaError',
      statusCode: 502,
      isRetryable: true,
    })

    expect(onChunk).toHaveBeenCalledWith('partial')
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('rejects terminal events with no assistant content', async () => {
    const onComplete = jest.fn()

    await expect(streamOfficialElizaSse(sseResponse([
      'event: done\ndata: {"messageId":"agent-message"}\n\n',
    ]), { onComplete }, 'session-1')).rejects.toMatchObject({
      name: 'WagdieElizaError',
      statusCode: 502,
      isRetryable: true,
    })

    expect(onComplete).not.toHaveBeenCalled()
  })
})
