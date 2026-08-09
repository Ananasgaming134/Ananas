"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { borrowItemCore, returnLoanCore } from "@/lib/loans";
import { refreshPanelsQuietly } from "@/lib/discordPanel";
import { LOAN_CHANNEL } from "@/lib/constants";

function refreshItemPages() {
  revalidatePath("/dashboard/items");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/akte");
  revalidatePath("/");
}

export async function borrowItem(itemId: string) {
  const member = await requireMember();
  const result = await borrowItemCore(itemId, member.id, LOAN_CHANNEL.WEB);
  refreshItemPages();
  if (result.ok) await refreshPanelsQuietly();
}

export async function returnLoan(loanId: string) {
  const member = await requireMember();
  const result = await returnLoanCore(loanId, member.id);
  refreshItemPages();
  if (result.ok) await refreshPanelsQuietly();
}
