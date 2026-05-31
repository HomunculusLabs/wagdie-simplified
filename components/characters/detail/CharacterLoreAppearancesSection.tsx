'use client'

import Link from 'next/link'
import {
  getLoreCharacterHref,
  getLoreEventHref,
  getLoreLocationHref,
} from '@/lib/lore/navigation'
import type {
  EffectiveTokenAppearanceSummary,
  EffectiveTokenCharacterLore,
  EffectiveTokenSeasonSummary,
} from '@/lib/lore/types'

interface CharacterLoreAppearancesSectionProps {
  lore: EffectiveTokenCharacterLore
}

function formatAppearanceDate(appearance: EffectiveTokenAppearanceSummary): string {
  const dateString = appearance.occurredAt ?? appearance.publishedAt
  if (!dateString) return 'undated'

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(dateString)).toLowerCase()
}

function getSeasonLabel(
  appearance: EffectiveTokenAppearanceSummary,
  seasonById: Map<string, EffectiveTokenSeasonSummary>
): string {
  if (!appearance.seasonId) return 'unseasoned'
  return seasonById.get(appearance.seasonId)?.title ?? 'unseasoned'
}

export function CharacterLoreAppearancesSection({ lore }: CharacterLoreAppearancesSectionProps) {
  const seasonById = new Map(lore.seasons.map((season) => [season.id, season]))
  const previewAppearances = lore.appearances.slice(0, 4)
  const remainingAppearanceCount = Math.max(0, lore.appearances.length - previewAppearances.length)
  const profileHref = getLoreCharacterHref(lore.character)

  return (
    <section aria-labelledby="character-lore-appearances-heading" className="border-t border-midnight-light/40 pt-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-display tracking-[0.28em] text-soul-accent lowercase">
            lore archive
          </p>
          <h2 id="character-lore-appearances-heading" className="text-h3 font-display text-bone tracking-widest lowercase">
            archive appearances
          </h2>
          <p className="max-w-2xl text-body-sm text-ash font-eskapade">
            Published official and community records that mention {lore.character.name}; separate from the editable story above.
          </p>
        </div>
        <Link
          href={profileHref}
          className="self-start border border-soul-accent/40 bg-soul-accent/10 px-3 py-2 text-xs font-display uppercase tracking-[0.16em] text-soul-accent transition-colors hover:border-soul-accent hover:bg-soul-accent/20 hover:text-bone"
        >
          full lore profile
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-3">
          {lore.firstAppearance && (
            <div className="border border-midnight-light/50 bg-black/20 p-4">
              <p className="text-[11px] font-display uppercase tracking-[0.2em] text-mist">
                first appearance
              </p>
              <Link
                href={getLoreEventHref(lore.firstAppearance)}
                className="mt-2 block font-display text-xl lowercase tracking-widest text-bone transition-colors hover:text-soul-accent"
              >
                {lore.firstAppearance.title}
              </Link>
              <p className="mt-2 text-sm leading-relaxed text-ash font-eskapade">
                {lore.firstAppearance.summary}
              </p>
            </div>
          )}

          {previewAppearances.length > 0 && (
            <ol className="space-y-3" aria-label="Lore appearance records">
              {previewAppearances.map((appearance) => (
                <li key={appearance.id} className="border border-midnight-light/45 bg-soul-900/35 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`border px-2 py-0.5 text-[11px] font-display uppercase tracking-[0.14em] ${appearance.kind === 'official' ? 'border-soul-accent/40 bg-soul-accent/10 text-soul-accent' : 'border-sky-400/40 bg-sky-400/10 text-sky-300'}`}>
                      {appearance.kind}
                    </span>
                    <span className="text-[11px] font-display uppercase tracking-[0.14em] text-dark">
                      {getSeasonLabel(appearance, seasonById)} / {formatAppearanceDate(appearance)}
                    </span>
                  </div>
                  <Link
                    href={getLoreEventHref(appearance)}
                    className="mt-2 block font-display text-lg lowercase tracking-widest text-bone transition-colors hover:text-soul-accent"
                  >
                    {appearance.title}
                  </Link>
                  <p className="mt-1 text-sm leading-relaxed text-ash font-eskapade">
                    {appearance.summary}
                  </p>
                </li>
              ))}
            </ol>
          )}

          {remainingAppearanceCount > 0 && (
            <p className="text-xs font-display tracking-[0.16em] text-mist lowercase">
              + {remainingAppearanceCount} more {remainingAppearanceCount === 1 ? 'record' : 'records'} in the full lore profile
            </p>
          )}
        </div>

        <aside className="space-y-4 border border-midnight-light/45 bg-black/20 p-4" aria-label="Lore archive context">
          <div>
            <p className="text-[11px] font-display uppercase tracking-[0.2em] text-mist">
              sources
            </p>
            <p className="mt-1 font-display text-2xl text-bone lowercase">
              {lore.sourceCount} {lore.sourceCount === 1 ? 'source' : 'sources'}
            </p>
            {lore.sources.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm font-eskapade text-ash">
                {lore.sources.slice(0, 3).map((source) => {
                  const sourceHref = source.archivedUrl ?? source.url
                  return (
                    <li key={source.id}>
                      {sourceHref ? (
                        <a href={sourceHref} target="_blank" rel="noreferrer" className="transition-colors hover:text-soul-accent">
                          {source.title}
                        </a>
                      ) : (
                        source.title
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {lore.locations.length > 0 && (
            <div>
              <p className="text-[11px] font-display uppercase tracking-[0.2em] text-mist">
                places
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {lore.locations.map((location) => (
                  <Link
                    key={location.id}
                    href={getLoreLocationHref(location)}
                    className="border border-midnight-light/60 px-2 py-1 text-xs font-display lowercase tracking-wide text-ash transition-colors hover:border-soul-accent/50 hover:text-soul-accent"
                  >
                    {location.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
