import { after } from "next/server";
import { InteractionResponseType, InteractionType, verifyKey } from "discord-interactions";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { borrowItemCore, returnLoanCore } from "@/lib/loans";
import {
  buildCategoryItemSelectPayload,
  buildItemSearchResultPayload,
  postOrUpdatePanel,
  postOrUpdateTicketPanel,
  refreshPanelsQuietly,
  syncCategoryChannelsQuietly,
} from "@/lib/discordPanel";
import { RENEW_PREFIX, renewOwnSubscriptionCore, setSubscriptionPlanCore } from "@/lib/subscriptions";
import { applyAndOpenTicketCore } from "@/lib/applications";
import {
  approvePlanChangeCore,
  findPendingRequestByDiscordId,
  findPendingRequestByTicket,
  rejectPlanChangeCore,
} from "@/lib/planChanges";
import {
  TICKET_PANEL_CHANNEL_ID,
  addThreadMember,
  canClaimTicket,
  grantChannelMemberAccess,
  isTicketOwner,
} from "@/lib/discord";
import {
  TICKET_CATEGORY,
  canManageTicket,
  claimTicketCore,
  closeTicketCore,
  createTicketCore,
  declineTicketCloseCore,
  requestTicketCloseCore,
  type TicketCategoryValue,
} from "@/lib/tickets";
import {
  BEWERBUNG_MODAL_PREFIX,
  BORROW_PREFIX,
  CATEGORY_ITEM_SELECT_ID,
  CATEGORY_PAGE_PREFIX,
  CHANNEL_ITEM_SELECT_ID,
  FORCE_RETURN_PREFIX,
  ITEM_SEARCH_MODAL_ID,
  ITEM_SEARCH_PAGE_PREFIX,
  ITEM_SEARCH_SELECT_ID,
  MY_LOANS_BUTTON_ID,
  PANEL_CATEGORY_SELECT_ID,
  PANEL_SEARCH_BUTTON_ID,
  PANEL_SELECT_ID,
  RETURN_PREFIX,
  SUPPORT_MODAL_ID,
  TICKET_CLAIM_PREFIX,
  TICKET_CLOSE_PREFIX,
  TICKET_CLOSE_CONFIRM_PREFIX,
  TICKET_CLOSE_DECLINE_PREFIX,
  TICKET_CLOSE_REQUEST_PREFIX,
  TICKET_OPEN_BEWERBUNG_ID,
  TICKET_OPEN_SUPPORT_ID,
  TICKET_OPEN_VERLEIH_ID,
  TICKET_PLAN_SELECT_ID,
  RENEW_SELECT_ID,
  VERLEIH_MODAL_ID,
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
import { getGeneralStats, getPersonalStats, rankedToLines } from "@/lib/stats";
import { verifyMemberCore } from "@/lib/verification";
import {
  LOAN_CHANNEL,
  LOAN_STATUS,
  MEMBER_STATUS,
  SITE_NAME,
  SUBSCRIPTION_PLANS,
  formatCoins,
  getSubscriptionPlan,
} from "@/lib/constants";

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

/**
 * Discord verlangt eine Antwort innerhalb von 3 Sekunden, sonst gilt die
 * Interaktion als fehlgeschlagen - fuer den Nutzer sieht es dann so aus, als
 * haette der Klick nichts bewirkt. Ticket-Aktionen brauchen mehrere
 * Discord-Aufrufe hintereinander und liegen damit gefaehrlich nah an der
 * Grenze.
 *
 * Deshalb wird sofort "denkt nach" geantwortet (Typ 5) und die eigentliche
 * Arbeit per after() nach dem Senden der Antwort erledigt. Das Ergebnis wird
 * anschliessend in die urspruengliche Antwort nachgetragen - dafuer laesst
 * Discord 15 Minuten Zeit.
 */
function deferAndRun(
  interaction: DiscordInteractionPayload,
  work: () => Promise<string>,
  /**
   * "update" ersetzt die Nachricht, an der das Auswahlmenue haengt, und
   * entfernt dabei die Bedienelemente - sonst koennte man dasselbe Menue ein
   * zweites Mal benutzen und aus Versehen doppelt buchen.
   */
  mode: "reply" | "update" = "reply"
) {
  const token = interaction.token;

  after(async () => {
    let content: string;
    try {
      content = await work();
    } catch (err) {
      console.error("[interactions] Aktion fehlgeschlagen:", err);
      content = "❌ Da ist etwas schiefgelaufen. Bitte noch einmal versuchen.";
    }

    const appId = process.env.AUTH_DISCORD_ID ?? "";
    if (!appId || !token) return;

    await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "update" ? { content, components: [], embeds: [] } : { content }),
    }).catch((err) => console.error("[interactions] Nachtragen der Antwort fehlgeschlagen:", err));
  });

  return Response.json({
    type:
      mode === "update"
        ? InteractionResponseType.DEFERRED_UPDATE_MESSAGE
        : InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: mode === "update" ? undefined : { flags: EPHEMERAL },
  });
}

