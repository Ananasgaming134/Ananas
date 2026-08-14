"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { createTicketCore, claimTicketCore, closeTicketCore, TICKET_CATEGORY } from "@/lib/tickets";
import { ROLES } from "@/lib/constants";

function refreshTicketPages() {
  revalidatePath("/dashboard/tickets");
  revalidatePath("/dashboard/verwaltung/tickets");
}

export async function openSupportTicket(formData: FormData) {
  const member = await requireMember();

  const subject = String(formData.get("subject") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!subject) return;

  await createTicketCore({
    category: TICKET_CATEGORY.SUPPORT,
    subject,
    applicantDiscordId: member.discordId,
    memberId: member.id,
    initialMessage: description || undefined,
  });

  refreshTicketPages();
}

export async function claimTicket(ticketId: string) {
  const member = await requireMember(ROLES.AUFSICHT);
  await claimTicketCore(ticketId, member.id);
  refreshTicketPages();
}

export async function closeTicket(ticketId: string) {
  const member = await requireMember(ROLES.AUFSICHT);
  await closeTicketCore(ticketId, member.id);
  refreshTicketPages();
}
