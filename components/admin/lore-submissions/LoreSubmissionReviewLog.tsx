import type { LoreSubmissionReview } from '@/types/lore-submission';

export interface LoreSubmissionReviewLogProps {
  reviews: LoreSubmissionReview[];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function LoreSubmissionReviewLog({ reviews }: LoreSubmissionReviewLogProps) {
  return (
    <section className="rounded-xl border border-soul-accent/20 bg-soul-shadow/70 p-5">
      <h2 className="font-display text-xl text-soul-accent">Moderation log</h2>
      <div className="mt-4 space-y-3">
        {reviews.length === 0 ? (
          <p className="text-sm text-soul-mist/70">No moderation entries yet.</p>
        ) : reviews.map((review) => (
          <div key={review.id} className="rounded border border-soul-accent/10 bg-abyss/40 p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-display uppercase tracking-wide text-soul-bone">{review.action}</span>
              <span className="text-soul-mist/60">{formatDate(review.created_at)}</span>
            </div>
            <p className="mt-1 font-mono text-xs text-soul-mist/50">{review.actor_address}</p>
            <p className="mt-2 text-xs uppercase tracking-wide text-soul-mist/50">
              {review.from_status ?? 'new'} → {review.to_status}
            </p>
            {review.note && <p className="mt-2 whitespace-pre-line text-soul-mist/80">{review.note}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
