'use client';

import { Button } from '@/components/ui';
import type {
  BusyAction,
  GameMasterAgentAdminState,
  GameMasterCanonicalContentReview,
  GameMasterCanonicalKnowledgeLiveStatus,
  GameMasterCanonicalKnowledgeSyncStatus,
  GameMasterCanonicalPersonaStatus,
} from './types';

interface GameMasterAgentCanonicalContentPanelProps {
  state: GameMasterAgentAdminState;
  busyAction: BusyAction;
  hasUnsavedPersonaChanges: boolean;
  onApplyPersona: () => Promise<void>;
  onApplyKnowledge: () => Promise<void>;
}

const personaStatusLabels: Record<GameMasterCanonicalPersonaStatus, string> = {
  unavailable: 'Unavailable',
  in_sync: 'In sync',
  drifted: 'Drifted',
};

const knowledgeStatusLabels: Record<GameMasterCanonicalContentReview['knowledge']['status'], string> = {
  unavailable: 'Unavailable',
  in_sync: 'In sync',
  drifted: 'Drifted',
  conflict: 'Conflict',
};

const liveStatusLabels: Record<GameMasterCanonicalKnowledgeLiveStatus, string> = {
  missing: 'Missing',
  in_sync: 'In sync',
  changed: 'Changed',
};

const syncStatusLabels: Record<GameMasterCanonicalKnowledgeSyncStatus, string> = {
  pending: 'Pending',
  indexed: 'Indexed',
  deleted: 'Deleted',
  error: 'Error',
  unsynced: 'Not indexed',
  unknown: 'Unknown',
};

