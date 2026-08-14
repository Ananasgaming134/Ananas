"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { postOrUpdatePanel, postOrUpdateTicketPanel } from "@/lib/discordPanel";
import { registerSlashCommands, roleIdsFromEnv, setChannelRoleVisibility } from "@/lib/discord";
import { postSubscriptionReminders } from "@/lib/subscriptions";
import { ROLES } from "@/lib/constants";

function refreshBotPages() {
  revalidatePath("/dashboard/verwaltung/bot");
}

function onlyDigits(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().replace(/[^0-9]/g, "");
}

/** Wie onlyDigits, aber fuer eine kommagetrennte Liste von Rollen-IDs (Ziffern pro Segment). */
function onlyDigitsList(value: FormDataEntryValue | null): string {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim().replace(/[^0-9]/g, ""))
    .filter(Boolean)
    .join(",");
}

export async function addBotDeployment(formData: FormData) {
  const member = await requireMember(ROLES.OWNER);

  const guildId = onlyDigits(formData.get("guildId"));
  const channelId = onlyDigits(formData.get("channelId"));
  const borrowRoleId = onlyDigits(formData.get("borrowRoleId"));
  const statusChannelId = onlyDigits(formData.get("statusChannelId")) || null;
  if (!guildId || !channelId || !borrowRoleId) return;

  const deployment = await prisma.botDeployment.upsert({
    where: { guildId },
    update: { channelId, borrowRoleId, statusChannelId, active: true },
    create: { guildId, channelId, borrowRoleId, statusChannelId, createdById: member.id },
  });

  await logAction({
    actorId: member.id,
    action: "BOT_DEPLOYMENT_SAVED",
    details: `Discord-Server ${guildId} konfiguriert (Kanal ${channelId}, Ausleih-Rolle ${borrowRoleId}${
      statusChannelId ? `, Status-Kanal ${statusChannelId}` : ""
    }).`,
  });

  refreshBotPages();

  // Direkt versuchen, das Panel zu posten/aktualisieren, damit der Owner
  // sofort sieht, ob es funktioniert (z.B. Bot nicht auf dem Server).
  const result = await postOrUpdatePanel(deployment.id);
  await logAction({
    actorId: member.id,
    action: result.ok ? "BOT_PANEL_POSTED" : "BOT_PANEL_FAILED",
    details: result.ok
      ? `Panel fuer Server ${guildId} gepostet/aktualisiert.`
      : `Panel fuer Server ${guildId} fehlgeschlagen: ${result.error}`,
  });
  refreshBotPages();
}

export async function removeBotDeployment(id: string) {
  const member = await requireMember(ROLES.OWNER);
  const deployment = await prisma.botDeployment.findUnique({ where: { id } });
  if (!deployment) return;

  await prisma.botDeployment.delete({ where: { id } });
  await logAction({
    actorId: member.id,
    action: "BOT_DEPLOYMENT_REMOVED",
    details: `Discord-Server ${deployment.guildId} entfernt.`,
  });

  refreshBotPages();
}

export async function refreshBotPanel(id: string) {
  const member = await requireMember(ROLES.OWNER);
  const deployment = await prisma.botDeployment.findUnique({ where: { id } });
  if (!deployment) return;

  const result = await postOrUpdatePanel(id);
  await logAction({
    actorId: member.id,
    action: result.ok ? "BOT_PANEL_POSTED" : "BOT_PANEL_FAILED",
    details: result.ok
      ? `Panel fuer Server ${deployment.guildId} manuell aktualisiert.`
      : `Panel fuer Server ${deployment.guildId} fehlgeschlagen: ${result.error}`,
  });

  refreshBotPages();
}

/**
 * Prueft manuell alle Kunden auf ablaufende/abgelaufene Abos und postet
 * Erinnerungen mit Verlaengern-Buttons in den Discord-Abo-Kanal. Es gibt
 * keinen echten Scheduler fuer automatische, wiederkehrende Checks - das
 * muss der Owner bis auf Weiteres manuell hier anstoßen.
 */
