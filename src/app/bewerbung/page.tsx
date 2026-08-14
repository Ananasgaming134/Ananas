import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticated } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MEMBER_STATUS, SITE_NAME, SUBSCRIPTION_PLANS } from "@/lib/constants";
import AnimatedBackground from "@/components/AnimatedBackground";
import BewerbungForm from "./BewerbungForm";

export default async function BewerbungPage() {
  const { discordId } = await requireAuthenticated();

  const [member, pending, lastRejected] = await Promise.all([
    prisma.member.findUnique({ where: { discordId } }),
    prisma.membershipApplication.findFirst({ where: { discordId, status: "PENDING" } }),
    prisma.membershipApplication.findFirst({
      where: { discordId, status: "REJECTED" },
      orderBy: { reviewedAt: "desc" },
    }),
  ]);

  if (member?.status === MEMBER_STATUS.ACTIVE) redirect("/dashboard");

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <AnimatedBackground />

      <div className="card-glass w-full max-w-2xl p-6 sm:p-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface text-2xl font-bold text-accent">
            OL
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Kunde beim {SITE_NAME} werden</h1>
          <p className="mt-2 text-sm text-muted">
            Fülle die Bewerbung aus — die Verwaltung prüft sie danach von Hand.
          </p>
        </div>

        {pending ? (
          <div className="space-y-4 rounded-xl border border-border bg-surface/60 p-6 text-center">
            <p className="text-lg font-medium">⏳ Bewerbung eingereicht</p>
            <p className="text-sm text-muted">
              Eingereicht am {pending.createdAt.toLocaleDateString("de-DE")} für das Paket{" "}
              {SUBSCRIPTION_PLANS.find((p) => p.id === pending.requestedPlanId)?.label ?? pending.requestedPlanId}.
              Du wirst per Discord benachrichtigt, sobald sie geprüft wurde.
            </p>
            <Link href="/login" className="inline-block text-sm text-accent hover:underline">
              Zurück zur Startseite
            </Link>
          </div>
        ) : (
          <>
            {lastRejected && (
              <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
                <p className="font-medium">Vorherige Bewerbung abgelehnt</p>
                {lastRejected.rejectionReason && <p className="mt-1 text-danger/90">Grund: {lastRejected.rejectionReason}</p>}
                <p className="mt-1 text-danger/80">Du kannst dich erneut bewerben.</p>
              </div>
            )}
            <BewerbungForm plans={SUBSCRIPTION_PLANS} />
          </>
        )}
      </div>
    </main>
  );
}
