/**
 * Karte mit Icon-Badge, Titel und optionaler Beschreibung/Aktion im Kopf -
 * die einheitliche Sektions-Huelle fuer Inhaltsbloecke im Dashboard.
 */
export default function SectionCard({
  icon,
  title,
  description,
  action,
  className = "",
  children,
}: {
  icon?: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon && <span className="icon-badge h-9 w-9 text-base">{icon}</span>}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