async function handleCommand(interaction: DiscordInteractionPayload) {
  const commandName = interaction.data?.name;
  const invokerRoles: string[] = interaction.member?.roles ?? [];

  if (commandName === "setup") {
    return handleSetupCommand(interaction, invokerRoles);
  }

  if (commandName === "setup-tickets") {
    return handleSetupTicketsCommand(interaction, invokerRoles);
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

  if (commandName === "ticket-schliessen") {
    return handleTicketCloseCommand(interaction, invokerRoles);
  }

  if (commandName === "guthaben" || commandName === "profil" || commandName === "verlaengern") {
    const discordUser = interaction.member?.user ?? interaction.user;
    if (!discordUser) return ephemeral("Konnte deinen Discord-Account nicht ermitteln.");
    if (commandName === "guthaben") return handleBalanceCommand(discordUser);
    if (commandName === "profil") return handleProfileCommand(interaction, invokerRoles, discordUser);
    return handleRenewCommand(interaction, discordUser);
  }

  if (commandName === "statistik") {
    const discordUser = interaction.member?.user ?? interaction.user;
    if (!discordUser) return ephemeral("Konnte deinen Discord-Account nicht ermitteln.");
    const sub = interaction.data?.options?.[0]?.name ?? "allgemein";
    return sub === "meine" ? handlePersonalStatsCommand(discordUser) : handleGeneralStatsCommand();
  }

  if (commandName === "verifizieren") {
    const discordUser = interaction.member?.user ?? interaction.user;
    if (!discordUser) return ephemeral("Konnte deinen Discord-Account nicht ermitteln.");
    const name = interaction.data?.options?.find((o) => o.name === "minecraft-name")?.value;
    if (!name) return ephemeral("Bitte deinen Minecraft-Namen angeben.");
    return handleVerifyCommand(discordUser, String(name));
  }

  if (commandName === "ausleihen") {
    if (!hasStaffRole(invokerRoles)) {
      return ephemeral("Nur Aufsichtspersonen und Owner können alle Ausleihen einsehen.");
    }
    return handleAllLoansCommand();
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

/**
 * "/setup-tickets": postet das Ticket-Panel in den fest konfigurierten
 * Ticket-Kanal (TICKET_PANEL_CHANNEL_ID) - unabhaengig davon, wo der Befehl
 * ausgefuehrt wird. Dort entstehen anschliessend auch die Ticket-Threads.
 */
async function handleSetupTicketsCommand(
  interaction: DiscordInteractionPayload,
  invokerRoles: string[]
) {
  if (!isTicketOwner(invokerRoles) && !hasOwnerRole(invokerRoles)) {
    return ephemeral("❌ Du hast nicht die erforderliche Rolle");
  }
  if (!interaction.guild_id) return ephemeral("Nur innerhalb eines Servers nutzbar.");

  const deployment = await prisma.botDeployment.findUnique({ where: { guildId: interaction.guild_id } });
  if (!deployment) {
    return ephemeral("Bitte zuerst „/setup item-panel“ ausführen, um diesen Server einzurichten.");
  }

  await prisma.botDeployment.update({
    where: { id: deployment.id },
    data: { ticketPanelChannelId: TICKET_PANEL_CHANNEL_ID },
  });

  const result = await postOrUpdateTicketPanel(deployment.id);
  const actor = await prisma.member.findUnique({
    where: { discordId: (interaction.member?.user ?? interaction.user)?.id ?? "" },
  });
  await logAction({
    actorId: actor?.id ?? null,
    action: result.ok ? "BOT_TICKET_PANEL_POSTED" : "BOT_TICKET_PANEL_FAILED",
    details: result.ok
      ? `Ticket-Panel in Kanal ${TICKET_PANEL_CHANNEL_ID} gepostet.`
      : `Ticket-Panel fehlgeschlagen: ${result.error}`,
  });

  return ephemeral(
    result.ok
      ? `✅ Ticket-Panel steht in <#${TICKET_PANEL_CHANNEL_ID}>.`
      : `❌ ${result.error}`
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

  // Auswahl in einem oeffentlichen Kategorie-Kanal: IMMER eine neue,
  // ephemere Antwort - sonst wuerde das Panel selbst ueberschrieben.
  if (customId === CHANNEL_ITEM_SELECT_ID) {
    const itemId: string | undefined = interaction.data?.values?.[0];
    if (!itemId) return ephemeral("Kein Item ausgewählt.");
    return respondWithItemActions(itemId, interaction.guild_id, memberRoles, discordUser, false);
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

  if (customId === MY_LOANS_BUTTON_ID) {
    return handleMeineAusleihenCommand(discordUser);
  }

  if (customId === PANEL_SEARCH_BUTTON_ID) {
    return Response.json({
      type: InteractionResponseType.MODAL,
      data: {
        custom_id: ITEM_SEARCH_MODAL_ID,
        title: "Item suchen",
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "query",
                style: 1,
                label: "Wonach suchst du?",
                max_length: 60,
                required: true,
              },
            ],
          },
        ],
      },
    });
  }

  if (customId === ITEM_SEARCH_SELECT_ID) {
    const itemId: string | undefined = interaction.data?.values?.[0];
    if (!itemId) return ephemeral("Kein Item ausgewählt.");
    return respondWithItemActions(itemId, interaction.guild_id, memberRoles, discordUser, true);
  }

  if (customId.startsWith(ITEM_SEARCH_PAGE_PREFIX)) {
    const rest = customId.slice(ITEM_SEARCH_PAGE_PREFIX.length);
    const separatorIndex = rest.indexOf(":");
    const page = parseInt(rest.slice(0, separatorIndex), 10) || 0;
    const query = rest.slice(separatorIndex + 1);
    const payload = await buildItemSearchResultPayload(query, page);
    return Response.json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: { ...payload, flags: EPHEMERAL },
    });
  }

  if (customId.startsWith(BORROW_PREFIX)) {
    const itemId = customId.slice(BORROW_PREFIX.length);
    return handleBorrow(itemId, interaction.guild_id, memberRoles, discordUser);
  }

  if (customId.startsWith(FORCE_RETURN_PREFIX)) {
    const loanId = customId.slice(FORCE_RETURN_PREFIX.length);
    return handleForceReturn(loanId, memberRoles, discordUser);
  }

  if (customId.startsWith(RETURN_PREFIX)) {
    const loanId = customId.slice(RETURN_PREFIX.length);
    return handleReturn(loanId, discordUser);
  }

  if (customId.startsWith(RENEW_PREFIX)) {
    const param = customId.slice(RENEW_PREFIX.length);
    return handleRenew(param, memberRoles, discordUser, interaction);
  }

  // Paket aus der Auswahl von /verlaengern - ersetzt die Auswahl-Nachricht,
  // damit dasselbe Menue nicht zweimal benutzt werden kann.
  if (customId === RENEW_SELECT_ID) {
    const planId = interaction.data?.values?.[0];
    if (!planId) return ephemeral("Kein Paket ausgewählt.");

    const member = await prisma.member.findUnique({ where: { discordId: discordUser.id } });
    if (!member) return ephemeral("Für dich existiert noch keine Akte im LeihCenter.");

    return runRenewal(interaction, member.id, planId, "update");
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

  if (customId === TICKET_OPEN_VERLEIH_ID) {
    return respondWithVerleihModal();
  }

  if (customId.startsWith(TICKET_CLOSE_REQUEST_PREFIX)) {
    const ticketId = customId.slice(TICKET_CLOSE_REQUEST_PREFIX.length);
    return handleTicketCloseRequest(ticketId, memberRoles, discordUser, interaction);
  }

  if (customId.startsWith(TICKET_CLOSE_CONFIRM_PREFIX)) {
    const ticketId = customId.slice(TICKET_CLOSE_CONFIRM_PREFIX.length);
    return handleTicketCloseConfirm(ticketId, discordUser, true, interaction, memberRoles);
  }

  if (customId.startsWith(TICKET_CLOSE_DECLINE_PREFIX)) {
    const ticketId = customId.slice(TICKET_CLOSE_DECLINE_PREFIX.length);
    return handleTicketCloseConfirm(ticketId, discordUser, false, interaction, memberRoles);
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

/**
 * Verleih-Service-Ticket: genau die fuenf Aufnahmefragen. Discord erlaubt
 * maximal fuenf Felder pro Modal - mehr passt hier also bewusst nicht rein.
 */
function respondWithVerleihModal() {
  const field = (customId: string, label: string, maxLength: number, style = 1) => ({
    type: 1,
    components: [{ type: 4, custom_id: customId, style, label, max_length: maxLength, required: true }],
  });

  return Response.json({
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: VERLEIH_MODAL_ID,
      title: "Verleih-Service",
      components: [
        field("age", "Wie alt bist du?", 3),
        field("minecraftName", "Dein Minecraft Name?", 32),
        field("netWorth", "Dein Gesamtvermögen?", 20),
        field("playHours", "Deine Gesamtspielzeit?", 20),
        field("banHistory", "Vorgeschichten in der Bannhistorie?", 500, 2),
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

  if (customId === VERLEIH_MODAL_ID) {
    return handleVerleihSubmit(interaction, discordUser);
  }

  if (customId === ITEM_SEARCH_MODAL_ID) {
    const query = getModalValue(interaction, "query");
    const payload = await buildItemSearchResultPayload(query, 0);
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { ...payload, flags: EPHEMERAL },
    });
  }

  if (customId === SUPPORT_MODAL_ID) {
    const subject = getModalValue(interaction, "subject") || "Support-Anfrage";
    const description = getModalValue(interaction, "description");

    // Thread anlegen, Intro posten und Claim-Meldung senden dauert zusammen
    // rund zwei Sekunden - zu knapp fuer Discords 3-Sekunden-Fenster.
    return deferAndRun(interaction, async () => {
      const member = await prisma.member.findUnique({ where: { discordId: discordUser.id } });
      const result = await createTicketCore({
        category: TICKET_CATEGORY.SUPPORT,
        subject,
        applicantDiscordId: discordUser.id,
        memberId: member?.id ?? null,
        initialMessage: description || undefined,
      });

      return result.ok
        ? "✅ Ticket wurde erstellt — du wurdest zum privaten Thread hinzugefügt."
        : `❌ ${result.error}`;
    });
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

/**
 * Nimmt ein abgesendetes Verleih-Formular entgegen: legt die Bewerbung an
 * (damit sie in der Bewerbungs-Uebersicht landet und dort angenommen werden
 * kann) und oeffnet das zugehoerige Ticket samt privatem Thread. Da das
 * Formular kein Paket abfragt, wird das kleinste Paket vorgemerkt - der Owner
 * legt beim Annehmen ohnehin fest, was tatsaechlich gebucht wird.
 */
async function handleVerleihSubmit(
  interaction: DiscordInteractionPayload,
  discordUser: DiscordInteractionUser
) {
  const minecraftName = getModalValue(interaction, "minecraftName").trim();
  const banHistory = getModalValue(interaction, "banHistory").trim();
  const age = parseInt(getModalValue(interaction, "age").replace(/[^\d]/g, ""), 10);
  const declaredNetWorth = parseInt(getModalValue(interaction, "netWorth").replace(/[^\d]/g, ""), 10);
  const playHours = parseInt(getModalValue(interaction, "playHours").replace(/[^\d]/g, ""), 10);

  if (!minecraftName || !Number.isFinite(age)) {
    return ephemeral("❌ Bitte Alter und Minecraft-Namen gültig ausfüllen.");
  }

  const displayName = discordUser.global_name ?? discordUser.username;

  return deferAndRun(interaction, async () => {
    const result = await applyAndOpenTicketCore({
      discordId: discordUser.id,
      username: discordUser.username,
      displayName,
      avatarUrl: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null,
      reason: banHistory || "—",
      banHistory: banHistory || null,
      declaredNetWorth: Number.isFinite(declaredNetWorth) ? declaredNetWorth : 0,
      requestedPlanId: SUBSCRIPTION_PLANS[0].id,
      source: "DISCORD",
      minecraftName,
      age,
      playHours: Number.isFinite(playHours) ? playHours : 0,
      ticketCategory: TICKET_CATEGORY.VERLEIH,
    });

    return result.ok
      ? "✅ Deine Anfrage ist raus! Du wurdest zu einem privaten Ticket hinzugefügt — dort meldet sich gleich jemand."
      : `❌ ${result.error}`;
  });
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
  if (!canManageTicket(ticket.category as TicketCategoryValue, deployment, memberRoles)) {
    return ephemeral("❌ Du hast nicht die erforderliche Rolle");
  }

  return deferAndRun(interaction, async () => {
    const actor = await ensureMemberFromDiscordUser(discordUser);
    const result = await claimTicketCore(ticketId, actor.id);
    if (!result.ok) return `❌ ${result.error}`;
    return `🙋 Ticket übernommen von ${discordUser.global_name ?? discordUser.username}.`;
  });
}

/**
 * Schliessanfrage: nur der Bearbeiter oder ein Owner darf sie stellen. Owner
 * schliessen damit direkt, alle anderen erst nach Bestaetigung des Erstellers.
 */
async function handleTicketCloseRequest(
  ticketId: string,
  memberRoles: string[],
  discordUser: DiscordInteractionUser,
  interaction: DiscordInteractionPayload
) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return ephemeral("Ticket nicht gefunden.");

  // Nur Aufsicht und Owner - unabhaengig davon, wer geclaimt hat.
  if (!canClaimTicket(memberRoles)) {
    return ephemeral("❌ Du hast nicht die erforderliche Rolle");
  }

  const owner = isTicketOwner(memberRoles);

  // Die Discord-Aktionen dauern gut eine Sekunde; ohne Aufschub laeuft die
  // Interaktion in Discords 3-Sekunden-Grenze und wirkt fuer den Nutzer als
  // waere nichts passiert.
  return deferAndRun(interaction, async () => {
    const actor = await ensureMemberFromDiscordUser(discordUser);

    if (owner) {
      const result = await closeTicketCore(ticketId, actor.id);
      return result.ok ? "🔒 Ticket geschlossen." : `❌ ${result.error}`;
    }

    const result = await requestTicketCloseCore(ticketId, actor.id);
    return result.ok
      ? "📨 Schließanfrage gesendet — der Ersteller bestätigt oder lehnt ab. Ohne Antwort schließt das Ticket in 24 Stunden automatisch."
      : `❌ ${result.error}`;
  });
}

/** Antwort des Erstellers auf die Schliessanfrage (bestaetigen oder ablehnen). */
async function handleTicketCloseConfirm(
  ticketId: string,
  discordUser: DiscordInteractionUser,
  confirmed: boolean,
  interaction: DiscordInteractionPayload,
  memberRoles: string[]
) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return ephemeral("Ticket nicht gefunden.");

  // In erster Linie entscheidet der Ersteller - Owner und Devs duerfen aber
  // ebenfalls bestaetigen oder ablehnen.
  const isCreator = ticket.applicantDiscordId === discordUser.id;
  if (!isCreator && !isTicketOwner(memberRoles)) {
    return ephemeral("Das entscheidet der Ersteller des Tickets (oder ein Owner).");
  }

  return deferAndRun(interaction, async () => {
    if (!confirmed) {
      const result = await declineTicketCloseCore(ticketId);
      return result.ok ? "↩️ Alles klar, das Ticket bleibt offen." : `❌ ${result.error}`;
    }

    const actor = await ensureMemberFromDiscordUser(discordUser);
    const result = await closeTicketCore(ticketId, actor.id);
    return result.ok ? "🔒 Ticket geschlossen. Danke dir!" : `❌ ${result.error}`;
  });
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

  // Abo-Antraege bestaetigen/ablehnen: bevorzugt im Abo-Ticket selbst (dann
  // ist der Antrag eindeutig), sonst per angegebener Person.
  if (subcommand?.name === "bestaetigen" || subcommand?.name === "ablehnen") {
    if (!isTicketOwner(invokerRoles) && !hasOwnerRole(invokerRoles)) {
      return ephemeral("❌ Über Abo-Anträge entscheidet nur der Owner.");
    }

    const discordUser = interaction.member?.user ?? interaction.user;
    if (!discordUser) return ephemeral("Konnte deinen Discord-Account nicht ermitteln.");

    const ticketHere = interaction.channel_id
      ? await prisma.ticket.findFirst({ where: { discordChannelId: interaction.channel_id } })
      : null;
    const targetDiscordId = subcommand.options?.find((o) => o.name === "user")?.value;

    const request = ticketHere
      ? await findPendingRequestByTicket(ticketHere.id)
      : targetDiscordId
        ? await findPendingRequestByDiscordId(String(targetDiscordId))
        : null;

    if (!request) {
      return ephemeral(
        ticketHere
          ? "Zu diesem Ticket gibt es keinen offenen Abo-Antrag."
          : "Kein offener Abo-Antrag gefunden. Nutze den Befehl im Abo-Ticket oder gib die Person an."
      );
    }

    const reason = subcommand.options?.find((o) => o.name === "grund")?.value;
    const approve = subcommand.name === "bestaetigen";

    return deferAndRun(interaction, async () => {
      const actor = await ensureMemberFromDiscordUser(discordUser);
      const result = approve
        ? await approvePlanChangeCore(request.id, actor.id)
        : await rejectPlanChangeCore(request.id, actor.id, reason ? String(reason) : null);

      if (!result.ok) return `❌ ${result.error}`;
      const plan = SUBSCRIPTION_PLANS.find((p) => p.id === request.requestedPlanId);
      return approve
        ? `✅ Abo von ${request.member.displayName} auf ${plan?.label ?? request.requestedPlanId} bestätigt.`
        : `❌ Abo-Antrag von ${request.member.displayName} abgelehnt.`;
    });
  }

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
/** "/guthaben" - eigener Guthabenstand, nur fuer den Aufrufer sichtbar. */
async function handleBalanceCommand(discordUser: DiscordInteractionUser) {
  const member = await prisma.member.findUnique({ where: { discordId: discordUser.id } });
  if (!member) return ephemeral("Für dich existiert noch keine Akte im LeihCenter.");

  const plan = getSubscriptionPlan(member.subscriptionPlan);
  const lines = [
    `**Guthaben:** ${formatCoins(member.balance)}`,
    plan
      ? `**Dein Paket:** ${plan.label} (${formatCoins(plan.price)} pro Verlängerung)`
      : "**Dein Paket:** noch keins gewählt",
    "",
    plan && member.balance >= plan.price
      ? "✅ Reicht für eine Verlängerung — einfach `/verlaengern`."
      : `Zum Aufladen: Business-Card **BC-584289**, Verwendungszweck \`Verleih ${member.customerNumber ?? "-"}\`.`,
  ];

  return ephemeral(lines.join("\n"));
}

/**
 * "/profil" - eigenes Profil. Mit "user"-Option auch fremde Profile, das
 * duerfen aber nur Aufsicht, Admin und Owner.
 */
async function handleProfileCommand(
  interaction: DiscordInteractionPayload,
  invokerRoles: string[],
  discordUser: DiscordInteractionUser
) {
  const requested = interaction.data?.options?.find((o) => o.name === "user")?.value;
  const isStaff = hasStaffRole(invokerRoles) || canClaimTicket(invokerRoles);

  if (requested && String(requested) !== discordUser.id && !isStaff) {
    return ephemeral("❌ Fremde Profile dürfen nur Aufsicht, Admin und Owner ansehen.");
  }

  const targetId = requested ? String(requested) : discordUser.id;
  const member = await prisma.member.findUnique({ where: { discordId: targetId } });
  if (!member) return ephemeral("Für diese Person existiert noch keine Akte.");

  const plan = getSubscriptionPlan(member.subscriptionPlan);
  const now = new Date();
  const active = Boolean(member.feePaidUntil && member.feePaidUntil > now);
  const activeLoans = await prisma.loan.count({
    where: { memberId: member.id, status: LOAN_STATUS.ACTIVE },
  });

  const fields = [
    { name: "Kundennummer", value: member.customerNumber ?? "—", inline: true },
    { name: "Minecraft", value: member.minecraftName || "—", inline: true },
    { name: "Guthaben", value: formatCoins(member.balance), inline: true },
    { name: "Paket", value: plan?.label ?? "keins", inline: true },
    {
      name: "Abo",
      value: member.feePaidUntil
        ? `${active ? "aktiv" : "abgelaufen"} · <t:${Math.floor(member.feePaidUntil.getTime() / 1000)}:d>`
        : "kein Abo",
      inline: true,
    },
    { name: "Aktuell ausgeliehen", value: String(activeLoans), inline: true },
  ];

  if (member.pausedAt) {
    fields.push({ name: "Pausiert", value: member.pauseReason ?? "ja", inline: false });
  }
  if (member.graceUntil && !member.feePaidUntil) {
    fields.push({
      name: "⏳ Abo-Frist",
      value: `läuft <t:${Math.floor(member.graceUntil.getTime() / 1000)}:R> ab`,
      inline: false,
    });
  }

  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: EPHEMERAL,
      embeds: [
        {
          title: `👤 ${member.displayName}`,
          color: active ? 0x3ddc97 : 0xf2b544,
          fields,
          footer: { text: active ? "Ausleihen möglich" : "Ohne aktives Abo kein Ausleihen" },
        },
      ],
    },
  });
}

/** "/verlaengern" - bucht das eigene Paket erneut vom Guthaben ab. */
async function handleRenewCommand(
  interaction: DiscordInteractionPayload,
  discordUser: DiscordInteractionUser
) {
  const member = await prisma.member.findUnique({ where: { discordId: discordUser.id } });
  if (!member) return ephemeral("Für dich existiert noch keine Akte im LeihCenter.");

  const chosen = interaction.data?.options?.find((o) => o.name === "paket")?.value;

  // Ohne ausgewaehltes Paket wird NICHT stillschweigend das bisherige
  // verlaengert - stattdessen kommt dieselbe Auswahl wie auf der Website,
  // damit man bewusst entscheidet (und auch auf einen anderen Tarif wechseln
  // kann).
  if (!chosen) return respondWithRenewSelect(member);

  return runRenewal(interaction, member.id, String(chosen), "reply");
}

/**
 * Paketauswahl zum Verlaengern - zeigt zu jedem Tarif den Preis, das neue
 * Laufzeitende und ob das Guthaben reicht.
 */
function respondWithRenewSelect(member: { balance: number; feePaidUntil: Date | null; subscriptionPlan: string | null }) {
  const now = new Date();
  const base = member.feePaidUntil && member.feePaidUntil > now ? member.feePaidUntil : now;

  const options = SUBSCRIPTION_PLANS.map((plan) => {
    const end = new Date(base);
    end.setMonth(end.getMonth() + plan.months);
    const affordable = member.balance >= plan.price;
    return {
      label: `${plan.label} — ${formatCoins(plan.price)}`,
      value: plan.id,
      description: affordable
        ? `Läuft dann bis ${end.toLocaleDateString("de-DE")}${plan.id === member.subscriptionPlan ? " · dein aktueller Tarif" : ""}`
        : `Guthaben reicht nicht (fehlen ${formatCoins(plan.price - member.balance)})`,
      emoji: { name: affordable ? "✅" : "🚫" },
    };
  });

  const laufzeit = member.feePaidUntil
    ? member.feePaidUntil > now
      ? `Dein Abo läuft noch bis **${member.feePaidUntil.toLocaleDateString("de-DE")}** — die gewählte Dauer kommt oben drauf.`
      : `Dein Abo ist am **${member.feePaidUntil.toLocaleDateString("de-DE")}** abgelaufen.`
    : "Du hast noch kein Abo.";

  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `**Welches Paket möchtest du buchen?**
${laufzeit}
Dein Guthaben: **${formatCoins(member.balance)}**`,
      flags: EPHEMERAL,
      components: [
        {
          type: 1,
          components: [
            {
              type: 3,
              custom_id: RENEW_SELECT_ID,
              placeholder: "Paket auswählen...",
              options,
            },
          ],
        },
      ],
    },
  });
}

