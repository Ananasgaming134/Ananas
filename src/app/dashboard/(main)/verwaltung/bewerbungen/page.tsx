import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/PageHeader";
import { approveApplication, blockApplicant, rejectApplication, unblockApplicant } from "@/app/actions/applications";
import { approvePlanChange, rejectPlanChange } from "@/app/actions/planChanges";
import { ROLES, SUBSCRIPTION_PLANS, formatCoins } from "@/lib/constants";

export default async function BewerbungenPage() {
  await requireMember(ROLES.OWNER);

  const [pending, blocks, planChangeRequests] = await Promise.all([
    prisma.membershipApplication.findMany({
      where: { status: "PENDING" },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.applicationBlock.findMany({ orderBy: { blockedAt: "desc" } }),
    prisma.planChangeRequest.findMany({
      where: { status: "PENDING" },
      include: { member: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const ticketIds = pending.map((a) => a.ticketId).filter((id): id is string => Boolean(id));
  const tickets = ticketIds.length > 0 ? await prisma.ticket.findMany({ where: { id: { in: ticketIds } } }) : [];
  const ticketById = new Map(tickets.map((t) => [t.id, t]));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Verwaltung"
        title="Bewerbungen"
        description="Offene Kunden-Bewerbungen prüfen. Annehmen legt sofort die Akte an, vergibt die Kunde-Rolle in Discord und macht die Zahlung fällig. Nur der Owner darf final entscheiden."
      />

      {pending.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">Keine offenen Bewerbungen.</div>
      ) : (
        <div className="space-y-4">
          {pending.map((app) => {
            const plan = SUBSCRIPTION_PLANS.find((p) => p.id === app.requestedPlanId);
            const ticket = app.ticketId ? ticketById.get(app.ticketId) : null;

            return (
              <div key={app.id} className="card space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{app.displayName}</p>
                    <p className="text-xs text-muted">
                      @{app.username} &middot; {app.createdAt.toLocaleString("de-DE")} &middot;{" "}
                      {app.source === "DISCORD" ? "per Discord" : "per Website"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                    {plan?.label ?? app.requestedPlanId} &middot; {formatCoins(plan?.price)}
                  </span>
                </div>

                <p className="text-sm">{app.reason}</p>

                <div className="grid grid-cols-2 gap-3 text-sm text-muted sm:grid-cols-4">
                  <p>
                    Minecraft: <span className="text-foreground">{app.minecraftName}</span>
                  </p>
                  <p>
                    Alter: <span className="text-foreground">{app.age}</span>
                  </p>
                  <p>
                    Spielstunden: <span className="text-foreground">{app.playHours}</span>
                  </p>
                  <p>
                    Vermögen: <span className="text-foreground">{formatCoins(app.declaredNetWorth)}</span>
                  </p>
                </div>

                {app.items.length > 0 && (
                  <div className="rounded-lg border border-border bg-surface/60 p-3">
                    <p className="mb-1.5 text-xs font-medium text-muted">Angegebene Items</p>
                    <ul className="space-y-1 text-sm">
                      {app.items.map((item) => (
                        <li key={item.id} className="flex justify-between">
                          <span>
                            {item.quantity > 1 ? `${item.quantity}x ` : ""}
                            {item.name}
                          </span>
                          {item.declaredPrice > 0 && <span className="text-muted">{formatCoins(item.declaredPrice)}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {ticket?.discordChannelId && (
                  <a
                    href={`https://discord.com/channels/${ticket.discordGuildId}/${ticket.discordChannelId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-xs text-accent hover:underline"
                  >
                    🎫 Bewerbungs-Ticket in Discord öffnen
                  </a>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  <form action={approveApplication.bind(null, app.id)}>
                    <button
                      type="submit"
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
                    >
                      ✅ Annehmen
                    </button>
                  </form>
                  <form action={rejectApplication.bind(null, app.id)} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      name="reason"
                      placeholder="Grund (optional)"
                      className="w-48 rounded-lg border border-border bg-surface px-2.5 py-2 text-xs outline-none ring-accent/40 focus:ring-2"
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-border px-3 py-2 text-xs font-medium transition hover:bg-surface-2"
                    >
                      Ablehnen
                    </button>
                  </form>
                  <form action={blockApplicant.bind(null, app.discordId)} className="flex flex-wrap items-center gap-1.5">
                    <input
                      type="text"
                      name="reason"
                      placeholder="Grund für Sperre"
                      className="w-44 rounded-lg border border-danger/40 bg-surface px-2.5 py-2 text-xs outline-none ring-danger/40 focus:ring-2"
                    />
                    <select
                      name="months"
                      defaultValue="6"
                      className="rounded-lg border border-danger/40 bg-surface px-2.5 py-2 text-xs outline-none ring-danger/40 focus:ring-2"
                    >
                      <option value="1">1 Monat Sperre</option>
                      <option value="3">3 Monate Sperre</option>
                      <option value="6">6 Monate Sperre</option>
                      <option value="12">12 Monate Sperre</option>
                      <option value="">Dauerhaft (rote Liste)</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-medium text-danger transition hover:bg-danger/20"
                    >
                      🚫 Sperren
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold">Paketwechsel-Anfragen</h2>
        {planChangeRequests.length === 0 ? (
          <p className="text-sm text-muted">Keine offenen Anfragen.</p>
        ) : (
          <div className="card divide-y divide-border overflow-hidden">
            {planChangeRequests.map((req) => {
              const plan = SUBSCRIPTION_PLANS.find((p) => p.id === req.requestedPlanId);
              const currentPlan = SUBSCRIPTION_PLANS.find((p) => p.id === req.member.subscriptionPlan);
              return (
                <div key={req.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{req.member.displayName}</p>
                    <p className="text-xs text-muted">
                      {currentPlan?.label ?? "kein Paket"} → <span className="text-foreground">{plan?.label ?? req.requestedPlanId}</span>{" "}
                      &middot; {req.createdAt.toLocaleDateString("de-DE")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action={approvePlanChange.bind(null, req.id)}>
                      <button
                        type="submit"
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:brightness-110"
                      >
                        Genehmigen
                      </button>
                    </form>
                    <form action={rejectPlanChange.bind(null, req.id)}>
                      <button
                        type="submit"
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2"
                      >
                        Ablehnen
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-1 text-sm font-semibold">Sperren &amp; rote Liste</h2>
        <p className="mb-3 text-xs text-muted">
          Befristete Aufnahmesperren laufen von allein aus &ndash; danach kann sich die Person wieder
          bewerben. Dauerhafte Einträge (rote Liste) sperren zusätzlich den Login.
        </p>
        {blocks.length === 0 ? (
          <p className="text-sm text-muted">Aktuell ist niemand gesperrt.</p>
        ) : (
          <div className="card divide-y divide-border overflow-hidden">
            {blocks.map((block) => {
              const expired = Boolean(block.expiresAt && block.expiresAt <= new Date());
              return (
                <div key={block.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">Discord-ID {block.discordId}</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          expired
                            ? "border-border bg-surface-2 text-muted"
                            : block.expiresAt
                              ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-500"
                              : "border-danger/40 bg-danger/10 text-danger"
                        }`}
                      >
                        {expired
                          ? "abgelaufen"
                          : block.expiresAt
                            ? `Sperre bis ${block.expiresAt.toLocaleDateString("de-DE")}`
                            : "dauerhaft"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {block.reason} &middot; seit {block.blockedAt.toLocaleDateString("de-DE")}
                    </p>
                  </div>
                  <form action={unblockApplicant.bind(null, block.id)}>
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
    </div>
  );
}
