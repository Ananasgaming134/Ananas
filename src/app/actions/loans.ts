"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { borrowItemCore, returnLoanCore } from "@/lib/loans";
import { refreshPanelsQuietly, syncCategoryChannelsQuietly } from "@/lib/discordPanel";
import { LOAN_CHANNEL, ROLES } from "@/lib/constants";

function refreshItemPages() {
  revalidatePath("/dashboard/items");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/akte");
  revalidatePath("/dashboard/verwaltung");
  revalidatePath("/");
}

export async function borrowItem(itemId: string) {
  const member = await requireMember();
  const result = await borrowItemCore(itemId, member.id, LOAN_CHANNEL.WEB);
  refreshItemPages();
  if (result.ok) {
    await refreshPanelsQuietly();
    await syncCategoryChannelsQuietly();
  }
}

export async function returnLoan(loanId: string) {
  const member = await requireMember();
  const result = await returnLoanCore(loanId, member.id);
  refreshItemPages();
  if (result.ok) {
    await refreshPanelsQuietly();
    await syncCategoryChannelsQuietly();
  }
}

/**
 * Bucht eine FREMDE Ausleihe aus - nur Aufsicht/Owner. Fuer Faelle, in denen
 * jemand das Item abgegeben, aber vergessen hat es selbst zurueckzugeben.
 */
export async function forceReturnLoan(loanId: string) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const result = await returnLoanCore(loanId, actor.id, { allowForeign: true });
  refreshItemPages();
  if (result.ok) {
    await refreshPanelsQuietly();
    await syncCategoryChannelsQuietly();
  }
}
