'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SubmissionStatusBadge } from '@/components/lore/submissions/SubmissionStatusBadge';
import { Button } from '@/components/ui/Button';
import { ApiError, apiClient } from '@/lib/api/client';
import type { UseAuthReturn } from '@/hooks/useAuth';
import type { LoreSubmissionListItemDto } from '@/types/lore-submission';

interface ProfileArchivePostsProps {
  auth: UseAuthReturn;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function addressesMatch(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function ProfileArchivePosts({ auth }: ProfileArchivePostsProps) {
  const hasMatchingSession = auth.isAuthenticated
    && addressesMatch(auth.address, auth.session?.address);
  const currentWallet = auth.address?.toLowerCase() ?? null;
  const requestGenerationRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [dataWallet, setDataWallet] = useState<string | null>(null);
  const [loadingWallet, setLoadingWallet] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<LoreSubmissionListItemDto[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [authenticationError, setAuthenticationError] = useState<Error | null>(null);
  const [reloadGeneration, setReloadGeneration] = useState(0);

  const loadSubmissions = useCallback(async () => {
    const requestedWallet = currentWallet;
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    abortControllerRef.current?.abort();

    if (!hasMatchingSession || !requestedWallet) {
      abortControllerRef.current = null;
      setDataWallet(null);
      setLoadingWallet(null);
      setSubmissions([]);
      setError(null);
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setDataWallet(requestedWallet);
    setLoadingWallet(requestedWallet);
    setSubmissions([]);
    setError(null);

    const isCurrentRequest = () => (
      requestGenerationRef.current === requestGeneration
      && currentWallet === requestedWallet
      && !abortController.signal.aborted
    );

    try {
      const data = await apiClient.getEnvelope<{ submissions: LoreSubmissionListItemDto[] }>(
        '/api/lore/submissions',
        {
          cache: 'no-store',
          signal: abortController.signal,
          fallbackMessage: 'Failed to load Archive posts',
        }
      );

      if (!isCurrentRequest()) return;
      setSubmissions(data.submissions);
    } catch (loadError) {
      if (!isCurrentRequest()) return;
      setError(loadError instanceof Error ? loadError : new Error('Failed to load Archive posts'));
      setSubmissions([]);
    } finally {
      if (isCurrentRequest()) {
        setLoadingWallet(null);
        abortControllerRef.current = null;
      }
    }
  }, [currentWallet, hasMatchingSession]);

  useEffect(() => {
    void loadSubmissions();

    return () => {
      requestGenerationRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [loadSubmissions, reloadGeneration]);

  const forceAuthenticate = async () => {
    setAuthenticationError(null);

    try {
      await auth.authenticate({ force: true });
      setReloadGeneration((current) => current + 1);
    } catch (authError) {
      setAuthenticationError(
        authError instanceof Error
          ? authError
          : new Error('Wallet authentication failed. Please try again.')
      );
    }
  };
  const isCurrentData = dataWallet === currentWallet;
  const currentError = isCurrentData ? error : null;
  const currentSubmissions = isCurrentData ? submissions : [];
  const isLoading = Boolean(
    hasMatchingSession
    && currentWallet
    && (dataWallet !== currentWallet || loadingWallet === currentWallet)
  );
  const isSessionFailure = currentError instanceof ApiError
    && (currentError.status === 401 || currentError.status === 403);

  return (
    <section aria-labelledby="archive-posts-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-parchment/15 pb-4">
        <div>
          <p className="font-ui text-xs uppercase tracking-[0.24em] text-arcane-bright">Signed wallet content</p>
          <h2 id="archive-posts-title" className="mt-2 font-display text-3xl text-parchment sm:text-4xl">
            Archive Posts
          </h2>
          <p className="mt-2 max-w-3xl font-ui text-sm leading-6 text-ash">
            Your session-owned lore submissions, including private, pending, hidden, and published states visible to their author.
          </p>
        </div>
        {hasMatchingSession && (
          <Link
            href="/lore/submit"
            className="inline-flex min-h-11 items-center border border-parchment/30 px-4 font-ui text-sm text-parchment transition-colors hover:border-parchment focus:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
          >
            New submission
          </Link>
        )}
      </div>

      {!hasMatchingSession ? (
        <div className="border border-arcane/30 bg-arcane-deep/10 p-6">
          <h3 className="font-display text-2xl text-parchment">
            {auth.isAuthenticating ? 'Waiting for wallet signature' : 'Signed session required'}
          </h3>
          <p className="mt-2 max-w-2xl font-ui text-sm leading-6 text-ash">
            Public holdings remain visible. Sign the connected wallet message to reveal only that wallet’s private submission queue.
          </p>
          {(authenticationError || auth.error) && (
            <p role="alert" className="mt-3 font-ui text-sm text-ember">
              {(authenticationError || auth.error)?.message}
            </p>
          )}
          <Button
            type="button"
            onClick={() => void forceAuthenticate()}
            isLoading={auth.isAuthenticating}
            disabled={auth.isHydrating}
            className="mt-5 min-h-11"
          >
            Sign wallet message
          </Button>
        </div>
      ) : isLoading ? (
        <div role="status" className="min-h-40 border border-parchment/10 bg-soul-950/50 p-8 text-center font-ui text-sm text-ash">
          Loading your Archive posts…
        </div>
      ) : currentError ? (
        <div role="alert" className="border border-blood/40 bg-blood/10 p-6">
          <h3 className="font-display text-xl text-ember">
            {isSessionFailure ? 'Wallet session expired' : 'Archive posts could not be loaded'}
          </h3>
          <p className="mt-2 font-ui text-sm text-ash">{currentError.message}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => setReloadGeneration((current) => current + 1)}
              className="min-h-11"
            >
              Retry posts
            </Button>
            {isSessionFailure && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void forceAuthenticate()}
                isLoading={auth.isAuthenticating}
                className="min-h-11"
              >
                Sign wallet message
              </Button>
            )}
          </div>
          {authenticationError && (
            <p className="mt-3 font-ui text-sm text-ember">
              {authenticationError.message}
            </p>
          )}
        </div>
      ) : currentSubmissions.length === 0 ? (
        <div className="border border-parchment/15 bg-soul-950/65 p-8 text-center">
          <h3 className="font-display text-2xl text-parchment">No Archive posts yet</h3>
          <p className="mt-2 font-ui text-sm text-ash">
            This signed wallet has not submitted community lore.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {currentSubmissions.map((submission) => (
            <li key={submission.id}>
              <Link
                href={`/lore/submissions/${submission.id}`}
                className="group block h-full border border-parchment/15 bg-soul-950/65 p-5 transition-colors hover:border-parchment/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words font-display text-xl text-parchment group-hover:text-arcane-bright">
                      {submission.title}
                    </h3>
                    <p className="mt-1 font-ui text-xs uppercase tracking-wide text-ash">
                      Token #{submission.tokenId} · submitted {formatDate(submission.submittedAt)}
                    </p>
                  </div>
                  <SubmissionStatusBadge status={submission.status} visibility={submission.visibility} />
                </div>
                <p className="mt-4 line-clamp-3 font-ui text-sm leading-6 text-ash">{submission.summary}</p>
                {submission.publishedSlug && (
                  <p className="mt-4 break-all font-ui text-xs text-arcane-bright">
                    Published as {submission.publishedSlug}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
