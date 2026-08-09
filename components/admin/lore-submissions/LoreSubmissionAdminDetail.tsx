'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Spinner } from '@/components/ui/Spinner';
import { MarkdownPreview } from '@/components/lore/submissions/MarkdownPreview';
import { SubmissionStatusBadge } from '@/components/lore/submissions/SubmissionStatusBadge';
import { apiClient } from '@/lib/api/client';
import type { LoreSubmissionDetailDto } from '@/types/lore-submission';
import { LoreSubmissionCurationForm } from './LoreSubmissionCurationForm';
import { LoreSubmissionPublishControls } from './LoreSubmissionPublishControls';
import { LoreSubmissionReviewLog } from './LoreSubmissionReviewLog';
import { LoreSubmissionReviewPanel } from './LoreSubmissionReviewPanel';
import type { LoreSubmissionAdminReferenceOptions } from './types';

export interface LoreSubmissionAdminDetailProps {
  submissionId: string;
  referenceOptions: LoreSubmissionAdminReferenceOptions;
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

function publicHref(detail: LoreSubmissionDetailDto): string | null {
  const slug = detail.submission.published_slug;
  if (!slug) return null;
  return detail.submission.status === 'canonized'
    ? `/lore/events/${slug}`
    : `/lore/community/${slug}`;
}

export function LoreSubmissionAdminDetail({ submissionId, referenceOptions }: LoreSubmissionAdminDetailProps) {
  const [detail, setDetail] = useState<LoreSubmissionDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.getEnvelope<LoreSubmissionDetailDto>(`/api/admin/lore/submissions/${encodeURIComponent(submissionId)}`, {
          cache: 'no-store',
          fallbackMessage: 'Failed to load lore submission',
        });
        if (mounted) setDetail(data);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : 'Failed to load lore submission');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [submissionId]);

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-xl border border-soul-accent/20 bg-soul-shadow/70">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return <div role="alert" className="rounded border border-soul-ember/40 bg-soul-ember/10 p-4 text-sm text-soul-ember">{error}</div>;
  }

  if (!detail) return null;

  const { submission, links } = detail;
  const href = publicHref(detail);
  const curatedBody = submission.curated_body_markdown ?? submission.body_markdown;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/lore/submissions" className="text-sm font-display text-soul-accent hover:text-soul-bone">← Community lore queue</Link>
        <div className="flex flex-wrap items-center gap-3">
          {href && (
            <Link href={href} className="text-sm font-display text-soul-accent hover:text-soul-bone">
              View public lore
            </Link>
          )}
          <SubmissionStatusBadge status={submission.status} visibility={submission.visibility} />
        </div>
      </div>

      <section className="rounded-xl border border-soul-accent/20 bg-soul-shadow/70 p-5 md:p-7">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <p className="text-xs uppercase tracking-wide text-soul-mist/60">
              Token #{submission.token_id} · received {formatDate(submission.submitted_at)}
            </p>
            <h1 className="mt-2 font-display text-3xl text-soul-accent">{submission.curated_title ?? submission.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-soul-mist/80">{submission.curated_summary ?? submission.summary}</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-1">
            <div className="rounded border border-soul-accent/10 bg-abyss/40 p-3">
              <dt className="text-xs uppercase tracking-wide text-soul-mist/50">Submitter</dt>
              <dd className="mt-1 break-all font-mono text-soul-bone">{submission.submitter_address}</dd>
            </div>
            <div className="rounded border border-soul-accent/10 bg-abyss/40 p-3">
              <dt className="text-xs uppercase tracking-wide text-soul-mist/50">Canon</dt>
              <dd className="mt-1 text-soul-bone">{submission.canon_status} · {submission.canon_stage_id}</dd>
            </div>
            <div className="rounded border border-soul-accent/10 bg-abyss/40 p-3">
              <dt className="text-xs uppercase tracking-wide text-soul-mist/50">Public slug</dt>
              <dd className="mt-1 break-all text-soul-bone">{submission.published_slug ?? 'Not public'}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <section className="rounded-xl border border-soul-accent/20 bg-soul-shadow/70 p-5">
            <h2 className="font-display text-xl text-soul-accent">Effective public preview</h2>
            <div className="mt-4 rounded border border-soul-accent/10 bg-abyss/50 p-4">
              <MarkdownPreview markdown={curatedBody} />
            </div>
          </section>

          <section className="rounded-xl border border-soul-accent/20 bg-soul-shadow/70 p-5">
            <h2 className="font-display text-xl text-soul-accent">Original submission</h2>
            <div className="mt-4 space-y-4 text-sm text-soul-mist/80">
              <div>
                <h3 className="font-display text-soul-bone">{submission.title}</h3>
                <p className="mt-1 leading-6">{submission.summary}</p>
              </div>
              <div className="rounded border border-soul-accent/10 bg-abyss/50 p-4">
                <MarkdownPreview markdown={submission.body_markdown} />
              </div>
              {submission.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {submission.tags.map((tag) => <span key={tag} className="rounded-full border border-soul-accent/20 px-2 py-1 text-xs">#{tag}</span>)}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-soul-accent/20 bg-soul-shadow/70 p-5">
            <h2 className="font-display text-xl text-soul-accent">Source and media links</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {links.map((link) => (
                <a key={link.id} href={link.normalized_url} target="_blank" rel="noreferrer" className="rounded border border-soul-accent/10 bg-abyss/40 p-3 text-sm hover:border-soul-accent/50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-soul-bone">{link.display_title || link.platform || link.link_type}</span>
                    <span className="text-xs uppercase tracking-wide text-soul-mist/50">{link.role}</span>
                  </div>
                  <p className="mt-2 break-all text-soul-mist/70">{link.normalized_url}</p>
                  {link.archived_url && <p className="mt-2 break-all text-xs text-soul-accent/80">Archive: {link.archived_url}</p>}
                  {link.attribution && <p className="mt-2 text-xs text-soul-mist/60">Attribution: {link.attribution}</p>}
                </a>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <LoreSubmissionReviewPanel detail={detail} onUpdated={setDetail} />
          <LoreSubmissionPublishControls detail={detail} onUpdated={setDetail} />
          <LoreSubmissionCurationForm detail={detail} referenceOptions={referenceOptions} onUpdated={setDetail} />
          <LoreSubmissionReviewLog reviews={detail.reviews} />
        </div>
      </div>
    </div>
  );
}
