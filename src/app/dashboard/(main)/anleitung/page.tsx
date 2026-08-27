import Link from "next/link";
import {
  BORROW_DURATION_MS,
  OVERDUE_SUSPENSION_GRACE_MS,
  REBORROW_COOLDOWN_MS,
} from "@/lib/constants";

const STEPS = [
  {
    n: 1,
    title: "Item aussuchen",
    text: "Schau im Item-Katalog nach, was gerade verfügbar ist – nach Kategorie sortiert, mit Bild und Bestand.",
  },
  {
    n: 2,
    title: "Ausleihen",
    text: "Klick auf „Ausleihen“ – auf der Website oder direkt im Discord über das Item-Panel. Beides ist immer synchron.",
  },
  {
    n: 3,
    title: "2 Stunden nutzen",
    text: "Ab dem Klick läuft die Frist. Du bekommst rechtzeitig Erinnerungen per Discord-DM.",
  },
  {
    n: 4,
    title: "Zurückgeben",
    text: "Vor Fristende zurückgeben – auf der Website oder im Discord. Danach ist das Item für andere wieder frei.",
  },
];

const hours = BORROW_DURATION_MS / (60 * 60 * 1000);
const cooldownMin = REBORROW_COOLDOWN_MS / (60 * 1000);
const graceMin = OVERDUE_SUSPENSION_GRACE_MS / (60 * 1000);

export default function AnleitungPage() {
  return (
    <div className="space-y-8">
      <div className="card-glass relative overflow-hidden p-6 sm:p-8">
        <div className="shimmer absolute inset-0 pointer-events-none" />
        <h1 className="relative text-2xl font-semibold">
          So funktioniert das <span className="text-gradient">LeihCenter</span>
        </h1>
        <p className="relative mt-2 max-w-2xl text-sm text-muted">
          Ausleihen geht in wenigen Klicks – auf der Website genauso wie direkt im Discord. Hier
          steht alles, was du dafür wissen musst: der Ablauf, die Zeitregeln und was bei
          Überziehung passiert.
        </p>
      </div>

      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">Der Ablauf</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div key={step.n} className="card card-hover relative overflow-hidden p-5">
              <span className="text-3xl font-bold text-accent/25">{step.n}</span>
              <h3 className="mt-2 text-sm font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-xs text-muted">{step.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
          Die Zeitregeln
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RuleCard
            icon="⏱️"
            tone="accent"
            title={`${hours} Stunden pro Ausleihe`}
            text={`Jedes Item darfst du maximal ${hours} Stunden am Stück haben. Danach muss es zurückgegeben sein.`}
          />
          <RuleCard
            icon="🔁"
            tone="accent-2"
            title={`${cooldownMin} Minuten Pause danach`}
            text={`Nach der Rückgabe kannst du dasselbe Item erst nach ${cooldownMin} Minuten wieder ausleihen. In dieser Zeit darfst du es auch nicht im Inventar haben.`}
          />
          <RuleCard
            icon="🔔"
            tone="accent"
            title="Erinnerungen per Discord-DM"
            text="Du wirst automatisch erinnert: 30 Minuten vorher, 5 Minuten vorher, und sobald die Frist erreicht ist."
          />
          <RuleCard
            icon="🚫"
            tone="danger"
            title={`Ab ${graceMin} Min. Überziehung: Sperre`}
            text={`Überziehst du mehr als ${graceMin} Minuten, kannst du eine Weile nichts ausleihen. Wie lange, richtet sich danach, wie lange du überzogen hast: bis 1 Std. sind es 3 Std. Sperre, bis 2 Std. sind es 6 Std., bis 3 Std. sind es 12 Std., darüber 24 Std. Gerechnet wird ab dem Moment der Rückgabe.`}
          />
        </div>

        <div className="card mt-4 border-l-4 border-l-danger p-5">
          <p className="text-sm font-semibold text-danger">⚠️ Wichtig bei Überziehung</p>
          <p className="mt-1.5 text-sm text-muted">
            Nimmst du das Item trotz abgelaufener Frist weiter ingame, fliegst du sofort und ohne
            Rückerstattung aus dem Verleih – die Handlung wird als{" "}
            <span className="font-medium text-danger">Diebstahl</span> gewertet.
          </p>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-sm font-semibold">Auch im Discord</h2>
        <p className="mt-1.5 text-sm text-muted">
          Alles, was du hier auf der Website machst, geht genauso im Discord: Items über das
          Panel auswählen und ausleihen, mit{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">/akte</code> deine eigene
          Akte einsehen, und über das Status-Panel sehen, was gerade ausgeliehen ist. Beide Seiten
          sind immer synchron.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/items"
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110"
        >
          Zu den Items
        </Link>
        <Link
          href="/dashboard/hilfe"
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-surface-2"
        >
          Noch Fragen? Zur Hilfe
        </Link>
      </div>
    </div>
  );
}

function RuleCard({
  icon,
  title,
  text,
  tone,
}: {
  icon: string;
  title: string;
  text: string;
  tone: "accent" | "accent-2" | "danger";
}) {
  const toneClasses =
    tone === "danger"
      ? "border-l-danger"
      : tone === "accent-2"
        ? "border-l-accent-2"
        : "border-l-accent";
  return (
    <div className={`card card-hover border-l-4 p-5 ${toneClasses}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-muted">{text}</p>
        </div>
      </div>
    </div>
  );
}
