"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { applyForMembership, searchCatalogItems, type ApplyFormState } from "@/app/actions/applications";
import { formatCoins, type SubscriptionPlan } from "@/lib/constants";

type DeclaredItem = { sourceKey: string | null; name: string; declaredPrice: number; quantity: number };
type SearchResult = { key: string; name: string; averagePrice: number };

const initialState: ApplyFormState = null;

export default function BewerbungForm({ plans }: { plans: SubscriptionPlan[] }) {
  const [state, formAction, pending] = useActionState(applyForMembership, initialState);
  const [reason, setReason] = useState("");
  const [declaredNetWorth, setDeclaredNetWorth] = useState("");
  const [minecraftName, setMinecraftName] = useState("");
  const [age, setAge] = useState("");
  const [playHours, setPlayHours] = useState("");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [items, setItems] = useState<DeclaredItem[]>([]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, startSearch] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startSearch(async () => {
        const res = await searchCatalogItems(value);
        setResults(res);
      });
    }, 350);
  }

  function addItem(item: DeclaredItem) {
    setItems((prev) => [...prev, item]);
    setQuery("");
    setResults([]);
  }

  function addManualItem() {
    if (!manualName.trim()) return;
    addItem({ sourceKey: null, name: manualName.trim(), declaredPrice: Number(manualPrice) || 0, quantity: 1 });
    setManualName("");
    setManualPrice("");
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="reason">
          Warum möchtest du ausleihen? *
        </label>
        <textarea
          id="reason"
          name="reason"
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="minecraftName">
            Minecraft-Name *
          </label>
          <input
            id="minecraftName"
            name="minecraftName"
            required
            value={minecraftName}
            onChange={(e) => setMinecraftName(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="age">
            Alter *
          </label>
          <input
            id="age"
            name="age"
            type="number"
            min={0}
            required
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="playHours">
            Spielstunden *
          </label>
          <input
            id="playHours"
            name="playHours"
            type="number"
            min={0}
            required
            value={playHours}
            onChange={(e) => setPlayHours(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="declaredNetWorth">
          Dein Gesamtvermögen *
        </label>
        <input
          id="declaredNetWorth"
          name="declaredNetWorth"
          type="number"
          min={0}
          required
          value={declaredNetWorth}
          onChange={(e) => setDeclaredNetWorth(e.target.value)}
          placeholder="in Coins"
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
        />
      </div>

      <div className="rounded-lg border border-border bg-surface/60 p-4">
        <p className="mb-2 text-xs font-medium text-muted">
          Items als Vermögensnachweis (optional)
        </p>

        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Item suchen und übernehmen..."
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
        />
        {isSearching && <p className="mt-2 text-xs text-muted">Suche läuft...</p>}
        {results.length > 0 && (
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {results.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => addItem({ sourceKey: r.key, name: r.name, declaredPrice: r.averagePrice, quantity: 1 })}
                  className="flex w-full items-center justify-between rounded-lg border border-transparent px-2 py-1.5 text-left text-sm transition hover:border-border hover:bg-surface-2"
                >
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 text-xs text-muted">{formatCoins(r.averagePrice)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            placeholder="Item manuell eintragen..."
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
          />
          <input
            type="number"
            value={manualPrice}
            onChange={(e) => setManualPrice(e.target.value)}
            placeholder="Preis"
            className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none ring-accent/40 focus:ring-2"
          />
          <button
            type="button"
            onClick={addManualItem}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-surface-2"
          >
            Hinzufügen
          </button>
        </div>

        {items.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {items.map((item, i) => (
              <li
                key={`${item.name}-${i}`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <span className="truncate">{item.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">{formatCoins(item.declaredPrice)}</span>
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="text-xs text-danger hover:underline"
                  >
                    Entfernen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted">Abo-Paket *</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {plans.map((plan) => (
            <label
              key={plan.id}
              className={`cursor-pointer rounded-xl border p-4 text-center transition ${
                planId === plan.id ? "border-accent bg-accent/10" : "border-border bg-surface hover:bg-surface-2"
              }`}
            >
              <input
                type="radio"
                name="requestedPlanIdRadio"
                value={plan.id}
                checked={planId === plan.id}
                onChange={() => setPlanId(plan.id)}
                className="sr-only"
              />
              <p className="text-sm font-semibold">{plan.label}</p>
              <p className="mt-1 text-xs text-muted">{formatCoins(plan.price)}</p>
            </label>
          ))}
        </div>
      </div>

      <input type="hidden" name="requestedPlanId" value={planId} />
      <input type="hidden" name="items" value={JSON.stringify(items)} readOnly />

      {state && !state.ok && state.error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Wird gesendet..." : "Bewerbung einreichen"}
      </button>
    </form>
  );
}
