"use client";

import { useActionState } from "react";
import { addBlacklistEntry, type BlacklistFormState } from "@/app/actions/blacklist";

const initialState: BlacklistFormState = null;

export default function BlacklistForm() {
  const [state, formAction, pending] = useActionState(addBlacklistEntry, initialState);

  return (
    <div className="space-y-3">
      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="text"
          name="discordId"
          required
          placeholder="Discord-ID *"
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
        />
        <input
          type="text"
          name="minecraftName"
          placeholder="Minecraft-Name"
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
        />
        <input
          type="text"
          name="minecraftUuid"
          placeholder="Minecraft-UUID (bleibt bei Namenswechsel gleich)"
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
        />
        <input
          type="number"
          name="days"
          min={1}
          placeholder="Dauer in Tagen (leer = dauerhaft)"
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
        />
        <textarea
          name="reason"
          required
          rows={2}
          placeholder="Grund *"
          className="sm:col-span-2 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
        />
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Wird eingetragen..." : "Auf die rote Liste setzen"}
          </button>
        </div>
      </form>

      {state?.error && <p className="text-sm text-danger">❌ {state.error}</p>}
      {state?.ok && <p className="text-sm text-accent-2">✅ {state.message}</p>}
    </div>
  );
}
