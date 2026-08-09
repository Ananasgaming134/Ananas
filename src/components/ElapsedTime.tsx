"use client";

import { useEffect, useState } from "react";

function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}t ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Live tickender Timer, der zeigt wie lange ein Item schon ausgeliehen ist. */
export default function ElapsedTime({ since, className }: { since: string | Date; className?: string }) {
  const sinceMs = new Date(since).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Bewusst sofort beim Mount setzen (nicht ueber einen Reducer/externen
    // Store zu loesen): das ist ein reiner Client-Ticker, der Serverzeitpunkt
    // wuerde sonst kurz "leer" bleiben statt sofort die aktuelle Dauer zu zeigen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Serverseitig / vor dem ersten Tick noch nichts anzeigen, um
  // Hydration-Mismatches zu vermeiden (Zeit haengt vom Client-Zeitpunkt ab).
  if (now === null) return <span className={className}>&nbsp;</span>;

  return <span className={className}>{formatElapsed(now - sinceMs)}</span>;
}
