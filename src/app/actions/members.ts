"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { canManage, MEMBER_STATUS, ROLES } from "@/lib/constants";
import { pauseMemberCore, resumeMemberCore, setSubscriptionPlanCore } from "@/lib/subscriptions";

function refreshMemberPages(memberId: string) {
  revalidatePath(`/dashboard/akte/${memberId}`);
  revalidatePath("/dashboard/verwaltung/kunden");
  revalidatePath("/dashboard/verwaltung/mitglieder");
  revalidatePath("/dashboard/verwaltung/logs");
  revalidatePath("/");
}

export async function addMemberNote(memberId: string, formData: FormData) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;

  await prisma.memberNote.create({
    data: { memberId, authorId: actor.id, content },
  });

  await logAction({
    actorId: actor.id,
    targetId: memberId,
    action: "MEMBER_NOTE_ADDED",
    details: content,
  });

  refreshMemberPages(memberId);
}

/**
 * Entzieht einem Kunden die Freigabe (Zugriff auf das LeihCenter).
 * Die eigentliche Discord-Rollenentfernung ist ein TODO, sobald der
 * Ausleih-Bot mit einem Bot-Token angebunden ist (DISCORD_BOT_TOKEN).
 */
export async function revokeAccess(memberId: string, formData: FormData) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target || !canManage(actor.role, target.role)) return;

  const reason = String(formData.get("reason") ?? "").trim() || null;

  await prisma.member.update({
    where: { id: memberId },
    data: { status: MEMBER_STATUS.REVOKED, revokedAt: new Date(), revokedReason: reason },
  });

  await logAction({
    actorId: actor.id,
    targetId: memberId,
    action: "ACCESS_REVOKED",
    details: `Freigabe entzogen. Grund: ${reason ?? "-"}. TODO: Discord-Rolle ${target.discordId} manuell entfernen (Bot folgt).`,
  });

  refreshMemberPages(memberId);
}

/** Pausiert das Abo eines Kunden - typischerweise ausgeloest ueber ein Support-Ticket. */
export async function pauseMember(memberId: string, formData: FormData) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target || !canManage(actor.role, target.role)) return;

  const reason = String(formData.get("reason") ?? "").trim() || "Kein Grund angegeben.";
  const ticketId = String(formData.get("ticketId") ?? "").trim() || null;
  await pauseMemberCore(memberId, reason, actor.id, ticketId);
  refreshMemberPages(memberId);
}

export async function resumeMember(memberId: string) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target || !canManage(actor.role, target.role)) return;

  await resumeMemberCore(memberId, actor.id);
  refreshMemberPages(memberId);
}

export async function reinstateAccess(memberId: string) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target || target.status === MEMBER_STATUS.BANNED || !canManage(actor.role, target.role)) return;

  await prisma.member.update({
    where: { id: memberId },
    data: { status: MEMBER_STATUS.ACTIVE, revokedAt: null, revokedReason: null },
  });

  await logAction({
    actorId: actor.id,
    targetId: memberId,
    action: "ACCESS_REINSTATED",
    details: "Freigabe wiederhergestellt.",
  });

  refreshMemberPages(memberId);
}

/**
 * Weist einem Kunden ein Abo zu bzw. verlaengert es. Laeuft die aktuelle
 * Laufzeit noch, wird das neue Abo daran angehaengt statt ab heute zu
 * zaehlen (frueh verlaengern verschenkt also keine Zeit).
 */
export async function setSubscriptionPlan(memberId: string, formData: FormData) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const planId = String(formData.get("planId") ?? "");

  await setSubscriptionPlanCore(memberId, planId, actor.id);

  refreshMemberPages(memberId);
}

/**
 * Aendert den Minecraft-Namen eines Mitglieds. Nur Aufsicht/Owner duerfen
 * das (nicht das Mitglied selbst), damit klar ist wer fuer die Korrektheit
 * verantwortlich ist - jede Aenderung wird geloggt.
 */
export async function updateMinecraftName(memberId: string, formData: FormData) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target) return;

  const newName = String(formData.get("minecraftName") ?? "").trim();
  if (!newName || newName === target.minecraftName) return;

  const oldName = target.minecraftName || "-";

  await prisma.member.update({
    where: { id: memberId },
    data: { minecraftName: newName },
  });

  await logAction({
    actorId: actor.id,
    targetId: memberId,
    action: "MINECRAFT_NAME_CHANGED",
    details: `Minecraft-Name geändert: "${oldName}" → "${newName}".`,
  });

  refreshMemberPages(memberId);
}

export async function banMember(memberId: string, formData: FormData) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target || !canManage(actor.role, target.role)) return;

  const reason = String(formData.get("reason") ?? "").trim() || null;

  await prisma.member.update({
    where: { id: memberId },
    data: { status: MEMBER_STATUS.BANNED, bannedAt: new Date(), bannedReason: reason },
  });

  await logAction({
    actorId: actor.id,
    targetId: memberId,
    action: "MEMBER_BANNED",
    details: `Dauerhaft ausgeschlossen. Grund: ${reason ?? "-"}. TODO: Discord-Rolle ${target.discordId} manuell entfernen (Bot folgt).`,
  });

  refreshMemberPages(memberId);
}
