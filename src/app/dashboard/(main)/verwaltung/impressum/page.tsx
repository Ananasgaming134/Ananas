import Link from "next/link";
import { requireMember } from "@/lib/session";
import { getSiteConfig } from "@/lib/siteConfig";
import PageHeader from "@/components/PageHeader";
import SiteConfigForm from "@/components/SiteConfigForm";
import { ROLES } from "@/lib/constants";

export default async function ImpressumVerwaltungPage() {
  await requireMember(ROLES.OWNER);
  const config = await getSiteConfig();

  const offeneStellen =
    (config.impressum.match(/\[[^\]]+\]/g)?.length ?? 0) +
    (config.datenschutz.match(/\[[^\]]+\]/g)?.length ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Impressum & Rechtliches"
        description="Impressum und Datenschutzerklärung der öffentlichen Seite. Änderungen sind sofort unter /impressum und /datenschutz sichtbar."
      />

      {offeneStellen > 0 && (
        <div className="card border-danger/40 bg-danger/5 p-4">
          <p className="text-sm font-medium text-danger">
            {offeneStellen} Platzhalter noch nicht ausgefüllt
          </p>
          <p className="mt-1 text-xs text-muted">
            Alles, was in eckigen Klammern steht, sind Platzhalter — zum Beispiel{" "}
            <span className="font-mono">[Vor- und Nachname]</span>. Solange die drin stehen, ist das
            Impressum unvollständig. Trag deine echten Angaben ein. Was genau nötig ist, hängt davon
            ab, ob das Angebot privat oder geschäftlich läuft — im Zweifel lass einmal jemanden
            drüberschauen, der sich damit auskennt.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs">
        <Link href="/impressum" className="text-accent hover:underline" target="_blank">
          Impressum ansehen →
        </Link>
        <Link href="/datenschutz" className="text-accent hover:underline" target="_blank">
          Datenschutz ansehen →
        </Link>
      </div>

      <SiteConfigForm
        impressum={config.impressum}
        datenschutz={config.datenschutz}
        discordInviteUrl={config.discordInviteUrl}
      />
    </div>
  );
}
