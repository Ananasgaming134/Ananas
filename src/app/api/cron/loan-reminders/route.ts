import { NextResponse } from "next/server";
import { enforceAccessRules } from "@/lib/accessControl";
import { autoCloseExpiredCloseRequests } from "@/lib/tickets";
import { sendGraceReminders } from "@/lib/accessControl";
import { sendExpiryNotices } from "@/lib/subscriptions";
import { expireBlacklistEntries } from "@/lib/blacklist";
import { syncCategoryChannels } from "@/lib/discordPanel";
import { processLoanReminders } from "@/lib/loanReminders";
import { postSubscriptionReminders } from "@/lib/subscriptions";
import { syncMinecraftNames } from "@/lib/verification";
import { checkForNewPayments } from "@/lib/payments";

/**
 * Wird per System-Crontab auf dem Server jede Minute aufgerufen (siehe
 * README), um Ausleih-Erinnerungen (30/5 Min., Frist abgelaufen) zu
 * verschicken und bei mehr als 15 Min. Ueberziehung automatisch eine
 * Ausleih-Sperre zu verhaengen. Per Secret-Query-Parameter geschuetzt, damit
 * das nicht von aussen missbraucht werden kann.
 *
 * Zusaetzlich laufen hier die stuendlichen Aufgaben mit: Abo-Ablauf-
 * Erinnerungen in den Discord-Abo-Kanal und der Mojang-Namensabgleich. Beide
 * sind selbst gegen Mehrfachausfuehrung abgesichert (subscriptionReminderSentAt
 * bzw. Vergleich gegen den gespeicherten Namen), der Zeitfilter hier spart
 * nur unnoetige Discord-/Mojang-Aufrufe bei minuetlichem Cron.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET nicht konfiguriert." }, { status: 500 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await processLoanReminders();

  // Zugangsregeln laufen bei JEDEM Durchlauf (also minuetlich) mit - abgelaufene
  // Abos, verstrichene Zahlungsfristen und in Discord entfernte Rollen sollen
  // nicht bis zur naechsten vollen Stunde weiterbestehen.
  const access = await enforceAccessRules().catch((err) => ({ error: String(err) }));

  // Unbeantwortete Schliessanfragen greifen nach 24 Stunden automatisch -
  // laeuft minuetlich mit, damit die Frist auf die Minute genau endet.
  const ticketAutoClose = await autoCloseExpiredCloseRequests().catch((err) => ({ error: String(err) }));

  // Benachrichtigungen: Zwischen-Erinnerung zur Abo-Frist, Ablauf-Hinweis
  // einen Tag vorher und das Auslaufen befristeter Sperren.
  // Eingehende Business-Card-Zahlungen erkennen und sofort als Guthaben
  // gutschreiben. Laeuft minuetlich als Netz fuer den Fall, dass die
  // Gateway-Verbindung eine Nachricht verpasst hat (dedupliziert ueber die
  // Discord-Nachrichten-ID, doppelt verbucht wird also nichts).
  const payments = await checkForNewPayments().catch((err) => ({ ok: false, error: String(err) }));

  const graceReminders = await sendGraceReminders().catch((err) => ({ error: String(err) }));
  const expiryNotices = await sendExpiryNotices().catch((err) => ({ error: String(err) }));
  const blacklistExpiry = await expireBlacklistEntries().catch((err) => ({ error: String(err) }));

  const hourly = url.searchParams.get("hourly") === "1" || new Date().getMinutes() === 0;
  let subscriptions: unknown = "übersprungen";
  let nameSync: unknown = "übersprungen";

  let categoryChannels: unknown = "übersprungen";

  if (hourly) {
    // Selbstheilung: geloeschte oder veraltete Panel-Nachrichten in den
    // Kategorie-Kanaelen werden hier wieder hergestellt.
    categoryChannels = await syncCategoryChannels().catch((err) => ({ error: String(err) }));
    subscriptions = await postSubscriptionReminders().catch((err) => ({ ok: false, error: String(err) }));
    nameSync = await syncMinecraftNames().catch((err) => ({ error: String(err) }));
  }

  return NextResponse.json({
    ok: true,
    ...result,
    access,
    ticketAutoClose,
    payments,
    graceReminders,
    expiryNotices,
    blacklistExpiry,
    categoryChannels,
    subscriptions,
    nameSync,
  });
}
