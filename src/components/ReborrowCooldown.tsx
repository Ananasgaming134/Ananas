"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * Live tickender Countdown bis ein Item nach eigener Rueckgabe wieder
 * ausleihbar ist (30-Min.-Sperre). Aktualisiert die Seite einmal automatisch
 * (router.refresh()), sobald die Zeit abgelaufen ist, damit der Ausleihen-
 * Button ohne manuellen Reload wieder freigeschaltet wird.
 */
export default function ReborrowCooldown({ until }: { until: string | Date }) {
  const untilMs = new Date(until).getTime();
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (now !== null && now >= untilMs) router.refresh();
  }, [now, untilMs, router]);

  if (now === null) return <span>&nbsp;</span>;

  const remaining = untilMs - now;
  if (remaining <= 0) return <span>Wird aktualisiert…</span>;

  return <span>Wieder ausleihbar in {formatDuration(remaining)}</span>;
}
