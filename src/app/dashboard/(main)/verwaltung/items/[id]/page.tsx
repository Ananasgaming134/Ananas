import PageHeader from "@/components/PageHeader";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { deleteItem, toggleItemAvailability, updateItem } from "@/app/actions/items";
import ItemForm from "@/components/ItemForm";
import { ROLES } from "@/lib/constants";

export default async function ItemBearbeitenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireMember(ROLES.OWNER);
  const { id } = await params;

  const [item, categories] = await Promise.all([
    prisma.item.findUnique({ where: { id } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!item) notFound();

  const boundAction = updateItem.bind(null, item.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Item bearbeiten" description={item.name} />
      <ItemForm
        action={boundAction}
        initial={item}
        submitLabel="Änderungen speichern"
        categories={categories}
      />

      {/* Verfuegbarkeit steht hier statt in der Item-Liste: dort war fuer das
          Grund-Feld kein Platz, es hat die Aktionen-Spalte aus der Tabelle
          geschoben. */}
      <div
        className={`card p-5 ${item.unavailable ? "border-danger/40 bg-danger/5" : ""}`}
      >
        <h2 className="text-sm font-semibold">Verfügbarkeit</h2>

        {item.unavailable ? (
          <>
            <p className="mt-1 text-sm text-danger">
              Dieses Item ist derzeit gesperrt und kann nicht ausgeliehen werden.
            </p>
            {item.unavailableReason && (
              <p className="mt-1 text-sm text-muted">
                Angegebener Grund: <span className="text-foreground">{item.unavailableReason}</span>
              </p>
            )}
            <form action={toggleItemAvailability.bind(null, item.id)} className="mt-4">
              <button
                type="submit"
                className="rounded-lg border border-accent-2/40 bg-accent-2/10 px-4 py-2 text-sm font-medium text-accent-2 transition hover:bg-accent-2/20"
              >
                Wieder freigeben
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              Gesperrte Items bleiben sichtbar, lassen sich aber nicht ausleihen — auf der Website
              und in Discord. Der Grund steht dann bei der Kachel.
            </p>
            <form action={toggleItemAvailability.bind(null, item.id)} className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">
                  Grund (optional, für alle sichtbar)
                </span>
                <input
                  type="text"
                  name="reason"
                  placeholder="z.B. verliehen an Event, in Reparatur, verloren gegangen"
                  className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/20"
              >
                Item sperren
              </button>
            </form>
          </>
        )}
      </div>

      {/* Loeschen steht hier statt in der Liste: dort war die Zeile zu breit
          fuer den Kasten, und ein Verklicken in einer langen Liste waere bei
          einer nicht umkehrbaren Aktion besonders aergerlich. */}
      <div className="card border-danger/30 p-5">
        <h2 className="text-sm font-semibold text-danger">Item löschen</h2>
        <p className="mt-1 text-sm text-muted">
          Entfernt <span className="text-foreground">{item.name}</span> dauerhaft aus dem Bestand,
          samt Bild und Ausleihhistorie. Das lässt sich nicht rückgängig machen. Soll das Item nur
          vorübergehend raus, sperr es lieber oben.
        </p>
        <form action={deleteItem.bind(null, item.id)} className="mt-4">
          <button
            type="submit"
            className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/20"
          >
            Endgültig löschen
          </button>
        </form>
      </div>
    </div>
  );
}
