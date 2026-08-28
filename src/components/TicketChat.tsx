"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { sendTicketMessage, type TicketMessageState } from "@/app/actions/ticketMessages";

const initialState: TicketMessageState = null;
const AKTUALISIEREN_MS = 15_000;

export type ChatNachricht = {
  id: string;
  autor: string;
  avatarUrl: string | null;
  istBot: boolean;
  vonWebsite: boolean;
  text: string;
  anhaenge: { url: string; name: string }[];
  zeit: string;
};

/**
 * Gespraechsverlauf eines Tickets mit Antwortfeld. Der Verlauf kommt live aus
 * dem Discord-Thread; solange das Ticket offen ist, wird er im Hintergrund
 * nachgeladen, damit man mitliest, was drueben geschrieben wird.
 */
export default function TicketChat({
  ticketId,
  nachrichten,
  geschlossen,
  darfSchreiben,
}: {
  ticketId: string;
  nachrichten: ChatNachricht[];
  geschlossen: boolean;
  darfSchreiben: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    sendTicketMessage.bind(null, ticketId),
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Nach dem Senden das Feld leeren und den Verlauf sofort neu holen.
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  // Geschlossene Tickets aendern sich nicht mehr - dann auch nicht nachladen.
  useEffect(() => {
    if (geschlossen) return;
    const takt = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, AKTUALISIEREN_MS);
    return () => clearInterval(takt);
  }, [geschlossen, router]);

  return (
    <div className="space-y-4">
      <div className="card divide-y divide-border">
        {nachrichten.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            Noch keine Nachrichten in diesem Ticket.
          </p>
        ) : (
          nachrichten.map((n) => (
            <div key={n.id} className="flex gap-3 p-4">
              {n.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={n.avatarUrl}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full border border-border object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-[10px] font-semibold text-muted">
                  {n.autor.slice(0, 2).toUpperCase()}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium">{n.autor}</span>
                  {n.istBot && (
                    <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted">
                      System
                    </span>
                  )}
                  {n.vonWebsite && (
                    <span className="rounded border border-accent/30 bg-accent/10 px-1 py-0.5 text-[10px] text-accent">
                      Website
                    </span>
                  )}
                  <span className="text-[11px] text-muted">
                    {new Date(n.zeit).toLocaleString("de-DE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </p>

                {n.text && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
                    {n.text}
                  </p>
                )}

                {n.anhaenge.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {n.anhaenge.map((a) => (
                      <a
                        key={a.url}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-border px-2 py-1 text-[11px] text-accent transition hover:bg-surface-2"
                      >
                        📎 {a.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {geschlossen ? (
        <div className="card p-4 text-center text-sm text-muted">
          Dieses Ticket ist geschlossen. Du kannst den Verlauf weiter nachlesen, aber nicht mehr
          antworten. Brauchst du noch etwas, eröffne bitte ein neues Ticket.
        </div>
      ) : darfSchreiben ? (
        <form ref={formRef} action={formAction} className="card space-y-3 p-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Antwort schreiben</span>
            <textarea
              name="text"
              rows={3}
              required
              maxLength={1800}
              placeholder="Deine Nachricht landet direkt im Discord-Ticket."
              className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
            >
              {pending ? "Wird gesendet..." : "Senden"}
            </button>
            {state?.error && <p className="text-xs text-danger">❌ {state.error}</p>}
          </div>
        </form>
      ) : (
        <div className="card p-4 text-center text-sm text-muted">
          Du kannst in diesem Ticket nur mitlesen.
        </div>
      )}
    </div>
  );
}
