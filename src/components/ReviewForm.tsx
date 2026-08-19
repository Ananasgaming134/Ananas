"use client";

import { useActionState, useState } from "react";
import { submitReview, type ReviewState } from "@/app/actions/reviews";

const initialState: ReviewState = null;

export default function ReviewForm({
  defaultRating,
  defaultComment,
}: {
  defaultRating?: number;
  defaultComment?: string;
}) {
  const [state, formAction, pending] = useActionState(submitReview, initialState);
  const [rating, setRating] = useState(defaultRating ?? 5);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="rating" value={rating} />
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            aria-label={`${star} von 5 Sternen`}
            className={`text-3xl leading-none transition hover:scale-110 ${
              star <= rating ? "text-accent" : "text-muted/40"
            }`}
          >
            ★
          </button>
        ))}
        <span className="ml-2 text-sm text-muted">{rating}/5</span>
      </div>
      <textarea
        name="comment"
        defaultValue={defaultComment}
        rows={3}
        maxLength={500}
        placeholder="Was lief gut, was können wir besser machen? (optional)"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Wird gespeichert..." : defaultRating ? "Bewertung aktualisieren" : "Bewertung abgeben"}
        </button>
        {state?.ok && <span className="text-xs text-accent-2">✅ Danke für deine Bewertung!</span>}
        {state && !state.ok && state.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
