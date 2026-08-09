import { AUTH_DISCORD_SERVER_NAME, SERVER_NAME, SITE_NAME } from "@/lib/constants";

const FAQ_ITEMS = [
  {
    q: `Ist ${SITE_NAME} der offizielle ${SERVER_NAME}-Server?`,
    a: `Nein. Wir sind ein eigenständiger Anbieter, der auf ${SERVER_NAME} aktiv ist – nicht der Serverbetreiber selbst. Login und Rollen laufen über unseren eigenen Discord-Server "${AUTH_DISCORD_SERVER_NAME}".`,
  },
  {
    q: "Wie leihe ich ein Item aus?",
    a: "Mit Discord anmelden, sobald du die passende Rolle in unserem Discord hast. Danach im Dashboard oder direkt im Ausleih-Panel auf unserem Discord-Server ein Item auswählen und ausleihen – geht in wenigen Sekunden.",
  },
  {
    q: "Was kostet die Mitgliedschaft?",
    a: "Es gibt Abos für 1, 3 oder 6 Monate. Den aktuellen Status siehst du jederzeit in deinem Profil, inklusive Restlaufzeit. Verlängert wird per Überweisung – die genaue Anleitung findest du direkt im Profil.",
  },
  {
    q: "Wie lange darf ich ein Item behalten?",
    a: "Solange du es aktiv nutzt – bleib einfach fair gegenüber der Community. Aufsicht und Owner sehen jederzeit live, was gerade ausgeliehen ist und wie lange schon.",
  },
  {
    q: "Ist nachvollziehbar, wer was macht?",
    a: "Ja. Jede Aktion im System – Ausleihen, Rückgaben, Änderungen an Akten – wird lückenlos geloggt und ist für Aufsicht und Owner einsehbar.",
  },
  {
    q: "Muss ich extra die Website öffnen?",
    a: "Nicht zwingend. Ausleihen und Zurückgeben funktioniert auch direkt über das Panel in unserem Discord-Server, ganz ohne Website.",
  },
] as const;

export default function FaqSection() {
  return (
    <section className="mx-auto max-w-4xl px-6 pb-24">
      <div className="mb-10 text-center">
        <span className="text-xs font-medium uppercase tracking-widest text-accent">FAQ</span>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Häufige Fragen</h2>
      </div>

      <div className="space-y-3">
        {FAQ_ITEMS.map((item) => (
          <details key={item.q} className="card group p-5 open:border-accent/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
              {item.q}
              <span className="shrink-0 text-muted transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
