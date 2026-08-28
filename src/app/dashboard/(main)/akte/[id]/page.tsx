import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  addMemberNote,
  banMember,
  lockMember,
  reinstateAccess,
  revokeAccess,
  unlockMember,
  updateMinecraftName,
} from "@/app/actions/members";
import RoleBadge from "@/components/RoleBadge";
import StatusBadge from "@/components/StatusBadge";
import StatCard from "@/components/StatCard";
import ElapsedTime from "@/components/ElapsedTime";
import LoanCountdown from "@/components/LoanCountdown";
import ItemCard from "@/components/ItemCard";
import AboAssignForm from "@/components/AboAssignForm";
import BalanceAdjustForm from "@/components/BalanceAdjustForm";
import VerifyForm from "@/components/VerifyForm";
import SanctionForm from "@/components/SanctionForm";
import {
  AboGewaehrenForm,
  EigenesAboForm,
  GeldstrafeForm,
  RechteSperrenForm,
} from "@/components/DisziplinPanel";
import { unblockRights, cancelFine } from "@/app/actions/discipline";
import { unverifyMember } from "@/app/actions/verification";
import { removeSanction } from "@/app/actions/sanctions";
import { SANCTION_TYPE_LABELS } from "@/lib/sanctions";
import {
  canManage,
  formatCoins,
  getSubscriptionPlan,
  hasAtLeastRole,
  LOAN_STATUS,
  LOAN_STATUS_LABELS,
  MEMBER_STATUS,
  ROLES,
  SUBSCRIPTION_PLANS,
  planMonthlyRate,
  subtractPlanDuration,
} from "@/lib/constants";

