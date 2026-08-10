import { InteractionResponseType, InteractionType, verifyKey } from "discord-interactions";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { borrowItemCore, returnLoanCore } from "@/lib/loans";
import { buildCategoryItemSelectPayload, postOrUpdatePanel, refreshPanelsQuietly } from "@/lib/discordPanel";
import { RENEW_PREFIX, setSubscriptionPlanCore } from "@/lib/subscriptions";
import {
  BORROW_PREFIX,
  CATEGORY_ITEM_SELECT_ID,
  PANEL_CATEGORY_SELECT_ID,
  PANEL_SELECT_ID,
  RETURN_PREFIX,
  buildAkteEmbedForDiscord,
  ensureMemberFromDiscordUser,
  hasOwnerRole,
  hasStaffRole,
  type DiscordInteractionOption,
  type DiscordInteractionPayload,
  type DiscordInteractionUser,
} from "@/lib/discordInteractions";
import { resetWordChain } from "@/lib/wordChain";
import { LOAN_CHANNEL, LOAN_STATUS, MEMBER_STATUS } from "@/lib/constants";

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY ?? "";
const EPHEMERAL = 64;

/**
 * Endpoint fuer Discord-Interactions (Slash-Befehle, Panel-Buttons/Select).
 * Discord ruft diese Route direkt per HTTPS auf (kein Gateway/Dauerprozess
 * noetig) - dafuer muss die "Interactions Endpoint URL" im Discord
 * Developer Portal auf https://DEINE-DOMAIN/api/discord/interactions
 * gesetzt werden. Das funktioniert erst, sobald die Seite oeffentlich
 * erreichbar ist; Discord prueft die URL beim Speichern per PING.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const rawBody = await request.text();

  if (!signature || !timestamp || !PUBLIC_KEY) {
    return new Response("Bad request", { status: 401 });
  }

  const isValid = await verifyKey(rawBody, signature, timestamp, PUBLIC_KEY);
  if (!isValid) {
    return new Response("Invalid signature", { status: 401 });
  }

  const interaction = JSON.parse(rawBody) as DiscordInteractionPayload;

  if (interaction.type === InteractionType.PING) {
    return Response.json({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    return handleCommand(interaction);
  }

  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    return handleComponent(interaction);
  }

  return Response.json({ type: InteractionResponseType.PONG });
}

function ephemeral(content: string) {
  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: EPHEMERAL },
  });
}

async function handleCommand(interaction: DiscordInteractionPayload) {
  const commandName = interaction.data?.name;
  const invokerRoles: string[] = interaction.member?.roles ?? [];

  if (commandName === "setup") {
    return handleSetupCommand(interaction, invokerRoles);
  }

  if (commandName === "wortketten-reset") {
    if (!hasStaffRole(invokerRoles)) {
      return ephemeral("Nur Aufsichtspersonen und Owner können das Wortkettenspiel zurücksetzen.");
    }
    const channelId = interaction.channel_id;
    if (!channelId) return ephemeral("Nur innerhalb eines Server-Kanals nutzbar.");
    await resetWordChain(channelId);
    return ephemeral("✅ Wortkettenspiel wurde zurückgesetzt. Das nächste gültige Wort startet die Kette neu.");
  }

  if (commandName !== "akte") {
    return ephemeral("Unbekannter Befehl.");
  }

  if (!hasStaffRole(invokerRoles)) {
    return ephemeral("Nur Aufsichtspersonen und Owner können die Akte abfragen.");
  }

  const userOption = interaction.data?.options?.find((o) => o.name === "user");
  const targetDiscordId: string | undefined = userOption?.value;
  if (!targetDiscordId) {
    return ephemeral("Bitte eine Person angeben.");
  }

  const member = await prisma.member.findUnique({ where: { discordId: targetDiscordId } });
  const loans = member
    ? await prisma.loan.findMany({
        where: { memberId: member.id },
        include: { item: true },
        orderBy: { borrowedAt: "desc" },
      })
    : [];

  const embed = buildAkteEmbedForDiscord(member, loans);

  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { embeds: [embed], flags: EPHEMERAL },
  });
}

/**
 * "/setup item-panel" bzw. "/setup status-panel" - laesst den Owner die
 * Panels direkt aus Discord heraus im aktuellen Kanal einrichten/
 * aktualisieren, ohne den Umweg ueber /dashboard/verwaltung/bot auf der Website.
 */