/** Bucht das gewaehlte Paket vom Guthaben ab und meldet das Ergebnis zurueck. */
function runRenewal(
  interaction: DiscordInteractionPayload,
  memberId: string,
  planId: string,
  mode: "reply" | "update"
) {
  return deferAndRun(
    interaction,
    async () => {
      const result = await renewOwnSubscriptionCore(memberId, planId);
      if (!result.ok) return `❌ ${result.error}`;
      const unix = Math.floor(result.newExpiry.getTime() / 1000);
      return `✅ **${result.plan.label}** gebucht (${formatCoins(result.plan.price)} abgebucht).
Läuft jetzt bis <t:${unix}:D> (<t:${unix}:R>).`;
    },
    mode
  );
}

/**
 * Schliessanfrage fuer das Ticket, in dessen Thread der Befehl ausgefuehrt
 * wird. Erreichbar als "/ticket-schliessen" und als "/ticket schliessen" -
 * der eigenstaendige Befehl existiert, weil "/ticket" mit gleichnamigen
 * Befehlen anderer Bots kollidieren kann und dann im Client fehlt.
 *
 * Schliesst nie direkt: der Ersteller (oder ein Owner) bestaetigt, sonst
 * greift nach 24 Stunden die Automatik.
 */
async function handleTicketCloseCommand(
  interaction: DiscordInteractionPayload,
  invokerRoles: string[]
) {
  const channelId = interaction.channel_id;
  if (!channelId) return ephemeral("Nur innerhalb eines Ticket-Threads nutzbar.");

  const ticket = await prisma.ticket.findFirst({ where: { discordChannelId: channelId } });
  if (!ticket) return ephemeral("Das hier ist kein Ticket-Thread.");
  if (ticket.status === "CLOSED") return ephemeral("Dieses Ticket ist bereits geschlossen.");

  if (!canClaimTicket(invokerRoles)) {
    return ephemeral("❌ Du hast nicht die erforderliche Rolle");
  }

  const discordUser = interaction.member?.user ?? interaction.user;
  if (!discordUser) return ephemeral("Konnte deinen Discord-Account nicht ermitteln.");

  return deferAndRun(interaction, async () => {
    const me = await ensureMemberFromDiscordUser(discordUser);
    const result = await requestTicketCloseCore(ticket.id, me.id);
    return result.ok
      ? "📨 Schließanfrage gestellt — der Ersteller (oder ein Owner) bestätigt. Ohne Antwort schließt das Ticket in 24 Stunden automatisch."
      : `❌ ${result.error}`;
  });
}

