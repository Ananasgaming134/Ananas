import PageHeader from "@/components/PageHeader";
import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  createCategory,
  deleteCategory,
  renameCategory,
  resendCategoryPanel,
  setCategoryChannel,
} from "@/app/actions/categories";
import { ROLES } from "@/lib/constants";

export default async function KategorienPage() {
  await requireMember(ROLES.OWNER);

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Kategorien"
        description="Zum Einsortieren und Filtern der Items. Jede Kategorie kann ihr eigenes Ausleih-Panel in einem Discord-Kanal haben — die Kanal-ID trägst du hier ein. Das Panel hält sich danach von selbst aktuell."
        action={
          <Link
            href="/dashboard/verwaltung/items"
            className="rounded-lg border border-border px-3 py-2 text-xs font-medium transition hover:bg-surface-2"
          >
            Zurück zu Items
          </Link>
        }
      />

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">Neue Kategorie</h2>
        <form action={createCategory} className="flex items-center gap-2">
          <input
            type="text"
            name="name"
            required
            placeholder="z.B. Werkzeug, Rüstung, Deko"
            className="flex-1 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
          />
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110"
          >
            Anlegen
          </button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="border-b border-border bg-surface-2/60 text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3 font-medium">Discord-Kanal fürs Panel</th>
              <th className="px-4 py-3 font-medium text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {categories.map((category) => (
              <tr key={category.id}>
                <td className="px-4 py-3">
                  <form
                    action={renameCategory.bind(null, category.id)}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      name="name"
                      defaultValue={category.name}
                      required
                      className="w-40 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none ring-accent/40 focus:ring-2"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-accent transition hover:bg-surface-2"
                    >
                      Speichern
                    </button>
                  </form>
                </td>

                <td className="px-4 py-3 text-muted">{category._count.items}</td>

                <td className="px-4 py-3">
                  <form
                    action={setCategoryChannel.bind(null, category.id)}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      name="channelId"
                      inputMode="numeric"
                      defaultValue={category.discordChannelId ?? ""}
                      placeholder="Kanal-ID"
                      className="w-44 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-xs outline-none ring-accent/40 focus:ring-2"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-accent transition hover:bg-surface-2"
                    >
                      Setzen
                    </button>
                  </form>
                  {category.discordChannelId && (
                    <p className="mt-1 text-[11px] text-muted">
                      {category.panelMessageIds
                        ? `Panel steht (${category.panelMessageIds.split(",").length} Nachricht(en))`
                        : "Panel noch nicht gesendet"}
                    </p>
                  )}
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {category.discordChannelId && (
                      <form action={resendCategoryPanel.bind(null, category.id)}>
                        <button
                          type="submit"
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:border-accent/40 hover:bg-surface-2"
                        >
                          Neu senden
                        </button>
                      </form>
                    )}
                    <form action={deleteCategory.bind(null, category.id)}>
                      <button
                        type="submit"
                        className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/20"
                      >
                        Löschen
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Noch keine Kategorien angelegt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card p-5 text-sm text-muted">
        <h2 className="mb-2 text-sm font-semibold text-foreground">So findest du eine Kanal-ID</h2>
        <p>
          In Discord unter Einstellungen → Erweitert den Entwicklermodus einschalten. Danach
          Rechtsklick auf den Kanal → „Kanal-ID kopieren". Ohne hinterlegte ID bleibt die Kategorie
          in Discord einfach unsichtbar — auf der Website ändert sich nichts.
        </p>
        <p className="mt-2">
          Der Kanal selbst gehört dir: Wir legen keine Kanäle mehr an, benennen keine um und löschen
          keine. Wird eine Kategorie gelöscht oder der Kanal gewechselt, räumen wir nur unsere
          eigenen Panel-Nachrichten weg.
        </p>
      </div>

    </div>
  );
}
