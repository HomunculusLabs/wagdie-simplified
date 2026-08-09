'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

interface LoreNarrationPlayerProps {
  text: string;
  title: string;
}

export function LoreNarrationPlayer({ text, title }: LoreNarrationPlayerProps) {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [supported, setSupported] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setSupported('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window);
    return () => {
      window.speechSynthesis?.cancel();
      utteranceRef.current = null;
    };
  }, []);

  const start = () => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 0.82;
    utterance.onboundary = (event) => {
      setProgress(Math.min(100, Math.round((event.charIndex / Math.max(text.length, 1)) * 100)));
    };
    utterance.onend = () => {
      setPlaying(false);
      setPaused(false);
      setProgress(100);
      utteranceRef.current = null;
    };
    utterance.onerror = () => {
      setPlaying(false);
      setPaused(false);
      utteranceRef.current = null;
    };
    utteranceRef.current = utterance;
    setProgress(0);
    setPlaying(true);
    setPaused(false);
    window.speechSynthesis.speak(utterance);
  };

  const togglePlayback = () => {
    if (!supported) return;
    if (!playing || !utteranceRef.current) {
      start();
      return;
    }
    if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    } else {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  };

  return (
    <div className="flex min-h-28 items-center gap-7 rounded-[2rem] border border-midnight-light/90 bg-soul-950/90 px-6 py-5 sm:px-8">
      <button
        type="button"
        onClick={togglePlayback}
        disabled={!supported}
        aria-label={paused || !playing ? `Play narration for ${title}` : `Pause narration for ${title}`}
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-midnight-light bg-soul-950 text-bone transition-colors hover:border-parchment hover:text-parchment disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
      >
        {playing && !paused
          ? <Pause className="h-6 w-6" fill="currentColor" aria-hidden="true" />
          : <Play className="ml-1 h-6 w-6" fill="currentColor" aria-hidden="true" />}
      </button>
      <div className="relative h-px flex-1 bg-mist/80" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 bg-parchment transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>
      <span className="sr-only" aria-live="polite">
        {!supported ? 'Narration is not supported in this browser.' : playing ? `${paused ? 'Paused' : 'Playing'}, ${progress}% complete` : 'Narration ready'}
      </span>
    </div>
  );
}
