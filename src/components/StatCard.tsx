export default function StatCard({
  label,
  value,
  hint,
  icon,
  accent = "accent",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: string;
  accent?: "accent" | "accent-2" | "danger";
}) {
  const glow =
    accent === "accent" ? "bg-accent/20" : accent === "accent-2" ? "bg-accent-2/20" : "bg-danger/20";
  return (
    <div className="card-glass card-hover relative overflow-hidden p-6">
      <div className="gradient-top-bar" />
      <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl ${glow}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
          <p className="mt-2 truncate text-3xl font-semibold tracking-tight text-foreground">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
        {icon && <span className="icon-badge h-10 w-10 shrink-0 text-lg">{icon}</span>}
      </div>
    </div>
  );
}
