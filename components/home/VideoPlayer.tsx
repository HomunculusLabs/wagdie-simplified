'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';

interface VideoPlayerProps {
  videoSrc: string;
  posterSrc: string;
  className?: string;
  hasConsent: boolean;
  onEnableVideo: () => void;
}

export function VideoPlayer({ videoSrc, posterSrc, className = '', hasConsent, onEnableVideo }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      setPrefersReducedMotion(false);
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updateMotionPreference();
    mediaQuery.addEventListener?.('change', updateMotionPreference);

    return () => mediaQuery.removeEventListener?.('change', updateMotionPreference);
  }, []);

  useEffect(() => {
    if (!hasConsent) {
      setIsMuted(true);
      setIsPlaying(false);
    }
  }, [hasConsent]);

  const handleTogglePlayback = () => {
    if (!hasConsent) return;

    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      return;
    }

    const playPromise = video.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(() => undefined);
    }
  };

  const handleToggleMute = () => {
    if (!hasConsent) return;

    const video = videoRef.current;
    if (!video) return;

    const nextMuted = !isMuted;
    video.muted = nextMuted;
    video.volume = nextMuted ? 0 : 1;
    setIsMuted(nextMuted);
  };

  return (
    <div className={`relative overflow-hidden border border-midnight-light bg-black shadow-2xl ${className}`}>
      {hasConsent ? (
        <>
          <video
            key={prefersReducedMotion ? 'reduced-motion' : 'autoplay'}
            ref={videoRef}
            src={videoSrc}
            poster={posterSrc}
            autoPlay={!prefersReducedMotion}
            muted={isMuted}
            loop
            playsInline
            controls
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            className="w-full h-full object-cover"
            preload="metadata"
          >
            Your browser does not support the video tag.
          </video>
          <div className="absolute right-3 top-3 flex gap-2">
            <button
              type="button"
              onClick={handleTogglePlayback}
              className="min-h-11 border border-neutral-600 bg-black/75 px-4 font-ui text-xs uppercase tracking-wide text-neutral-100 backdrop-blur-sm transition-colors hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-accent"
              aria-label={`${isPlaying ? 'Pause' : 'Play'} WAGDIE introduction video`}
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={handleToggleMute}
              className="min-h-11 border border-neutral-600 bg-black/75 px-4 font-ui text-xs uppercase tracking-wide text-neutral-100 backdrop-blur-sm transition-colors hover:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-accent"
              aria-label={`${isMuted ? 'Unmute' : 'Mute'} WAGDIE introduction video`}
            >
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
          </div>
        </>
      ) : (
        <div className="relative h-full w-full">
          <Image
            src={posterSrc}
            alt="Static preview frame for the WAGDIE introduction video"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/10" aria-hidden="true" />
          <div className="absolute bottom-4 right-4 z-20 flex max-w-xs flex-col items-end gap-2 border border-parchment/30 bg-black/75 p-3 text-right backdrop-blur-sm sm:bottom-6 sm:right-6">
            <p className="font-ui text-xs leading-5 text-ash">
              The introduction video is paused until you explicitly enable autoplay.
            </p>
            <Button type="button" onClick={onEnableVideo} className="h-11 px-5 text-sm">
              Enable video
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
