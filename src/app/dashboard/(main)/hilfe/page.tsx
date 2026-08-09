import Link from "next/link";
import { requireMember } from "@/lib/session";
import FaqAccordion from "@/components/FaqAccordion";
import { AUTH_DISCORD_SERVER_NAME } from "@/lib/constants";

export default async function HilfePage() {
  const member = await requireMember();

  const faq = [
    {
      question: "Wie leihe ich ein Item aus?",
      answer:
        "Geh zu „Items“, such dir ein verfügbares Item aus und klick auf „Ausleihen“. Das geht genauso über das Item-Panel im Discord. Ab dem Klick hast du 2 Stunden Zeit.",
    },
    {
      question: "Wie lange darf ich ein Item behalten?",
      answer:
        "Maximal 2 Stunden pro Ausleihe. Du bekommst automatisch Discord-DMs 30 Minuten und 5 Minuten vor Ablauf, danach eine Erinnerung sobald die Frist erreicht ist. Details unter „Anleitung“.",
    },
    {
      question: "Was passiert, wenn ich zu spät zurückgebe?",
      answer:
        "Bis zu 15 Minuten nach Fristende ist Kulanzzeit. Danach wirst du für 2 Stunden für neue Ausleihen gesperrt. Nimmst du das Item trotz abgelaufener Frist weiter ingame, fliegst du sofort ohne Rückerstattung raus – das zählt als Diebstahl.",
    },
    {
      question: "Kann ich dasselbe Item sofort wieder ausleihen?",
      answer:
        "Nein, nach der Rückgabe gilt eine 30-minütige Pause, bevor du dasselbe Item erneut ausleihen kannst. In dieser Zeit darfst du es auch nicht im Inventar haben.",
    },
    {
      question: "Wo finde ich meine Kundennummer?",
      answer: member.customerNumber
        ? `Deine Kundennummer ist ${member.customerNumber} – sie steht auch oben in deinem Profil. Du brauchst sie als Verwendungszweck bei Abo-Zahlungen.`
        : "Deine Kundennummer steht in deinem Profil unter „Profil“. Du brauchst sie als Verwendungszweck bei Abo-Zahlungen.",
    },
    {
      question: "Wie verlängere ich mein Abo?",
      answer:
        "Überweise den Betrag für die gewünschte Laufzeit an die im Profil angegebene Business-Card mit deiner Kundennummer als Verwendungszweck. Die Zahlung wird automatisch erkannt oder von der Aufsicht bestätigt – Details unter „Profil“.",
    },
    {
      question: "Wo sehe ich meine bisherigen Ausleihen?",
      answer:
        "In deinem Profil unter „Ausleihhistorie“ – dort stehen alle Ausleihen inklusive Fristen, Rückgabezeiten und eventueller Verstöße.",
    },
    {
      question: "Ich habe ein Problem oder eine Frage, die hier nicht steht.",
      answer: `Wende dich an eine Aufsichtsperson oder den Owner im „${AUTH_DISCORD_SERVER_NAME}“-Discord – die können dir direkt weiterhelfen.`,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="card-glass p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">
          Hilfe <span className="text-gradient">&amp; Support</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Antworten auf die häufigsten Fragen rund ums Ausleihen, Fristen und dein Abo. Nicht
          dabei? Wende dich einfach an eine Aufsicht.
        </p>
      </div>

      <FaqAccordion items={faq} />

      <div className="card p-6">
        <h2 className="text-sm font-semibold">Noch Fragen?</h2>
        <p className="mt-1.5 text-sm text-muted">
          Aufsichtspersonen und der Owner im „{AUTH_DISCORD_SERVER_NAME}“-Discord helfen dir gerne
          direkt weiter.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/dashboard/anleitung"
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-surface-2"
          >
            Zur Anleitung
          </Link>
          <Link
            href="/dashboard/akte"
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-surface-2"
          >
            Zu meinem Profil
          </Link>
        </div>
      </div>
    </div>
  );
}
