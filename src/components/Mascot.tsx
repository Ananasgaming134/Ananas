"use client";

import { useEffect, useState } from "react";

const QUIPS = [
  { emoji: "🧨", text: "Ich hab nachgezählt: 100% der Creeper hier sind unsichtbar. Alle." },
  { emoji: "🔋", text: "Fun Fact über mich: Ich brauche keinen Schlaf. Nur gelegentlich ein Update und Bewunderung." },
  { emoji: "🥚", text: "Warum leiht sich hier keiner ein Ei aus? Die eierlegende Wollmilchsau ist schon vergriffen." },
  { emoji: "🪞", text: "Ich hab mal ein Item an mich selbst verliehen. Die Rückgabe war... kompliziert." },
  { emoji: "🎯", text: "Mein Beruf: Diener. Meine Berufung: euer Guthaben im Blick behalten." },
  { emoji: "💥", text: "Zwischen mir und einem Creeper gibt's einen Unterschied: ich explodiere nur vor Stolz." },
  { emoji: "🌀", text: "Ein Support-Ticket aufgeben ist wie eine Enderperle werfen: kurz warten, dann bist du da." },
  { emoji: "🏃", text: "Ich hab keine Beine. Trotzdem renne ich euch gedanklich hinterher, wenn ihr zu spät zurückgebt." },
  { emoji: "⚡", text: "Warum ist Redstone so eine Drama-Queen? Zu viel Spannung, zu wenig Chill." },
  { emoji: "☕", text: "Mein Kaffee ist rein digital. Schmeckt trotzdem nach Verantwortung." },
  { emoji: "😴", text: "Ich zähl Items im Schlaf. Ach so, ich schlafe ja nicht. Macht Sinn." },
  { emoji: "👼", text: "Ein Golden Black Angel und ich haben beide Flügel. Meine sind nur aus CSS." },
  { emoji: "💎", text: "Pünktlich zurückgeben schlägt jeden Diamanten. Fast jeden." },
  { emoji: "♾️", text: "Ich bin technisch gesehen unsterblich. Praktisch gesehen: einfach gut gepflegt." },
  { emoji: "💰", text: "Mein Lieblingssatz im Verleih: „Kommt sofort zurück.“ Fast so schön wie „Guthaben aufgeladen“." },
];

/**
 * Animierte Diener-Figur mit rotierenden Sprüchen, oben rechts auf der
 * Kundenbereich-Uebersicht (unten rechts stoerte dort haeufig sichtbare
 * Buttons/Inhalte). mounted-Gate verhindert einen Hydration-Mismatch, da
 * der Startspruch zufaellig gewaehlt wird (client-only).
 */
export default function Mascot() {
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setMounted(true);
    setIndex(Math.floor(Math.random() * QUIPS.length));
    const id = setInterval(() => setIndex((i) => (i + 1) % QUIPS.length), 8000);
    return () => clearInterval(id);
  }, []);

  if (!mounted) return null;

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        aria-label="Diener wieder anzeigen"
        className="fixed right-5 top-24 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-accent/40 bg-gradient-to-br from-accent/25 via-surface-2 to-surface text-2xl shadow-[0_8px_24px_-6px_var(--accent)] transition hover:scale-110"
      >
        🤵
      </button>
    );
  }

  return (
    <div className="fade-up fixed right-5 top-24 z-40 flex max-w-[min(85vw,21rem)] items-center gap-3">
      <div className="card-glass relative rounded-2xl rounded-br-md px-4 py-3 pr-7 shadow-2xl">
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Diener ausblenden"
          className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-[10px] text-muted transition hover:scale-110 hover:text-foreground"
        >
          ✕
        </button>
        <div key={index} className="diener-pop">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            <span aria-hidden>{QUIPS[index].emoji}</span> Der Diener
          </p>
          <p
            className="mt-1 text-xs leading-relaxed text-foreground/90"
            dangerouslySetInnerHTML={{ __html: QUIPS[index].text }}
          />
        </div>
        <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-border bg-[var(--surface)]" />
      </div>

      <button
        type="button"
        onClick={() => setIndex((i) => (i + 1) % QUIPS.length)}
        aria-label="Nächster Spruch"
        className="group relative shrink-0 select-none"
      >
        <span className="absolute inset-0 -m-3 animate-pulse-slow rounded-full bg-gradient-to-br from-accent/50 to-accent-2/40 blur-xl" />
        <span className="absolute inset-0 -m-1 rounded-full bg-gradient-to-br from-accent/60 via-accent-2/40 to-accent/60 opacity-70 blur-[2px] transition group-hover:opacity-100" />
        <span className="relative flex h-20 w-20 animate-diener-idle items-center justify-center rounded-full border-2 border-accent/50 bg-gradient-to-br from-accent/25 via-surface-2 to-surface text-5xl shadow-[0_12px_36px_-8px_var(--accent)] transition group-hover:scale-110 group-hover:rotate-6">
          🤵
        </span>
        <span className="absolute -bottom-1 left-1/2 h-2.5 w-10 -translate-x-1/2 rounded-full bg-black/40 blur-sm" />
      </button>
    </div>
  );
}
