import Link from "next/link";
import { auth } from "@/auth";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingAmbient from "@/components/landing/LandingAmbient";
import VoxelField from "@/components/landing/VoxelField";
import Reveal from "@/components/landing/Reveal";
import CountUp from "@/components/landing/CountUp";
import ReviewMarquee from "@/components/landing/ReviewMarquee";
import PartnerCarousel from "@/components/landing/PartnerCarousel";
import FaqAccordion from "@/components/FaqAccordion";
import { getPublicStats } from "@/lib/stats";
import { getTeamGroups } from "@/lib/team";
import { getPublicReviews, getReviewSummary } from "@/lib/reviews";
import { getPublicPartners } from "@/lib/partners";
import { getDiscordInvite } from "@/lib/siteConfig";
import {
  AUTH_DISCORD_SERVER_NAME,
  SERVER_NAME,
  SERVER_URL,
  SITE_NAME,
  SUBSCRIPTION_PLANS,
  formatCoins,
  planMonthlyRate,
  planRateLabel,
} from "@/lib/constants";

const SCHRITTE = [
  {
    icon: "🎮",
    title: "Discord beitreten",
    text: "Auf unseren Server kommen und die Kunden-Rolle holen.",
  },
  {
    icon: "🔑",
    title: "Anmelden",
    text: "Ein Klick über Discord. Kein Passwort, kein Formular.",
  },
  {
    icon: "⛏️",
    title: "Item aussuchen",
    text: "Im Dashboard oder direkt im Discord-Panel.",
  },
  {
    icon: "↩️",
    title: "Zurückgeben",
    text: "Zwei Stunden pro Ausleihe — wir erinnern dich rechtzeitig.",
  },
] as const;

const VORTEILE = [
  {
    icon: "🔔",
    title: "Du verpasst keine Frist",
    text: "30 und 5 Minuten vorher kommt eine Nachricht in Discord. Du musst an nichts denken.",
  },
  {
    icon: "💳",
    title: "Kein Papierkram",
    text: "Deine Überweisung landet automatisch als Guthaben. Abo buchen geht mit einem Befehl.",
  },
  {
    icon: "📦",
    title: "Bestand, der wächst",
    text: "Vom Werkzeug bis zur vollen Rüstung — und was frei ist, siehst du live.",
  },
  {
    icon: "🔒",
    title: "Sauber geführt",
    text: "Jede Ausleihe steht in deiner Akte. Zugang nur mit gültiger Rolle, laufend geprüft.",
  },
] as const;

const FAQ = [
  {
    question: `Ist das ${SITE_NAME} der offizielle ${SERVER_NAME}-Server?`,
    answer: `Nein. Wir sind ein eigenständiger Anbieter, der auf ${SERVER_NAME} aktiv ist — nicht der Serverbetreiber. Login und Rollen laufen über unseren eigenen Discord „${AUTH_DISCORD_SERVER_NAME}“.`,
  },
  {
    question: "Wie leihe ich ein Item aus?",
    answer:
      "Mit Discord anmelden, sobald du bei uns die Kunden-Rolle hast. Danach im Dashboard oder direkt im Ausleih-Panel in Discord ein Item auswählen — das dauert Sekunden.",
  },
  {
    question: "Wie lange darf ich ein Item behalten?",
    answer:
      "Zwei Stunden pro Ausleihe. Du bekommst 30 Minuten und 5 Minuten vorher eine Direktnachricht. Wer mehr als 15 Minuten überzieht, kann eine Weile nichts ausleihen — je länger überzogen, desto länger die Sperre.",
  },
  {
    question: "Kann ich das Paket wechseln?",
    answer:
      "Ja. Beim Verlängern wählst du frei, welches Paket du buchen möchtest — es muss nicht dasselbe sein wie bisher. Die neue Laufzeit kommt oben auf die bestehende drauf.",
  },
  {
    question: "Muss ich die Website öffnen?",
    answer:
      "Nein. Ausleihen, Zurückgeben, Guthaben ansehen und Verlängern geht komplett über Discord. Die Website ist der bequemere Weg, aber kein Muss.",
  },
  {
    question: "Was passiert, wenn ich meine Rolle verliere?",
    answer:
      "Dann endet der Zugang sofort — das wird laufend gegen Discord geprüft, nicht nur beim Anmelden. Bekommst du die Rolle zurück, meldest du dich einfach neu an.",
  },
] as const;

