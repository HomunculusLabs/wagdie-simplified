'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getLowPolyEmbedUrl,
  getLowPolyYoutubeUrl,
  type LowPolyEpisode,
} from '@/lib/content/lowPolyEpisodes';
import { AspectRatio, Button, Card } from '@/components/ui';

type LowPolyVideoExperienceProps = {
  episodes: LowPolyEpisode[];
  initialEpisodeId?: LowPolyEpisode['id'];
};

const PLAYER_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

function getValidEpisodeIdFromHash(
  hash: string,
  episodes: LowPolyEpisode[]
): LowPolyEpisode['id'] | null {
  const id = hash.replace(/^#/, '');
  return episodes.find((episode) => episode.id === id)?.id ?? null;
}

export function LowPolyVideoExperience({
  episodes,
  initialEpisodeId,
}: LowPolyVideoExperienceProps) {
  const defaultEpisodeId = initialEpisodeId ?? episodes[0]?.id;
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(defaultEpisodeId);
  const [loadedEpisodeId, setLoadedEpisodeId] = useState<string | null>(null);

  const selectedEpisode = useMemo(
    () => episodes.find((episode) => episode.id === selectedEpisodeId) ?? episodes[0],
    [episodes, selectedEpisodeId]
  );

  const selectEpisode = useCallback((episodeId: LowPolyEpisode['id'], updateHash = true) => {
    setSelectedEpisodeId(episodeId);
    setLoadedEpisodeId(null);

    if (updateHash && window.location.hash !== `#${episodeId}`) {
      window.history.pushState(null, '', `#${episodeId}`);
    }
  }, []);

  useEffect(() => {
    const hashEpisodeId = getValidEpisodeIdFromHash(window.location.hash, episodes);

    if (hashEpisodeId) {
      selectEpisode(hashEpisodeId, false);
    }

    const handleHashChange = () => {
      const nextEpisodeId = getValidEpisodeIdFromHash(window.location.hash, episodes);

      if (nextEpisodeId) {
        selectEpisode(nextEpisodeId, false);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, [episodes, selectEpisode]);

  if (!selectedEpisode) {
    return null;
  }

  const isLoaded = loadedEpisodeId === selectedEpisode.id;
  const youtubeUrl = getLowPolyYoutubeUrl(selectedEpisode.youtubeId);

  return (
    <section
      id="low-poly-theater"
      aria-labelledby="low-poly-theater-heading"
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
    >
      <Card className="rounded-lg border-neutral-800 bg-black/50">
        <div className="border-b border-neutral-800 px-5 py-4 md:px-6">
          <p className="font-eskapade text-xs uppercase tracking-[0.26em] text-soul-accent/80">
            Now viewing {selectedEpisode.label}
          </p>
          <h2
            id="low-poly-theater-heading"
            className="mt-2 font-display text-2xl lowercase text-neutral-100 md:text-3xl"
          >
            {selectedEpisode.title}
          </h2>
          <p className="mt-2 max-w-2xl font-eskapade text-sm leading-relaxed text-neutral-500">
            {selectedEpisode.summary}
          </p>
        </div>

        <AspectRatio ratio={16 / 9} className="bg-black">
          {isLoaded ? (
            <iframe
              title={`WAGDIE ${selectedEpisode.title}`}
              src={getLowPolyEmbedUrl(selectedEpisode.youtubeId, true)}
              loading="lazy"
              allow={PLAYER_ALLOW}
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="h-full w-full border-0"
            />
          ) : (
            <div className="relative h-full w-full overflow-hidden">
              <Image
                src={selectedEpisode.thumbnailSrc}
                alt=""
                fill
                sizes="(min-width: 1024px) 760px, 100vw"
                className="object-cover opacity-85"
                priority={selectedEpisode.episode === 1}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
                <Button
                  type="button"
                  onClick={() => setLoadedEpisodeId(selectedEpisode.id)}
                  className="min-w-40"
                  aria-label={`Play ${selectedEpisode.title}`}
                >
                  Play episode
                </Button>
                <p className="max-w-md font-eskapade text-sm text-neutral-300">
                  The YouTube player loads only after you choose to play this episode.
                </p>
              </div>
            </div>
          )}
        </AspectRatio>

        <div className="flex flex-col gap-3 border-t border-neutral-800 px-5 py-4 font-eskapade text-sm text-neutral-500 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <span>Privacy embed via youtube-nocookie.com</span>
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-soul-accent transition-colors hover:text-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-accent focus-visible:ring-offset-2 focus-visible:ring-offset-soul-950"
          >
            Open on YouTube
          </a>
        </div>
      </Card>

      <Card className="rounded-lg border-neutral-800 bg-black/40">
        <div className="border-b border-neutral-800 px-5 py-4">
          <h3 className="font-display text-xl lowercase text-neutral-100">Episode queue</h3>
          <p className="mt-1 font-eskapade text-sm text-neutral-500">
            Select an episode, then press play in the theater.
          </p>
        </div>

        <div className="grid max-h-[760px] gap-3 overflow-y-auto p-4">
          {episodes.map((episode) => {
            const isSelected = episode.id === selectedEpisode.id;

            return (
              <button
                key={episode.id}
                type="button"
                onClick={() => selectEpisode(episode.id)}
                aria-pressed={isSelected}
                className={`group grid grid-cols-[104px_minmax(0,1fr)] gap-3 rounded-md border p-2 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-accent focus-visible:ring-offset-2 focus-visible:ring-offset-soul-950 ${
                  isSelected
                    ? 'border-soul-accent/70 bg-soul-accent/10'
                    : 'border-neutral-800 bg-black/30 hover:border-soul-accent/40 hover:bg-black/50'
                }`}
              >
                <AspectRatio ratio={16 / 9} className="overflow-hidden rounded bg-black">
                  <Image
                    src={episode.thumbnailSrc}
                    alt=""
                    fill
                    sizes="104px"
                    className="object-cover opacity-85 transition-opacity group-hover:opacity-100"
                  />
                </AspectRatio>
                <span className="min-w-0 self-center">
                  <span className="block font-eskapade text-xs uppercase tracking-[0.22em] text-soul-accent/80">
                    {episode.label}
                  </span>
                  <span className="mt-1 block truncate font-display text-base lowercase text-neutral-100">
                    {episode.title}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>
    </section>
  );
}
