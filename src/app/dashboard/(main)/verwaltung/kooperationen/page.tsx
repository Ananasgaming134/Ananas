import { requireMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { deletePartner } from "@/app/actions/partners";
import PageHeader from "@/components/PageHeader";
import PartnerForm from "@/components/PartnerForm";
import { ROLES } from "@/lib/constants";

/**
 * Visitenkarten der Kooperationspartner. Was hier aktiv ist, erscheint auf der
 * Startseite - bei mehreren Eintraegen wechseln sie sich dort ab.
 */
export default async function KooperationenPage() {
  await requireMember(ROLES.OWNER);

  const partners = await prisma.partner.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const sichtbar = partners.filter((p) => p.active).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kooperationen"
        description="Visitenkarten für die Startseite. Jede Karte kann ein Banner, ein Profilbild, einen Text und eine Discord-Einladung haben — angeklickt öffnet sie den hinterlegten Link. Sind mehrere aktiv, wechseln sie sich auf der Startseite ab."
      />

      <div className="card p-5">
        <h2 className="mb-4 text-sm font-semibold">Neue Kooperation anlegen</h2>
        <PartnerForm />
      </div>

      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold">
          Angelegte Kooperationen{" "}
          <span className="font-normal text-muted">
            ({partners.length} gesamt, {sichtbar} sichtbar)
          </span>
        </h2>
        <div className="divider-glow flex-1" />
      </div>

      {partners.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          Noch keine Kooperation angelegt. Die Startseite blendet den Bereich dann einfach aus.
        </div>
      ) : (
        <div className="space-y-4">
          {partners.map((partner) => (
            <div key={partner.id} className="card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{partner.name}</h3>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      partner.active
                        ? "border-accent-2/40 bg-accent-2/10 text-accent-2"
                        : "border-border bg-surface-2 text-muted"
                    }`}
                  >
                    {partner.active ? "sichtbar" : "ausgeblendet"}
                  </span>
                </div>
                <form action={deletePartner.bind(null, partner.id)}>
                  <button
                    type="submit"
                    className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                  >
                    Löschen
                  </button>
                </form>
              </div>
              <PartnerForm partner={partner} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
