import Link from "next/link";
import { auth } from "@/auth";
import LandingHeader from "@/components/landing/LandingHeader";
import VoxelField from "@/components/landing/VoxelField";
import Reveal from "@/components/landing/Reveal";
import CountUp from "@/components/landing/CountUp";
import ReviewMarquee from "@/components/landing/ReviewMarquee";
import FaqAccordion from "@/components/FaqAccordion";
import { getPublicStats } from "@/lib/stats";
import { getTeamGroups } from "@/lib/team";
import { getPublicReviews, getReviewSummary } from "@/lib/reviews";
import {
  AUTH_DISCORD_SERVER_NAME,
  SERVER_NAME,
  SERVER_URL,
  SITE_NAME,
  SUBSCRIPTION_PLANS,
  formatCoins,
} from "@/lib/constants";

const SCHRITTE = [
  {
    icon: "🎮",
    title: "Discord beitreten",
    text: `Komm auf unseren Discord „${AUTH_DISCORD_SERVER_NAME}“ und hol dir die Kunden-Rolle.`,
  },
  {
    icon: "🔑",
    title: "Anmelden",
    text: "Ein Klick — der Login läuft komplett über deinen Discord-Account. Kein Passwort, kein Formular.",
  },
  {
    icon: "⛏️",
    title: "Item aussuchen",
    text: "Im Dashboard oder direkt im Discord-Panel. Jede Kategorie hat ihren eigenen Kanal.",
  },
  {
    icon: "↩️",
    title: "Zurückgeben",
    text: "Zwei Stunden pro Ausleihe. Wir erinnern dich rechtzeitig per DM — du musst an nichts denken.",
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
      "Zwei Stunden pro Ausleihe. Du bekommst 30 Minuten und 5 Minuten vorher eine Direktnachricht. Wer mehr als 15 Minuten überzieht, wird für zwei Stunden vom Ausleihen gesperrt.",
  },
  {
    question: "Was kostet die Mitgliedschaft?",
    answer:
      "Es gibt Pakete für 1, 3 oder 6 Monate. Bezahlt wird vom Guthaben auf deinem Konto — deine Überweisung wird automatisch erkannt und gutgeschrieben.",
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

const VORTEILE = [
  {
    icon: "🔒",
    title: "Zugang nur mit Rolle",
    text: "Wer die Rolle in Discord verliert, verliert im selben Moment den Zugang. Das wird laufend geprüft, nicht nur beim Anmelden.",
  },
  {
    icon: "📁",
    title: "Lückenlose Akten",
    text: "Jede Ausleihe, jede Rückgabe, jede Änderung steht in deiner Akte. Nachvollziehbar für dich und für die Aufsicht.",
  },
  {
    icon: "🔔",
    title: "Erinnerungen, die ankommen",
    text: "30 Minuten vorher, 5 Minuten vorher, bei Ablauf. Als Direktnachricht in Discord, ohne dass du die Website offen haben musst.",
  },
  {
    icon: "💳",
    title: "Guthaben statt Papierkram",
    text: "Deine Überweisung landet automatisch als Guthaben auf deinem Konto. Abo buchen geht dann mit einem Befehl.",
  },
  {
    icon: "🎫",
    title: "Tickets mit festem Ablauf",
    text: "Support, Bewerbung, Verleih-Service — jedes Ticket wird übernommen, bearbeitet und sauber geschlossen.",
  },
  {
    icon: "📦",
    title: "Bestand, der wächst",
    text: "Vom Werkzeug bis zur vollen Rüstung. Was gerade verfügbar ist, siehst du live — hier und in Discord.",
  },
] as const;

export default async function Home() {
  const [session, stats, teamGroups, reviews, reviewSummary] = await Promise.all([
    auth(),
    getPublicStats(),
    getTeamGroups(),
    getPublicReviews(),
    getReviewSummary(),
  ]);
  const loggedIn = !!session?.user?.memberId;
  const teamCount = teamGroups.reduce((sum, g) => sum + g.members.length, 0);

  // Zwei versetzte Baender lesen sich lebendiger als eine lange Reihe.
  const half = Math.ceil(reviews.length / 2);
  const reihe1 = reviews.slice(0, half);
  const reihe2 = reviews.slice(half);

  return (
    <main className="landing relative">
      <LandingHeader loggedIn={loggedIn} />

      {/* ---------------------------------------------------------------- */}
      {/* Kopfbereich                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <VoxelField />
          <div className="hero-veil" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pb-28 pt-20 sm:pt-28">
          <div className="max-w-3xl">
            <span className="badge-live fade-up">
              <span className="badge-dot" />
              Aktiv auf {SERVER_NAME} · {stats.activeLoans} Item
              {stats.activeLoans === 1 ? "" : "s"} gerade unterwegs
            </span>

            <h1 className="fade-up fade-up-1 mt-6 font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
              Nicht kaufen.
              <br />
              <span className="headline-accent">Ausleihen.</span>
            </h1>

            <p className="fade-up fade-up-2 mt-7 max-w-xl text-lg leading-relaxed text-muted">
              Das {SITE_NAME} ist der Ausrüstungsverleih für {SERVER_NAME}. Du holst dir,
              was du für die nächste Runde brauchst — wir kümmern uns um Bestand, Fristen und
              alles dazwischen.
            </p>

            <div className="fade-up fade-up-3 mt-9 flex flex-wrap items-center gap-3">
              <Link href={loggedIn ? "/dashboard" : "/login"} className="btn-primary">
                {loggedIn ? "Zum Dashboard" : "Mit Discord anmelden"}
                <span aria-hidden className="btn-arrow">
                  →
                </span>
              </Link>
              <a href="#ablauf" className="btn-ghost">
                So läuft das ab
              </a>
            </div>

            <p className="fade-up fade-up-4 mt-8 max-w-lg text-xs leading-relaxed text-muted/80">
              Wir sind ein eigenständiger Anbieter, aktiv auf{" "}
              <a href={SERVER_URL} target="_blank" rel="noopener noreferrer" className="link-subtle">
                {SERVER_URL.replace("https://", "")}
              </a>{" "}
              — nicht der offizielle {SERVER_NAME}-Server selbst. Anmeldung und Rollen laufen über
              unseren eigenen Discord „{AUTH_DISCORD_SERVER_NAME}“.
            </p>
          </div>
        </div>

        {/* Kennzahlen-Band als Abschluss des Kopfbereichs */}
        <div className="relative border-y border-border/60 bg-surface/30 backdrop-blur-sm">
          <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-border/60 px-6 lg:grid-cols-4">
            <StatBand
              value={<CountUp value={stats.totalValue} prefix="$" compact />}
              label="Warenwert im Regal"
            />
            <StatBand value={<CountUp value={stats.totalQuantity} />} label="Items im Bestand" />
            <StatBand value={<CountUp value={stats.kundenCount} />} label="Kunden" />
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
              label={`Bewertung${reviewSummary.count > 0 ? ` aus ${reviewSummary.count}` : ""}`}
            />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Ablauf                                                            */}
      {/* ---------------------------------------------------------------- */}
      <Section id="ablauf" eyebrow="Der Ablauf" title="Vier Schritte, dann bist du ausgerüstet">
        <ol className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SCHRITTE.map((schritt, i) => (
            <Reveal key={schritt.title} as="li" delay={i * 90} className="step-card">
              <span className="step-number" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="step-icon" aria-hidden>
                {schritt.icon}
              </span>
              <h3 className="mt-4 font-display text-base font-bold">{schritt.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{schritt.text}</p>
            </Reveal>
          ))}
        </ol>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Was dahintersteckt                                                */}
      {/* ---------------------------------------------------------------- */}
      <Section
        eyebrow="Was dahintersteckt"
        title="Ein Verleih, der sich um den Papierkram kümmert"
        description="Das meiste davon merkst du im Alltag gar nicht — genau das ist der Punkt."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {VORTEILE.map((vorteil, i) => (
            <Reveal key={vorteil.title} delay={(i % 3) * 90} className="feature-card">
              <span className="feature-icon" aria-hidden>
                {vorteil.icon}
              </span>
              <h3 className="mt-4 font-display text-base font-bold">{vorteil.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{vorteil.text}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Zahlen                                                            */}
      {/* ---------------------------------------------------------------- */}
      <Section id="zahlen" eyebrow="Live-Zahlen" title="Der aktuelle Stand">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <BigStat
            delay={0}
            label="Gesamtwert aller Items"
            value={formatCoins(stats.totalValue)}
            hint={`${stats.itemCount} verschiedene Item-Arten`}
          />
          <BigStat
            delay={90}
            label="Aktuell ausgeliehen"
            value={String(stats.activeLoans)}
            hint="laufende Ausleihen in diesem Moment"
            tone="accent-2"
          />
          <BigStat
            delay={180}
            label="Kunden"
            value={String(stats.kundenCount)}
            hint={`${stats.activeMembers} aktive Mitglieder insgesamt`}
          />
          <BigStat
            delay={270}
            label="Im Team"
            value={String(teamCount)}
            hint="Aufsicht und Owner zusammen"
            tone="accent-2"
          />
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Stimmen                                                           */}
      {/* ---------------------------------------------------------------- */}
      {reviews.length > 0 && (
        <section id="stimmen" className="section-pad overflow-hidden">
          <div className="mx-auto max-w-6xl px-6">
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

          <div className="mt-10 space-y-4">
            <ReviewMarquee reviews={reihe1} speed={64} />
            {reihe2.length > 0 && <ReviewMarquee reviews={reihe2} reverse speed={78} />}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Pakete                                                            */}
      {/* ---------------------------------------------------------------- */}
      <Section
        eyebrow="Mitgliedschaft"
        title="Ein Paket, dann leihst du"
        description="Bezahlt wird vom Guthaben auf deinem Konto. Verlängern kannst du jederzeit selbst — auch mit einem anderen Paket."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {SUBSCRIPTION_PLANS.map((plan, i) => {
            const beliebt = i === 1;
            const proMonat = Math.round(plan.price / plan.months);
            return (
              <Reveal key={plan.id} delay={i * 100} className={`plan-card${beliebt ? " plan-card-featured" : ""}`}>
                {beliebt && <span className="plan-ribbon">Beliebt</span>}
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                  {plan.label}
                </p>
                <p className="mt-3 font-display text-3xl font-extrabold tracking-tight">
                  {formatCoins(plan.price)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  entspricht {formatCoins(proMonat)} pro Monat
                </p>
                <ul className="mt-5 space-y-2 text-sm text-muted">
                  <PlanPoint>Voller Zugriff auf den gesamten Bestand</PlanPoint>
                  <PlanPoint>Ausleihen über Website und Discord</PlanPoint>
                  <PlanPoint>Erinnerungen per Direktnachricht</PlanPoint>
                  {plan.months > 1 && <PlanPoint>Günstiger als monatlich verlängern</PlanPoint>}
                </ul>
              </Reveal>
            );
          })}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Team                                                              */}
      {/* ---------------------------------------------------------------- */}
      {teamGroups.length > 0 && (
        <Section id="team" eyebrow="Unser Team" title="Die Menschen hinter dem LeihCenter">
          <div className="space-y-10">
            {teamGroups.map((group) => (
              <div key={group.key}>
                <div className="mb-5 flex items-center gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">
                    {group.label}
                  </h3>
                  <div className="divider-glow flex-1" />
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {group.members.map((teamMember, i) => (
                    <Reveal key={teamMember.discordId} delay={(i % 5) * 70} className="team-card">
                      {teamMember.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={teamMember.avatarUrl}
                          alt=""
                          className="team-avatar object-cover"
                        />
                      ) : (
                        <div className="team-avatar flex items-center justify-center text-lg font-semibold text-muted">
                          {teamMember.displayName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <p className="mt-3 truncate text-sm font-semibold">{teamMember.displayName}</p>
                      <p className="truncate text-xs text-muted">@{teamMember.username}</p>
                    </Reveal>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Fragen                                                            */}
      {/* ---------------------------------------------------------------- */}
      <Section id="fragen" eyebrow="Fragen" title="Was oft gefragt wird" narrow>
        <FaqAccordion items={[...FAQ]} />
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Abschluss                                                         */}
      {/* ---------------------------------------------------------------- */}
      <section className="section-pad">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="cta-panel">
            <div className="relative">
              <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                Bereit für die nächste Runde?
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
                Melde dich mit Discord an. Hast du die Rolle noch nicht, kannst du dich direkt bei
                uns bewerben — das dauert keine zwei Minuten.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href={loggedIn ? "/dashboard" : "/login"} className="btn-primary">
                  {loggedIn ? "Zum Dashboard" : "Mit Discord anmelden"}
                  <span aria-hidden className="btn-arrow">
                    →
                  </span>
                </Link>
                <Link href="/bewerbung" className="btn-ghost">
                  Bewerben
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 text-center text-xs text-muted">
          <div className="flex items-center gap-2">
            <span className="logo-mark logo-mark-sm">OL</span>
            <span className="font-display font-bold text-foreground">{SITE_NAME}</span>
          </div>
          <p>
            Eigenständiger Item-Verleih, aktiv auf {SERVER_NAME} — nicht der offizielle
            Serverbetreiber.
          </p>
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
      <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {description && <p className="mt-3 text-sm leading-relaxed text-muted">{description}</p>}
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  description,
  narrow,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  narrow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="section-pad">
      <div className={`mx-auto px-6 ${narrow ? "max-w-3xl" : "max-w-6xl"}`}>
        <Reveal>
          <SectionHead eyebrow={eyebrow} title={title} description={description} />
        </Reveal>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function StatBand({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="px-4 py-7 text-center sm:py-8">
      <p className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{value}</p>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

function BigStat({
  label,
  value,
  hint,
  tone = "accent",
  delay,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "accent" | "accent-2";
  delay: number;
}) {
  return (
    <Reveal delay={delay} className="big-stat">
      <span
        aria-hidden
        className={`big-stat-bar ${tone === "accent" ? "bg-accent" : "bg-accent-2"}`}
      />
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-extrabold tracking-tight break-words">{value}</p>
      <p className="mt-2 text-xs text-muted">{hint}</p>
    </Reveal>
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