export async function checkSubscriptionReminders() {
  const member = await requireMember(ROLES.OWNER);

  const result = await postSubscriptionReminders();
  await logAction({
    actorId: member.id,
    action: result.ok ? "SUBSCRIPTION_REMINDERS_CHECKED" : "SUBSCRIPTION_REMINDERS_FAILED",
    details: result.ok
      ? `${result.posted} Abo-Erinnerung(en) gepostet.`
      : `Fehlgeschlagen: ${result.error}`,
  });

  refreshBotPages();
}

/**
 * Speichert die Ticket-Konfiguration eines Servers (Claim-Rollen pro
 * Kategorie, Sichtbarkeit fuer die Kunde-Rolle) und synchronisiert die
 * Sichtbarkeit direkt mit Discord, falls das Ticket-Panel bereits gepostet ist.
 */
export async function updateTicketConfig(deploymentId: string, formData: FormData) {
  const member = await requireMember(ROLES.OWNER);
  const deployment = await prisma.botDeployment.findUnique({ where: { id: deploymentId } });
  if (!deployment) return;

  const supportClaimRoleIds = onlyDigitsList(formData.get("supportClaimRoleIds")) || null;
  const bewerbungClaimRoleIds = onlyDigitsList(formData.get("bewerbungClaimRoleIds")) || null;
  const ticketsVisibleToCustomers = formData.get("ticketsVisibleToCustomers") === "on";

  await prisma.botDeployment.update({
    where: { id: deploymentId },
    data: { supportClaimRoleIds, bewerbungClaimRoleIds, ticketsVisibleToCustomers },
  });

  await logAction({
    actorId: member.id,
    action: "TICKET_CONFIG_SAVED",
    details: `Ticket-Konfiguration für Server ${deployment.guildId} aktualisiert (sichtbar für Kunden: ${
      ticketsVisibleToCustomers ? "ja" : "nein"
    }).`,
  });

  const kundeRoleId = roleIdsFromEnv("DISCORD_ROLE_KUNDE")[0];
  if (deployment.ticketPanelChannelId && kundeRoleId) {
    await setChannelRoleVisibility(deployment.ticketPanelChannelId, kundeRoleId, ticketsVisibleToCustomers).catch(
      () => {}
    );
  }

  refreshBotPages();
}

/** "/setup ticket-panel"-Aequivalent von der Website aus - postet/aktualisiert das Ticket-Panel im angegebenen Kanal. */
export async function setupTicketPanel(deploymentId: string, formData: FormData) {
  const member = await requireMember(ROLES.OWNER);
  const deployment = await prisma.botDeployment.findUnique({ where: { id: deploymentId } });
  if (!deployment) return;

  const ticketPanelChannelId = onlyDigits(formData.get("ticketPanelChannelId"));
  if (!ticketPanelChannelId) return;

  await prisma.botDeployment.update({ where: { id: deploymentId }, data: { ticketPanelChannelId } });

  const result = await postOrUpdateTicketPanel(deploymentId);
  await logAction({
    actorId: member.id,
    action: result.ok ? "BOT_PANEL_POSTED" : "BOT_PANEL_FAILED",
    details: result.ok
      ? `Ticket-Panel für Server ${deployment.guildId} in Kanal ${ticketPanelChannelId} eingerichtet.`
      : `Ticket-Panel für Server ${deployment.guildId} fehlgeschlagen: ${result.error}`,
  });

  refreshBotPages();
}

export async function registerSlashCommand(deploymentId: string) {
  const member = await requireMember(ROLES.OWNER);
  const deployment = await prisma.botDeployment.findUnique({ where: { id: deploymentId } });
  if (!deployment) return;

  const result = await registerSlashCommands(deployment.guildId);
  await logAction({
    actorId: member.id,
    action: result.ok ? "BOT_COMMAND_REGISTERED" : "BOT_COMMAND_REGISTER_FAILED",
    details: result.ok
      ? `Slash-Befehle (/akte, /setup) für Server ${deployment.guildId} registriert.`
      : `Slash-Befehl-Registrierung für Server ${deployment.guildId} fehlgeschlagen: ${result.error}`,
  });

  refreshBotPages();
}
