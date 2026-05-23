import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GameMasterAgentAdminContainer } from '@/components/admin/game-master-agent/GameMasterAgentAdminContainer';
import type { GameMasterAgentAdminState } from '@/components/admin/game-master-agent/types';
import type { AICharacter } from '@/types/eliza';

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
  headers: new Headers({ 'content-type': 'application/json' }),
  json: jest.fn().mockResolvedValue(body),
}) as unknown as Response;

const character: AICharacter = {
  id: 'agent-1',
  externalId: 'wagdie:service:location-room-game-master',
  name: 'Official WAGDIE Game Master',
  username: 'wagdie-game-master',
  personality: null,
  backstory: 'Keeps continuity for location rooms.',
  system: 'Return strict JSON beats.',
  systemPrompt: 'Return strict JSON beats.',
  exampleMessages: [],
  templates: {},
  settings: {},
  bio: ['Private GM for location rooms'],
  lore: ['The world is ash.'],
  topics: ['location rooms'],
  adjectives: ['ominous'],
  style: { all: ['Be restrained.'], chat: [], post: [] },
  postExamples: [],
  knowledge: [],
  createdAt: '2026-05-22T00:00:00.000Z',
  updatedAt: '2026-05-22T00:00:00.000Z',
};

const makeState = (overrides: Partial<GameMasterAgentAdminState> = {}): GameMasterAgentAdminState => ({
  effectiveSource: 'admin',
  envFallback: {
    configured: false,
    officialAgentId: null,
  },
  activeSetting: {
    settingKey: 'location-room-game-master',
    officialAgentId: 'agent-1',
    externalId: character.externalId,
    source: 'admin',
    createdBy: '0xAdmin',
    updatedBy: '0xAdmin',
    lastValidatedAt: '2026-05-22T00:00:00.000Z',
    validationError: null,
    validationErrorAt: null,
    metadata: {},
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
  },
  officialAgentId: 'agent-1',
  officialRecordStatus: {
    available: true,
    error: null,
  },
  aiCharacter: character,
  knowledge: [],
  ...overrides,
});

describe('GameMasterAgentAdminContainer', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('loads missing state and posts create/adopt from the empty admin setting state', async () => {
    const missingState = makeState({
      effectiveSource: 'env',
      envFallback: {
        configured: true,
        officialAgentId: 'env-agent',
      },
      activeSetting: null,
      officialAgentId: 'env-agent',
      aiCharacter: { ...character, id: 'env-agent' },
    });
    const adoptedState = makeState({ activeSetting: { ...makeState().activeSetting!, source: 'env_adopted' } });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(missingState))
      .mockResolvedValueOnce(jsonResponse(adoptedState));
    global.fetch = fetchMock;

    render(<GameMasterAgentAdminContainer />);

    expect((await screen.findAllByText('Env fallback')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /adopt env fallback/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /adopt env fallback/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/admin/eliza/game-master-agent', { cache: 'no-store' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/admin/eliza/game-master-agent', { method: 'POST' });
    expect(await screen.findByText('Adopted from env')).toBeInTheDocument();
  });

  it('saves persona edits through the admin PATCH endpoint', async () => {
    const updatedCharacter = { ...character, name: 'Ashen Game Master', updatedAt: '2026-05-22T01:00:00.000Z' };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(makeState()))
      .mockResolvedValueOnce(jsonResponse(makeState({ aiCharacter: updatedCharacter })));
    global.fetch = fetchMock;

    render(<GameMasterAgentAdminContainer />);

    fireEvent.change(await screen.findByLabelText(/display name/i), {
      target: { value: 'Ashen Game Master' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save persona/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, init] = fetchMock.mock.calls[1];
    expect(init).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse(init.body)).toMatchObject({
      name: 'Ashen Game Master',
      username: 'wagdie-game-master',
      system: 'Return strict JSON beats.',
      systemPrompt: 'Return strict JSON beats.',
      bio: ['Private GM for location rooms'],
    });
  });

  it('uploads knowledge and retries failed sync rows through GM admin knowledge APIs', async () => {
    const failedKnowledgeState = makeState({
      knowledge: [
        {
          id: 'doc-1',
          path: 'gm-lore.md',
          preview: 'Old world reference.',
          size: 20,
          syncState: {
            serviceAgentKey: 'location-room-game-master',
            documentId: 'doc-1',
            officialAgentId: 'agent-1',
            officialMemoryId: null,
            contentHash: 'abc',
            status: 'error',
            lastError: 'Knowledge sync failed. Retry after checking ElizaOS availability.',
            lastSyncedAt: null,
            deletedAt: null,
            createdAt: '2026-05-22T00:00:00.000Z',
            updatedAt: '2026-05-22T00:00:00.000Z',
          },
        },
      ],
    });
    const indexedKnowledgeState = makeState({
      knowledge: [
        {
          ...failedKnowledgeState.knowledge[0],
          syncState: {
            ...failedKnowledgeState.knowledge[0].syncState!,
            status: 'indexed',
            lastError: null,
            lastSyncedAt: '2026-05-22T01:00:00.000Z',
          },
        },
      ],
    });
    const uploadedKnowledgeState = makeState({
      knowledge: [
        ...indexedKnowledgeState.knowledge,
        {
          id: 'doc-2',
          path: 'gm-notes.txt',
          preview: 'fresh notes',
          size: 11,
          syncState: null,
        },
      ],
    });
    const deletedKnowledgeState = makeState({
      knowledge: [uploadedKnowledgeState.knowledge[1]],
    });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse(failedKnowledgeState))
      .mockResolvedValueOnce(jsonResponse({ state: indexedKnowledgeState, sync: { attempted: true, ok: true, error: null } }))
      .mockResolvedValueOnce(jsonResponse({ state: uploadedKnowledgeState, sync: { attempted: true, ok: true, error: null } }))
      .mockResolvedValueOnce(jsonResponse(deletedKnowledgeState));
    global.fetch = fetchMock;

    render(<GameMasterAgentAdminContainer />);

    expect(await screen.findByText('gm-lore.md')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry sync/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/admin/eliza/game-master-agent/knowledge/doc-1/sync',
      { method: 'POST' }
    );
    expect(await screen.findByText('Indexed')).toBeInTheDocument();

    const file = new File(['fresh notes'], 'gm-notes.txt', { type: 'text/plain' });
    const uploadInput = await screen.findByLabelText(/upload gm knowledge document/i);
    fireEvent.change(uploadInput, {
      target: { files: [file] },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[2];
    expect(uploadUrl).toBe('/api/admin/eliza/game-master-agent/knowledge');
    expect(uploadInit).toMatchObject({ method: 'POST' });
    expect(uploadInit.body).toBeInstanceOf(FormData);
    expect(await screen.findByText('gm-notes.txt')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /delete/i })[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/admin/eliza/game-master-agent/knowledge/doc-1',
      { method: 'DELETE' }
    );
  });
});
