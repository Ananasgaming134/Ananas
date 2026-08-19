import PageHeader from "@/components/PageHeader";
import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createCategory, deleteCategory, renameCategory } from "@/app/actions/categories";
import { ROLES } from "@/lib/constants";

export default async function KategorienPage() {
  await requireMember(ROLES.OWNER);

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Kategorien"
        description="Zum Einsortieren und Filtern der Items. Nur für Owner sichtbar."
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

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-2/60 text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Items</th>
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
                      className="w-48 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none ring-accent/40 focus:ring-2"
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
                <td className="px-4 py-3 text-right">
                  <form action={deleteCategory.bind(null, category.id)}>
                    <button
                      type="submit"
                      className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/20"
                    >
                      Löschen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted">
                  Noch keine Kategorien angelegt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
