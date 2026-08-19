import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import ReviewForm from "@/components/ReviewForm";
import { deleteReview } from "@/app/actions/reviews";
import { getReviewSummary, renderStars } from "@/lib/reviews";
import { hasAtLeastRole, ROLES } from "@/lib/constants";

export default async function BewertungenPage() {
  const member = await requireMember();
  const isStaff = hasAtLeastRole(member.role, ROLES.AUFSICHT);

  const [reviews, summary, ownReview] = await Promise.all([
    prisma.review.findMany({
      include: { member: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    getReviewSummary(),
    prisma.review.findUnique({ where: { memberId: member.id } }),
  ]);

  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: reviews.filter((r) => r.rating === stars).length,
  }));
  const maxInDistribution = Math.max(1, ...distribution.map((d) => d.count));

  return (
    <div className="space-y-6">
      <p className="fade-up text-sm text-muted">
        Wie zufrieden bist du mit dem LeihCenter? Deine Bewertung hilft uns, besser zu werden.
      </p>

      <div className="fade-up card-glass grid grid-cols-1 gap-6 p-6 sm:grid-cols-[auto_1fr]">
        <div className="text-center sm:text-left">
          <p className="text-5xl font-bold tracking-tight text-accent">
            {summary.count > 0 ? summary.average.toFixed(1) : "–"}
          </p>
          <p className="mt-1 text-lg text-accent">{renderStars(Math.round(summary.average))}</p>
          <p className="mt-1 text-xs text-muted">
            {summary.count} {summary.count === 1 ? "Bewertung" : "Bewertungen"}
          </p>
        </div>
        <div className="space-y-1.5">
          {distribution.map((d) => (
            <div key={d.stars} className="flex items-center gap-2 text-xs">
              <span className="w-8 shrink-0 text-muted">{d.stars}★</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(d.count / maxInDistribution) * 100}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right font-mono text-muted">{d.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="fade-up card p-5">
        <h2 className="mb-3 text-sm font-semibold">
          {ownReview ? "Deine Bewertung ändern" : "Deine Bewertung abgeben"}
        </h2>
        <ReviewForm defaultRating={ownReview?.rating} defaultComment={ownReview?.comment ?? undefined} />
      </div>

      <div className="fade-up card p-5">
        <h2 className="mb-4 text-sm font-semibold">Was andere sagen</h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Bewertungen vorhanden — sei die erste Person!</p>
        ) : (
          <ul className="divide-y divide-border">
            {reviews.map((review) => (
              <li key={review.id} className="flex items-start gap-3 py-3">
                {review.member.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={review.member.avatarUrl}
                    alt={review.member.displayName}
                    className="h-9 w-9 shrink-0 rounded-full border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-xs">
                    {review.member.displayName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{review.member.displayName}</p>
                    <span className="text-sm text-accent">{renderStars(review.rating)}</span>
                    <span className="text-[11px] text-muted">
                      {review.updatedAt.toLocaleDateString("de-DE")}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="mt-1 text-sm text-muted">{review.comment}</p>
                  )}
                </div>
                {isStaff && (
                  <form action={deleteReview.bind(null, review.id)}>
                    <button
                      type="submit"
                      className="rounded-md border border-border px-2 py-1 text-[11px] text-muted transition hover:bg-surface-2 hover:text-danger"
                    >
                      Entfernen
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
