import { SupabaseLocationRoomRepository } from '@/lib/eliza/locationRooms/repository'
import { getSupabaseAdmin } from '@/lib/supabase'

jest.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: jest.fn(),
}))

const mockedGetSupabaseAdmin = jest.mocked(getSupabaseAdmin)

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    room_id: 'room-1',
    location_id: 'loc-1',
    tick_id: 'tick-1',
    sequence: 1,
    visibility: 'public',
    author_kind: 'game_master',
    token_id: null,
    official_agent_id: 'gm-1',
    author_name: 'WAGDIE Game Master',
    content: 'The room answers.',
    metadata: {},
    created_at: '2026-06-05T12:00:00.000Z',
    ...overrides,
  }
}

describe('SupabaseLocationRoomRepository.appendMessagesBatch', () => {
  let rpc: jest.Mock
  let from: jest.Mock
  let repository: SupabaseLocationRoomRepository

  beforeEach(() => {
    rpc = jest.fn()
    from = jest.fn()
    mockedGetSupabaseAdmin.mockReturnValue({ rpc, from } as never)
    repository = new SupabaseLocationRoomRepository()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('sends an ordered batch to the transactional RPC and maps returned rows in order', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        messageRow({ id: 'msg-gm', sequence: 10, metadata: { messageKind: 'gm_beat', dedupeKey: 'narrative:beat-1:gm_beat' } }),
        messageRow({
          id: 'msg-character',
          sequence: 11,
          author_kind: 'agent',
          token_id: 1,
          official_agent_id: 'agent-1',
          author_name: 'Ash',
          content: 'I answer in kind.',
          metadata: { messageKind: 'character_reaction' },
        }),
      ],
      error: null,
    })

    const result = await repository.appendMessagesBatch([
      {
        roomId: 'room-1',
        locationId: 'loc-1',
        tickId: 'tick-1',
        authorKind: 'game_master',
        officialAgentId: 'gm-1',
        authorName: 'WAGDIE Game Master',
        content: 'The room answers.',
        metadata: { messageKind: 'gm_beat', dedupeKey: 'stale-client-value' },
        dedupeKey: ' narrative:beat-1:gm_beat ',
      },
      {
        roomId: 'room-1',
        locationId: 'loc-1',
        tickId: 'tick-1',
        authorKind: 'agent',
        tokenId: 1,
        officialAgentId: 'agent-1',
        authorName: 'Ash',
        content: 'I answer in kind.',
        metadata: { messageKind: 'character_reaction', dedupeKey: 'remove-me' },
      },
    ])

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('append_location_room_messages_batch', {
      p_messages: [
        {
          room_id: 'room-1',
          location_id: 'loc-1',
          tick_id: 'tick-1',
          visibility: 'public',
          author_kind: 'game_master',
          token_id: null,
          official_agent_id: 'gm-1',
          author_name: 'WAGDIE Game Master',
          content: 'The room answers.',
          metadata: { messageKind: 'gm_beat', dedupeKey: 'narrative:beat-1:gm_beat' },
          dedupeKey: 'narrative:beat-1:gm_beat',
        },
        {
          room_id: 'room-1',
          location_id: 'loc-1',
          tick_id: 'tick-1',
          visibility: 'public',
          author_kind: 'agent',
          token_id: 1,
          official_agent_id: 'agent-1',
          author_name: 'Ash',
          content: 'I answer in kind.',
          metadata: { messageKind: 'character_reaction' },
          dedupeKey: null,
        },
      ],
    })
    expect(result.map((message) => message.id)).toEqual(['msg-gm', 'msg-character'])
    expect(result.map((message) => message.sequence)).toEqual([10, 11])
    expect(result[0].metadata).toEqual({ messageKind: 'gm_beat', dedupeKey: 'narrative:beat-1:gm_beat' })
  })

  it('returns deduped rows from the RPC without reordering or reinserting client-side', async () => {
    const existing = messageRow({
      id: 'msg-existing',
      sequence: 4,
      author_kind: 'agent',
      token_id: 7,
      official_agent_id: 'agent-7',
      author_name: 'Seven',
      content: 'Already spoken.',
      metadata: { dedupeKey: 'scene_check:beat-1:character_action' },
    })
    rpc.mockResolvedValueOnce({ data: [existing, existing], error: null })

    const result = await repository.appendMessagesBatch([
      {
        roomId: 'room-1',
        locationId: 'loc-1',
        tickId: 'tick-1',
        authorKind: 'agent',
        tokenId: 7,
        officialAgentId: 'agent-7',
        authorName: 'Seven',
        content: 'Already spoken.',
        dedupeKey: 'scene_check:beat-1:character_action',
      },
      {
        roomId: 'room-1',
        locationId: 'loc-1',
        tickId: 'tick-1',
        authorKind: 'agent',
        tokenId: 7,
        officialAgentId: 'agent-7',
        authorName: 'Seven',
        content: 'Already spoken again.',
        dedupeKey: 'scene_check:beat-1:character_action',
      },
    ])

    expect(result.map((message) => message.id)).toEqual(['msg-existing', 'msg-existing'])
    expect(from).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('propagates RPC failure so Postgres can roll back the whole batch without partial fallback writes', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'content violates check constraint' } })

    await expect(repository.appendMessagesBatch([
      {
        roomId: 'room-1',
        locationId: 'loc-1',
        tickId: 'tick-1',
        authorKind: 'game_master',
        authorName: 'WAGDIE Game Master',
        content: 'First message.',
      },
      {
        roomId: 'room-1',
        locationId: 'loc-1',
        tickId: 'tick-1',
        authorKind: 'agent',
        tokenId: 1,
        authorName: 'Ash',
        content: '',
      },
    ])).rejects.toThrow('content violates check constraint')

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(from).not.toHaveBeenCalled()
  })

  it('does not call Supabase for an empty batch', async () => {
    await expect(repository.appendMessagesBatch([])).resolves.toEqual([])
    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })
})
