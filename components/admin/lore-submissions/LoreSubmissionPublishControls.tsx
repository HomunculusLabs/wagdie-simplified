'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api/client';
import type { LoreSubmissionDetailDto } from '@/types/lore-submission';

type PublishAction = 'canonize' | 'decanonize' | 'unpublish';

export interface LoreSubmissionPublishControlsProps {
  detail: LoreSubmissionDetailDto;
  onUpdated: (detail: LoreSubmissionDetailDto) => void;
}

const labels: Record<PublishAction, string> = {
  canonize: 'Promote to canon',
  decanonize: 'Return to community',
  unpublish: 'Hide community lore',
};

export function LoreSubmissionPublishControls({ detail, onUpdated }: LoreSubmissionPublishControlsProps) {
  const [note, setNote] = useState('');
  const [busyAction, setBusyAction] = useState<PublishAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitAction = async (action: PublishAction) => {
    setBusyAction(action);
    setError(null);

    try {
      const updated = await apiClient.postEnvelope<LoreSubmissionDetailDto>(`/api/admin/lore/submissions/${encodeURIComponent(detail.submission.id)}/${action}`, {
        note: note.trim() || undefined,
      }, {
        fallbackMessage: `Failed to ${labels[action].toLowerCase()}`,
      });
      setNote('');
      onUpdated(updated);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Failed to ${labels[action].toLowerCase()}`);
    } finally {
      setBusyAction(null);
    }
  };

  const status = detail.submission.status;

  return (
    <section className="space-y-4 rounded-xl border border-soul-accent/20 bg-soul-shadow/70 p-5">
      <div>
        <h2 className="font-display text-xl text-soul-accent">Canon and visibility controls</h2>
        <p className="mt-1 text-sm text-soul-mist/70">
          Public community lore is already visible. Promote it to canon, return canonized lore to community status, or hide it from public lore.
        </p>
      </div>

      {error && <div role="alert" className="rounded border border-soul-ember/40 bg-soul-ember/10 p-3 text-sm whitespace-pre-line text-soul-ember">{error}</div>}

      <label className="block space-y-1 text-sm text-soul-mist">
        <span className="font-display uppercase tracking-wide">Action note</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          className="w-full rounded border border-soul-accent/20 bg-abyss/60 px-3 py-2 text-soul-bone focus:border-soul-accent focus:outline-none"
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" onClick={() => submitAction('canonize')} disabled={status !== 'public'} isLoading={busyAction === 'canonize'}>
          Promote to canon
        </Button>
        <Button type="button" variant="secondary" onClick={() => submitAction('decanonize')} disabled={status !== 'canonized'} isLoading={busyAction === 'decanonize'}>
          Return to community
        </Button>
        <Button type="button" variant="danger" onClick={() => submitAction('unpublish')} disabled={status !== 'public'} isLoading={busyAction === 'unpublish'}>
          Hide community lore
        </Button>
      </div>
    </section>
  );
}
