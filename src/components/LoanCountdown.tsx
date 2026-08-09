"use client";

import { useEffect, useState } from "react";

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Live tickender Countdown bis zur 2h-Ausleihfrist (dueAt). Faerbt sich je
 * nach verbleibender Zeit ein (neutral -> gelb ab 30 Min. -> orange ab 5
 * Min. -> rot bei Ueberziehung, dann als Stoppuhr aufwaerts seit Fristende).
 */
export default function LoanCountdown({ dueAt, className }: { dueAt: string | Date; className?: string }) {
  const dueMs = new Date(dueAt).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (now === null) return <span className={className}>&nbsp;</span>;

  const remaining = dueMs - now;

  if (remaining <= 0) {
    return (
      <span className={`font-medium text-danger ${className ?? ""}`}>
        Überfällig seit {formatDuration(-remaining)}
      </span>
    );
  }

  const tone =
    remaining <= 5 * 60_000
      ? "text-danger"
      : remaining <= 30 * 60_000
        ? "text-yellow-500"
        : "text-muted";

  return <span className={`${tone} ${className ?? ""}`}>Noch {formatDuration(remaining)}</span>;
}