async function handleTicketAddCommand(interaction: DiscordInteractionPayload, invokerRoles: string[]) {
  const channelId = interaction.channel_id;
  if (!channelId) return ephemeral("Nur innerhalb eines Ticket-Kanals nutzbar.");

  const ticket = await prisma.ticket.findFirst({ where: { discordChannelId: channelId } });
  if (!ticket) return ephemeral("Das ist kein Ticket-Kanal.");

  const discordUser = interaction.member?.user ?? interaction.user;
  const actor = discordUser ? await prisma.member.findUnique({ where: { discordId: discordUser.id } }) : null;

  const subcommandName = interaction.data?.options?.[0]?.name;
  if (subcommandName === "schliessen") {
    return handleTicketCloseCommand(interaction, invokerRoles);
  }

  const isOwner = hasOwnerRole(invokerRoles) || isTicketOwner(invokerRoles);
  const isClaimer = Boolean(actor && ticket.claimedById === actor.id);
  if (!isOwner && !isClaimer) {
    return ephemeral("Nur der Owner oder wer das Ticket übernommen hat, kann Leute hinzufügen.");
  }

  const subcommand = interaction.data?.options?.[0];
  const targetDiscordId = subcommand?.options?.find((o) => o.name === "user")?.value;
  if (!targetDiscordId) return ephemeral("Bitte eine Person angeben.");
  if (!ticket.discordChannelId) return ephemeral("Für dieses Ticket existiert kein Discord-Kanal.");

  // Tickets laufen als Thread (dort zaehlt die Thread-Mitgliedschaft) oder als
  // eigener Kanal (dort die Kanal-Berechtigung) - beides versuchen, es muss
  // nur eines davon greifen.
  const asThread = await addThreadMember(ticket.discordChannelId, targetDiscordId);
  const asChannel = await grantChannelMemberAccess(ticket.discordChannelId, targetDiscordId);
  if (!asThread.ok && !asChannel.ok) return ephemeral(`❌ ${asChannel.error}`);

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
  await syncCategoryChannelsQuietly();

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
  await syncCategoryChannelsQuietly();

  if (!result.ok) return ephemeral(`❌ ${result.error}`);

  const unixSeconds = Math.floor(result.cooldownEndsAt.getTime() / 1000);
  return ephemeral(
    `✅ **${result.itemName}** zurückgegeben. Danke!\nDu kannst es ab <t:${unixSeconds}:R> wieder ausleihen.`
  );
}

