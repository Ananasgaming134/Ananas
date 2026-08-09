"use client";

import { useRef, useState, useTransition } from "react";
import { searchPriceSourceAction } from "@/app/actions/items";
import { formatCoins } from "@/lib/constants";

type ItemFormValues = {
  name?: string;
  categoryId?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
  sourceKey?: string | null;
  averagePrice?: number | null;
  quantityTotal?: number;
  imageUrl?: string | null;
};

type CategoryOption = { id: string; name: string };

type PriceSourceResult = {
  key: string;
  name: string;
  icon: string | null;
  category: string | null;
  averagePrice: number;
  saleCount: number;
};

export default function ItemForm({
  action,
  initial,
  submitLabel,
  categories,
}: {
  action: (formData: FormData) => void | Promise<void>;
  initial?: ItemFormValues;
  submitLabel: string;
  categories: CategoryOption[];
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [suggestedCategory, setSuggestedCategory] = useState<string | null>(null);
  const [averagePrice, setAveragePrice] = useState(
    initial?.averagePrice !== null && initial?.averagePrice !== undefined
      ? String(initial.averagePrice)
      : ""
  );
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? "");
  const [sourceKey, setSourceKey] = useState(initial?.sourceKey ?? "");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PriceSourceResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startSearch(async () => {
        const res = await searchPriceSourceAction(value);
        if (res.ok) {
          setResults(res.items);
          setSearchError(null);
        } else {
          setResults([]);
          setSearchError(res.error);
        }
      });
    }, 350);
  }

  function pickResult(result: PriceSourceResult) {
    setName(result.name);
    if (result.category) {
      const match = categories.find(
        (c) => c.name.toLowerCase() === result.category!.toLowerCase()
      );
      if (match) {
        setCategoryId(match.id);
        setSuggestedCategory(null);
      } else {
        setSuggestedCategory(result.category);
      }
    }
    setAveragePrice(String(result.averagePrice));
    if (result.icon) setImageUrl(result.icon);
    setSourceKey(result.key);
    setResults([]);
    setQuery("");
  }

  return (
    <form action={action} encType="multipart/form-data" className="card space-y-5 p-6">
      <div className="rounded-lg border border-border bg-surface/60 p-4">
        <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="priceSourceQuery">
          Item aus der Preis-Datenbank suchen &amp; übernehmen
        </label>
        <input
          id="priceSourceQuery"
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="z.B. Elytra, Netherite..."
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
        />
        {isSearching && <p className="mt-2 text-xs text-muted">Suche läuft...</p>}
        {searchError && (
          <p className="mt-2 text-xs text-yellow-500">
            Preisquelle nicht erreichbar: {searchError}
          </p>
        )}
        {results.length > 0 && (
          <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
            {results.map((result) => (
              <li key={result.key}>
                <button
                  type="button"
                  onClick={() => pickResult(result)}
                  className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 text-left text-sm transition hover:border-border hover:bg-surface-2"
                >
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-border bg-surface-2">
                    {result.icon && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={result.icon} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <span className="flex-1 truncate">{result.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {formatCoins(result.averagePrice)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {sourceKey && (
          <p className="mt-2 text-xs text-accent-2">
            Mit Preisquelle verknüpft &ndash; Preis kann später automatisch aktualisiert werden.
          </p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="name">
          Name *
        </label>
        <input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSourceKey("");
          }}
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
        />
        <input type="hidden" name="sourceKey" value={sourceKey} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-medium text-muted" htmlFor="categoryId">
              Kategorie
            </label>
            <a
              href="/dashboard/verwaltung/items/kategorien"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:underline"
            >
              Kategorien verwalten
            </a>
          </div>
          <select
            id="categoryId"
            name="categoryId"
            value={categoryId ?? ""}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
          >
            <option value="">Ohne Kategorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {suggestedCategory && (
            <p className="mt-1.5 text-xs text-yellow-500">
              Vorschlag aus der Preis-Datenbank: „{suggestedCategory}“ &ndash; gibt es als
              Kategorie noch nicht, bitte passende wählen oder anlegen.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="quantityTotal">
            Stückzahl
          </label>
          <input
            id="quantityTotal"
            name="quantityTotal"
            type="number"
            min={1}
            defaultValue={initial?.quantityTotal ?? 1}
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="description">
          Beschreibung
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={initial?.description ?? ""}
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="averagePrice">
            Durchschnittspreis
          </label>
          <input
            id="averagePrice"
            name="averagePrice"
            type="number"
            min={0}
            value={averagePrice}
            onChange={(e) => {
              setAveragePrice(e.target.value);
              setSourceKey("");
            }}
            placeholder="in Coins"
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="sourceUrl">
            Quelllink (opsucht.net)
          </label>
          <input
            id="sourceUrl"
            name="sourceUrl"
            type="url"
            value={sourceUrl ?? ""}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="imageFile">
            Bild hochladen
          </label>
          <input
            id="imageFile"
            name="imageFile"
            type="file"
            accept="image/*"
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-foreground"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="imageUrl">
            oder Bild-URL
          </label>
          <input
            id="imageUrl"
            name="imageUrl"
            type="url"
            value={imageUrl ?? ""}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
          />
        </div>
      </div>

      {imageUrl && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Bildvorschau</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Item-Bildvorschau"
            className="h-24 w-24 rounded-lg border border-border object-cover"
          />
        </div>
      )}

      <button
        type="submit"
        className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110"
      >
        {submitLabel}
      </button>
    </form>
  );
}
