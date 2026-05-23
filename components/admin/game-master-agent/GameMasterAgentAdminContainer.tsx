'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@/components/ui';
import type { UpdateAICharacterInput } from '@/types/eliza';
import { GameMasterAgentKnowledgePanel } from './GameMasterAgentKnowledgePanel';
import { GameMasterAgentPersonaForm } from './GameMasterAgentPersonaForm';
import { GameMasterAgentStatusPanel } from './GameMasterAgentStatusPanel';
import type { BusyAction, GameMasterAgentAdminState, GameMasterAgentSyncResponse } from './types';

const API_ROOT = '/api/admin/eliza/game-master-agent';

function isStateResponse(value: unknown): value is GameMasterAgentAdminState {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'effectiveSource' in value &&
    'envFallback' in value &&
    'knowledge' in value
  );
}

function isSyncResponse(value: unknown): value is GameMasterAgentSyncResponse {
  return Boolean(value && typeof value === 'object' && 'state' in value && 'sync' in value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const maybeError = 'error' in body ? (body as { error?: unknown }).error : undefined;
    if (typeof maybeError === 'string' && maybeError.trim()) return maybeError;

    const maybeMessage = 'message' in body ? (body as { message?: unknown }).message : undefined;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
  }

  return fallback;
}

function stateFromBody(body: unknown): GameMasterAgentAdminState | null {
  if (isStateResponse(body)) return body;
  if (isSyncResponse(body)) return body.state;
  return null;
}

function normalizeKnowledgeUploadFile(file: File): File {
  if (file.type) return file;

  const fallbackType = file.name.endsWith('.md')
    ? 'text/markdown'
    : file.name.endsWith('.txt')
      ? 'text/plain'
      : '';

  if (!fallbackType) return file;

  return new File([file], file.name, {
    type: fallbackType,
    lastModified: file.lastModified,
  });
}

async function requestState(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallback: string
): Promise<GameMasterAgentAdminState> {
  const response = await fetch(input, init);
  const body = await readJson(response);
  const state = stateFromBody(body);

  if (!response.ok) {
    const message = isSyncResponse(body) && body.sync.error
      ? body.sync.error
      : extractErrorMessage(body, fallback);

    if (state) {
      const error = new Error(message) as Error & { state?: GameMasterAgentAdminState };
      error.state = state;
      throw error;
    }

    throw new Error(message);
  }

  if (!state) {
    throw new Error(fallback);
  }

  return state;
}

