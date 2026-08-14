"use client";

import { useEffect, useState } from "react";

const QUIPS = [
  "Psst... hast du dein Item auch pünktlich zurückgebracht? 👀",
  "Ich bewache hier die Ausrüstung. Und dein Guthaben. Und deine Ausreden.",
  "Ein Golden Black Angel am Tag hält den Ärger fern.",
  "Frag nicht, warum ich hier stehe. Frag lieber, was du heute ausleihst.",
  "Guthaben rein, Ausrüstung raus &ndash; so einfach ist das hier.",
  "Ich hab schon mehr Mini-Bohrer gesehen als du Ausreden für Verspätungen.",
  "Ich schlafe nie. Ich zähle nur Items.",
  "30 Minuten Pause nach der Rückgabe &ndash; auch ich brauche mal Kaffee.",
  "Ein Diener braucht keinen Dank. Nur pünktliche Rückgaben.",
  "Dein Abo läuft &ndash; genau wie ich, wenn ein Creeper auftaucht.",
  "Ich hab hier alles im Blick. Wirklich alles.",
  "Kein Guthaben, kein Abo. Kein Abo, kein Ausleihen. So läuft das.",
  "Ich wurde für diesen Job programmiert. Bereue nichts.",
  "Verspätete Rückgabe? Ich seh dich. Ich seh alles.",
  "Zwischen uns bleibt's: dein Lieblings-Item verrät mehr über dich, als du denkst.",
];

/**
 * Animierte Diener-Figur mit rotierenden Sprüchen, unten rechts auf der
 * Kundenbereich-Uebersicht. mounted-Gate verhindert einen Hydration-
 * Mismatch, da der Startspruch zufaellig gewaehlt wird (client-only).
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
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-accent/40 bg-gradient-to-br from-accent/25 via-surface-2 to-surface text-2xl shadow-[0_8px_24px_-6px_var(--accent)] transition hover:scale-110"
      >
        🤵
      </button>
    );
  }

  return (
    <div className="fade-up fixed bottom-5 right-5 z-40 flex max-w-[min(85vw,21rem)] items-end gap-3">
      <div className="card-glass relative rounded-2xl rounded-br-md px-4 py-3 pr-7 shadow-2xl">
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Diener ausblenden"
          className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-[10px] text-muted transition hover:scale-110 hover:text-foreground"
        >
          ✕
        </button>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">Der Diener</p>
        <p key={index} className="fade-up mt-1 text-xs leading-relaxed text-foreground/90" dangerouslySetInnerHTML={{ __html: QUIPS[index] }} />
        <span className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-border bg-[var(--surface)]" />
      </div>

      <button
        type="button"
        onClick={() => setIndex((i) => (i + 1) % QUIPS.length)}
        aria-label="Nächster Spruch"
        className="group relative shrink-0 select-none"
      >
        <span className="absolute inset-0 -m-2 animate-pulse-slow rounded-full bg-gradient-to-br from-accent/40 to-accent-2/30 blur-xl" />
        <span className="relative flex h-16 w-16 animate-bob-slow items-center justify-center rounded-full border border-accent/40 bg-gradient-to-br from-accent/20 via-surface-2 to-surface text-4xl shadow-[0_10px_30px_-8px_var(--accent)] transition group-hover:scale-110">
          🤵
        </span>
        <span className="absolute -bottom-1 left-1/2 h-2 w-8 -translate-x-1/2 rounded-full bg-black/40 blur-sm" />
      </button>
    </div>
  );
}
