export default function StatCard({
  label,
  value,
  hint,
  accent = "accent",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "accent" | "accent-2" | "danger";
}) {
  const glow =
    accent === "accent" ? "bg-accent/20" : accent === "accent-2" ? "bg-accent-2/20" : "bg-danger/20";
  return (
    <div className="card-glass card-hover relative overflow-hidden p-6">
      <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl ${glow}`} />
      <p className="relative text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="relative mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint && <p className="relative mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
