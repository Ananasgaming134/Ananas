import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { claimTicket, closeTicket } from "@/app/actions/tickets";
import { pauseMember, resumeMember } from "@/app/actions/members";
import { ROLES } from "@/lib/constants";

const CATEGORY_LABELS: Record<string, string> = { SUPPORT: "Support", BEWERBUNG: "Bewerbung" };

export default async function VerwaltungTicketsPage() {
  await requireMember(ROLES.AUFSICHT);

  const tickets = await prisma.ticket.findMany({
    where: { status: { not: "CLOSED" } },
    orderBy: { createdAt: "asc" },
  });

  const memberIds = tickets.flatMap((t) => [t.memberId, t.claimedById]).filter((id): id is string => Boolean(id));
  const memberById = memberIds.length
    ? new Map((await prisma.member.findMany({ where: { id: { in: memberIds } } })).map((m) => [m.id, m]))
    : new Map();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Tickets</h1>
        <p className="mt-1 text-sm text-muted">
          Offene Support- und Bewerbungs-Tickets. Der eigentliche Verlauf läuft in Discord — hier
          nur Übernehmen/Schließen und der direkte Link zum Kanal.
        </p>
      </div>

      {tickets.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">Keine offenen Tickets.</div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const applicant = ticket.memberId ? memberById.get(ticket.memberId) : null;
            const claimer = ticket.claimedById ? memberById.get(ticket.claimedById) : null;

            return (
              <div key={ticket.id} className="card space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{ticket.subject}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {CATEGORY_LABELS[ticket.category] ?? ticket.category} &middot; von{" "}
                      {applicant?.displayName ?? `Discord-ID ${ticket.applicantDiscordId}`} &middot;{" "}
                      {ticket.createdAt.toLocaleDateString("de-DE")}
                      {claimer && ` · übernommen von ${claimer.displayName}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {ticket.discordChannelId && (
                      <a
                        href={`https://discord.com/channels/${ticket.discordGuildId}/${ticket.discordChannelId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:underline"
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
