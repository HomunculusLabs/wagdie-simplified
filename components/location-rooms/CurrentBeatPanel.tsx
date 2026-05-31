import { Button } from '@/components/ui';
import type { CurrentBeatSummary } from './locationRoomPresentation';

interface CurrentBeatPanelProps {
  beat: CurrentBeatSummary | null;
  hasPendingActivity: boolean;
  onJumpToLatest: () => void;
}

export function CurrentBeatPanel({ beat, hasPendingActivity, onJumpToLatest }: CurrentBeatPanelProps) {
  if (!beat) return null;

  const meta = [beat.label, beat.domain, beat.phase].filter(Boolean).join(' · ');

  return (
    <section className="rounded-2xl border border-soul-accent/25 bg-[linear-gradient(135deg,rgba(180,130,255,0.14),rgba(8,7,12,0.76))] p-4 shadow-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-eskapade text-[11px] uppercase tracking-[0.24em] text-soul-accent/80">
            {hasPendingActivity ? 'new activity waiting' : 'current beat'}
          </p>
          <div className="flex flex-wrap items-center gap-2 font-eskapade text-xs text-neutral-400">
            <span className={beat.isGameMaster ? 'font-display text-lg lowercase text-soul-accent' : 'text-neutral-100'}>
              {beat.speakerName}
            </span>
            <span>#{beat.sequence}</span>
            <span>{beat.timeLabel}</span>
            {meta && <span className="text-neutral-300">{meta}</span>}
          </div>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onJumpToLatest}>
          Jump to latest
        </Button>
      </div>

      <p className="mt-3 font-serif text-lg leading-relaxed text-neutral-200 md:text-xl">
        {beat.contentPreview}
      </p>

      {beat.rollSummary && (
        <p className="mt-3 rounded-lg border border-neutral-700/70 bg-black/25 px-3 py-2 font-eskapade text-xs text-neutral-300">
          {beat.rollSummary}
        </p>
      )}
    </section>
  );
}
