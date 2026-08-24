import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { removeBlacklistEntry, importBlacklist } from "@/app/actions/blacklist";
import BlacklistForm from "@/components/BlacklistForm";
import StatCard from "@/components/StatCard";
import PageHeader from "@/components/PageHeader";
import { hasAtLeastRole, ROLES } from "@/lib/constants";

export default async function RoteListePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const viewer = await requireMember(ROLES.AUFSICHT);
  const isOwner = hasAtLeastRole(viewer.role, ROLES.OWNER);
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const entries = await prisma.applicationBlock.findMany({
    where: query
      ? {
          OR: [
            { discordId: { contains: query } },
            { minecraftName: { contains: query, mode: "insensitive" } },
            { minecraftUuid: { contains: query, mode: "insensitive" } },
            { username: { contains: query, mode: "insensitive" } },
            { reason: { contains: query, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: { blockedAt: "desc" },
  });

  const now = new Date();
  const total = await prisma.applicationBlock.count();
  const permanent = await prisma.applicationBlock.count({ where: { expiresAt: null } });
  const temporary = total - permanent;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Verwaltung"
        title="Rote Liste"
        description="Wer hier steht, kann sich nicht bewerben und kein Verleih-Ticket eröffnen. Support-Tickets bleiben möglich, damit Betroffene sich melden können. Befristete Sperren laufen automatisch aus — die Person bekommt dann eine DM."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Einträge gesamt" value={String(total)} accent="danger" icon="🚫" />
        <StatCard label="Dauerhaft" value={String(permanent)} accent="danger" icon="⛔" />
        <StatCard label="Befristet" value={String(temporary)} icon="⏳" />
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">Neuen Eintrag anlegen</h2>
        <BlacklistForm />
      </div>

      <form className="card flex flex-wrap items-center gap-3 p-4" method="GET">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Nach Discord-ID, Minecraft-Name, UUID oder Grund suchen..."
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110"
        >
          Suchen
        </button>
        {query && (
          <Link
            href="/dashboard/verwaltung/rote-liste"
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-surface-2"
          >
            Zurücksetzen
          </Link>
        )}
      </form>

      {isOwner && (
        <form action={importBlacklist} className="card flex flex-wrap items-center gap-3 p-4">
          <p className="min-w-0 flex-1 text-sm text-muted">
            Bestehende Einträge aus dem Blacklist-Kanal übernehmen. Bereits vorhandene bleiben
            unverändert.
          </p>
          <button
            type="submit"
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-surface-2"
          >
            Aus Discord-Kanal einlesen
          </button>
        </form>
      )}

      {entries.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          {query ? "Keine Treffer." : "Die rote Liste ist leer."}
        </div>
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {entries.map((entry) => {
            const expired = entry.expiresAt && entry.expiresAt <= now;
            return (
              <div key={entry.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {entry.minecraftName || entry.displayName || entry.discordId}
                    </p>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        entry.expiresAt
                          ? expired
                            ? "border-border bg-surface-2 text-muted"
                            : "border-yellow-500/40 bg-yellow-500/10 text-yellow-500"
                          : "border-danger/40 bg-danger/10 text-danger"
                      }`}
                    >
                      {entry.expiresAt
                        ? expired
                          ? "abgelaufen"
                          : `befristet bis ${entry.expiresAt.toLocaleDateString("de-DE")}`
                        : "dauerhaft"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{entry.reason}</p>
                  <dl className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted">
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <dt className="shrink-0">Discord</dt>
                      <dd className="min-w-0 break-all font-mono text-foreground">
                        {entry.discordId}
                      </dd>
                    </div>
                    {entry.minecraftUuid && (
                      <div className="flex min-w-0 items-baseline gap-1.5">
                        <dt className="shrink-0">UUID</dt>
                        <dd className="min-w-0 break-all font-mono text-foreground">
                          {entry.minecraftUuid}
                        </dd>
                      </div>
                    )}
                    <div className="flex shrink-0 items-baseline gap-1.5">
                      <dt>Seit</dt>
                      <dd className="tabular-nums">
                        {entry.blockedAt.toLocaleDateString("de-DE")}
                      </dd>
                    </div>
                  </dl>
                </div>
                <form action={removeBlacklistEntry.bind(null, entry.discordId)}>
                  <button
                    type="submit"
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2"
                  >
                    Entfernen
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
