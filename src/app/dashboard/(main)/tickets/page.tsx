import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import SupportTicketForm from "@/components/SupportTicketForm";

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Offen",
  CLAIMED: "In Bearbeitung",
  CLOSED: "Geschlossen",
};

const CATEGORY_LABELS: Record<string, string> = {
  SUPPORT: "Support",
  BEWERBUNG: "Bewerbung",
};

export default async function TicketsPage() {
  const member = await requireMember();

  const tickets = await prisma.ticket.findMany({
    where: { OR: [{ memberId: member.id }, { applicantDiscordId: member.discordId }] },
    orderBy: { createdAt: "desc" },
  });

  const claimerIds = tickets.map((t) => t.claimedById).filter((id): id is string => Boolean(id));
  const claimerById = claimerIds.length
    ? new Map((await prisma.member.findMany({ where: { id: { in: claimerIds } } })).map((m) => [m.id, m]))
    : new Map();

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">Neues Support-Ticket</h2>
        <SupportTicketForm />
      </div>

      <div className="space-y-3">
        {tickets.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted">Du hast noch keine Tickets.</div>
        ) : (
          tickets.map((ticket) => {
            const claimer = ticket.claimedById ? claimerById.get(ticket.claimedById) : null;
            return (
              <div key={ticket.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">{ticket.subject}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {CATEGORY_LABELS[ticket.category] ?? ticket.category} &middot;{" "}
                    {ticket.createdAt.toLocaleDateString("de-DE")}
                    {claimer && ` · bearbeitet von ${claimer.displayName}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      ticket.status === "CLOSED"
                        ? "border-border text-muted"
                        : ticket.status === "CLAIMED"
                          ? "border-accent-2/40 bg-accent-2/10 text-accent-2"
                          : "border-accent/40 bg-accent/10 text-accent"
                    }`}
                  >
                    {STATUS_LABELS[ticket.status] ?? ticket.status}
                  </span>
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
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
