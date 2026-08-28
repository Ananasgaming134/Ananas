"use client";

import { useActionState, useState } from "react";
import {
  addItemToSet,
  borrowSet,
  deleteSet,
  removeItemFromSet,
  renameSet,
  type SetState,
} from "@/app/actions/itemSets";
import { MAX_SET_ITEMS } from "@/lib/itemSets";

const initialState: SetState = null;

export type SetEintragAnzeige = {
  itemId: string;
  name: string;
  imageUrl: string | null;
  kategorie: string | null;
  ausleihbar: boolean;
  grund?: string;
  schonDraussen: boolean;
};

export type SetAnzeige = {
  id: string;
  name: string;
  eintraege: SetEintragAnzeige[];
  ausleihbar: number;
  schonDraussen: number;
};

export type ItemAuswahl = { id: string; name: string; kategorie: string | null };

/**
 * Ein Set: umbenennen, Items hinzufuegen und entfernen, am Stueck ausleihen.
 *
 * Wichtig ist die Warnung vor dem Ausleihen: sind nicht alle Teile frei, wird
 * das vorher gezeigt - mit Namen und Grund - statt dass man hinterher raetselt,
 * warum nur die Haelfte ankam.
 */
export default function SetCard({
  set,
  alleItems,
}: {
  set: SetAnzeige;
  alleItems: ItemAuswahl[];
}) {
  const [ausleihState, ausleihAction, ausleihPending] = useActionState(
    borrowSet.bind(null, set.id),
    initialState
  );
  const [addState, addAction, addPending] = useActionState(
    addItemToSet.bind(null, set.id),
    initialState
  );
  const [nameState, nameAction, namePending] = useActionState(
    renameSet.bind(null, set.id),
    initialState
  );
  const [bearbeiten, setBearbeiten] = useState(false);

  const gesamt = set.eintraege.length;
  const blockiert = set.eintraege.filter((e) => !e.ausleihbar && !e.schonDraussen);
  const vollstaendig = gesamt > 0 && set.ausleihbar + set.schonDraussen === gesamt;
  const nichtsMoeglich = set.ausleihbar === 0;

  // Was schon im Set ist, muss nicht mehr zur Auswahl stehen.
  const drin = new Set(set.eintraege.map((e) => e.itemId));
  const auswahl = alleItems.filter((i) => !drin.has(i.id));

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {bearbeiten ? (
          <form action={nameAction} className="flex flex-wrap items-center gap-2">
            <input
              name="name"
              defaultValue={set.name}
              maxLength={40}
              required
              className="w-52 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none ring-accent/40 focus:ring-2"
            />
            <button
              type="submit"
              disabled={namePending}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-surface-2"
            >
              Speichern
            </button>
            <button
              type="button"
              onClick={() => setBearbeiten(false)}
              className="text-xs text-muted transition hover:text-foreground"
            >
              Abbrechen
            </button>
          </form>
        ) : (
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{set.name}</h2>
            <p className="mt-0.5 text-xs text-muted">
              {gesamt} von {MAX_SET_ITEMS} Items
              {set.schonDraussen > 0 && ` · ${set.schonDraussen} schon bei dir`}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          {!bearbeiten && (
            <button
              type="button"
              onClick={() => setBearbeiten(true)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2"
            >
              Umbenennen
            </button>
          )}
          <form action={deleteSet.bind(null, set.id)}>
            <button
              type="submit"
              className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
            >
              Löschen
            </button>
          </form>
        </div>
      </div>

      {nameState?.error && <p className="text-xs text-danger">❌ {nameState.error}</p>}

      {gesamt === 0 ? (
        <p className="text-sm text-muted">
          Noch keine Items drin. Such dir unten welche aus — bis zu {MAX_SET_ITEMS} Stück.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {set.eintraege.map((eintrag) => (
            <li key={eintrag.itemId} className="flex items-center gap-3 py-2.5">
              {eintrag.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={eintrag.imageUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-lg border border-border bg-surface-2 object-contain p-0.5"
                />
              ) : (
                <span className="h-9 w-9 shrink-0 rounded-lg border border-border bg-surface-2" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{eintrag.name}</p>
                <p className="truncate text-[11px] text-muted">
                  {eintrag.schonDraussen ? (
                    <span className="text-accent-2">hast du schon ausgeliehen</span>
                  ) : eintrag.ausleihbar ? (
                    <span className="text-accent-2">verfügbar</span>
                  ) : (
                    <span className="text-danger">{eintrag.grund}</span>
                  )}
                  {eintrag.kategorie && ` · ${eintrag.kategorie}`}
                </p>
              </div>

              <form action={removeItemFromSet.bind(null, set.id, eintrag.itemId)}>
                <button
                  type="submit"
                  title="Aus dem Set entfernen"
                  className="rounded-lg border border-border px-2 py-1 text-xs text-muted transition hover:border-danger/40 hover:text-danger"
                >
                  ✕
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {blockiert.length > 0 && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3">
          <p className="text-sm font-medium text-yellow-500">
            ⚠️ Vorsicht: {blockiert.length} von {gesamt} Items können gerade nicht ausgeliehen werden
          </p>
          <ul className="mt-1.5 space-y-1">
            {blockiert.map((e) => (
              <li key={e.itemId} className="text-xs text-muted">
                <span className="text-foreground">{e.name}</span> — {e.grund}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            {nichtsMoeglich
              ? "Aktuell lässt sich aus diesem Set nichts ausleihen."
              : `Du kannst trotzdem die ${set.ausleihbar} verfügbaren ausleihen — oder warten, bis alles frei ist.`}
          </p>
        </div>
      )}

      {gesamt > 0 && (
        <form action={ausleihAction} className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={ausleihPending || nichtsMoeglich}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              vollstaendig
                ? "bg-accent text-black hover:brightness-110"
                : "border border-yellow-500/40 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20"
            }`}
          >
            {ausleihPending
              ? "Wird ausgeliehen..."
              : nichtsMoeglich
                ? "Gerade nichts verfügbar"
                : vollstaendig
                  ? "Set ausleihen"
                  : `Nur die ${set.ausleihbar} verfügbaren ausleihen`}
          </button>

          {ausleihState?.error && <p className="text-xs text-danger">❌ {ausleihState.error}</p>}
          {ausleihState?.ok && <p className="text-xs text-accent-2">✅ {ausleihState.hinweis}</p>}
        </form>
      )}

      {gesamt < MAX_SET_ITEMS && (
        <form action={addAction} className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <select
            name="itemId"
            required
            defaultValue=""
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
          >
            <option value="" disabled>
              Item auswählen...
            </option>
            {auswahl.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.kategorie ? ` — ${item.kategorie}` : ""}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={addPending}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:border-accent/40 hover:bg-surface-2 disabled:opacity-60"
          >
            {addPending ? "Wird hinzugefügt..." : "Hinzufügen"}
          </button>
          {addState?.error && <p className="text-xs text-danger">❌ {addState.error}</p>}
        </form>
      )}
    </div>
  );
}
