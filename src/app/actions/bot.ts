"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { postOrUpdatePanel } from "@/lib/discordPanel";
import { registerSlashCommands } from "@/lib/discord";
import { postSubscriptionReminders } from "@/lib/subscriptions";
import { ROLES } from "@/lib/constants";

function refreshBotPages() {
  revalidatePath("/dashboard/verwaltung/bot");
}

function onlyDigits(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().replace(/[^0-9]/g, "");
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
