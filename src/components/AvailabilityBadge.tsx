/**
 * Einheitliche Verfuegbarkeits-Anzeige fuer Items: farbiger Punkt, Zahl und
 * ein kleiner Balken - damit auf einen Blick klar ist, wie viel noch da ist,
 * statt nur "2/5" lesen zu muessen. Spiegelt bewusst dieselbe Logik wie das
 * Discord-Panel (gruen frei / gelb knapp / rot vergriffen).
 */
export default function AvailabilityBadge({
  available,
  total,
  size = "md",
}: {
  available: number;
  total: number;
  size?: "sm" | "md";
}) {
  const free = Math.max(0, available);
  const pct = total > 0 ? (free / total) * 100 : 0;

  const tone =
    free <= 0
      ? { text: "text-danger", bg: "bg-danger", ring: "border-danger/40 bg-danger/10" }
      : free <= total / 2
        ? { text: "text-yellow-500", bg: "bg-yellow-500", ring: "border-yellow-500/40 bg-yellow-500/10" }
        : { text: "text-accent-2", bg: "bg-accent-2", ring: "border-accent-2/40 bg-accent-2/10" };

  return (
    <div className={size === "sm" ? "w-20" : "w-24"}>
      <span
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone.ring} ${tone.text}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.bg}`} aria-hidden />
        {free > 0 ? `${free}/${total} frei` : "vergriffen"}
      </span>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${tone.bg} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