async function handleSetupCommand(interaction: DiscordInteractionPayload, invokerRoles: string[]) {
  if (!hasOwnerRole(invokerRoles)) {
    return ephemeral("Nur der Owner kann die Panels einrichten.");
  }

  const guildId = interaction.guild_id;
  const channelId = interaction.channel_id;
  if (!guildId || !channelId) {
    return ephemeral("Nur innerhalb eines Server-Kanals nutzbar.");
  }

  const subcommand = interaction.data?.options?.[0];
  if (!subcommand) return ephemeral("Bitte einen Setup-Typ angeben.");

  const discordUser = interaction.member?.user ?? interaction.user;
  const actor = discordUser ? await prisma.member.findUnique({ where: { discordId: discordUser.id } }) : null;

  if (subcommand.name === "item-panel") {
    return handleSetupItemPanel(guildId, channelId, subcommand.options ?? [], actor?.id ?? null);
  }
  if (subcommand.name === "status-panel") {
    return handleSetupStatusPanel(guildId, channelId, actor?.id ?? null);
  }

  return ephemeral("Unbekannter Setup-Typ.");
}

async function handleSetupItemPanel(
  guildId: string,
  channelId: string,
  options: DiscordInteractionOption[],
  actorId: string | null
) {
  const existing = await prisma.botDeployment.findUnique({ where: { guildId } });
  const roleOption = options.find((o) => o.name === "rolle")?.value;
  const borrowRoleId = roleOption ?? existing?.borrowRoleId;
  if (!borrowRoleId) {
    return ephemeral(
      "Für die erste Einrichtung auf diesem Server muss die Option „rolle“ mit angegeben werden."
    );
  }

  const deployment = await prisma.botDeployment.upsert({
    where: { guildId },
    update: { channelId, borrowRoleId, active: true },
    create: { guildId, channelId, borrowRoleId },
  });

  const result = await postOrUpdatePanel(deployment.id);
  await logAction({
    actorId,
    action: result.ok ? "BOT_PANEL_POSTED" : "BOT_PANEL_FAILED",
    details: result.ok
      ? `Ausleih-Panel für Server ${guildId} per /setup in Kanal ${channelId} eingerichtet.`
      : `Ausleih-Panel für Server ${guildId} per /setup fehlgeschlagen: ${result.error}`,
  });

  return ephemeral(
    result.ok ? "✅ Ausleih-Panel wurde in diesem Kanal eingerichtet/aktualisiert." : `❌ ${result.error}`
  );
}

async function handleSetupStatusPanel(guildId: string, channelId: string, actorId: string | null) {
  const existing = await prisma.botDeployment.findUnique({ where: { guildId } });
  if (!existing) {
    return ephemeral("Bitte zuerst „/setup item-panel“ ausführen, um diesen Server einzurichten.");
  }

  await prisma.botDeployment.update({ where: { guildId }, data: { statusChannelId: channelId } });
  const result = await postOrUpdatePanel(existing.id);
  await logAction({
    actorId,
    action: result.ok ? "BOT_PANEL_POSTED" : "BOT_PANEL_FAILED",
    details: result.ok
      ? `Status-Panel für Server ${guildId} per /setup in Kanal ${channelId} eingerichtet.`
      : `Status-Panel für Server ${guildId} per /setup fehlgeschlagen: ${result.error}`,
  });

  return ephemeral(
    result.ok ? "✅ Status-Panel wurde in diesem Kanal eingerichtet/aktualisiert." : `❌ ${result.error}`
  );
}

async function handleComponent(interaction: DiscordInteractionPayload) {
  const customId: string = interaction.data?.custom_id ?? "";
  const discordUser = interaction.member?.user ?? interaction.user;
  const memberRoles: string[] = interaction.member?.roles ?? [];
  if (!discordUser) return ephemeral("Konnte deinen Discord-Account nicht ermitteln.");

  if (customId === PANEL_SELECT_ID) {
    const itemId: string | undefined = interaction.data?.values?.[0];
    if (!itemId) return ephemeral("Kein Item ausgewählt.");
    return respondWithItemActions(itemId, interaction.guild_id, memberRoles, discordUser, false);
  }

  if (customId === PANEL_CATEGORY_SELECT_ID) {
    const categoryValue: string | undefined = interaction.data?.values?.[0];
    if (!categoryValue) return ephemeral("Keine Kategorie ausgewählt.");
    const payload = await buildCategoryItemSelectPayload(categoryValue);
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { ...payload, flags: EPHEMERAL },
    });
  }

  if (customId === CATEGORY_ITEM_SELECT_ID) {
    const itemId: string | undefined = interaction.data?.values?.[0];
    if (!itemId) return ephemeral("Kein Item ausgewählt.");
    return respondWithItemActions(itemId, interaction.guild_id, memberRoles, discordUser, true);
  }

  if (customId.startsWith(BORROW_PREFIX)) {
    const itemId = customId.slice(BORROW_PREFIX.length);
    return handleBorrow(itemId, interaction.guild_id, memberRoles, discordUser);
  }

  if (customId.startsWith(RETURN_PREFIX)) {
    const loanId = customId.slice(RETURN_PREFIX.length);
    return handleReturn(loanId, discordUser);
  }

  if (customId.startsWith(RENEW_PREFIX)) {
    const param = customId.slice(RENEW_PREFIX.length);
    return handleRenew(param, memberRoles, discordUser, interaction);
  }

  return ephemeral("Unbekannte Aktion.");
}

