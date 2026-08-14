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
 * Kleine animierte Diener-Figur mit rotierenden Sprüchen, unten rechts auf
 * der Kundenbereich-Uebersicht. mounted-Gate verhindert einen Hydration-
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
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-2 text-2xl shadow-lg transition hover:scale-110"
      >
        🤵
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex max-w-[min(80vw,20rem)] items-end gap-2">
      <div className="card-glass relative rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xl">
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Diener ausblenden"
          className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-[10px] text-muted transition hover:text-foreground"
        >
          ✕
        </button>
        <p dangerouslySetInnerHTML={{ __html: QUIPS[index] }} />
      </div>
      <button
        type="button"
        onClick={() => setIndex((i) => (i + 1) % QUIPS.length)}
        aria-label="Nächster Spruch"
        className="animate-bob-slow shrink-0 select-none text-4xl transition hover:scale-110"
      >
        🤵
      </button>
    </div>
  );
}
