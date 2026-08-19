import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { claimTicket, closeTicket } from "@/app/actions/tickets";
import { pauseMember, resumeMember } from "@/app/actions/members";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import TicketTranscript from "@/components/TicketTranscript";
import { ROLES } from "@/lib/constants";

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  SUPPORT: { label: "Support", icon: "🎧" },
  BEWERBUNG: { label: "Bewerbung", icon: "📝" },
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  OPEN: { label: "Offen", className: "border-accent/40 bg-accent/10 text-accent" },
  CLAIMED: { label: "Übernommen", className: "border-accent-2/40 bg-accent-2/10 text-accent-2" },
  CLOSED: { label: "Geschlossen", className: "border-border bg-surface-2 text-muted" },
};

export default async function VerwaltungTicketsPage() {
  await requireMember(ROLES.AUFSICHT);

  const [openTickets, closedTickets] = await Promise.all([
    prisma.ticket.findMany({ where: { status: { not: "CLOSED" } }, orderBy: { createdAt: "asc" } }),
    prisma.ticket.findMany({ where: { status: "CLOSED" }, orderBy: { closedAt: "desc" }, take: 25 }),
  ]);

  const allTickets = [...openTickets, ...closedTickets];
  const memberIds = allTickets
    .flatMap((t) => [t.memberId, t.claimedById, t.closedById])
    .filter((id): id is string => Boolean(id));
  const memberById = memberIds.length
    ? new Map((await prisma.member.findMany({ where: { id: { in: memberIds } } })).map((m) => [m.id, m]))
    : new Map();

  const unclaimedCount = openTickets.filter((t) => t.status !== "CLAIMED").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        description="Der Verlauf läuft in einem privaten Discord-Thread. Hier siehst du Status, übernimmst Tickets und liest geschlossene Verläufe nach."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Offen" value={String(openTickets.length)} icon="🎫" />
        <StatCard label="Unbearbeitet" value={String(unclaimedCount)} accent="danger" icon="🙋" />
        <StatCard label="Archiviert" value={String(closedTickets.length)} accent="accent-2" icon="🗃️" />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Offene Tickets</h2>
        {openTickets.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted">
            Keine offenen Tickets — alles abgearbeitet. 🎉
          </div>
        ) : (
          <div className="space-y-3">
            {openTickets.map((ticket) => {
              const applicant = ticket.memberId ? memberById.get(ticket.memberId) : null;
              const claimer = ticket.claimedById ? memberById.get(ticket.claimedById) : null;
              const category = CATEGORY_META[ticket.category] ?? { label: ticket.category, icon: "🎫" };
              const status = STATUS_META[ticket.status] ?? STATUS_META.OPEN;

              return (
                <article
                  key={ticket.id}
                  className={`card card-hover space-y-3 p-4 ${
                    ticket.status !== "CLAIMED" ? "border-l-4 border-l-accent" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="icon-badge h-9 w-9 text-base">{category.icon}</span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{ticket.subject}</p>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${status.className}`}
                          >
                            {status.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          {category.label} &middot; von{" "}
                          {applicant?.displayName ?? `Discord-ID ${ticket.applicantDiscordId}`} &middot;{" "}
                          {ticket.createdAt.toLocaleDateString("de-DE")}
                          {claimer && ` · übernommen von ${claimer.displayName}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {ticket.discordChannelId && (
                        <a
                          href={`https://discord.com/channels/${ticket.discordGuildId}/${ticket.discordChannelId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-surface-2"
                        >
                          In Discord öffnen →
                        </a>
                      )}
                      {ticket.status !== "CLAIMED" && (
                        <form action={claimTicket.bind(null, ticket.id)}>
                          <button
                            type="submit"
                            className="rounded-lg border border-accent-2/40 bg-accent-2/10 px-3 py-1.5 text-xs font-medium text-accent-2 transition hover:bg-accent-2/20"
                          >
                            🙋 Übernehmen
                          </button>
                        </form>
                      )}
                      <form action={closeTicket.bind(null, ticket.id)}>
                        <button
                          type="submit"
                          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/20"
                        >
                          🔒 Schließen
                        </button>
                      </form>
                    </div>
                  </div>

                  {ticket.category === "SUPPORT" && applicant && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      {applicant.pausedAt ? (
                        <>
                          <span className="text-xs text-muted">
                            Abo pausiert seit {applicant.pausedAt.toLocaleDateString("de-DE")}
                            {applicant.pauseReason ? ` — ${applicant.pauseReason}` : ""}
                          </span>
                          <form action={resumeMember.bind(null, applicant.id)}>
                            <button
                              type="submit"
                              className="rounded-lg border border-accent-2/40 bg-accent-2/10 px-3 py-1.5 text-xs font-medium text-accent-2 transition hover:bg-accent-2/20"
                            >
                              ▶ Fortsetzen
                            </button>
                          </form>
                        </>
                      ) : (
                        <form
                          action={pauseMember.bind(null, applicant.id)}
                          className="flex flex-wrap items-center gap-1.5"
                        >
                          <input type="hidden" name="ticketId" value={ticket.id} />
                          <input
                            type="text"
                            name="reason"
                            placeholder="Grund für Pause"
                            className="w-48 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none ring-accent/40 focus:ring-2"
                          />
                          <button
                            type="submit"
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2"
                          >
                            ⏸ Abo pausieren
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold">Archiv</h2>
        <p className="mb-3 text-xs text-muted">
          Geschlossene Tickets mit gesichertem Gesprächsverlauf &ndash; als Nachweis, falls später
          strittig ist, was zugesagt wurde.
        </p>
        {closedTickets.length === 0 ? (
          <div className="card p-6 text-center text-sm text-muted">Noch keine geschlossenen Tickets.</div>
        ) : (
          <div className="card divide-y divide-border overflow-hidden">
            {closedTickets.map((ticket) => {
              const applicant = ticket.memberId ? memberById.get(ticket.memberId) : null;
              const closer = ticket.closedById ? memberById.get(ticket.closedById) : null;
              const category = CATEGORY_META[ticket.category] ?? { label: ticket.category, icon: "🎫" };

              return (
                <div key={ticket.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm">
                        <span aria-hidden>{category.icon}</span> {ticket.subject}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {category.label} &middot;{" "}
                        {applicant?.displayName ?? `Discord-ID ${ticket.applicantDiscordId}`}
                        {ticket.closedAt && ` · geschlossen ${ticket.closedAt.toLocaleDateString("de-DE")}`}
                        {closer && ` von ${closer.displayName}`}
                      </p>
                    </div>
                    {!ticket.transcript && (
                      <span className="shrink-0 text-[11px] text-muted">kein Verlauf gesichert</span>
                    )}
                  </div>
                  {ticket.transcript && <TicketTranscript transcript={ticket.transcript} />}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
