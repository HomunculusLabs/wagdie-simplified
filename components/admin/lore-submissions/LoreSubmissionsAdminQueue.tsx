'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { apiClient } from '@/lib/api/client';
import type { LoreSubmission, LoreSubmissionStatus } from '@/types/lore-submission';
import { loreSubmissionStatuses } from '@/types/lore-submission';
import { SubmissionStatusBadge } from '@/components/lore/submissions/SubmissionStatusBadge';

interface AdminListResponse {
  submissions: LoreSubmission[];
  total: number;
  page: number;
  perPage: number;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function displayTitle(submission: LoreSubmission) {
  return submission.curated_title ?? submission.title;
}

const statusFilterLabels: Record<LoreSubmissionStatus | 'all', string> = {
  all: 'All',
  submitted: 'Submitted / publication pending',
  changes_requested: 'Changes requested',
  public: 'Public',
  canonized: 'Canonized',
  closed: 'Closed',
};

export function LoreSubmissionsAdminQueue() {
  const [status, setStatus] = useState<LoreSubmissionStatus | 'all'>('public');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AdminListResponse>({ submissions: [], total: 0, page: 1, perPage: 25 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.getEnvelope<AdminListResponse>('/api/admin/lore/submissions', {
          cache: 'no-store',
          fallbackMessage: 'Failed to load lore submission queue',
          params: {
            page,
            perPage: 25,
            status: status === 'all' ? undefined : status,
            query: query.trim() || undefined,
          },
        });
        if (mounted) setResult(data);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : 'Failed to load lore submission queue');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [page, query, status]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setQuery(searchInput);
  };

  const totalPages = Math.max(1, Math.ceil(result.total / result.perPage));

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-soul-accent/20 bg-soul-shadow/70 p-4">
        <div className="flex flex-wrap gap-2">
          {(['all', ...loreSubmissionStatuses] as const).map((nextStatus) => (
            <button
              key={nextStatus}
              type="button"
              onClick={() => {
                setStatus(nextStatus);
                setPage(1);
              }}
              className={`rounded border px-3 py-2 text-xs font-display uppercase tracking-wide transition-colors ${status === nextStatus ? 'border-soul-accent bg-soul-accent/15 text-soul-accent' : 'border-soul-accent/15 text-soul-mist hover:border-soul-accent/50 hover:text-soul-bone'}`}
            >
              {statusFilterLabels[nextStatus]}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="mt-4 flex gap-3">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search title, summary, or token id"
            className="min-w-0 flex-1 rounded border border-soul-accent/20 bg-abyss/60 px-3 py-2 text-soul-bone placeholder:text-soul-mist/40 focus:border-soul-accent focus:outline-none"
          />
          <Button type="submit" size="sm">Search</Button>
        </form>
      </div>

      {error && <div role="alert" className="rounded border border-soul-ember/40 bg-soul-ember/10 p-3 text-sm text-soul-ember">{error}</div>}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-xl border border-soul-accent/20 bg-soul-shadow/70">
          <Spinner />
        </div>
      ) : result.submissions.length === 0 ? (
        <div className="rounded-xl border border-soul-accent/20 bg-soul-shadow/70 p-8 text-center">
          <h2 className="font-display text-xl text-soul-bone">No submissions found</h2>
          <p className="mt-2 text-sm text-soul-mist/70">Adjust filters or wait for new auto-public community lore.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-soul-accent/20 bg-soul-shadow/70">
          {result.submissions.map((submission) => (
            <Link
              key={submission.id}
              href={`/admin/lore/submissions/${submission.id}`}
              className="block border-b border-soul-accent/10 p-5 transition-colors last:border-b-0 hover:bg-soul-accent/5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-xl text-soul-accent">{displayTitle(submission)}</h2>
                  <p className="mt-1 text-xs uppercase tracking-wide text-soul-mist/60">
                    Token #{submission.token_id} · received {formatDate(submission.submitted_at)} · {submission.submitter_address}
                  </p>
                </div>
                <SubmissionStatusBadge status={submission.status} visibility={submission.visibility} />
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-soul-mist/75">
                {submission.curated_summary ?? submission.summary}
              </p>
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-sm text-soul-mist/70">
        <span>{result.total} submissions · page {result.page} of {totalPages}</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading}>
            Previous
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setPage((value) => value + 1)} disabled={page >= totalPages || loading}>
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}