export function GameMasterAgentAdminContainer() {
  const [state, setState] = useState<GameMasterAgentAdminState | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>('load');
  const [errors, setErrors] = useState<string[]>([]);
  const [personaDirty, setPersonaDirty] = useState(false);

  const loadState = useCallback(async () => {
    setBusyAction('load');
    setErrors([]);

    try {
      const nextState = await requestState(API_ROOT, { cache: 'no-store' }, 'Failed to load game-master agent state');
      setState(nextState);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Failed to load game-master agent state']);
    } finally {
      setBusyAction(null);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const runStateAction = async (
    action: Exclude<BusyAction, 'load' | null>,
    request: () => Promise<GameMasterAgentAdminState>,
    fallback: string
  ) => {
    setBusyAction(action);
    setErrors([]);

    try {
      const nextState = await request();
      setState(nextState);
    } catch (error) {
      const maybeState = error instanceof Error ? (error as Error & { state?: GameMasterAgentAdminState }).state : undefined;
      if (maybeState) setState(maybeState);
      setErrors([error instanceof Error ? error.message : fallback]);
      throw error;
    } finally {
      setBusyAction(null);
    }
  };

  const handleBootstrap = () => {
    void runStateAction(
      'bootstrap',
      () => requestState(API_ROOT, { method: 'POST' }, 'Failed to create or adopt game-master agent'),
      'Failed to create or adopt game-master agent'
    ).catch(() => undefined);
  };

  const handleClearSetting = () => {
    if (!window.confirm('Clear the admin GM agent setting? The official ElizaOS agent will not be deleted.')) {
      return;
    }

    void runStateAction(
      'clear-setting',
      () => requestState(API_ROOT, { method: 'DELETE' }, 'Failed to clear game-master agent setting'),
      'Failed to clear game-master agent setting'
    ).catch(() => undefined);
  };

  const handleSavePersona = async (input: UpdateAICharacterInput) => {
    await runStateAction(
      'save-persona',
      () => requestState(
        API_ROOT,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
        'Failed to save game-master persona'
      ),
      'Failed to save game-master persona'
    );
  };

  const handleUploadKnowledge = async (file: File) => {
    const formData = new FormData();
    formData.append('file', normalizeKnowledgeUploadFile(file));

    await runStateAction(
      'upload-knowledge',
      () => requestState(
        `${API_ROOT}/knowledge`,
        {
          method: 'POST',
          body: formData,
        },
        'Failed to upload game-master knowledge document'
      ),
      'Failed to upload game-master knowledge document'
    );
  };

  const handleDeleteKnowledge = async (documentId: string) => {
    if (!window.confirm('Delete this GM knowledge document?')) return;

    await runStateAction(
      `delete-knowledge:${documentId}`,
      () => requestState(
        `${API_ROOT}/knowledge/${encodeURIComponent(documentId)}`,
        { method: 'DELETE' },
        'Failed to delete game-master knowledge document'
      ),
      'Failed to delete game-master knowledge document'
    );
  };

  const handleRetryKnowledge = async (documentId: string) => {
    await runStateAction(
      `retry-knowledge:${documentId}`,
      () => requestState(
        `${API_ROOT}/knowledge/${encodeURIComponent(documentId)}/sync`,
        { method: 'POST' },
        'Failed to retry game-master knowledge sync'
      ),
      'Failed to retry game-master knowledge sync'
    );
  };

  if (busyAction === 'load' && !state) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-soul-accent/20 bg-soul-shadow/70">
        <Spinner />
      </div>
    );
  }

  if (!state) {
    return (
      <section className="rounded-lg border border-soul-accent/20 bg-soul-shadow/70 p-8 text-center">
        <p className="font-display text-xl text-soul-bone">Unable to load the game-master agent.</p>
        {errors.length > 0 && (
          <p className="mt-3 text-sm text-ember">{errors.join(', ')}</p>
        )}
        <button
          type="button"
          onClick={() => void loadState()}
          className="mt-5 rounded border border-soul-accent/50 px-4 py-2 text-sm text-soul-accent hover:border-soul-accent hover:text-soul-bone"
        >
          Retry
        </button>
      </section>
    );
  }

  const canEdit = Boolean(state.activeSetting && state.officialRecordStatus.available && state.aiCharacter);
  const canManageKnowledge = canEdit && !personaDirty;

  return (
    <div className="space-y-5">
      {errors.length > 0 && (
        <div className="rounded border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100" role="alert">
          {errors.join(', ')}
        </div>
      )}

      <GameMasterAgentStatusPanel
        state={state}
        busyAction={busyAction}
        hasUnsavedPersonaChanges={personaDirty}
        onBootstrap={handleBootstrap}
        onClearSetting={handleClearSetting}
      />

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <GameMasterAgentPersonaForm
          character={state.aiCharacter}
          canEdit={canEdit}
          busyAction={busyAction}
          onSave={handleSavePersona}
          onDirtyChange={setPersonaDirty}
        />
        <GameMasterAgentKnowledgePanel
          documents={state.knowledge}
          canEdit={canManageKnowledge}
          busyAction={busyAction}
          error={errors[0] ?? null}
          blockedReason={personaDirty ? 'Save or discard persona changes before managing knowledge.' : null}
          onUpload={handleUploadKnowledge}
          onDelete={handleDeleteKnowledge}
          onRetry={handleRetryKnowledge}
        />
      </div>
    </div>
  );
}
