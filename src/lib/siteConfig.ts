import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";

/** Fester Einladungslink zum eigenen Discord, bis in der Verwaltung einer hinterlegt wird. */
export const DEFAULT_DISCORD_INVITE = "https://discord.gg/WMfMPc62hv";

/**
 * Startvorlage fuers Impressum. Bewusst mit Platzhaltern in eckigen Klammern
 * statt erfundener Angaben - was hier steht, muss stimmen, sonst schuetzt es
 * niemanden. Wird beim ersten Aufruf angelegt und danach in der Verwaltung
 * bearbeitet.
 */
export const IMPRESSUM_VORLAGE = `## Angaben gemäß § 5 DDG

[Vor- und Nachname]
[Straße und Hausnummer]
[PLZ und Ort]
[Land]

## Kontakt

E-Mail: [E-Mail-Adresse]
Discord: [Discord-Name oder Einladungslink]

## Verantwortlich für den Inhalt

[Vor- und Nachname]
[Anschrift wie oben]

## Art des Angebots

Das OP-LeihCenter ist ein privates, nicht gewerbliches Freizeitprojekt rund um
den Minecraft-Server OPSucht. Verliehen werden ausschließlich virtuelle
Gegenstände innerhalb dieses Spiels. Es findet kein Handel mit realem Geld
statt; sämtliche Beträge und Guthaben beziehen sich auf die Spielwährung.

## Kein Zusammenhang mit OPSucht oder Mojang

Wir sind ein eigenständiges Projekt und weder Betreiber des Servers OPSucht
noch mit diesem, mit Mojang Studios oder mit Microsoft verbunden. „Minecraft"
ist eine Marke von Mojang Studios.

## Haftung für Inhalte

Für eigene Inhalte auf diesen Seiten sind wir nach den allgemeinen Gesetzen
verantwortlich. Wir sind jedoch nicht verpflichtet, übermittelte oder
gespeicherte fremde Informationen zu überwachen oder nach Umständen zu
forschen, die auf eine rechtswidrige Tätigkeit hinweisen.

## Haftung für Links

Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte
wir keinen Einfluss haben. Für die Inhalte der verlinkten Seiten ist stets der
jeweilige Anbieter verantwortlich. Bei Bekanntwerden von Rechtsverletzungen
entfernen wir derartige Links umgehend.

## Urheberrecht

Die durch uns erstellten Inhalte auf diesen Seiten unterliegen dem deutschen
Urheberrecht. Beiträge Dritter sind als solche gekennzeichnet.`;

export const DATENSCHUTZ_VORLAGE = `## Verantwortliche Stelle

[Vor- und Nachname]
[Straße und Hausnummer]
[PLZ und Ort]
E-Mail: [E-Mail-Adresse]

## Welche Daten wir verarbeiten

**Anmeldung über Discord.** Meldest du dich an, erhalten wir von Discord deine
Discord-ID, deinen Benutzernamen, deinen Anzeigenamen, dein Profilbild, deine
E-Mail-Adresse und die Rollen, die du auf unserem Discord-Server hast. Diese
Angaben brauchen wir, um dich zu erkennen und zu prüfen, ob du Zugang hast.

**Nutzung des Verleihs.** Wir speichern, welche Gegenstände du ausleihst und
zurückgibst, deine Laufzeit, dein Guthaben, deinen verifizierten
Minecraft-Namen samt UUID sowie Tickets und Bewertungen, die du schreibst.

**Protokoll.** Aktionen im System werden protokolliert, damit Vorgänge
nachvollziehbar bleiben. Einsehbar ist das nur für Aufsicht und Owner.

## Warum wir das dürfen

Die Verarbeitung erfolgt zur Erfüllung des Nutzungsverhältnisses
(Art. 6 Abs. 1 lit. b DSGVO) sowie zu unserem berechtigten Interesse an einem
nachvollziehbaren und missbrauchsfreien Betrieb (Art. 6 Abs. 1 lit. f DSGVO).

## Wie lange wir speichern

Solange dein Zugang besteht und darüber hinaus so lange, wie es für die
Nachvollziehbarkeit des Verleihs nötig ist. Danach werden die Daten gelöscht
oder anonymisiert.

## Weitergabe

Wir geben keine Daten an Dritte weiter. Für die Anmeldung und die
Benachrichtigungen nutzen wir Discord (Discord Netherlands BV bzw. Discord
Inc.); für Namen und UUID im Spiel fragen wir die öffentliche Schnittstelle von
Mojang ab.

## Cookies

Wir setzen ausschließlich ein technisch notwendiges Cookie, das deine Anmeldung
aufrechterhält. Tracking oder Werbe-Cookies verwenden wir nicht.

## Deine Rechte

Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
Verarbeitung, Datenübertragbarkeit und Widerspruch. Melde dich dafür einfach
bei uns — am schnellsten über ein Support-Ticket auf unserem Discord. Außerdem
kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren.`;

/** Holt die Einstellungen und legt sie beim ersten Aufruf mit den Vorlagen an. */
export async function getSiteConfig() {
  const existing = await prisma.siteConfig.findUnique({ where: { key: "default" } });
  if (existing) return existing;

  return prisma.siteConfig.create({
    data: {
      key: "default",
      impressum: IMPRESSUM_VORLAGE,
      datenschutz: DATENSCHUTZ_VORLAGE,
      discordInviteUrl: DEFAULT_DISCORD_INVITE,
    },
  });
}

/** Einladungslink, immer mit einem brauchbaren Rueckfallwert. */
export async function getDiscordInvite(): Promise<string> {
  const config = await getSiteConfig();
  return config.discordInviteUrl.trim() || DEFAULT_DISCORD_INVITE;
}

export type SiteConfigResult = { ok: true } | { ok: false; error: string };

export async function saveSiteConfigCore(
  input: { impressum: string; datenschutz: string; discordInviteUrl: string },
  actorId: string
): Promise<SiteConfigResult> {
  const invite = input.discordInviteUrl.trim();
  if (invite && !/^https:\/\/(discord\.gg|discord\.com\/invite)\//i.test(invite)) {
    return {
      ok: false,
      error: "Der Einladungslink muss mit https://discord.gg/ oder https://discord.com/invite/ beginnen.",
    };
  }

  await getSiteConfig();
  await prisma.siteConfig.update({
    where: { key: "default" },
    data: {
      impressum: input.impressum,
      datenschutz: input.datenschutz,
      discordInviteUrl: invite,
      updatedById: actorId,
    },
  });

  await logAction({
    actorId,
    action: "SITE_CONFIG_UPDATED",
    details: "Impressum, Datenschutz bzw. Einladungslink geändert.",
  });

  return { ok: true };
}
