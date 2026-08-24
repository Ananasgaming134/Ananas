"use client";

import { useActionState } from "react";
import { saveSiteConfig, type FormState } from "@/app/actions/partners";

const initialState: FormState = null;

const feldClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2";

/**
 * Impressum, Datenschutz und der Einladungslink zum eigenen Discord. Beide
 * Texte erlauben Markdown-Ueberschriften (## Titel) und Absaetze; angezeigt
 * werden sie unter /impressum bzw. /datenschutz.
 */
export default function SiteConfigForm({
  impressum,
  datenschutz,
  discordInviteUrl,
}: {
  impressum: string;
  datenschutz: string;
  discordInviteUrl: string;
}) {
  const [state, formAction, pending] = useActionState(saveSiteConfig, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <div className="card p-5">
        <h2 className="mb-1 text-sm font-semibold">Discord-Einladung</h2>
        <p className="mb-3 text-xs text-muted">
          Wird auf der Startseite im Abschnitt „Komm auf unseren Discord“ verlinkt.
        </p>
        <input
          name="discordInviteUrl"
          type="url"
          defaultValue={discordInviteUrl}
          placeholder="https://discord.gg/..."
          className={feldClass}
        />
      </div>

      <div className="card p-5">
        <h2 className="mb-1 text-sm font-semibold">Impressum</h2>
        <p className="mb-3 text-xs text-muted">
          Alles in eckigen Klammern muss durch echte Angaben ersetzt werden — sonst erfüllt das
          Impressum seinen Zweck nicht. Überschriften mit <span className="font-mono">## Titel</span>,
          Absätze durch eine Leerzeile.
        </p>
        <textarea
          name="impressum"
          rows={18}
          defaultValue={impressum}
          className={`${feldClass} font-mono text-xs leading-relaxed`}
        />
      </div>

      <div className="card p-5">
        <h2 className="mb-1 text-sm font-semibold">Datenschutzerklärung</h2>
        <p className="mb-3 text-xs text-muted">
          Beschreibt, welche Daten das LeihCenter verarbeitet. Auch hier die eckigen Klammern
          ersetzen.
        </p>
        <textarea
          name="datenschutz"
          rows={18}
          defaultValue={datenschutz}
          className={`${feldClass} font-mono text-xs leading-relaxed`}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Wird gespeichert..." : "Speichern"}
        </button>
        {state?.error && <p className="text-xs text-danger">❌ {state.error}</p>}
        {state?.ok && <p className="text-xs text-accent-2">✅ Gespeichert und sofort öffentlich.</p>}
      </div>
    </form>
  );
}
