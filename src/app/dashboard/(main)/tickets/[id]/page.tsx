import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getTicketMessages } from "@/lib/ticketMessages";
import { ticketLabel, TICKET_STATUS } from "@/lib/tickets";
import TicketChat from "@/components/TicketChat";
import { hasAtLeastRole, ROLES } from "@/lib/constants";

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Offen",
  CLAIMED: "In Bearbeitung",
  CLOSED: "Geschlossen",
};

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireMember();
  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) notFound();

  const gehoertMir =
    ticket.memberId === member.id || ticket.applicantDiscordId === member.discordId;
  const istAufsicht = hasAtLeastRole(member.role, ROLES.AUFSICHT);
  if (!gehoertMir && !istAufsicht) redirect("/dashboard/tickets");

  const geschlossen = ticket.status === TICKET_STATUS.CLOSED;
  const nachrichten = await getTicketMessages(ticket.discordChannelId);

  const claimer = ticket.claimedById
    ? await prisma.member.findUnique({ where: { id: ticket.claimedById } })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/dashboard/tickets" className="text-xs text-muted transition hover:text-foreground">
          ← Zurück zu deinen Tickets
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold sm:text-2xl">{ticket.subject}</h1>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              geschlossen
                ? "border-border text-muted"
                : ticket.status === "CLAIMED"
                  ? "border-accent-2/40 bg-accent-2/10 text-accent-2"
                  : "border-accent/40 bg-accent/10 text-accent"
            }`}
          >
            {STATUS_LABELS[ticket.status] ?? ticket.status}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          {ticketLabel(ticket.category)} · eröffnet am{" "}
          {ticket.createdAt.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
          {claimer && ` · bearbeitet von ${claimer.displayName}`}
          {geschlossen &&
            ticket.closedAt &&
            ` · geschlossen am ${ticket.closedAt.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}`}
        </p>
      </div>

      {nachrichten.length === 0 && geschlossen && ticket.transcript ? (
        // Der Thread ist weg, aber beim Schliessen wurde der Verlauf gesichert.
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">Gesicherter Verlauf</h2>
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-2/50 p-3 text-[11px] leading-relaxed text-muted">
            {ticket.transcript}
          </pre>
        </div>
      ) : (
        <TicketChat
          ticketId={ticket.id}
          geschlossen={geschlossen}
          darfSchreiben={gehoertMir || istAufsicht}
          nachrichten={nachrichten.map((n) => ({ ...n, zeit: n.zeit.toISOString() }))}
        />
      )}
    </div>
  );
}
