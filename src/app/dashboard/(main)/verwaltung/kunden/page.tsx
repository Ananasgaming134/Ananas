import Link from "next/link";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import StatusBadge from "@/components/StatusBadge";
import StatCard from "@/components/StatCard";
import { activateDiscordMember } from "@/app/actions/members";
import { fetchGuildMembersWithRole, roleIdsFromEnv } from "@/lib/discord";
import { getSubscriptionPlan, LOAN_STATUS, MEMBER_STATUS, ROLES } from "@/lib/constants";

function matches(query: string, ...fields: (string | null | undefined)[]) {
  const q = query.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(q));
}

export default async function KundenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireMember(ROLES.AUFSICHT);
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const dbKunden = await prisma.member.findMany({
    where: { role: ROLES.KUNDE },
    orderBy: { joinedAt: "desc" },
    include: {
      _count: {
        select: { loans: { where: { status: LOAN_STATUS.ACTIVE } } },
      },
    },
  });

  const byDiscordId = new Map(dbKunden.map((k) => [k.discordId, k]));

  // Zusaetzlich alle Discord-Mitglieder mit der Kunde-Rolle abfragen, damit
  // auch Leute auftauchen, die die Rolle in Discord haben, sich aber noch
  // nie auf der Seite eingeloggt haben. Braucht das privilegierte "Server
  // Members Intent" im Discord Developer Portal - ohne das liefert der
  // Aufruf null und wir zeigen nur die lokal bekannten Kunden.
  let discordOnlyFetchFailed = false;
  const kundeRoleIds = roleIdsFromEnv("DISCORD_ROLE_KUNDE");
  const discordOnlyKunden: { discordId: string; username: string; displayName: string; avatarUrl: string | null }[] = [];

  if (kundeRoleIds.length > 0) {
    const seen = new Set<string>();
    for (const roleId of kundeRoleIds) {
      const members = await fetchGuildMembersWithRole(roleId);
      if (members === null) {
        discordOnlyFetchFailed = true;
        continue;
      }
      for (const m of members) {
        if (byDiscordId.has(m.discordId) || seen.has(m.discordId)) continue;
        seen.add(m.discordId);
        discordOnlyKunden.push(m);
      }
    }
  }

  const totalCount = dbKunden.length + discordOnlyKunden.length;
  const activeSubCount = dbKunden.filter(
    (k) => k.subscriptionPlan && k.feePaidUntil && k.feePaidUntil >= new Date()
  ).length;
  const expiredSubCount = dbKunden.filter(
    (k) => k.subscriptionPlan && (!k.feePaidUntil || k.feePaidUntil < new Date())
  ).length;
  const noSubCount = dbKunden.filter((k) => !k.subscriptionPlan).length + discordOnlyKunden.length;

  const filteredDbKunden = query
    ? dbKunden.filter((k) => matches(query, k.displayName, k.username, k.minecraftName))
    : dbKunden;
  const filteredDiscordOnlyKunden = query
    ? discordOnlyKunden.filter((k) => matches(query, k.displayName, k.username))
    : discordOnlyKunden;
  const visibleCount = filteredDbKunden.length + filteredDiscordOnlyKunden.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Kunden</h1>
        <p className="mt-1 text-sm text-muted">
          {query ? `${visibleCount} von ${totalCount} Kunden gefunden.` : `${totalCount} Kunden insgesamt.`}
        </p>
        {discordOnlyFetchFailed && (
          <p className="mt-2 text-xs text-yellow-500">
            Konnte nicht alle Discord-Mitglieder mit der Kunde-Rolle abrufen &ndash;
            es werden nur bereits eingeloggte Kunden angezeigt. Dafür muss im
            Discord Developer Portal bei der Bot-App unter &bdquo;Privileged
            Gateway Intents&ldquo; das &bdquo;Server Members Intent&ldquo;
            aktiviert werden.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Kunden insgesamt" value={String(totalCount)} />
        <StatCard label="Aktive Abos" value={String(activeSubCount)} accent="accent-2" />
        <StatCard label="Abgelaufene Abos" value={String(expiredSubCount)} accent="danger" />
        <StatCard label="Kein Abo" value={String(noSubCount)} />
      </div>

      <form className="card flex flex-wrap items-center gap-3 p-4" method="GET">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Nach Name, Discord- oder Minecraft-Namen suchen..."
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
            href="/dashboard/verwaltung/kunden"
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-surface-2"
          >
            Zurücksetzen
          </Link>
        )}
      </form>

      {visibleCount === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          {query ? "Keine Kunden gefunden." : "Noch keine Kunden vorhanden."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDbKunden.map((kunde) => {
            const plan = getSubscriptionPlan(kunde.subscriptionPlan);
            const expired = kunde.feePaidUntil ? kunde.feePaidUntil < new Date() : true;
            return (
              <Link
                key={kunde.id}
                href={`/dashboard/akte/${kunde.id}`}
                className={`card card-hover flex flex-col gap-3 p-4 ${
                  plan && expired ? "border-l-4 border-l-danger" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  {kunde.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={kunde.avatarUrl}
                      alt={kunde.displayName}
                      className="h-11 w-11 shrink-0 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-sm">
                      {kunde.displayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{kunde.displayName}</p>
                    <p className="truncate text-xs text-muted">@{kunde.username}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={kunde.status} />
                  {plan ? (
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        expired
                          ? "border-danger/40 bg-danger/10 text-danger"
                          : "border-accent-2/40 bg-accent-2/10 text-accent-2"
                      }`}
                    >
                      {plan.label}
                      {expired ? " (abgelaufen)" : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">
                      kein Abo
                    </span>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 border-t border-border pt-3 text-xs">
                  <div>
                    <dt className="text-muted">Minecraft-Name</dt>
                    <dd className="truncate">{kunde.minecraftName || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Aktiv ausgeliehen</dt>
                    <dd>{kunde._count.loans}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted">Mitglied seit</dt>
                    <dd>{kunde.joinedAt.toLocaleDateString("de-DE")}</dd>
                  </div>
                </dl>
              </Link>
            );
          })}
          {filteredDiscordOnlyKunden.map((kunde) => (
            <form key={kunde.discordId} action={activateDiscordMember}>
              <input type="hidden" name="discordId" value={kunde.discordId} />
              <input type="hidden" name="username" value={kunde.username} />
              <input type="hidden" name="displayName" value={kunde.displayName} />
              <input type="hidden" name="avatarUrl" value={kunde.avatarUrl ?? ""} />
              <button
                type="submit"
                className="card card-hover flex w-full flex-col gap-3 bg-surface/40 p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  {kunde.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={kunde.avatarUrl}
                      alt={kunde.displayName}
                      className="h-11 w-11 shrink-0 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-sm">
                      {kunde.displayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{kunde.displayName}</p>
                    <p className="truncate text-xs text-muted">@{kunde.username}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={MEMBER_STATUS.ACTIVE} />
                  <span className="text-[11px] text-muted">Noch nicht eingeloggt &ndash; zum Öffnen klicken</span>
                </div>
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
