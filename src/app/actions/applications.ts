"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember, requireAuthenticated } from "@/lib/session";
import {
  applyAndOpenTicketCore,
  approveApplicationCore,
  blockApplicantCore,
  rejectApplicationCore,
  unblockApplicantCore,
  type ApplicationItemInput,
} from "@/lib/applications";
import { searchPriceSourceItems } from "@/lib/priceSource";
import { ROLES } from "@/lib/constants";

function refreshApplicationPages() {
  revalidatePath("/bewerbung");
  revalidatePath("/dashboard/verwaltung/bewerbungen");
}

export async function searchCatalogItems(query: string) {
  if (!query || query.trim().length < 2) return [];
  const results = await searchPriceSourceItems(query, 8);
  return results.map((r) => ({ key: r.key, name: r.name, averagePrice: r.averagePrice }));
}

export type ApplyFormState = { ok: boolean; error?: string } | null;

export async function applyForMembership(_prevState: ApplyFormState, formData: FormData): Promise<ApplyFormState> {
  const { discordId, session } = await requireAuthenticated();

  const reason = String(formData.get("reason") ?? "").trim();
  const declaredNetWorth = parseInt(String(formData.get("declaredNetWorth") ?? ""), 10);
  const requestedPlanId = String(formData.get("requestedPlanId") ?? "");
  const itemsRaw = String(formData.get("items") ?? "[]");

  if (!reason || !Number.isFinite(declaredNetWorth) || !requestedPlanId) {
    return { ok: false, error: "Bitte alle Pflichtfelder ausfüllen." };
  }

  let items: ApplicationItemInput[] = [];
  try {
    const parsed = JSON.parse(itemsRaw);
    if (Array.isArray(parsed)) {
      items = parsed
        .filter((i) => i && typeof i.name === "string" && i.name.trim())
        .map((i) => ({
          sourceKey: typeof i.sourceKey === "string" ? i.sourceKey : null,
          name: String(i.name).slice(0, 200),
          declaredPrice: Number.isFinite(Number(i.declaredPrice)) ? Number(i.declaredPrice) : 0,
          quantity: Number.isFinite(Number(i.quantity)) && Number(i.quantity) > 0 ? Number(i.quantity) : 1,
        }));
    }
  } catch {
    // Ungueltiges JSON wird einfach als "keine Items" behandelt.
  }

  const result = await applyAndOpenTicketCore({
    discordId,
    username: session.user?.name ?? "Unbekannt",
    displayName: session.user?.name ?? "Unbekannt",
    avatarUrl: session.user?.image ?? null,
    reason,
    declaredNetWorth,
    requestedPlanId,
    source: "WEB",
    items,
  });

  refreshApplicationPages();
  if (result.ok) redirect("/bewerbung");
  return result;
}

export async function approveApplication(applicationId: string) {
  const member = await requireMember(ROLES.OWNER);
  await approveApplicationCore(applicationId, member.id);
  refreshApplicationPages();
  revalidatePath("/dashboard/verwaltung/kunden");
}

export async function rejectApplication(applicationId: string, formData: FormData) {
  const member = await requireMember(ROLES.OWNER);
  const reason = String(formData.get("reason") ?? "").trim() || "Kein Grund angegeben.";
  await rejectApplicationCore(applicationId, reason, member.id);
  refreshApplicationPages();
}

export async function blockApplicant(discordId: string, formData: FormData) {
  const member = await requireMember(ROLES.OWNER);
  const reason = String(formData.get("reason") ?? "").trim() || "Kein Grund angegeben.";
  await blockApplicantCore(discordId, reason, member.id);
  refreshApplicationPages();
}

export async function unblockApplicant(blockId: string) {
  const member = await requireMember(ROLES.OWNER);
  await unblockApplicantCore(blockId, member.id);
  refreshApplicationPages();
}
