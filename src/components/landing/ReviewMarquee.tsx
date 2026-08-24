import type { PublicReview } from "@/lib/reviews";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-sm leading-none tracking-tight" aria-label={`${rating} von 5 Sternen`}>
      <span className="text-accent">{"★".repeat(rating)}</span>
      <span className="text-border">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function ReviewCard({ review }: { review: PublicReview }) {
  return (
    <figure className="card mx-2 flex w-[19rem] shrink-0 flex-col gap-3 p-5 sm:w-[22rem]">
      <Stars rating={review.rating} />
      <blockquote className="line-clamp-4 text-sm leading-relaxed text-foreground/90">
        „{review.comment}“
      </blockquote>
      <figcaption className="mt-auto flex items-center gap-2.5 pt-1">
        {review.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={review.avatarUrl}
            alt=""
            className="h-7 w-7 rounded-full border border-border object-cover"
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-2 text-[10px] font-semibold text-muted">
            {review.displayName.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="truncate text-xs font-medium text-muted">{review.displayName}</span>
      </figcaption>
    </figure>
  );
}

/**
 * Durchlaufendes Band mit Kundenstimmen. Die Liste wird zweimal
 * hintereinander gerendert und um genau die halbe Breite verschoben - so
 * entsteht ein nahtloser Kreislauf ohne sichtbaren Sprung. Beim Darueberfahren
 * haelt das Band an, damit man in Ruhe lesen kann.
 */
export default function ReviewMarquee({
  reviews,
  reverse = false,
  speed = 60,
}: {
  reviews: PublicReview[];
  reverse?: boolean;
  speed?: number;
}) {
  if (reviews.length === 0) return null;

  return (
    <div className="marquee">
      <div
        className={`marquee-track${reverse ? " marquee-track-reverse" : ""}`}
        style={{ animationDuration: `${speed}s` }}
      >
        {[...reviews, ...reviews].map((review, i) => (
          <ReviewCard key={`${review.id}-${i}`} review={review} />
        ))}
      </div>
    </div>
  );
}
