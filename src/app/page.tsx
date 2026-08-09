import Link from "next/link";
import { auth } from "@/auth";
import AnimatedBackground from "@/components/AnimatedBackground";
import VoxelLandscape from "@/components/VoxelLandscape";
import HowItWorks from "@/components/HowItWorks";
import FaqSection from "@/components/FaqSection";
import StatCard from "@/components/StatCard";
import TeamSection from "@/components/TeamSection";
import { getPublicStats } from "@/lib/stats";
import { getTeamGroups } from "@/lib/team";
import { AUTH_DISCORD_SERVER_NAME, SERVER_NAME, SERVER_URL, SITE_NAME, formatCoins } from "@/lib/constants";

export default async function Home() {
  const [session, stats, teamGroups] = await Promise.all([
    auth(),
    getPublicStats(),
    getTeamGroups(),
  ]);
  const loggedIn = !!session?.user?.memberId;

  return (
    <main className="relative min-h-screen">
      <AnimatedBackground />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-sm font-bold text-accent shadow-[0_0_20px_-4px_var(--accent)]">
            OL
          </div>
          <span className="text-lg font-semibold tracking-tight">{SITE_NAME}</span>
        </div>
        <Link
          href={loggedIn ? "/dashboard" : "/login"}
          className="rounded-lg border border-border bg-surface/60 px-4 py-2 text-sm font-medium transition hover:border-accent/40 hover:bg-surface-2"
        >
          {loggedIn ? "Zum Dashboard" : "Anmelden"}
        </Link>
      </header>

      <section className="mx-auto flex max-w-6xl flex-col items-center px-6 pb-14 pt-16 text-center sm:pt-24">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-1.5 text-xs font-medium text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-2 animate-pulse-slow" />
          Unabhängiger Item-Verleih, aktiv auf {SERVER_NAME}
        </span>

        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          <span className="text-gradient">{SITE_NAME}</span>
          <br />
          Wir für euch &ndash; hier leiht ihr euch eure Ausrüstung.
        </h1>
        <p className="mt-6 max-w-xl text-balance text-base text-muted sm:text-lg">
          Von der Community, für die Community: Ihr kommt vorbei, sucht euch das
          passende Item aus, und wir kümmern uns um den Rest &ndash; transparent,
          vollständig geloggt, direkt über Discord abgesichert.
        </p>
        <p className="mt-3 max-w-xl text-xs text-muted">
          Wir sind ein eigenständiger Anbieter und aktiv auf{" "}
          <a
            href={SERVER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline decoration-border underline-offset-4 hover:decoration-accent"
          >
            {SERVER_URL.replace("https://", "")}
          </a>{" "}
          &ndash; nicht der offizielle {SERVER_NAME}-Server selbst. Anmeldung und
          Rollen laufen über unseren eigenen Discord &bdquo;{AUTH_DISCORD_SERVER_NAME}&ldquo;.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link
            href={loggedIn ? "/dashboard" : "/login"}
            className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-black shadow-[0_8px_30px_-8px_var(--accent)] transition hover:brightness-110"
          >
            {loggedIn ? "Zum Dashboard" : "Mit Discord anmelden"}
          </Link>
          <a
            href="#stats"
            className="rounded-xl border border-border bg-surface/60 px-6 py-3 text-sm font-medium transition hover:border-accent/40 hover:bg-surface-2"
          >
            Aktuelle Zahlen ansehen
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <VoxelLandscape />
      </section>

      <HowItWorks />

      <section id="stats" className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Gesamtwert aller Items"
            value={formatCoins(stats.totalValue)}
            hint={`${stats.itemCount} Item-Arten im Bestand`}
          />
          <StatCard
            label="Verwaltete Kunden"
            value={String(stats.kundenCount)}
            hint={`${stats.activeMembers} aktive Mitglieder insgesamt`}
            accent="accent-2"
          />
          <StatCard
            label="Aktuell ausgeliehen"
            value={String(stats.activeLoans)}
            hint="laufende Ausleihen"
          />
          <StatCard
            label="Item-Bestand"
            value={String(stats.totalQuantity)}
            hint="verfügbare Stückzahl gesamt"
            accent="accent-2"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FeatureCard
            icon="🔒"
            title="Discord-abgesicherter Zugang"
            description="Login ausschließlich per Discord-Account. Nur wer bei uns die Rolle Kunde, Aufsichtsperson oder Owner hat, kommt rein."
          />
          <FeatureCard
            icon="📁"
            title="Lückenlose Akten"
            description="Jeder Kunde bekommt eine eigene Akte mit Ausleihhistorie. Aufsichtspersonen und Owner sehen alle Akten, jede Änderung wird geloggt."
          />
          <FeatureCard
            icon="📦"
            title="Immer ausgerüstet"
            description="Vom Werkzeug bis zur Rüstung: unser Bestand wächst laufend, der Gesamtwert des LeihCenters ist hier live einsehbar."
          />
        </div>
      </section>

      <TeamSection groups={teamGroups} />

      <FaqSection />

      <footer className="mx-auto max-w-6xl px-6 pb-10 text-center text-xs text-muted">
        {SITE_NAME} &middot; eigenständiger Item-Verleih, aktiv auf {SERVER_NAME} &middot;{" "}
        nicht der offizielle Serverbetreiber.
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="card card-hover p-6">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-2 text-lg">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
    </div>
  );
}
