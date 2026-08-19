/**
 * Einheitlicher Seitenkopf fuer alle Dashboard-Seiten: kleine Bereichs-Zeile
 * (eyebrow), grosse Ueberschrift, Beschreibung und optional eine Aktion
 * rechts. Sorgt dafuer, dass Kundenbereich und Verwaltung gleich aufgebaut
 * sind, statt dass jede Seite ihren eigenen Kopf mitbringt.
 */
export default function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="fade-up flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted/70">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
