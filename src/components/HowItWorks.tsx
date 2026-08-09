const STEPS = [
  {
    icon: "🎮",
    title: "Discord beitreten",
    description: "Werde Teil unseres Discord-Servers und hol dir die passende Rolle.",
  },
  {
    icon: "🔑",
    title: "Anmelden",
    description: "Ein Klick, Login läuft komplett über deinen Discord-Account.",
  },
  {
    icon: "⛏️",
    title: "Item auswählen",
    description: "Im Dashboard oder direkt im Discord-Panel das gewünschte Item ausleihen.",
  },
  {
    icon: "✅",
    title: "Loslegen",
    description: "Fertig ausgerüstet spielen – Abo, Historie und Status immer im Profil im Blick.",
  },
] as const;

export default function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-24">
      <div className="mb-10 text-center">
        <span className="text-xs font-medium uppercase tracking-widest text-accent">
          So funktioniert&apos;s
        </span>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          In vier Schritten ausgerüstet
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <div key={step.title} className="card card-hover relative overflow-hidden p-6">
            <span className="absolute -right-2 -top-2 text-5xl font-bold text-border/60">
              {i + 1}
            </span>
            <div className="relative mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2 text-xl">
              {step.icon}
            </div>
            <h3 className="relative text-sm font-semibold">{step.title}</h3>
            <p className="relative mt-2 text-sm leading-relaxed text-muted">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
