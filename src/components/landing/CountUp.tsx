"use client";

import { useEffect, useRef, useState } from "react";

function format(value: number, prefix: string, compact: boolean): string {
  if (!compact) return prefix + new Intl.NumberFormat("de-DE").format(Math.round(value));
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${prefix}${(value / 1_000_000_000).toFixed(2)} Mrd.`;
  if (abs >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(1)} Mio.`;
  return prefix + new Intl.NumberFormat("de-DE").format(Math.round(value));
}

/**
 * Zaehlt eine Zahl hoch, sobald sie ins Bild kommt. Grosse Betraege werden
 * abgekuerzt (2,45 Mrd.), damit die Kennzahl auf einen Blick erfassbar
 * bleibt statt als zwoelfstellige Ziffernkette.
 */
export default function CountUp({
  value,
  prefix = "",
  compact = false,
  duration = 1400,
}: {
  value: number;
  prefix?: string;
  compact?: boolean;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }

    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        const start = performance.now();
        const step = (t: number) => {
          const p = Math.min(1, (t - start) / duration);
          // Weiches Auslaufen, damit die Zahl am Ende "einrastet".
          setDisplay(value * (1 - Math.pow(1 - p, 3)));
          if (p < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.4 }
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {format(display, prefix, compact)}
    </span>
  );
}
