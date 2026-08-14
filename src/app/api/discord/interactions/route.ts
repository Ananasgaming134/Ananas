import { InteractionResponseType, InteractionType, verifyKey } from "discord-interactions";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { borrowItemCore, returnLoanCore } from "@/lib/loans";
import {
  buildCategoryItemSelectPayload,
  postOrUpdatePanel,
  postOrUpdateTicketPanel,
  refreshPanelsQuietly,
} from "@/lib/discordPanel";
import { RENEW_PREFIX, setSubscriptionPlanCore } from "@/lib/subscriptions";
import { applyAndOpenTicketCore } from "@/lib/applications";
import { grantChannelMemberAccess } from "@/lib/discord";
import {
  TICKET_CATEGORY,
  canManageTicket,
  claimTicketCore,
  closeTicketCore,
  createTicketCore,
  type TicketCategoryValue,
} from "@/lib/tickets";
import {
  BEWERBUNG_MODAL_PREFIX,
  BORROW_PREFIX,
  CATEGORY_ITEM_SELECT_ID,
  CATEGORY_PAGE_PREFIX,
  PANEL_CATEGORY_SELECT_ID,
  PANEL_SELECT_ID,
  RETURN_PREFIX,
  SUPPORT_MODAL_ID,
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_PREFIX,
  TICKET_OPEN_BEWERBUNG_ID,
  TICKET_OPEN_SUPPORT_ID,
  TICKET_PLAN_SELECT_ID,
  buildAkteEmbedForDiscord,
  ensureMemberFromDiscordUser,
  getModalValue,
  hasOwnerRole,
  hasStaffRole,
  type DiscordInteractionOption,
  type DiscordInteractionPayload,
  type DiscordInteractionUser,
} from "@/lib/discordInteractions";
import { resetWordChain } from "@/lib/wordChain";
import { LOAN_CHANNEL, LOAN_STATUS, MEMBER_STATUS, SUBSCRIPTION_PLANS } from "@/lib/constants";

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

  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    return handleModalSubmit(interaction);
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

  if (commandName === "meine-ausleihen") {
    const discordUser = interaction.member?.user ?? interaction.user;
    if (!discordUser) return ephemeral("Konnte deinen Discord-Account nicht ermitteln.");
    return handleMeineAusleihenCommand(discordUser);
  }

  if (commandName === "bewerben") {
    return respondWithPlanSelect();
  }

  if (commandName === "abo") {
    return handleAboCommand(interaction, invokerRoles);
  }

  if (commandName === "ticket") {
    return handleTicketAddCommand(interaction, invokerRoles);
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
  if (subcommand.name === "ticket-panel") {
    return handleSetupTicketPanel(guildId, channelId, actor?.id ?? null);
  }

  return ephemeral("Unbekannter Setup-Typ.");
}

async function handleSetupTicketPanel(guildId: string, channelId: string, actorId: string | null) {
  const existing = await prisma.botDeployment.findUnique({ where: { guildId } });
  if (!existing) {
    return ephemeral("Bitte zuerst „/setup item-panel“ ausführen, um diesen Server einzurichten.");
  }

  await prisma.botDeployment.update({ where: { guildId }, data: { ticketPanelChannelId: channelId } });
  const result = await postOrUpdateTicketPanel(existing.id);
  await logAction({
    actorId,
    action: result.ok ? "BOT_PANEL_POSTED" : "BOT_PANEL_FAILED",
    details: result.ok
      ? `Ticket-Panel für Server ${guildId} per /setup in Kanal ${channelId} eingerichtet.`
      : `Ticket-Panel für Server ${guildId} per /setup fehlgeschlagen: ${result.error}`,
  });

  return ephemeral(
    result.ok
      ? "✅ Ticket-Panel wurde in diesem Kanal eingerichtet/aktualisiert. Sichtbarkeit für Kunden lässt sich in der Verwaltung auf der Website umschalten."
      : `❌ ${result.error}`
  );
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

  if (customId.startsWith(CATEGORY_PAGE_PREFIX)) {
    const rest = customId.slice(CATEGORY_PAGE_PREFIX.length);
    const separatorIndex = rest.lastIndexOf(":");
    const categoryValue = rest.slice(0, separatorIndex);
    const page = parseInt(rest.slice(separatorIndex + 1), 10) || 0;
    const payload = await buildCategoryItemSelectPayload(categoryValue, page);
    return Response.json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { ...payload, flags: EPHEMERAL },
    });
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

  if (customId === TICKET_OPEN_SUPPORT_ID) {
    return Response.json({
      type: InteractionResponseType.MODAL,
      data: {
        custom_id: SUPPORT_MODAL_ID,
        title: "Support-Ticket eröffnen",
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "subject",
                style: 1,
                label: "Worum geht's? (kurz)",
                max_length: 100,
                required: true,
              },
            ],
          },
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "description",
                style: 2,
                label: "Beschreibung",
                max_length: 1000,
                required: false,
              },
            ],
          },
        ],
      },
    });
  }

  if (customId === TICKET_OPEN_BEWERBUNG_ID) {
    return respondWithPlanSelect();
  }

  if (customId === TICKET_PLAN_SELECT_ID) {
    const planId = interaction.data?.values?.[0];
    if (!planId) return ephemeral("Kein Paket ausgewählt.");
    return respondWithBewerbungModal(planId);
  }

  if (customId.startsWith(TICKET_CLAIM_PREFIX)) {
    const ticketId = customId.slice(TICKET_CLAIM_PREFIX.length);
    return handleTicketClaim(ticketId, memberRoles, discordUser, interaction);
  }

  if (customId.startsWith(TICKET_CLOSE_PREFIX)) {
    const ticketId = customId.slice(TICKET_CLOSE_PREFIX.length);
    return handleTicketClose(ticketId, memberRoles, discordUser, interaction);
  }

  return ephemeral("Unbekannte Aktion.");
}

