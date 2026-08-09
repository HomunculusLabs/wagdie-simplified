'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface LoreArchiveCarouselSlide {
  id: string;
  title: string;
  summary: string;
  imageUrl: string;
  imageAlt: string;
  href: string;
  eyebrow: string;
}

interface LoreArchiveCarouselProps {
  slides: LoreArchiveCarouselSlide[];
}

const AUTOPLAY_DELAY_MS = 7000;

export function LoreArchiveCarousel({ slides }: LoreArchiveCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || isPaused) return;

    const intervalId = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % slides.length);
    }, AUTOPLAY_DELAY_MS);

    return () => window.clearInterval(intervalId);
  }, [isPaused, slides.length]);

  useEffect(() => {
    if (activeIndex >= slides.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, slides.length]);

  const activeSlide = slides[activeIndex];

  if (!activeSlide) {
    return (
      <header className="relative flex min-h-[28rem] items-center justify-center py-16 text-center sm:min-h-[40rem] lg:min-h-[50rem]">
        <h1 className="font-display text-6xl leading-none text-parchment sm:text-8xl lg:text-[7rem]">
          Archive
        </h1>
      </header>
    );
  }

  const showPrevious = () => {
    setActiveIndex((index) => (index - 1 + slides.length) % slides.length);
  };

  const showNext = () => {
    setActiveIndex((index) => (index + 1) % slides.length);
  };

  return (
    <header
      className="relative min-h-[32rem] overflow-hidden border-x border-b border-midnight-light/60 bg-black sm:min-h-[42rem] lg:min-h-[50rem]"
      aria-roledescription="carousel"
      aria-label="Selected lore events"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsPaused(false);
        }
      }}
    >
      <Image
        key={activeSlide.imageUrl}
        src={activeSlide.imageUrl}
        alt={activeSlide.imageAlt}
        fill
        priority={activeIndex === 0}
        sizes="(min-width: 1920px) 1920px, 100vw"
        className="object-cover opacity-70"
      />
      <div className="absolute inset-0 bg-black/35" aria-hidden="true" />

      <div className="relative z-10 flex min-h-[32rem] flex-col px-5 py-8 sm:min-h-[42rem] sm:px-10 sm:py-12 lg:min-h-[50rem] lg:px-16 lg:py-14">
        <h1 className="text-center font-display text-6xl leading-none text-parchment drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-8xl lg:text-[7rem]">
          Archive
        </h1>

        <div className="mt-auto max-w-3xl border border-parchment/25 bg-black/70 p-5 text-left backdrop-blur-sm sm:p-7">
          <p className="font-ui text-xs uppercase tracking-[0.24em] text-arcane-bright">
            {activeSlide.eyebrow}
          </p>
          <Link href={activeSlide.href} className="group mt-3 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment">
            <h2 className="font-display text-3xl leading-tight text-parchment transition-colors group-hover:text-bone sm:text-5xl">
              {activeSlide.title}
            </h2>
            <p className="mt-3 max-w-2xl font-ui text-sm leading-6 text-bone/80 sm:text-base sm:leading-7">
              {activeSlide.summary}
            </p>
            <span className="mt-5 inline-flex min-h-11 items-center font-ui text-sm text-arcane-bright transition-colors group-hover:text-parchment">
              Read this record
            </span>
          </Link>
        </div>

        {slides.length > 1 && (
          <div className="mt-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2" aria-label="Choose a lore event">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`h-3 w-3 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment ${
                    index === activeIndex
                      ? 'border-parchment bg-parchment'
                      : 'border-parchment/65 bg-black/60 hover:bg-parchment/40'
                  }`}
                  aria-label={`Show ${slide.title}`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={showPrevious}
                className="inline-flex h-11 w-11 items-center justify-center border border-parchment/55 bg-black/65 text-parchment transition-colors hover:border-parchment hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
                aria-label="Previous lore event"
              >
                <ChevronLeft aria-hidden="true" size={22} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={showNext}
                className="inline-flex h-11 w-11 items-center justify-center border border-parchment/55 bg-black/65 text-parchment transition-colors hover:border-parchment hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
                aria-label="Next lore event"
              >
                <ChevronRight aria-hidden="true" size={22} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