function statusClass(status: string): string {
  if (status === 'in_sync' || status === 'indexed') {
    return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100';
  }
  if (status === 'drifted' || status === 'changed' || status === 'missing' || status === 'pending' || status === 'unsynced') {
    return 'border-amber-400/40 bg-amber-400/10 text-amber-100';
  }
  if (status === 'conflict' || status === 'error' || status === 'unavailable') {
    return 'border-red-400/40 bg-red-400/10 text-red-100';
  }
  return 'border-neutral-500/40 bg-neutral-500/10 text-neutral-200';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function Badge({ status, label }: { status: string; label: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusClass(status)}`}>
      {label}
    </span>
  );
}

function getApplyBlocker(input: {
  state: GameMasterAgentAdminState;
  review: GameMasterCanonicalContentReview;
  hasUnsavedPersonaChanges: boolean;
  kind: 'persona' | 'knowledge';
}): string | null {
  if (!input.state.activeSetting) return 'Create or adopt the game-master agent before applying canonical content.';
  if (!input.state.officialRecordStatus.available) return 'Official ElizaOS record is unavailable.';
  if (input.hasUnsavedPersonaChanges) return 'Save or discard persona changes before applying canonical content.';
  if (!input.review.reviewToken) return 'Refresh canonical preview before applying.';
  if (!input.review.canApply) return input.review.unavailableReason ?? 'Canonical content cannot be applied right now.';
  if (input.kind === 'persona' && input.review.persona.status !== 'drifted') {
    return 'Canonical persona is already in sync.';
  }
  if (input.kind === 'knowledge' && input.review.knowledge.documentLimit.conflict) {
    return `Canonical knowledge would exceed the ${input.review.knowledge.documentLimit.max} document limit.`;
  }
  if (input.kind === 'knowledge' && !input.review.knowledge.documents.some((document) => document.shouldSync)) {
    return 'Canonical knowledge is already in sync.';
  }
  return null;
}

export function GameMasterAgentCanonicalContentPanel({
  state,
  busyAction,
  hasUnsavedPersonaChanges,
  onApplyPersona,
  onApplyKnowledge,
}: GameMasterAgentCanonicalContentPanelProps) {
  const review = state.canonicalContent;
  const personaBlocker = getApplyBlocker({ state, review, hasUnsavedPersonaChanges, kind: 'persona' });
  const knowledgeBlocker = getApplyBlocker({ state, review, hasUnsavedPersonaChanges, kind: 'knowledge' });
  const busy = busyAction !== null;
  const personaDisabled = busy || Boolean(personaBlocker);
  const knowledgeDisabled = busy || Boolean(knowledgeBlocker);

  return (
    <section className="rounded-lg border border-soul-accent/20 bg-soul-shadow/70 p-5">
      <div className="flex flex-col gap-4 border-b border-soul-accent/10 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-display text-2xl text-soul-accent">Canonical Content</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-soul-mist/75">
            Review the repo-canonical GM bundle against the live Official ElizaOS agent, then apply
            persona or knowledge independently. Runtime still uses the live Official agent state.
          </p>
          <p className="mt-2 text-xs text-soul-mist/60">
            Bundle <span className="font-mono text-soul-bone">{review.bundleId}</span> · version{' '}
            <span className="font-mono text-soul-bone">{review.contentVersion}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void onApplyPersona().catch(() => undefined)}
            isLoading={busyAction === 'apply-canonical-persona'}
            disabled={personaDisabled}
            title={personaBlocker ?? undefined}
          >
            Apply persona
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void onApplyKnowledge().catch(() => undefined)}
            isLoading={busyAction === 'apply-canonical-knowledge'}
            disabled={knowledgeDisabled}
            title={knowledgeBlocker ?? undefined}
          >
            Apply knowledge
          </Button>
        </div>
      </div>

      {(personaBlocker || knowledgeBlocker || review.knowledge.syncStateLookupFailed) && (
        <div className="mt-4 space-y-2">
          {personaBlocker && <p className="rounded border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">{personaBlocker}</p>}
          {!personaBlocker && knowledgeBlocker && <p className="rounded border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">{knowledgeBlocker}</p>}
          {review.knowledge.syncStateLookupFailed && (
            <p className="rounded border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
              Knowledge sync state could not be fully loaded; refresh before applying if statuses look stale.
            </p>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <article className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-100">Persona drift</h3>
            <Badge status={review.persona.status} label={personaStatusLabels[review.persona.status]} />
          </div>
          <dl className="mt-3 space-y-2 text-xs text-neutral-400">
            <div>
              <dt className="uppercase tracking-wide text-neutral-500">Canonical hash</dt>
              <dd className="break-all font-mono text-neutral-200">{review.persona.canonicalHash}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-neutral-500">Live hash</dt>
              <dd className="break-all font-mono text-neutral-200">{review.persona.liveHash ?? '—'}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-neutral-500">Last applied</dt>
              <dd className="text-neutral-200">{formatDate(review.persona.lastApplied?.appliedAt)}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Changed fields</p>
            {review.persona.changedFields.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {review.persona.changedFields.map((field) => (
                  <span key={field} className="rounded border border-soul-accent/20 bg-abyss/50 px-2 py-1 text-xs text-soul-bone">
                    {field}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-neutral-500">No canonical persona field drift detected.</p>
            )}
          </div>
        </article>

        <article className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">Canonical knowledge</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Resulting documents: {review.knowledge.documentLimit.resultingCount} / {review.knowledge.documentLimit.max}
                {' '}({review.knowledge.documentLimit.preservedLiveCount} preserved live)
              </p>
            </div>
            <Badge status={review.knowledge.status} label={knowledgeStatusLabels[review.knowledge.status]} />
          </div>

          <div className="mt-4 space-y-3">
            {review.knowledge.documents.length === 0 ? (
              <div className="rounded border border-dashed border-neutral-700 bg-abyss/30 p-5 text-center text-sm text-neutral-500">
                No canonical knowledge documents are bundled.
              </div>
            ) : (
              review.knowledge.documents.map((document) => (
                <div key={document.id} className="rounded border border-neutral-800 bg-abyss/40 p-3">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-sm font-semibold text-neutral-100">{document.title}</h4>
                        <Badge status={document.liveStatus} label={liveStatusLabels[document.liveStatus]} />
                        <Badge status={document.syncStatus} label={syncStatusLabels[document.syncStatus]} />
                        {document.shouldSync && (
                          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100">
                            Will sync
                          </span>
                        )}
                      </div>
                      <p className="mt-1 break-all font-mono text-xs text-neutral-500">{document.path}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {formatFileSize(document.size)} · last indexed {formatDate(document.lastSyncedAt)}
                      </p>
                      {document.preview && <p className="mt-2 line-clamp-2 text-xs text-neutral-500">{document.preview}</p>}
                      {document.hasSyncError && <p className="mt-2 text-xs text-red-200">Last sync failed; apply or retry after checking ElizaOS availability.</p>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {review.knowledge.obsoletePreservedDocuments.length > 0 && (
            <div className="mt-4 rounded border border-amber-400/20 bg-amber-400/10 p-3">
              <p className="text-sm font-semibold text-amber-100">Obsolete repo-canonical documents preserved</p>
              <ul className="mt-2 space-y-1 text-xs text-amber-100/80">
                {review.knowledge.obsoletePreservedDocuments.map((document) => (
                  <li key={document.id} className="break-all font-mono">{document.path}</li>
                ))}
              </ul>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
