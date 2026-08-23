"use client";

import { useActionState } from "react";
import { openSupportTicket, type TicketFormState } from "@/app/actions/tickets";

const initialState: TicketFormState = null;

/**
 * Formular fuer ein Support-Ticket von der Website aus. Zeigt Fehler direkt
 * an - vorher verschwanden sie stumm, sodass etwa ein bereits offenes Ticket
 * wie ein kaputter Knopf wirkte.
 */
export default function SupportTicketForm() {
  const [state, formAction, pending] = useActionState(openSupportTicket, initialState);

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        <input
          type="text"
          name="subject"
          required
          maxLength={100}
          placeholder="Worum geht's? (kurz)"
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
        />
        <textarea
          name="description"
          rows={3}
          placeholder="Beschreibung (optional)"
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Wird eröffnet..." : "Ticket eröffnen"}
        </button>
      </form>

      {state?.error && <p className="text-sm text-danger">❌ {state.error}</p>}
      {state?.ok && (
        <p className="text-sm text-accent-2">
          ✅ Ticket eröffnet — du wurdest in Discord zu einem privaten Thread hinzugefügt.
        </p>
      )}
    </div>
  );
}
