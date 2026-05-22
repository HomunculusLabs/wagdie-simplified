import type { SourceRecord } from '@/lib/lore/types';

interface SourceListProps {
  sources: SourceRecord[];
  title?: string;
  variant?: 'default' | 'compact';
}

const formatDate = (dateString?: string) => {
  if (!dateString) {
    return undefined;
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(dateString));
};

const isNavigableUrl = (url?: string) => {
  return Boolean(url && !url.startsWith('manual://'));
};

function SourceLink({ href, label }: { href?: string; label: string }) {
  if (!href) {
    return null;
  }

  if (!isNavigableUrl(href)) {
    return (
      <span className="break-all border border-midnight-light/50 px-2 py-1 text-xs text-neutral-200">
        {label}: {href}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="break-all border border-soul-accent/30 px-2 py-1 text-xs text-soul-accent transition-colors hover:border-soul-accent hover:text-neutral-50"
    >
      {label}
    </a>
  );
}

export function SourceList({ sources, title = 'Sources and preservation', variant = 'default' }: SourceListProps) {
  const compact = variant === 'compact';

  return (
    <section className={compact ? 'space-y-3' : 'space-y-4'}>
      <div>
        <p className={compact ? 'font-serif text-xs uppercase tracking-[0.12em] text-neutral-500' : 'text-sm font-serif uppercase tracking-[0.06em] text-soul-accent'}>
          {title}
        </p>
        <h2 className={compact ? 'mt-1 font-serif text-xl text-bone' : 'mt-2 font-display text-2xl lowercase tracking-widest text-neutral-50'}>
          Attribution ledger
        </h2>
      </div>

      {sources.length > 0 ? (
        <div className={compact ? 'grid gap-3 lg:grid-cols-2' : 'space-y-3'}>
          {sources.map((source) => {
            const publishedAt = formatDate(source.publishedAt);
            const capturedAt = formatDate(source.capturedAt);
            const offlineOnly = !source.url && !source.archivedUrl;

            return (
              <article key={source.id} className={compact ? 'space-y-3 border border-midnight-light/45 bg-black/20 p-4' : 'space-y-4 border border-midnight-light/50 bg-black/30 p-5'}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className={compact ? 'font-serif text-lg leading-tight text-bone' : 'font-display text-2xl lowercase tracking-wide text-neutral-50'}>
                      {source.title}
                    </h3>
                    <p className="text-sm font-serif uppercase tracking-[0.06em] text-neutral-200">
                      {source.platform ?? source.kind} {source.author ? `• ${source.author}` : ''}
                    </p>
                  </div>
                  <span className="border border-midnight-light/60 px-2.5 py-1 text-sm font-serif uppercase tracking-[0.06em] text-neutral-200">
                    {source.kind.replace('_', ' ')}
                  </span>
                </div>

                {(publishedAt || capturedAt) && (
                  <dl className="grid gap-3 font-serif text-base text-neutral-100 sm:grid-cols-2">
                    {publishedAt && (
                      <div>
                        <dt className="uppercase tracking-[0.14em] text-neutral-200">Published</dt>
                        <dd>{publishedAt}</dd>
                      </div>
                    )}
                    {capturedAt && (
                      <div>
                        <dt className="uppercase tracking-[0.14em] text-neutral-200">Captured</dt>
                        <dd>{capturedAt}</dd>
                      </div>
                    )}
                  </dl>
                )}

                <p className={compact ? 'font-serif text-sm leading-6 text-neutral-300' : 'font-serif text-lg leading-8 text-neutral-100'}>
                  {source.attribution}
                </p>

                {source.preservationNote && (
                  <p className="border-l border-soul-accent/30 pl-3 font-serif text-sm leading-6 text-neutral-200">
                    {source.preservationNote}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <SourceLink href={source.url} label="Original" />
                  <SourceLink href={source.archivedUrl} label="Archive" />
                  {offlineOnly && (
                    <span className="border border-violet-400/30 bg-violet-400/10 px-2 py-1 text-sm font-serif text-violet-300">
                      Offline/manual archive only
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="border border-midnight-light/50 bg-black/20 p-5 font-serif text-base text-neutral-200">
          No source records are attached to this archive entry yet.
        </div>
      )}
    </section>
  );
}