async function handleRenew(
  param: string,
  memberRoles: string[],
  discordUser: DiscordInteractionUser,
  interaction: DiscordInteractionPayload
) {
  if (!hasStaffRole(memberRoles)) {
    return ephemeral("Nur Aufsichtspersonen und Owner können Abos verlängern.");
  }

  const [memberId, planId] = param.split(":");
  if (!memberId || !planId) return ephemeral("Ungültige Aktion.");

  const actor = await prisma.member.findUnique({ where: { discordId: discordUser.id } });
  const result = await setSubscriptionPlanCore(memberId, planId, actor?.id ?? null);
  if (!result.ok) return ephemeral(`❌ ${result.error}`);

  const actorLabel = discordUser.global_name ?? discordUser.username;
  return Response.json({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      content: `✅ Verlängert (${result.plan.label}) bis ${result.newExpiry.toLocaleDateString("de-DE")} — von ${actorLabel}.`,
      embeds: interaction.message?.embeds ?? [],
      components: [],
    },
  });
}

async function checkBorrowPermission(guildId: string | undefined, memberRoles: string[]) {
  if (!guildId) return { ok: false as const, error: "Nur innerhalb eines Servers nutzbar." };
  const deployment = await prisma.botDeployment.findUnique({ where: { guildId } });
  if (!deployment || !deployment.active) {
    return { ok: false as const, error: "Dieser Server ist nicht für das LeihCenter konfiguriert." };
  }
  if (!memberRoles.includes(deployment.borrowRoleId)) {
    return { ok: false as const, error: "Du hast auf diesem Server keine Berechtigung zum Ausleihen." };
  }
  return { ok: true as const };
}

async function respondWithItemActions(
  itemId: string,
  guildId: string | undefined,
  memberRoles: string[],
  discordUser: DiscordInteractionUser,
  updateInPlace: boolean
) {
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item) return ephemeral("Item nicht gefunden.");

  const permission = await checkBorrowPermission(guildId, memberRoles);

  const member = await prisma.member.findUnique({ where: { discordId: discordUser.id } });
  const activeLoan = member
    ? await prisma.loan.findFirst({
        where: { itemId, memberId: member.id, status: LOAN_STATUS.ACTIVE },
      })
    : null;

  const borrowedCount = await prisma.loan.count({ where: { itemId, status: LOAN_STATUS.ACTIVE } });
  const available = item.quantityTotal - borrowedCount;

  const components = [
    {
      type: 1,
      components: [
        activeLoan
          ? {
              type: 2,
              style: 3,
              label: "Zurückgeben",
              custom_id: `${RETURN_PREFIX}${activeLoan.id}`,
            }
          : {
              type: 2,
              style: 1,
              label: "Ausleihen",
              custom_id: `${BORROW_PREFIX}${item.id}`,
              disabled: available <= 0,
            },
      ],
    },
  ];

  const status = activeLoan
    ? "Du hast dieses Item aktuell ausgeliehen."
    : available > 0
      ? `Verfügbar: ${available}/${item.quantityTotal}`
      : "Aktuell nicht verfügbar.";

  return Response.json({
    type: updateInPlace ? InteractionResponseType.UPDATE_MESSAGE : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `**${item.name}**\n${status}${
        permission.ok ? "" : `\n\n⚠️ ${permission.error}`
      }`,
      flags: EPHEMERAL,
      components: permission.ok ? components : [],
    },
  });
}

async function handleBorrow(
  itemId: string,
  guildId: string | undefined,
  memberRoles: string[],
  discordUser: DiscordInteractionUser
) {
  const permission = await checkBorrowPermission(guildId, memberRoles);
  if (!permission.ok) return ephemeral(permission.error);

  const member = await ensureMemberFromDiscordUser(discordUser);
  if (member.status !== MEMBER_STATUS.ACTIVE) {
    return ephemeral("Deine Freigabe ist aktuell nicht aktiv.");
  }

  const result = await borrowItemCore(itemId, member.id, LOAN_CHANNEL.DISCORD);
  await refreshPanelsQuietly();

  return ephemeral(
    result.ok ? "✅ Item ausgeliehen. Viel Spaß!" : `❌ ${result.error}`
  );
}

async function handleReturn(loanId: string, discordUser: DiscordInteractionUser) {
  const member = await prisma.member.findUnique({ where: { discordId: discordUser.id } });
  if (!member) return ephemeral("Kein Datensatz gefunden.");

  const result = await returnLoanCore(loanId, member.id);
  await refreshPanelsQuietly();

  return ephemeral(result.ok ? "✅ Item zurückgegeben. Danke!" : `❌ ${result.error}`);
}
