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

  useEffect(() => {
    if (!hasConsent) {
      setIsMuted(true);
    }
  }, [hasConsent]);

  const handleUnmute = () => {
    if (!hasConsent) return;

    const video = videoRef.current;
    if (!video) return;

    video.muted = false;
    video.volume = 1;

    const playPromise = video.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(() => undefined);
    }

    setIsMuted(false);
  };

  return (
    <div className={`relative bg-black border border-neutral-800 shadow-2xl overflow-hidden ${className}`}>
      {hasConsent ? (
        <>
          <video
            ref={videoRef}
            src={videoSrc}
            poster={posterSrc}
            autoPlay
            muted={isMuted}
            loop
            playsInline
            className="w-full h-full object-cover"
            preload="metadata"
          >
            Your browser does not support the video tag.
          </video>
          {isMuted && (
            <button
              type="button"
              onClick={handleUnmute}
              className="absolute inset-0 flex items-center justify-center bg-black/45 text-neutral-100 text-sm md:text-base tracking-wide uppercase transition-colors hover:bg-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-accent"
              aria-label="Unmute WAGDIE introduction video"
            >
              <span className="flex items-center gap-2 px-4 py-2 border border-neutral-600 bg-black/50 backdrop-blur-sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
                <span className="font-eskapade">Click to Unmute</span>
              </span>
            </button>
          )}
        </>
      ) : (
        <div className="relative w-full h-full">
          <Image
            src={posterSrc}
            alt="Static preview frame for the WAGDIE introduction video"
            fill
            priority
            sizes="(min-width: 1024px) 1024px, 100vw"
            className="object-cover grayscale-[35%] contrast-125"
          />
          <div className="absolute inset-0 bg-black/55" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="max-w-md text-sm md:text-base text-neutral-300 font-eskapade leading-relaxed">
              The introduction video is paused until you explicitly enable autoplay.
            </p>
            <Button type="button" onClick={onEnableVideo} className="h-12 px-8 text-base">
              Enable video
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
