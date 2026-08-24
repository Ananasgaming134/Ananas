import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

export type ReviewResult = { ok: true } | { ok: false; error: string };

/**
 * Legt die Bewertung eines Kunden an oder ueberschreibt seine bestehende -
 * jeder darf genau eine abgeben und sie jederzeit aendern (deshalb upsert
 * statt einer Historie).
 */
export async function submitReviewCore(
  memberId: string,
  rating: number,
  comment: string
): Promise<ReviewResult> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Bitte eine Bewertung von 1 bis 5 Sternen abgeben." };
  }

  const trimmed = comment.trim().slice(0, 500);
  await prisma.review.upsert({
    where: { memberId },
    create: { memberId, rating, comment: trimmed || null },
    update: { rating, comment: trimmed || null },
  });

  await logAction({
    actorId: memberId,
    targetId: memberId,
    action: "REVIEW_SUBMITTED",
    details: `Bewertung abgegeben: ${rating}/5${trimmed ? ` — "${trimmed}"` : ""}`,
  });

  return { ok: true };
}

export async function deleteReviewCore(reviewId: string, actorId: string): Promise<ReviewResult> {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) return { ok: false, error: "Bewertung nicht gefunden." };

  await prisma.review.delete({ where: { id: reviewId } });
  await logAction({
    actorId,
    targetId: review.memberId,
    action: "REVIEW_DELETED",
    details: `Bewertung (${review.rating}/5) entfernt.`,
  });

  return { ok: true };
}

/** Durchschnitt + Anzahl, fuer die Anzeige auf der Bewertungsseite und im Discord. */
export async function getReviewSummary(): Promise<{ average: number; count: number }> {
  const result = await prisma.review.aggregate({ _avg: { rating: true }, _count: true });
  return {
    average: Math.round((result._avg.rating ?? 0) * 10) / 10,
    count: result._count,
  };
}

export function renderStars(rating: number): string {
  return "★".repeat(Math.max(0, Math.min(5, rating))) + "☆".repeat(Math.max(0, 5 - rating));
}

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  displayName: string;
  avatarUrl: string | null;
  createdAt: Date;
};

/**
 * Bewertungen fuer das Laufband auf der Startseite. Auch Bewertungen ohne
 * geschriebenen Text kommen mit - sonst wiederholt sich bei wenigen
 * Kommentaren immer dieselbe Karte. Bewertungen mit Text stehen vorne.
 */
export async function getPublicReviews(limit = 24): Promise<PublicReview[]> {
  const rows = await prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { member: { select: { displayName: true, avatarUrl: true } } },
  });

  const mitText = rows.filter((r) => r.comment && r.comment.trim() !== "");
  const ohneText = rows.filter((r) => !r.comment || r.comment.trim() === "");

  return [...mitText, ...ohneText].map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment?.trim() || null,
    displayName: r.member.displayName,
    avatarUrl: r.member.avatarUrl,
    createdAt: r.createdAt,
  }));
}