/** "/verifizieren <name>" - prueft den Namen bei Mojang und speichert die UUID. */
async function handleVerifyCommand(discordUser: DiscordInteractionUser, minecraftName: string) {
  const member = await ensureMemberFromDiscordUser(discordUser);
  const result = await verifyMemberCore(member.id, minecraftName, member.id);

  return ephemeral(
    result.ok
      ? `✅ Verifiziert als **${result.minecraftName}**. Du kannst jetzt ausleihen.`
      : `❌ ${result.error}`
  );
}

/** "/statistik allgemein" - dieselben Zahlen wie die Statistik-Seite der Website. */
async function handleGeneralStatsCommand() {
  const stats = await getGeneralStats();

  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: EPHEMERAL,
      embeds: [
        {
          title: `📊 ${SITE_NAME} — Statistik`,
          color: 0xf2b544,
          fields: [
            { name: "🔥 Die gefragtesten Items", value: rankedToLines(stats.topItems) },
            { name: "🏷️ Die gefragtesten Kategorien", value: rankedToLines(stats.topCategories) },
            {
              name: "📡 Überblick",
              value:
                `Ausleihen insgesamt: **${stats.totalLoans}**\n` +
                `Aktuell ausgeliehen: **${stats.activeLoans}**\n` +
                `Items im Bestand: **${stats.itemCount}** in ${stats.categoryCount} Kategorien\n` +
                `Über Website: **${stats.webLoans}** · über Discord: **${stats.discordLoans}**`,
            },
          ],
          footer: { text: "Mehr Details auf der Website unter „Statistik“." },
        },
      ],
    },
  });
}

