"use client";

import { useEffect, useState } from "react";

const QUIPS = [
  { emoji: "🧨", text: "Warum hat der Creeper keine Freunde? Er geht immer etwas zu explosiv auf Leute zu." },
  { emoji: "😅", text: "Ich hab mal versucht, mir selbst eine Spitzhacke auszuleihen. Hat nicht geklappt. War trotzdem peinlich." },
  { emoji: "🤖", text: "Fun Fact über mich: 90% Code, 10% schlechte Wortspiele. Die Quote wird nicht besser." },
  { emoji: "☕", text: "Ich hab zwar keinen Körper, aber mein Kaffee-Bedarf ist trotzdem episch." },
  { emoji: "🪨", text: "Ich und Redstone haben eine Sache gemeinsam: manchmal ganz schön kompliziert verdrahtet." },
  { emoji: "📊", text: "Ich hab kein Gehalt, dafür aber richtig hübsche Guthaben-Statistiken. Zählt das?" },
  { emoji: "✨", text: "Ein Golden Black Angel und ich haben eins gemeinsam: wir stehen beide gern im Rampenlicht." },
  { emoji: "⚡", text: "Ich zähl Items schneller, als ein Creeper zischen kann. Übungssache." },
  { emoji: "🌀", text: "Support-Tickets sind wie Enderperlen &ndash; man landet manchmal woanders, als man dachte." },
  { emoji: "🦶", text: "Ich hab keine Beine, steh aber trotzdem immer für euch bereit. Multitasking eben." },
  { emoji: "🎵", text: "Warum ist die Ausleihe nie traurig? Weil sie am Ende immer pünktlich zurückkommt." },
  { emoji: "💭", text: "Ich träume nicht. Ich rendere einfach Sprüche für euch, während ihr schlaft." },
  { emoji: "🎶", text: "Wenn dein Guthaben Musik wäre, wärst du gerade mitten im besten Refrain." },
  { emoji: "💎", text: "Kleiner Diener-Tipp: ein pünktlich zurückgebrachtes Item macht glücklicher als zehn Emeralds." },
  { emoji: "🎩", text: "Ich bin nur ein Diener, aber ich trag meinen imaginären Hut mit Stolz." },
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
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
          <span aria-hidden>{QUIPS[index].emoji}</span> Der Diener
        </p>
        <p
          key={index}
          className="fade-up mt-1 text-xs leading-relaxed text-foreground/90"
          dangerouslySetInnerHTML={{ __html: QUIPS[index].text }}
        />
        <span className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-border bg-[var(--surface)]" />
      </div>

      <button
        type="button"
        onClick={() => setIndex((i) => (i + 1) % QUIPS.length)}
        aria-label="Nächster Spruch"
        className="group relative shrink-0 select-none"
      >
        <span className="absolute inset-0 -m-3 animate-pulse-slow rounded-full bg-gradient-to-br from-accent/50 to-accent-2/40 blur-xl" />
        <span className="absolute inset-0 -m-1 rounded-full bg-gradient-to-br from-accent/60 via-accent-2/40 to-accent/60 opacity-70 blur-[2px] transition group-hover:opacity-100" />
        <span className="relative flex h-20 w-20 animate-bob-slow items-center justify-center rounded-full border-2 border-accent/50 bg-gradient-to-br from-accent/25 via-surface-2 to-surface text-5xl shadow-[0_12px_36px_-8px_var(--accent)] transition group-hover:scale-110 group-hover:rotate-6">
          🤵
        </span>
        <span className="absolute -bottom-1 left-1/2 h-2.5 w-10 -translate-x-1/2 rounded-full bg-black/40 blur-sm" />
      </button>
    </div>
  );
}
