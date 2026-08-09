import { NextResponse } from "next/server";
import { processLoanReminders } from "@/lib/loanReminders";

/**
 * Wird per System-Crontab auf dem Server jede Minute aufgerufen (siehe
 * README), um Ausleih-Erinnerungen (30/5 Min., Frist abgelaufen) zu
 * verschicken und bei mehr als 15 Min. Ueberziehung automatisch eine
 * Ausleih-Sperre zu verhaengen. Per Secret-Query-Parameter geschuetzt, damit
 * das nicht von aussen missbraucht werden kann.
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
  return NextResponse.json({ ok: true, ...result });
}