/** "/statistik meine" - nur die eigenen Zahlen der aufrufenden Person. */
async function handlePersonalStatsCommand(discordUser: DiscordInteractionUser) {
  const member = await prisma.member.findUnique({ where: { discordId: discordUser.id } });
  if (!member) return ephemeral("Für dich ist noch kein Konto hinterlegt.");

  const stats = await getPersonalStats(member.id);
  if (stats.totalLoans === 0) return ephemeral("Du hast bisher noch nichts ausgeliehen.");

  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: EPHEMERAL,
      embeds: [
        {
          title: `📊 Deine Statistik — ${member.displayName}`,
          color: 0x3ddc97,
          fields: [
            { name: "⭐ Deine Lieblings-Items", value: rankedToLines(stats.topItems) },
            { name: "📂 Deine Lieblings-Kategorien", value: rankedToLines(stats.topCategories) },
            {
              name: "📦 Überblick",
              value:
                `Ausleihen insgesamt: **${stats.totalLoans}**\n` +
                `Aktuell bei dir: **${stats.activeLoans}**` +
                (stats.firstLoanAt
                  ? `\nErste Ausleihe: <t:${Math.floor(stats.firstLoanAt.getTime() / 1000)}:D>`
                  : ""),
            },
          ],
        },
      ],
    },
  });
}