export default async function Home() {
  const [session, stats, teamGroups, reviews, reviewSummary, partners, discordInvite] =
    await Promise.all([
      auth(),
      getPublicStats(),
      getTeamGroups(),
      getPublicReviews(),
      getReviewSummary(),
      getPublicPartners(),
      getDiscordInvite(),
    ]);
  const loggedIn = !!session?.user?.memberId;
  const anmeldeZiel = loggedIn ? "/dashboard" : "/login";
  const anmeldeText = loggedIn ? "Zum Dashboard" : "Mit Discord anmelden";

  // Zwei versetzte Baender lohnen sich erst ab genug Stimmen.
  const zweiReihen = reviews.length >= 6;
  const half = Math.ceil(reviews.length / 2);
  const reihe1 = zweiReihen ? reviews.slice(0, half) : reviews;
  const reihe2 = zweiReihen ? reviews.slice(half) : [];

  return (
    <main className="landing relative">
      <LandingAmbient />
      <LandingHeader loggedIn={loggedIn} hatKooperationen={partners.length > 0} />

      {/* ================================================================ */}
      {/* 1. Aufhaenger: Versprechen, Knopf, Vertrauen — alles auf einen    */}
      {/*    Blick, ohne dass man scrollen muss.                            */}
      {/* ================================================================ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <VoxelField />
          <div className="hero-veil" />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-6 pb-12 pt-14 sm:pb-16 sm:pt-20">
          <div className="max-w-2xl">
            <span className="badge-live fade-up">
              <span className="badge-dot" />
              Ausrüstung auf Zeit · aktiv auf {SERVER_NAME}
            </span>

            <h1 className="fade-up fade-up-1 mt-5 font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
              Nicht kaufen.
              <br />
              <span className="headline-accent">Ausleihen.</span>
            </h1>

            <p className="fade-up fade-up-2 mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
              Hol dir für die nächste Runde genau die Ausrüstung, die du brauchst — und gib sie
              danach einfach zurück. Um Bestand, Fristen und Abrechnung kümmern wir uns.
            </p>

            <div className="fade-up fade-up-3 mt-7 flex flex-wrap items-center gap-3">
              <a href={discordInvite} target="_blank" rel="noopener noreferrer" className="btn-primary">
                <DiscordLogo />
                Discord beitreten
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </a>
              <Link href={anmeldeZiel} className="btn-ghost">
                {anmeldeText}
              </Link>
              <a href="#pakete" className="text-sm font-medium text-muted transition hover:text-foreground">
                Preise ansehen
              </a>
            </div>
          </div>
        </div>

        {/* Vertrauensleiste: die harten Zahlen direkt unter dem Versprechen. */}
        <div className="relative z-10 border-y border-border/60 bg-surface/30 backdrop-blur-sm">
          <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-border/60 px-6 lg:grid-cols-4">
            <StatBand
              value={<CountUp value={stats.totalValue} prefix="$" compact />}
              label="Warenwert im Regal"
            />
            <StatBand value={<CountUp value={stats.totalQuantity} />} label="Items im Bestand" />
            <StatBand value={<CountUp value={stats.itemCount} />} label="Item-Arten" />
            <StatBand
              value={
                reviewSummary.count > 0 ? (
                  <>
                    {reviewSummary.average.toFixed(1)}
                    <span className="text-muted">/5</span>
                  </>
                ) : (
                  "—"
                )
              }
              label={reviewSummary.count > 0 ? `aus ${reviewSummary.count} Bewertungen` : "Bewertung"}
            />
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 2. Kooperationen — bewusst ganz weit oben, direkt nach dem        */}
      {/*    Aufhaenger, damit Partner sofort gesehen werden.               */}
      {/* ================================================================ */}
      {partners.length > 0 && (
        <Section
          id="kooperationen"
          eyebrow="Kooperationen"
          title="Unsere Partner"
          description="Ein Klick auf die Karte führt direkt zu ihrem Discord."
          eng
        >
          <PartnerCarousel partners={partners} />
        </Section>
      )}

      {/* ================================================================ */}
      {/* 3. Wie es laeuft — vier Schritte, kurz gehalten.                  */}
      {/* ================================================================ */}
      <Section id="ablauf" eyebrow="So läuft das" title="In vier Schritten ausgerüstet" eng>
        <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {SCHRITTE.map((schritt, i) => (
            <Reveal key={schritt.title} as="li" delay={i * 70} className="step-card">
              <span className="step-number" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="step-icon" aria-hidden>
                {schritt.icon}
              </span>
              <h3 className="mt-3 font-display text-sm font-bold sm:text-base">{schritt.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted sm:text-sm">{schritt.text}</p>
            </Reveal>
          ))}
        </ol>
      </Section>

      {/* ================================================================ */}
      {/* 4. Das Angebot — der eigentliche Grund fuer die Seite, deshalb    */}
      {/*    weit vor Team und Fragen.                                      */}
      {/* ================================================================ */}
      <Section
        id="pakete"
        eyebrow="Mitgliedschaft"
        title="Ein Paket, dann leihst du"
        description="Bezahlt wird vom Guthaben auf deinem Konto. Verlängern kannst du jederzeit selbst — auch mit einem anderen Paket."
        eng
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SUBSCRIPTION_PLANS.map((plan, i) => {
            const beliebt = plan.id === SUBSCRIPTION_PLANS[SUBSCRIPTION_PLANS.length - 1].id;
            const proMonat = Math.round(planMonthlyRate(plan));
            const ersparnis = Math.round(
              (1 - proMonat / planMonthlyRate(SUBSCRIPTION_PLANS[0])) * 100
            );
            return (
              <Reveal
                key={plan.id}
                delay={i * 80}
                className={`plan-card${beliebt ? " plan-card-featured" : ""}`}
              >
                {beliebt && <span className="plan-ribbon">Beliebt</span>}
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                  {plan.label}
                </p>
                <p className="mt-2 font-display text-3xl font-extrabold tracking-tight">
                  {formatCoins(plan.price)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {formatCoins(proMonat)} pro Monat
                  {ersparnis > 0 && (
                    <span className="ml-1.5 font-semibold text-accent-2">−{ersparnis} %</span>
                  )}
                </p>
                <ul className="mt-4 space-y-1.5 text-sm text-muted">
                  <PlanPoint>Ganzer Bestand verfügbar</PlanPoint>
                  <PlanPoint>Website und Discord</PlanPoint>
                  <PlanPoint>Erinnerungen per Nachricht</PlanPoint>
                </ul>
              </Reveal>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href={anmeldeZiel} className="btn-primary">
            {anmeldeText}
            <span aria-hidden className="btn-arrow">
              →
            </span>
          </Link>
          <Link href="/bewerbung" className="btn-ghost">
            Erst bewerben
          </Link>
        </div>
      </Section>

      {/* ================================================================ */}
      {/* 5. Warum wir — vier kurze Punkte in einer Reihe statt sechs       */}
      {/*    grosser Karten.                                                */}
      {/* ================================================================ */}
      <Section eyebrow="Warum wir" title="Was du davon hast" eng>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {VORTEILE.map((vorteil, i) => (
            <Reveal key={vorteil.title} delay={i * 70} className="feature-card">
              <span className="feature-icon" aria-hidden>
                {vorteil.icon}
              </span>
              <h3 className="mt-3 font-display text-sm font-bold sm:text-base">{vorteil.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted sm:text-sm">{vorteil.text}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ================================================================ */}
      {/* 6. Stimmen — laeuft von selbst durch, kostet kaum Hoehe.          */}
      {/* ================================================================ */}
      {reviews.length > 0 && (
        <section id="stimmen" className="section-pad overflow-hidden">
          <div className="mx-auto max-w-5xl px-6">
            <Reveal>
              <SectionHead
                eyebrow="Stimmen"
                title="Was unsere Kunden sagen"
                description={
                  reviewSummary.count > 0
                    ? `Durchschnittlich ${reviewSummary.average.toFixed(1)} von 5 Sternen aus ${reviewSummary.count} Bewertung${reviewSummary.count === 1 ? "" : "en"}.`
                    : undefined
                }
              />
            </Reveal>
          </div>

          <div className="mt-8 space-y-3">
            <ReviewMarquee reviews={reihe1} speed={55} />
            {reihe2.length > 0 && <ReviewMarquee reviews={reihe2} reverse speed={68} />}
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* 7. Team und Fragen nebeneinander - spart eine ganze Seitenhoehe.  */}
      {/* ================================================================ */}
      <section className="section-pad">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-12 px-6 lg:grid-cols-2 lg:gap-10">
          {teamGroups.length > 0 && (
            <div id="team">
              <Reveal>
                <SectionHead eyebrow="Unser Team" title="Wer dahintersteckt" />
              </Reveal>
              <div className="mt-6 space-y-6">
                {teamGroups.map((group) => (
                  <div key={group.key}>
                    <div className="mb-3 flex items-center gap-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                        {group.label}
                      </h3>
                      <div className="divider-glow flex-1" />
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {group.members.map((teamMember, i) => (
                        <Reveal key={teamMember.discordId} delay={(i % 6) * 50} className="team-chip">
                          {teamMember.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={teamMember.avatarUrl} alt="" className="team-chip-avatar" />
                          ) : (
                            <span className="team-chip-avatar flex items-center justify-center text-[10px] font-semibold text-muted">
                              {teamMember.displayName.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                          <span className="truncate text-xs font-medium">
                            {teamMember.displayName}
                          </span>
                        </Reveal>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div id="fragen">
            <Reveal>
              <SectionHead eyebrow="Fragen" title="Kurz beantwortet" />
            </Reveal>
            <div className="mt-6">
              <FaqAccordion items={[...FAQ]} />
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 8. Abschluss                                                      */}
      {/* ================================================================ */}
      <section className="pb-20">
        <div className="mx-auto max-w-5xl px-6">
          <Reveal className="cta-panel">
            <div className="relative">
              <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                Bereit für die nächste Runde?
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
                Alles läuft über unseren Discord: Rolle holen, anmelden, ausleihen. Hast du die
                Rolle noch nicht, bewirb dich direkt bei uns — das dauert keine zwei Minuten.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href={discordInvite} target="_blank" rel="noopener noreferrer" className="btn-primary">
                  <DiscordLogo />
                  Discord beitreten
                  <span aria-hidden className="btn-arrow">
                    →
                  </span>
                </a>
                <Link href={anmeldeZiel} className="btn-ghost">
                  {anmeldeText}
                </Link>
                <Link href="/bewerbung" className="btn-ghost">
                  Bewerben
                </Link>
              </div>
              <p className="mt-6 max-w-lg text-xs leading-relaxed text-muted/80">
                Wir sind ein eigenständiger Anbieter, aktiv auf{" "}
                <a href={SERVER_URL} target="_blank" rel="noopener noreferrer" className="link-subtle">
                  {SERVER_URL.replace("https://", "")}
                </a>{" "}
                — nicht der offizielle {SERVER_NAME}-Server selbst. Anmeldung und Rollen laufen über
                unseren eigenen Discord „{AUTH_DISCORD_SERVER_NAME}“.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-6 text-center text-xs text-muted">
          <div className="flex items-center gap-2">
            <span className="logo-mark logo-mark-sm">OL</span>
            <span className="font-display font-bold text-foreground">{SITE_NAME}</span>
          </div>
          <p>
            Eigenständiger Item-Verleih, aktiv auf {SERVER_NAME} — nicht der offizielle
            Serverbetreiber.
          </p>
          <nav className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link href="/impressum" className="transition hover:text-foreground">
              Impressum
            </Link>
            <Link href="/datenschutz" className="transition hover:text-foreground">
              Datenschutz
            </Link>
            <Link href="/dashboard/regelwerk" className="transition hover:text-foreground">
              Regelwerk
            </Link>
            <a
              href={discordInvite}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-foreground"
            >
              Discord
            </a>
          </nav>
        </div>
      </footer>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Bausteine                                                                  */
/* -------------------------------------------------------------------------- */

function SectionHead({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">
        {title}
      </h2>
      {description && <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>}
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  description,
  eng,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  eng?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="section-pad">
      <div className={`mx-auto px-6 ${eng ? "max-w-5xl" : "max-w-6xl"}`}>
        <Reveal>
          <SectionHead eyebrow={eyebrow} title={title} description={description} />
        </Reveal>
        <div className="mt-7">{children}</div>
      </div>
    </section>
  );
}

function StatBand({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="px-4 py-5 text-center sm:py-6">
      <p className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

function PlanPoint({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className="mt-0.5 text-accent-2">
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

function DiscordLogo() {
  return (
    <svg viewBox="0 0 24 18" width="18" height="14" fill="currentColor" aria-hidden>
      <path d="M20.317 1.492A19.79 19.79 0 0 0 15.432 0c-.21.375-.455.88-.623 1.28a18.27 18.27 0 0 0-5.487 0A12.6 12.6 0 0 0 8.69 0 19.736 19.736 0 0 0 3.8 1.495C.72 6.045-.116 10.48.302 14.853a19.9 19.9 0 0 0 6.033 3.04c.486-.66.92-1.362 1.293-2.1a12.9 12.9 0 0 1-2.037-.977c.171-.125.338-.255.5-.389a14.2 14.2 0 0 0 12.02 0c.163.135.33.265.5.39-.65.383-1.334.71-2.04.977.374.738.807 1.44 1.293 2.1a19.85 19.85 0 0 0 6.037-3.04c.5-5.08-.838-9.47-3.584-13.362ZM8.02 12.33c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.335-.955 2.42-2.157 2.42Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.335-.947 2.42-2.157 2.42Z" />
    </svg>
  );
}
