"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { deleteReviewCore, submitReviewCore } from "@/lib/reviews";
import { ROLES } from "@/lib/constants";

export type ReviewState = { ok: boolean; error?: string } | null;

export async function submitReview(_prevState: ReviewState, formData: FormData): Promise<ReviewState> {
  const member = await requireMember();
  const rating = parseInt(String(formData.get("rating") ?? ""), 10);
  const comment = String(formData.get("comment") ?? "");

  const result = await submitReviewCore(member.id, rating, comment);
  revalidatePath("/dashboard/bewertungen");

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** Entfernt eine Bewertung - z.B. bei beleidigendem Inhalt (nur Aufsicht/Owner). */
export async function deleteReview(reviewId: string) {
  const actor = await requireMember(ROLES.AUFSICHT);
  await deleteReviewCore(reviewId, actor.id);
  revalidatePath("/dashboard/bewertungen");
}
