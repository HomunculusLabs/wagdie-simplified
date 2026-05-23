'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { FIELD_LIMITS } from '@/types/eliza';
import type { BusyAction, GameMasterKnowledgeDocument, ServiceAgentKnowledgeSyncStatus } from './types';

interface GameMasterAgentKnowledgePanelProps {
  documents: GameMasterKnowledgeDocument[];
  canEdit: boolean;
  busyAction: BusyAction;
  error?: string | null;
  blockedReason?: string | null;
  onUpload: (file: File) => Promise<void>;
  onDelete: (documentId: string) => Promise<void>;
  onRetry: (documentId: string) => Promise<void>;
}

const statusLabels: Record<ServiceAgentKnowledgeSyncStatus | 'unsynced', string> = {
  pending: 'Pending',
  indexed: 'Indexed',
  deleted: 'Deleted',
  error: 'Error',
  unsynced: 'Not indexed',
};

const statusClasses: Record<ServiceAgentKnowledgeSyncStatus | 'unsynced', string> = {
  pending: 'border-amber-400/40 bg-amber-400/10 text-amber-100',
  indexed: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100',
  deleted: 'border-neutral-500/40 bg-neutral-500/10 text-neutral-200',
  error: 'border-red-400/40 bg-red-400/10 text-red-100',
  unsynced: 'border-neutral-500/40 bg-neutral-500/10 text-neutral-200',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function getDocumentStatus(document: GameMasterKnowledgeDocument): ServiceAgentKnowledgeSyncStatus | 'unsynced' {
  return document.syncState?.status ?? 'unsynced';
}

function isAllowedKnowledgeFile(file: File): boolean {
  const filename = file.name.toLowerCase();
  return filename.endsWith('.txt') || filename.endsWith('.md');
}

export function GameMasterAgentKnowledgePanel({
  documents,
  canEdit,
  busyAction,
  error,
  blockedReason = null,
  onUpload,
  onDelete,
  onRetry,
}: GameMasterAgentKnowledgePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const isUploading = busyAction === 'upload-knowledge';
  const canUpload = canEdit && documents.length < FIELD_LIMITS.maxKnowledgeDocs && busyAction === null;

  const handleFile = async (file: File) => {
    setLocalError(null);

    if (!isAllowedKnowledgeFile(file)) {
      setLocalError('Only .txt and .md files are supported.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    if (file.size > FIELD_LIMITS.maxKnowledgeSize) {
      setLocalError(`File must be under ${FIELD_LIMITS.maxKnowledgeSize / 1024}KB.`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    try {
      await onUpload(file);
    } catch (uploadError) {
      setLocalError(uploadError instanceof Error ? uploadError.message : 'Failed to upload knowledge document');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <section className="rounded-lg border border-soul-accent/20 bg-soul-shadow/70 p-5">
      <div className="flex flex-col gap-3 border-b border-soul-accent/10 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-display text-2xl text-soul-accent">Knowledge</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-soul-mist/75">
            Upload .txt or .md reference documents for the GM agent. Embedded documents remain
            the source of truth while sync status tracks official ElizaOS indexing.
          </p>
        </div>
        <span className="text-xs uppercase tracking-wide text-soul-mist/60">
          {documents.length} / {FIELD_LIMITS.maxKnowledgeDocs} documents
        </span>
      </div>

      {!canEdit && (
        <p className="mt-4 rounded border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
          {blockedReason ?? 'Create or adopt the game-master agent before managing knowledge.'}
        </p>
      )}

      <div className="mt-5 space-y-3">
        {documents.length === 0 ? (
          <div className="rounded border border-dashed border-neutral-700 bg-abyss/30 p-6 text-center text-sm text-soul-mist/70">
            No GM knowledge documents have been uploaded yet.
          </div>
        ) : (
          documents.map((document) => {
            const status = getDocumentStatus(document);
            const deleting = busyAction === `delete-knowledge:${document.id}`;
            const retrying = busyAction === `retry-knowledge:${document.id}`;
            const canRetry = canEdit && (status === 'error' || status === 'pending' || status === 'unsynced');

            return (
              <article
                key={document.id}
                className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-neutral-100">{document.path}</h3>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusClasses[status]}`}>
                        {statusLabels[status]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {formatFileSize(document.size)} · stored {formatDate(document.syncState?.createdAt)} · indexed {formatDate(document.syncState?.lastSyncedAt)}
                    </p>
                    {document.preview && (
                      <p className="mt-2 line-clamp-2 text-xs text-neutral-500">{document.preview}</p>
                    )}
                    {document.syncState?.lastError && (
                      <p className="mt-2 text-xs text-red-200">{document.syncState.lastError}</p>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      {canRetry && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            void onRetry(document.id).catch((retryError) => {
                              setLocalError(retryError instanceof Error ? retryError.message : 'Failed to retry knowledge sync');
                            });
                          }}
                          isLoading={retrying}
                          disabled={busyAction !== null}
                        >
                          Retry sync
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          void onDelete(document.id).catch((deleteError) => {
                            setLocalError(deleteError instanceof Error ? deleteError.message : 'Failed to delete knowledge document');
                          });
                        }}
                        isLoading={deleting}
                        disabled={busyAction !== null}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {canUpload && (
        <label className="mt-5 block cursor-pointer rounded-lg border-2 border-dashed border-neutral-700 bg-abyss/40 p-6 text-center transition-colors hover:border-soul-accent/50">
          <input
            ref={inputRef}
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
            disabled={!canUpload}
            aria-label="Upload GM knowledge document"
          />
          <span className="block font-display text-lg text-soul-accent">
            {isUploading ? 'Uploading...' : 'Click to upload GM knowledge'}
          </span>
          <span className="mt-1 block text-sm text-neutral-500">
            .txt or .md files up to {FIELD_LIMITS.maxKnowledgeSize / 1024}KB
          </span>
        </label>
      )}

      {(localError || error) && (
        <p className="mt-4 rounded border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100">
          {localError || error}
        </p>
      )}
    </section>
  );
}