/** Schritt 1 der Bewerbung per Discord: Abo-Paket waehlen (Modals erlauben keine Selects). */
function respondWithPlanSelect() {
  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "Welches Abo-Paket möchtest du beantragen?",
      flags: EPHEMERAL,
      components: [
        {
          type: 1,
          components: [
            {
              type: 3,
              custom_id: TICKET_PLAN_SELECT_ID,
              placeholder: "Paket auswählen...",
              options: SUBSCRIPTION_PLANS.map((p) => ({
                label: p.label,
                value: p.id,
                description: `$${p.price.toLocaleString("en-US")}`,
              })),
            },
          ],
        },
      ],
    },
  });
}

/** Schritt 2 der Bewerbung per Discord: das eigentliche Modal mit dem gewaehlten Paket im custom_id. */
function respondWithBewerbungModal(planId: string) {
  return Response.json({
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: `${BEWERBUNG_MODAL_PREFIX}${planId}`,
      title: "Bewerbung ums LeihCenter",
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "reason",
              style: 2,
              label: "Warum möchtest du ausleihen?",
              max_length: 500,
              required: true,
            },
          ],
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "netWorth",
              style: 1,
              label: "Dein Gesamtvermögen (Zahl)",
              max_length: 20,
              required: true,
            },
          ],
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "minecraftName",
              style: 1,
              label: "Dein Minecraft-Name",
              max_length: 32,
              required: true,
            },
          ],
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "age",
              style: 1,
              label: "Dein Alter (Zahl)",
              max_length: 3,
              required: true,
            },
          ],
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "playHours",
              style: 1,
              label: "Deine Spielstunden auf dem Server (Zahl)",
              max_length: 10,
              required: true,
            },
          ],
        },
      ],
    },
  });
}

async function handleModalSubmit(interaction: DiscordInteractionPayload) {
  const customId = interaction.data?.custom_id ?? "";
  const discordUser = interaction.member?.user ?? interaction.user;
  if (!discordUser) return ephemeral("Konnte deinen Discord-Account nicht ermitteln.");

  if (customId === SUPPORT_MODAL_ID) {
    const subject = getModalValue(interaction, "subject") || "Support-Anfrage";
    const description = getModalValue(interaction, "description");
    const member = await prisma.member.findUnique({ where: { discordId: discordUser.id } });

    const result = await createTicketCore({
      category: TICKET_CATEGORY.SUPPORT,
      subject,
      applicantDiscordId: discordUser.id,
      memberId: member?.id ?? null,
      initialMessage: description || undefined,
    });

    return ephemeral(
      result.ok
        ? "✅ Ticket wurde erstellt — du findest den Kanal auch auf der Website unter „Meine Tickets“."
        : `❌ ${result.error}`
    );
  }

  if (customId.startsWith(BEWERBUNG_MODAL_PREFIX)) {
    const planId = customId.slice(BEWERBUNG_MODAL_PREFIX.length);
    const reason = getModalValue(interaction, "reason");
    const netWorthRaw = getModalValue(interaction, "netWorth");
    const declaredNetWorth = parseInt(netWorthRaw.replace(/[^\d]/g, ""), 10);
    const minecraftName = getModalValue(interaction, "minecraftName").trim();
    const ageRaw = getModalValue(interaction, "age");
    const age = parseInt(ageRaw.replace(/[^\d]/g, ""), 10);
    const playHoursRaw = getModalValue(interaction, "playHours");
    const playHours = parseInt(playHoursRaw.replace(/[^\d]/g, ""), 10);

    if (
      !reason ||
      !Number.isFinite(declaredNetWorth) ||
      !minecraftName ||
      !Number.isFinite(age) ||
      !Number.isFinite(playHours)
    ) {
      return ephemeral("❌ Bitte alle Felder gültig ausfüllen.");
    }

    const result = await applyAndOpenTicketCore({
      discordId: discordUser.id,
      username: discordUser.username,
      displayName: discordUser.global_name ?? discordUser.username,
      avatarUrl: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null,
      reason,
      declaredNetWorth,
      requestedPlanId: planId,
      source: "DISCORD",
      minecraftName,
      age,
      playHours,
    });

    return ephemeral(
      result.ok
        ? "✅ Bewerbung eingereicht! Du wirst benachrichtigt, sobald sie geprüft wurde."
        : `❌ ${result.error}`
    );
  }

  return ephemeral("Unbekanntes Formular.");
}

