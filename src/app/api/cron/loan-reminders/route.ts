import { NextResponse } from "next/server";
import { enforceAccessRules } from "@/lib/accessControl";
import { processLoanReminders } from "@/lib/loanReminders";
import { postSubscriptionReminders } from "@/lib/subscriptions";
import { syncMinecraftNames } from "@/lib/verification";

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

  const hourly = url.searchParams.get("hourly") === "1" || new Date().getMinutes() === 0;
  let subscriptions: unknown = "übersprungen";
  let nameSync: unknown = "übersprungen";

  if (hourly) {
    subscriptions = await postSubscriptionReminders().catch((err) => ({ ok: false, error: String(err) }));
    nameSync = await syncMinecraftNames().catch((err) => ({ error: String(err) }));
  }

  return NextResponse.json({ ok: true, ...result, access, subscriptions, nameSync });
}
