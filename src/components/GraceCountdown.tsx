"use client";

import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "abgelaufen";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = Math.floor((ms % 60_000) / 1000);
  if (hours > 0) return `${hours} Std. ${minutes} Min.`;
  if (minutes > 0) return `${minutes} Min. ${seconds} Sek.`;
  return `${seconds} Sek.`;
}

/**
 * Live-Countdown der 3-Stunden-Zahlungsfrist nach der Rollenvergabe. Der
 * mounted-Gate verhindert einen Hydration-Mismatch, da Server und Client die
 * Restzeit sonst zu unterschiedlichen Zeitpunkten berechnen.
 */
export default function GraceCountdown({ until }: { until: string | Date }) {
  const target = typeof until === "string" ? new Date(until) : until;
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(target.getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  if (remaining === null) return null;

  return (
    <span className={remaining <= 30 * 60_000 ? "font-semibold text-danger" : "font-semibold text-yellow-500"}>
      {formatRemaining(remaining)}
    </span>
  );
}