async function handleTicketClaim(
  ticketId: string,
  memberRoles: string[],
  discordUser: DiscordInteractionUser,
  interaction: DiscordInteractionPayload
) {
  const deployment = interaction.guild_id
    ? await prisma.botDeployment.findUnique({ where: { guildId: interaction.guild_id } })
    : null;
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return ephemeral("Ticket nicht gefunden.");
  if (!deployment || !canManageTicket(ticket.category as TicketCategoryValue, deployment, memberRoles)) {
    return ephemeral("Du bist nicht berechtigt, dieses Ticket zu übernehmen.");
  }

  const actor = await ensureMemberFromDiscordUser(discordUser);
  const result = await claimTicketCore(ticketId, actor.id);
  if (!result.ok) return ephemeral(`❌ ${result.error}`);

  const actorLabel = discordUser.global_name ?? discordUser.username;
  return ephemeral(`🙋 Ticket übernommen von ${actorLabel}.`);
}

async function handleTicketClose(
  ticketId: string,
  memberRoles: string[],
  discordUser: DiscordInteractionUser,
  interaction: DiscordInteractionPayload
) {
  const deployment = interaction.guild_id
    ? await prisma.botDeployment.findUnique({ where: { guildId: interaction.guild_id } })
    : null;
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return ephemeral("Ticket nicht gefunden.");
  if (!deployment || !canManageTicket(ticket.category as TicketCategoryValue, deployment, memberRoles)) {
    return ephemeral("Du bist nicht berechtigt, dieses Ticket zu schließen.");
  }

  const actor = await ensureMemberFromDiscordUser(discordUser);
  const result = await closeTicketCore(ticketId, actor.id);
  if (!result.ok) return ephemeral(`❌ ${result.error}`);

  const actorLabel = discordUser.global_name ?? discordUser.username;
  return ephemeral(`🔒 Ticket geschlossen von ${actorLabel}.`);
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

/** "/abo setzen" - direktes Setzen des Abo-Pakets eines Mitglieds, ohne auf eine Ablauf-Erinnerung zu warten. */
async function handleAboCommand(interaction: DiscordInteractionPayload, invokerRoles: string[]) {
  if (!hasStaffRole(invokerRoles)) {
    return ephemeral("Nur Aufsichtspersonen und Owner können Abos ändern.");
  }

  const subcommand = interaction.data?.options?.[0];
  if (subcommand?.name !== "setzen") return ephemeral("Unbekannter Abo-Befehl.");

  const targetDiscordId = subcommand.options?.find((o) => o.name === "user")?.value;
  const planId = subcommand.options?.find((o) => o.name === "paket")?.value;
  if (!targetDiscordId || !planId) return ephemeral("Bitte Person und Paket angeben.");

  const target = await prisma.member.findUnique({ where: { discordId: targetDiscordId } });
  if (!target) return ephemeral("Für diese Person existiert noch keine Akte.");

  const discordUser = interaction.member?.user ?? interaction.user;
  const actor = discordUser ? await prisma.member.findUnique({ where: { discordId: discordUser.id } }) : null;

  const result = await setSubscriptionPlanCore(target.id, planId, actor?.id ?? null);
  if (!result.ok) return ephemeral(`❌ ${result.error}`);

  return ephemeral(
    `✅ Abo von ${target.displayName} auf ${result.plan.label} gesetzt — läuft jetzt bis ${result.newExpiry.toLocaleDateString("de-DE")}.`
  );
}

/**
 * "/ticket add <user>" - nur innerhalb eines Ticket-Kanals nutzbar. Nur der
 * Owner oder die Person, die das Ticket geclaimt hat, darf weitere Leute
 * hinzufuegen (siehe Plan: Warteschlangen-Modell mit Einzel-Claim-Zugriff).
 */
async function handleTicketAddCommand(interaction: DiscordInteractionPayload, invokerRoles: string[]) {
  const channelId = interaction.channel_id;
  if (!channelId) return ephemeral("Nur innerhalb eines Ticket-Kanals nutzbar.");

  const ticket = await prisma.ticket.findFirst({ where: { discordChannelId: channelId } });
  if (!ticket) return ephemeral("Das ist kein Ticket-Kanal.");

  const discordUser = interaction.member?.user ?? interaction.user;
  const actor = discordUser ? await prisma.member.findUnique({ where: { discordId: discordUser.id } }) : null;

  const isOwner = hasOwnerRole(invokerRoles);
  const isClaimer = Boolean(actor && ticket.claimedById === actor.id);
  if (!isOwner && !isClaimer) {
    return ephemeral("Nur der Owner oder wer das Ticket übernommen hat, kann Leute hinzufügen.");
  }

  const subcommand = interaction.data?.options?.[0];
  const targetDiscordId = subcommand?.options?.find((o) => o.name === "user")?.value;
  if (!targetDiscordId) return ephemeral("Bitte eine Person angeben.");
  if (!ticket.discordChannelId) return ephemeral("Für dieses Ticket existiert kein Discord-Kanal.");

  const result = await grantChannelMemberAccess(ticket.discordChannelId, targetDiscordId);
  if (!result.ok) return ephemeral(`❌ ${result.error}`);

  await logAction({
    actorId: actor?.id ?? null,
    action: "TICKET_MEMBER_ADDED",
    details: `Discord-ID ${targetDiscordId} zu Ticket "${ticket.subject}" hinzugefügt.`,
  });

  return ephemeral(`✅ <@${targetDiscordId}> wurde zum Ticket hinzugefügt.`);
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

  const description = `${status}${permission.ok ? "" : `\n\n⚠️ ${permission.error}`}`;
  const imageUrl = absoluteSiteUrl(item.imageUrl);

  return Response.json({
    type: updateInPlace ? InteractionResponseType.UPDATE_MESSAGE : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: "",
      embeds: [
        {
          title: item.name,
          description,
          color: 0xf2b544,
          ...(imageUrl ? { image: { url: imageUrl } } : {}),
        },
      ],
      flags: EPHEMERAL,
      components: permission.ok ? components : [],
    },
  });
}

