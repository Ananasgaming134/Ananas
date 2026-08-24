import Link from "next/link";
import type { Metadata } from "next";
import RulesView from "@/components/RulesView";
import LandingAmbient from "@/components/landing/LandingAmbient";
import { getSiteConfig } from "@/lib/siteConfig";
import { SITE_NAME } from "@/lib/constants";

// Nicht vorab erzeugen: der Text wird in der Verwaltung gepflegt und muss
// sofort nach dem Speichern stimmen, ohne neuen Build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `Datenschutz — ${SITE_NAME}` };

export default async function DatenschutzPage() {
  const config = await getSiteConfig();

  return (
    <main className="landing relative min-h-screen">
      <LandingAmbient />

      <section className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-xs text-muted transition hover:text-foreground">
          ← Zurück zur Startseite
        </Link>

        <h1 className="mt-6 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Datenschutz
        </h1>

        <div className="card mt-8 p-6 sm:p-8">
          <RulesView content={config.datenschutz} />
        </div>

        <p className="mt-6 text-xs text-muted">
          <Link href="/impressum" className="text-accent hover:underline">
            Impressum
          </Link>
        </p>
      </section>
    </main>
  );
}