/**
 * "/ausleihen" (Aufsicht/Owner) - listet alle aktiven Ausleihen mit einem
 * Ausbuchen-Button je Eintrag, fuer den Fall dass jemand ein Item abgegeben,
 * aber vergessen hat es selbst zurueckzugeben.
 */
async function handleAllLoansCommand() {
  const loans = await prisma.loan.findMany({
    where: { status: LOAN_STATUS.ACTIVE },
    include: { item: true, member: true },
    orderBy: { borrowedAt: "asc" },
    take: 20,
  });

  if (loans.length === 0) return ephemeral("Aktuell ist nichts ausgeliehen.");

  const description = loans
    .map((loan) => {
      const since = Math.floor(loan.borrowedAt.getTime() / 1000);
      const due = loan.dueAt ? ` · fällig <t:${Math.floor(loan.dueAt.getTime() / 1000)}:R>` : "";
      return `📦 **${loan.item.name}** — ${loan.member.displayName} · seit <t:${since}:R>${due}`;
    })
    .join("\n");

  // Discord erlaubt maximal 5 Action-Rows mit je 5 Buttons.
  const components = [];
  for (let i = 0; i < Math.min(loans.length, 25); i += 5) {
    components.push({
      type: 1,
      components: loans.slice(i, i + 5).map((loan) => ({
        type: 2,
        style: 2,
        label: `Ausbuchen: ${loan.item.name}`.slice(0, 80),
        custom_id: `${FORCE_RETURN_PREFIX}${loan.id}`,
      })),
    });
    if (components.length === 5) break;
  }

  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: EPHEMERAL,
      embeds: [
        {
          title: `📋 ${SITE_NAME} — Alle aktiven Ausleihen`,
          description,
          color: 0x5b8cff,
          footer: { text: `${loans.length} aktive Ausleihe(n)` },
        },
      ],
      components,
    },
  });
}

/** Ausbuchen einer FREMDEN Ausleihe durch Aufsicht/Owner. */
async function handleForceReturn(
  loanId: string,
  memberRoles: string[],
  discordUser: DiscordInteractionUser
) {
  if (!hasStaffRole(memberRoles)) {
    return ephemeral("Nur Aufsichtspersonen und Owner können fremde Ausleihen ausbuchen.");
  }

  const actor = await ensureMemberFromDiscordUser(discordUser);
  const result = await returnLoanCore(loanId, actor.id, { allowForeign: true });
  await refreshPanelsQuietly();
  await syncCategoryChannelsQuietly();

  if (!result.ok) return ephemeral(`❌ ${result.error}`);
  return ephemeral(`✅ **${result.itemName}** wurde für das Mitglied ausgebucht.`);
}
