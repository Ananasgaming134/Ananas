"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { postTicketMessage } from "@/lib/ticketMessages";
import { hasAtLeastRole, ROLES } from "@/lib/constants";

export type TicketMessageState = { ok: boolean; error?: string } | null;

const MAX_ZEICHEN = 1800;

/**
 * Schickt einen Beitrag aus dem Ticket auf der Website in den Discord-Thread.
 * Schreiben darf nur, wem das Ticket gehoert - oder Aufsicht und hoeher.
 */
export async function sendTicketMessage(
  ticketId: string,
  _prev: TicketMessageState,
  formData: FormData
): Promise<TicketMessageState> {
  const member = await requireMember();
  const text = String(formData.get("text") ?? "").trim();

  if (!text) return { ok: false, error: "Schreib erst eine Nachricht." };
  if (text.length > MAX_ZEICHEN) {
    return { ok: false, error: `Zu lang — höchstens ${MAX_ZEICHEN} Zeichen (aktuell ${text.length}).` };
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Ticket nicht gefunden." };

  const gehoertMir = ticket.memberId === member.id || ticket.applicantDiscordId === member.discordId;
  if (!gehoertMir && !hasAtLeastRole(member.role, ROLES.AUFSICHT)) {
    return { ok: false, error: "Dieses Ticket gehört dir nicht." };
  }

  const result = await postTicketMessage(ticketId, member.displayName, member.avatarUrl, text);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/dashboard/tickets/${ticketId}`);
  return { ok: true };
}
