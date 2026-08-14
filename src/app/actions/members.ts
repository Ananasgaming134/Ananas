"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { canManage, MEMBER_STATUS, ROLES } from "@/lib/constants";
import {
  adjustBalanceCore,
  lockMemberCore,
  pauseMemberCore,
  resumeMemberCore,
  setSubscriptionPlanCore,
  unlockMemberCore,
} from "@/lib/subscriptions";

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

/** "Abo sperren" - nur Owner (siehe Plan): kein sofortiger Ausschluss, laeuft nur nicht mehr weiter. */
export async function lockMember(memberId: string, formData: FormData) {
  const actor = await requireMember(ROLES.OWNER);
  const reason = String(formData.get("reason") ?? "").trim() || "Kein Grund angegeben.";
  await lockMemberCore(memberId, reason, actor.id);
  refreshMemberPages(memberId);
}

export async function unlockMember(memberId: string) {
  const actor = await requireMember(ROLES.OWNER);
  await unlockMemberCore(memberId, actor.id);
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

export type AdjustBalanceState = { ok: boolean; error?: string } | null;

/**
 * Manuelle Guthaben-Buchung durch die Führungsebene (nur Owner) - z.B. wenn
 * eine Zahlung nicht automatisch erkannt wurde, oder für Korrekturen/Boni.
 */
export async function adjustBalance(
  memberId: string,
  _prevState: AdjustBalanceState,
  formData: FormData
): Promise<AdjustBalanceState> {
  const actor = await requireMember(ROLES.OWNER);
  const amount = parseInt(String(formData.get("amount") ?? ""), 10);
  const reason = String(formData.get("reason") ?? "").trim() || "Kein Grund angegeben.";

  if (!Number.isFinite(amount) || amount === 0) {
    return { ok: false, error: "Bitte einen gültigen Betrag ungleich 0 angeben." };
  }

  const result = await adjustBalanceCore(memberId, amount, reason, actor.id);

  refreshMemberPages(memberId);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export type AssignPlanState = { ok: boolean; error?: string } | null;

/**
 * Bucht das gewaehlte Abo-Paket vom Guthaben des Kunden ab und verlaengert
 * das Abo entsprechend. Laeuft die aktuelle Laufzeit noch, wird das neue Abo
 * daran angehaengt statt ab heute zu zaehlen (frueh verlaengern verschenkt
 * also keine Zeit). Schlaegt fehl, wenn nicht genug Guthaben vorhanden ist -
 * der Fehler wird ueber useActionState in AboAssignForm angezeigt.
 */
export async function setSubscriptionPlan(
  memberId: string,
  _prevState: AssignPlanState,
  formData: FormData
): Promise<AssignPlanState> {
  const actor = await requireMember(ROLES.AUFSICHT);
  const planId = String(formData.get("planId") ?? "");

  const result = await setSubscriptionPlanCore(memberId, planId, actor.id);

  refreshMemberPages(memberId);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
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

/**
 * Schliesst ein Mitglied dauerhaft aus (Regelverstoss). Loescht dabei auch
 * das komplette Guthaben - anders als bei Freigabe-Entzug (revokeAccess)
 * bleibt bei einem Bann nichts uebrig, siehe Guthaben-Regeln in
 * src/lib/subscriptions.ts.
 */
export async function banMember(memberId: string, formData: FormData) {
  const actor = await requireMember(ROLES.AUFSICHT);
  const target = await prisma.member.findUnique({ where: { id: memberId } });
  if (!target || !canManage(actor.role, target.role)) return;

  const reason = String(formData.get("reason") ?? "").trim() || null;
  const forfeitedBalance = target.balance;

  await prisma.member.update({
    where: { id: memberId },
    data: { status: MEMBER_STATUS.BANNED, bannedAt: new Date(), bannedReason: reason, balance: 0 },
  });

  await logAction({
    actorId: actor.id,
    targetId: memberId,
    action: "MEMBER_BANNED",
    details: `Dauerhaft ausgeschlossen. Grund: ${reason ?? "-"}.${
      forfeitedBalance > 0 ? ` Guthaben von ${forfeitedBalance}$ verfällt.` : ""
    } TODO: Discord-Rolle ${target.discordId} manuell entfernen (Bot folgt).`,
  });

  refreshMemberPages(memberId);
}
