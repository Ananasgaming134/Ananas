export default function StatBar({
  label,
  sublabel,
  count,
  max,
  accent = "accent",
}: {
  label: string;
  sublabel?: string;
  count: number;
  max: number;
  accent?: "accent" | "accent-2";
}) {
  const pct = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{label}</p>
          {sublabel && <p className="truncate text-xs text-muted">{sublabel}</p>}
        </div>
        <span className="shrink-0 font-mono text-xs text-muted">{count}x</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full transition-all ${accent === "accent" ? "bg-accent" : "bg-accent-2"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