/** Baut aus einem relativen Bildpfad (z.B. "/api/uploads/xxx.png") eine fuer Discord-Embeds noetige absolute URL. */
function absoluteSiteUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = process.env.NEXTAUTH_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}${path}`;
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

/**
 * "/meine-ausleihen" - zeigt alle aktuell ausgeliehenen Items der
 * aufrufenden Person direkt mit Rueckgabe-Button, ohne dass man erst wieder
 * durch Kategorie/Item-Auswahl navigieren muss, um an den Button zu kommen.
 */
async function handleMeineAusleihenCommand(discordUser: DiscordInteractionUser) {
  const member = await prisma.member.findUnique({ where: { discordId: discordUser.id } });
  if (!member) return ephemeral("Für deinen Account existiert noch keine Akte. Leih zuerst etwas aus.");

  const activeLoans = await prisma.loan.findMany({
    where: { memberId: member.id, status: LOAN_STATUS.ACTIVE },
    include: { item: true },
    orderBy: { borrowedAt: "asc" },
  });

  if (activeLoans.length === 0) {
    return ephemeral("Du hast aktuell nichts ausgeliehen.");
  }

  const lines = activeLoans.map((loan) => {
    const unixSeconds = Math.floor(loan.borrowedAt.getTime() / 1000);
    return `📦 **${loan.item.name}** — ausgeliehen seit <t:${unixSeconds}:R>`;
  });

  // Discord: max. 5 Buttons pro Zeile, max. 5 Zeilen pro Nachricht.
  const buttonRows = [];
  for (let i = 0; i < activeLoans.length && buttonRows.length < 5; i += 5) {
    buttonRows.push({
      type: 1,
      components: activeLoans.slice(i, i + 5).map((loan) => ({
        type: 2,
        style: 3,
        label: loan.item.name.slice(0, 80),
        custom_id: `${RETURN_PREFIX}${loan.id}`,
      })),
    });
  }

  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `**Deine aktuellen Ausleihen:**\n${lines.join("\n")}\n\nZum Zurückgeben einfach unten klicken:`,
      components: buttonRows,
      flags: EPHEMERAL,
    },
  });
}

async function handleReturn(loanId: string, discordUser: DiscordInteractionUser) {
  const member = await prisma.member.findUnique({ where: { discordId: discordUser.id } });
  if (!member) return ephemeral("Kein Datensatz gefunden.");

  const result = await returnLoanCore(loanId, member.id);
  await refreshPanelsQuietly();

  if (!result.ok) return ephemeral(`❌ ${result.error}`);

  const unixSeconds = Math.floor(result.cooldownEndsAt.getTime() / 1000);
  return ephemeral(
    `✅ **${result.itemName}** zurückgegeben. Danke!\nDu kannst es ab <t:${unixSeconds}:R> wieder ausleihen.`
  );
}
