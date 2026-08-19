import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import RoleBadge from "@/components/RoleBadge";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/PageHeader";
import { ROLES } from "@/lib/constants";

export default async function MitgliederPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireMember(ROLES.AUFSICHT);
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const mitglieder = await prisma.member.findMany({
    where: query
      ? {
          OR: [
            { discordId: { contains: query } },
            { username: { contains: query } },
            { displayName: { contains: query } },
            { minecraftName: { contains: query } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Verwaltung"
        title="Mitglieder-Archiv"
        description={
          <>
            Dauerhaftes Verzeichnis aller Mitglieder, die jemals eine
            LeihCenter-Rolle hatten &ndash; inklusive freigabe-entzogener und
            ausgeschlossener Mitglieder.
          </>
        }
      />

      <form className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Suche nach Discord-ID, Benutzername oder Minecraft-Name..."
          className="w-full max-w-md rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
        />
        <button
          type="submit"
          className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium transition hover:bg-surface"
        >
          Suchen
        </button>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-2/60 text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Mitglied</th>
              <th className="px-4 py-3 font-medium">Discord-ID</th>
              <th className="px-4 py-3 font-medium">Minecraft-Name</th>
              <th className="px-4 py-3 font-medium">Rolle</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Archiviert am</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mitglieder.map((m) => (
              <tr key={m.id} className="transition hover:bg-surface-2/40">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/akte/${m.id}`} className="hover:underline">
                    <span className="font-medium">{m.displayName}</span>
                    <span className="ml-2 text-xs text-muted">@{m.username}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted">{m.discordId}</td>
                <td className="px-4 py-3 text-muted">{m.minecraftName || "-"}</td>
                <td className="px-4 py-3">
                  <RoleBadge role={m.role} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={m.status} />
                </td>
                <td className="px-4 py-3 text-muted">
                  {m.createdAt.toLocaleDateString("de-DE")}
                </td>
              </tr>
            ))}
            {mitglieder.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Keine Einträge gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