export default async function AktePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireMember();
  const { id } = await params;

  const isSelf = viewer.id === id;
  const isAufsichtPlus = hasAtLeastRole(viewer.role, ROLES.AUFSICHT);
  if (!isSelf && !isAufsichtPlus) redirect("/dashboard/akte");

  const target = await prisma.member.findUnique({ where: { id } });
  if (!target) notFound();

  // Die Merkliste ist persoenlich - sie wird nur im eigenen Profil geladen
  // und angezeigt, nicht wenn die Aufsicht eine fremde Akte oeffnet.
  const [loans, notes, suspensionEvents, sanctions, merkliste, aktiveAusleihenGesamt, strafen] =
    await Promise.all([
    prisma.loan.findMany({
      where: { memberId: target.id },
      include: { item: true },
      orderBy: { borrowedAt: "desc" },
    }),
    isAufsichtPlus
      ? prisma.memberNote.findMany({
          where: { memberId: target.id },
          include: { author: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.auditLog.findMany({
      where: { targetId: target.id, action: "BORROW_SUSPENDED" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.sanction.findMany({
      where: { memberId: target.id },
      include: { issuedBy: true },
      orderBy: { createdAt: "desc" },
    }),
    isSelf
      ? prisma.favorite.findMany({
          where: { memberId: target.id },
          include: { item: { include: { category: true } } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    isSelf
      ? prisma.loan.groupBy({
          by: ["itemId"],
          where: { status: LOAN_STATUS.ACTIVE },
          _count: { itemId: true },
        })
      : Promise.resolve([]),
    prisma.fine.findMany({ where: { memberId: id }, orderBy: { createdAt: "desc" } }),
    ]);

  const belegtProItem = new Map(aktiveAusleihenGesamt.map((l) => [l.itemId, l._count.itemId]));
  const eigeneAktive = new Map(
    loans.filter((l) => l.status === LOAN_STATUS.ACTIVE).map((l) => [l.itemId, l])
  );
  const jetzt = new Date();
  const merkSperren = {
    gesperrt: Boolean(target.borrowSuspendedUntil && target.borrowSuspendedUntil > jetzt),
    pausiert: Boolean(target.pausedAt),
    ohneAbo: !target.pausedAt && (!target.feePaidUntil || target.feePaidUntil < jetzt),
    unverifiziert: !target.verifiedAt,
  };

  // Verstoesse = verspaetet zurueckgegebene Ausleihen (returnedAt nach dueAt)
  // plus jede tatsaechlich verhaengte Ausleih-Sperre - alles aus vorhandenen
  // Daten hergeleitet, keine zusaetzliche Tabelle noetig.
  const lateReturns = loans.filter((l) => l.dueAt && l.returnedAt && l.returnedAt > l.dueAt);
  const isCurrentlySuspended = Boolean(target.borrowSuspendedUntil && target.borrowSuspendedUntil > new Date());

  const boundAddNote = addMemberNote.bind(null, target.id);
  const boundRevoke = revokeAccess.bind(null, target.id);
  const boundBan = banMember.bind(null, target.id);
  const boundReinstate = reinstateAccess.bind(null, target.id);
  const boundUpdateMinecraftName = updateMinecraftName.bind(null, target.id);
  const boundLock = lockMember.bind(null, target.id);
  const boundUnlock = unlockMember.bind(null, target.id);
  const showManageActions = isAufsichtPlus && !isSelf && canManage(viewer.role, target.role);
  const showOwnerActions = hasAtLeastRole(viewer.role, ROLES.OWNER) && !isSelf && canManage(viewer.role, target.role);
  // Guthaben-Buchung ist bewusst weniger streng als showOwnerActions: der
  // Owner soll auch bei sich selbst (einzige/erste Zeit ohne weitere
  // Kunden) und bei Kollegen auf gleicher Stufe manuell buchen koennen.
  const canAdjustBalance = hasAtLeastRole(viewer.role, ROLES.OWNER);

  const currentPlan = getSubscriptionPlan(target.subscriptionPlan);
  const now = new Date();
  const isExpired = target.feePaidUntil ? target.feePaidUntil < now : true;
  const daysLeft = target.feePaidUntil
    ? Math.ceil((target.feePaidUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Fortschritt der aktuellen Laufzeit (fuer die Abo-Fortschrittsanzeige im
  // Profil) - der Laufzeit-Start wird aus feePaidUntil minus Paket-Laufzeit
  // hergeleitet, da kein eigenes "Start"-Datum gespeichert wird.
  let periodProgressPct: number | null = null;
  if (currentPlan && target.feePaidUntil) {
    const periodStart = subtractPlanDuration(target.feePaidUntil, currentPlan);
    const totalMs = target.feePaidUntil.getTime() - periodStart.getTime();
    const elapsedMs = now.getTime() - periodStart.getTime();
    periodProgressPct = totalMs > 0 ? Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100))) : 100;
  }

  const activeLoanCount = loans.filter((l) => l.status === LOAN_STATUS.ACTIVE).length;
  const frequency = new Map<string, { name: string; count: number }>();
  for (const loan of loans) {
    const entry = frequency.get(loan.itemId) ?? { name: loan.item.name, count: 0 };
    entry.count += 1;
    frequency.set(loan.itemId, entry);
  }
  const topItems = Array.from(frequency.values()).sort((a, b) => b.count - a.count).slice(0, 3);
  const favorite = topItems[0];

  return (
    <div className="space-y-6">
      <div className="card-glass p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {target.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={target.avatarUrl}
                alt={target.displayName}
                className="h-16 w-16 rounded-full border-2 border-accent/40 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent/40 bg-surface-2 text-lg">
                {target.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-lg font-semibold">{target.displayName}</h1>
              <p className="text-xs text-muted">@{target.username}</p>
              <div className="mt-1.5 flex gap-2">
                <RoleBadge role={target.role} veraltet={target.status !== MEMBER_STATUS.ACTIVE} />
                <StatusBadge status={target.status} />
              </div>
            </div>
          </div>

          {showManageActions && (
            <div className="flex flex-wrap gap-2">
              {target.status === MEMBER_STATUS.ACTIVE ? (
                <form action={boundRevoke} className="flex items-center gap-2">
                  <input
                    type="text"
                    name="reason"
                    placeholder="Grund (optional)"
                    className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs outline-none ring-accent/40 focus:ring-2"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 text-xs font-medium text-yellow-500 transition hover:bg-yellow-500/20"
                  >
                    Freigabe entziehen
                  </button>
                </form>
              ) : target.status === MEMBER_STATUS.REVOKED ? (
                <form action={boundReinstate}>
                  <button
                    type="submit"
                    className="rounded-lg border border-accent-2/40 bg-accent-2/10 px-3 py-1.5 text-xs font-medium text-accent-2 transition hover:bg-accent-2/20"
                  >
                    Freigabe wiederherstellen
                  </button>
                </form>
              ) : null}

              {target.status !== MEMBER_STATUS.BANNED && (
                <form action={boundBan} className="flex items-center gap-2">
                  <input
                    type="text"
                    name="reason"
                    placeholder="Grund (optional)"
                    className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs outline-none ring-accent/40 focus:ring-2"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/20"
                  >
                    Dauerhaft ausschließen
                  </button>
                </form>
              )}

              {showOwnerActions &&
                (target.lockedAt ? (
                  <form action={boundUnlock}>
                    <button
                      type="submit"
                      className="rounded-lg border border-accent-2/40 bg-accent-2/10 px-3 py-1.5 text-xs font-medium text-accent-2 transition hover:bg-accent-2/20"
                    >
                      Abo-Sperre aufheben
                    </button>
                  </form>
                ) : (
                  <form action={boundLock} className="flex items-center gap-2">
                    <input
                      type="text"
                      name="reason"
                      placeholder="Grund für Sperrung"
                      className="rounded-lg border border-yellow-500/40 bg-surface px-3 py-1.5 text-xs outline-none ring-yellow-500/40 focus:ring-2"
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 text-xs font-medium text-yellow-500 transition hover:bg-yellow-500/20"
                    >
                      ⏳ Abo sperren
                    </button>
                  </form>
                ))}
            </div>
          )}
        </div>

        {target.revokedAt && (
          <div className="mt-6 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-500">
            <span className="font-medium">Freigabe entzogen</span> am{" "}
            {target.revokedAt.toLocaleDateString("de-DE")}
            {target.revokedReason ? ` – ${target.revokedReason}` : ""}
          </div>
        )}
        {target.bannedAt && (
          <div className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            <span className="font-medium">Dauerhaft ausgeschlossen</span> am{" "}
            {target.bannedAt.toLocaleDateString("de-DE")}
            {target.bannedReason ? ` – ${target.bannedReason}` : ""}
          </div>
        )}
        {isCurrentlySuspended && (
          <div className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            <span className="font-medium">🚫 Ausleih-Sperre aktiv</span> bis{" "}
            {target.borrowSuspendedUntil?.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
            {target.borrowSuspendedReason ? ` – ${target.borrowSuspendedReason}` : ""}
          </div>
        )}
        {target.lockedAt && (
          <div className="mt-6 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-500">
            <span className="font-medium">⏳ Abo gesperrt</span> seit {target.lockedAt.toLocaleDateString("de-DE")}
            {target.lockReason ? ` – ${target.lockReason}` : ""}. Läuft nur noch bis zum bezahlten Ende, keine
            weitere Verlängerung möglich.
          </div>
        )}

        <p className="mt-6 border-t border-border pt-4 text-xs font-medium uppercase tracking-wider text-muted">
          Profil
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Kundennummer" value={target.customerNumber ?? "-"} mono />
          <Field label="Discord-ID" value={target.discordId} mono />
          {isAufsichtPlus ? (
            <div>
              <dt className="text-xs text-muted">Minecraft-Name</dt>
              <form action={boundUpdateMinecraftName} className="mt-0.5 flex items-center gap-1.5">
                <input
                  type="text"
                  name="minecraftName"
                  defaultValue={target.minecraftName}
                  required
                  className="w-32 rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none ring-accent/40 focus:ring-2"
                />
                <button
                  type="submit"
                  className="rounded-md border border-border px-2 py-1 text-xs font-medium text-accent transition hover:bg-surface-2"
                >
                  Speichern
                </button>
              </form>
            </div>
          ) : (
            <Field label="Minecraft-Name" value={target.minecraftName || "-"} />
          )}
          <Field label="Mitglied seit" value={target.joinedAt.toLocaleDateString("de-DE")} />
        </dl>

        <div
          className={`mt-6 rounded-lg border p-4 ${
            target.verifiedAt
              ? "border-accent-2/40 bg-accent-2/5"
              : "border-yellow-500/40 bg-yellow-500/10"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                {target.verifiedAt ? "✅ Minecraft-Account verifiziert" : "⚠️ Nicht verifiziert"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {target.verifiedAt ? (
                  <>
                    Verifiziert als <span className="font-mono text-foreground">{target.minecraftName}</span> am{" "}
                    {target.verifiedAt.toLocaleDateString("de-DE")}.
                    {target.minecraftUuid && (
                      <>
                        {" "}
                        Namensänderungen werden über die UUID automatisch erkannt.
                      </>
                    )}
                  </>
                ) : isSelf ? (
                  "Ohne Verifizierung kannst du nichts ausleihen. Gib deinen Minecraft-Namen ein — er wird direkt bei Mojang geprüft."
                ) : (
                  "Dieses Mitglied kann erst ausleihen, wenn der Minecraft-Account verifiziert ist."
                )}
              </p>
            </div>
            {target.verifiedAt && showManageActions && (
              <form action={unverifyMember.bind(null, target.id)}>
                <button
                  type="submit"
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-danger"
                >
                  Verifizierung zurückziehen
                </button>
              </form>
            )}
          </div>
          {!target.verifiedAt && (isSelf || isAufsichtPlus) && (
            <div className="mt-3">
              <VerifyForm
                memberId={target.id}
                defaultName={target.minecraftName || undefined}
                asStaff={!isSelf}
              />
            </div>
          )}
        </div>
      </div>

      {showManageActions && (
        <div className="card space-y-6 p-6">
          <div>
            <h2 className="text-sm font-semibold">Maßnahmen</h2>
            <p className="mt-1 text-xs text-muted">
              Greift sofort und unabhängig davon, ob ein Abo läuft. Betroffene werden jeweils per
              Direktnachricht informiert.
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Ausleih-Rechte
            </h3>
            {target.rightsBlockedAt ? (
              <div className="rounded-lg border border-danger/40 bg-danger/5 p-4">
                <p className="text-sm font-medium text-danger">
                  🚫 Rechte gesperrt seit{" "}
                  {target.rightsBlockedAt.toLocaleString("de-DE", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
                {target.rightsBlockReason && (
                  <p className="mt-1 text-sm text-muted">Grund: {target.rightsBlockReason}</p>
                )}
                <form action={unblockRights.bind(null, target.id)} className="mt-3">
                  <button
                    type="submit"
                    className="rounded-lg border border-accent-2/40 bg-accent-2/10 px-4 py-2 text-sm font-medium text-accent-2 transition hover:bg-accent-2/20"
                  >
                    Rechte wieder freigeben
                  </button>
                </form>
              </div>
            ) : (
              <RechteSperrenForm memberId={target.id} />
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Geldstrafe
            </h3>
            <GeldstrafeForm memberId={target.id} balance={target.balance} />

            {strafen.length > 0 && (
              <ul className="mt-3 divide-y divide-border border-t border-border">
                {strafen.map((strafe) => {
                  const offen = strafe.amount - strafe.paidAmount;
                  return (
                    <li key={strafe.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{formatCoins(strafe.amount)}</span>{" "}
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                              strafe.paidAt
                                ? "border-accent-2/40 bg-accent-2/10 text-accent-2"
                                : "border-yellow-500/40 bg-yellow-500/10 text-yellow-500"
                            }`}
                          >
                            {strafe.paidAt ? "beglichen" : `${formatCoins(offen)} offen`}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {strafe.reason} ·{" "}
                          {strafe.createdAt.toLocaleDateString("de-DE")}
                        </p>
                      </div>
                      <form action={cancelFine.bind(null, target.id, strafe.id)}>
                        <button
                          type="submit"
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2"
                        >
                          Streichen
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {showOwnerActions && (
            <>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  Abo ohne Guthaben gewähren
                </h3>
                <AboGewaehrenForm memberId={target.id} plans={SUBSCRIPTION_PLANS} />
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  Eigenes Abo nach Maß
                </h3>
                <EigenesAboForm memberId={target.id} />
              </div>
            </>
          )}
        </div>
      )}

      {isAufsichtPlus && (
        <div className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Sanktionen</h2>
              <p className="mt-1 text-xs text-muted">
                Dokumentierte Verwarnungen und Maßnahmen &ndash; unabhängig von automatisch
                verhängten Ausleih-Sperren.
              </p>
            </div>
            <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
              {sanctions.length} Eintrag/Einträge
            </span>
          </div>

          {showManageActions && (
            <div className="mt-4">
              <SanctionForm memberId={target.id} />
            </div>
          )}

          {sanctions.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Keine Sanktionen eingetragen.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {sanctions.map((sanction) => (
                <li key={sanction.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium text-danger">
                        {SANCTION_TYPE_LABELS[sanction.type] ?? sanction.type}
                      </span>{" "}
                      &mdash; {sanction.reason}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {sanction.createdAt.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
                      {sanction.issuedBy && ` · durch ${sanction.issuedBy.displayName}`}
                    </p>
                  </div>
                  {showManageActions && (
                    <form action={removeSanction.bind(null, sanction.id, target.id)}>
                      <button
                        type="submit"
                        className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] text-muted transition hover:bg-surface-2 hover:text-foreground"
                      >
                        Entfernen
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div
        className={`card border-l-4 p-6 ${
          currentPlan ? (isExpired ? "border-l-danger" : "border-l-accent-2") : "border-l-border"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">Abo</h2>
              {currentPlan && (
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    isExpired
                      ? "border-danger/40 bg-danger/10 text-danger"
                      : "border-accent-2/40 bg-accent-2/10 text-accent-2"
                  }`}
                >
                  {isExpired ? "Abgelaufen" : "Aktiv"}
                </span>
              )}
            </div>
            <div className="mt-2.5 inline-flex items-center gap-3 rounded-xl border border-accent/30 bg-gradient-to-br from-accent/15 via-surface to-surface px-4 py-2.5">
              <span className="icon-badge h-10 w-10 shrink-0 text-lg">💰</span>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted">Guthaben</p>
                <p className="text-xl font-bold tracking-tight text-accent">{formatCoins(target.balance)}</p>
              </div>
            </div>
            {currentPlan ? (
              <p className="mt-1.5 text-sm text-muted">
                {currentPlan.label} &middot; {formatCoins(currentPlan.price)}
              </p>
            ) : (
              <p className="mt-1.5 text-sm text-muted">Noch kein Abo zugewiesen.</p>
            )}
            {target.feePaidUntil && (
              <p className="mt-1 text-xs">
                {isExpired ? (
                  <span className="text-danger">
                    Abgelaufen am {target.feePaidUntil.toLocaleDateString("de-DE")}
                  </span>
                ) : (
                  <span className="text-accent-2">
                    Gültig bis {target.feePaidUntil.toLocaleDateString("de-DE")} (
                    {daysLeft} {daysLeft === 1 ? "Tag" : "Tage"})
                  </span>
                )}
              </p>
            )}
            {periodProgressPct !== null && (
              <div className="mt-2 h-1.5 w-48 max-w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full ${isExpired ? "bg-danger" : "bg-accent-2"}`}
                  style={{ width: `${periodProgressPct}%` }}
                />
              </div>
            )}
            {canAdjustBalance && (
              <div className="mt-2">
                <BalanceAdjustForm memberId={target.id} />
              </div>
            )}
          </div>

          {isAufsichtPlus && !isSelf && (
            <AboAssignForm memberId={target.id} plans={SUBSCRIPTION_PLANS} currentPlanId={currentPlan?.id} />
          )}
        </div>

        {isSelf && (
          <div className="mt-5 rounded-lg border border-border bg-surface/60 p-4">
            <p className="text-sm font-medium">Guthaben aufladen</p>
            <p className="mt-1 text-xs text-muted">
              Überweise einen beliebigen Betrag an die Business-Card{" "}
              <span className="font-mono text-foreground">BC-584289</span> mit dem Verwendungszweck{" "}
              <span className="font-mono text-foreground">
                Verleih {target.customerNumber ?? "-"}
              </span>{" "}
              (deine Kundennummer). Der Betrag wird als Guthaben auf deinem
              Konto gutgeschrieben und bleibt dort dauerhaft hinterlegt &ndash; die Aufsicht bucht
              davon dann dein gewünschtes Paket ab. Eine Rücküberweisung ist nicht möglich.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SUBSCRIPTION_PLANS.map((plan) => {
                const monthlyRate = planMonthlyRate(plan);
                const baseMonthlyRate = planMonthlyRate(SUBSCRIPTION_PLANS[0]);
                const savingsPct = Math.round((1 - monthlyRate / baseMonthlyRate) * 100);
                const isBestValue = plan.id === SUBSCRIPTION_PLANS[SUBSCRIPTION_PLANS.length - 1].id;
                return (
                  <div
                    key={plan.id}
                    className={`card-hover relative rounded-lg border p-4 ${
                      isBestValue ? "border-accent/50 bg-accent/5" : "border-border bg-surface"
                    }`}
                  >
                    {isBestValue && (
                      <span className="absolute -top-2.5 right-3 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-black">
                        Beliebt
                      </span>
                    )}
                    <p className="text-sm font-semibold">{plan.label}</p>
                    <p className="mt-1.5 text-lg font-semibold text-accent">
                      {formatCoins(plan.price)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {formatCoins(Math.round(monthlyRate))} / Monat
                      {savingsPct > 0 && (
                        <span className="ml-1.5 text-accent-2">-{savingsPct}%</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-muted">
              Nach Zahlungseingang wird dein Abo automatisch erkannt bzw. von der Aufsicht
              bestätigt.
            </p>
          </div>
        )}
      </div>

      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">Statistiken</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Ausleihen insgesamt" value={String(loans.length)} />
          <StatCard
            label="Aktuell ausgeliehen"
            value={String(activeLoanCount)}
            accent="accent-2"
          />
          <StatCard
            label="Lieblings-Item"
            value={favorite ? favorite.name : "-"}
            hint={favorite ? `${favorite.count}x ausgeliehen` : "noch keine Ausleihen"}
          />
        </div>
      </div>

      {isSelf && (
        <div className="card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="text-accent" aria-hidden>
                ★
              </span>
              Deine Favoriten
              {merkliste.length > 0 && (
                <span className="text-xs font-normal text-muted">({merkliste.length})</span>
              )}
            </h2>
            <Link href="/dashboard/items" className="text-xs text-accent hover:underline">
              Zu den Items →
            </Link>
          </div>

          {merkliste.length === 0 ? (
            <p className="text-sm text-muted">
              Du hast dir noch nichts gemerkt. Klick bei den{" "}
              <Link href="/dashboard/items" className="text-accent hover:underline">
                Items
              </Link>{" "}
              auf den Stern an einer Kachel — gemerkte Items stehen dort dann ganz oben und hier
              in deinem Profil.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {merkliste.map((eintrag) => (
                <ItemCard
                  key={eintrag.id}
                  item={eintrag.item}
                  lage={{
                    available: eintrag.item.quantityTotal - (belegtProItem.get(eintrag.itemId) ?? 0),
                    myLoan: eigeneAktive.get(eintrag.itemId) ?? null,
                    cooldownEnd: null,
                    favorit: true,
                  }}
                  sperren={merkSperren}
                  zeigeKategorie
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card p-6">
        <h2 className="mb-4 text-sm font-semibold">Ausleihhistorie</h2>
        {loans.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Ausleihen vorhanden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted">
                <tr>
                  <th className="py-2 font-medium">Item</th>
                  <th className="py-2 font-medium">Ausgeliehen am</th>
                  <th className="py-2 font-medium">Frist</th>
                  <th className="py-2 font-medium">Zurückgegeben am</th>
                  <th className="py-2 font-medium">Kanal</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Dauer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loans.map((loan) => {
                  const wasLate = Boolean(loan.dueAt && loan.returnedAt && loan.returnedAt > loan.dueAt);
                  return (
                    <tr key={loan.id} className="transition hover:bg-surface-2/40">
                      <td className="py-2.5">{loan.item.name}</td>
                      <td className="py-2.5 text-muted">
                        {loan.borrowedAt.toLocaleString("de-DE")}
                      </td>
                      <td className="py-2.5 text-muted">
                        {loan.dueAt ? loan.dueAt.toLocaleString("de-DE") : "-"}
                      </td>
                      <td className="py-2.5 text-muted">
                        {loan.returnedAt ? (
                          <>
                            {loan.returnedAt.toLocaleString("de-DE")}
                            {wasLate && (
                              <span className="ml-1.5 rounded-full border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                                verspätet
                              </span>
                            )}
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2.5 text-muted">{loan.channel}</td>
                      <td className="py-2.5">
                        {LOAN_STATUS_LABELS[loan.status as keyof typeof LOAN_STATUS_LABELS] ??
                          loan.status}
                      </td>
                      <td className="py-2.5 text-accent-2">
                        {loan.status === LOAN_STATUS.ACTIVE ? (
                          loan.dueAt ? (
                            <LoanCountdown dueAt={loan.dueAt} />
                          ) : (
                            <ElapsedTime since={loan.borrowedAt} />
                          )
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="mb-4 text-sm font-semibold">Verstöße</h2>
        {lateReturns.length === 0 && suspensionEvents.length === 0 ? (
          <p className="text-sm text-muted">Keine Verstöße bekannt.</p>
        ) : (
          <ul className="space-y-2.5">
            {suspensionEvents.map((event) => (
              <li
                key={event.id}
                className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
              >
                <span className="font-medium">🚫 Ausleih-Sperre verhängt</span>{" "}
                <span className="text-danger/70">
                  ({event.createdAt.toLocaleString("de-DE")})
                </span>
                {event.details && <p className="mt-1 text-xs text-danger/90">{event.details}</p>}
              </li>
            ))}
            {lateReturns.map((loan) => (
              <li
                key={loan.id}
                className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-500"
              >
                <span className="font-medium">⏰ Verspätet zurückgegeben:</span> {loan.item.name}{" "}
                <span className="text-yellow-500/70">
                  (Frist {loan.dueAt?.toLocaleString("de-DE")}, zurück{" "}
                  {loan.returnedAt?.toLocaleString("de-DE")})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isAufsichtPlus && (
        <div className="card p-6">
          <h2 className="mb-4 text-sm font-semibold">
            Notizen <span className="font-normal text-muted">(nur für Aufsicht/Owner sichtbar)</span>
          </h2>

          <form action={boundAddNote} className="mb-5 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              name="content"
              required
              placeholder="Notiz hinzufügen..."
              className="flex-1 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none ring-accent/40 focus:ring-2"
            />
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Speichern
            </button>
          </form>

          {notes.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Notizen vorhanden.</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((note) => (
                <li key={note.id} className="rounded-lg border border-border bg-surface/60 p-3 text-sm">
                  <p>{note.content}</p>
                  <p className="mt-1 text-xs text-muted">
                    {note.author.displayName} &middot; {note.createdAt.toLocaleString("de-DE")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={mono ? "font-mono text-sm" : "text-sm"}>{value}</dd>
    </div>
  );
}
