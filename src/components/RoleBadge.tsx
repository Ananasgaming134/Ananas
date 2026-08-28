import clsx from "clsx";
import { ROLES, ROLE_LABELS, type RoleValue } from "@/lib/constants";

/**
 * Rollen-Kennzeichen. Bei entzogenem Zugang ist die gespeicherte Rolle nur
 * noch der letzte bekannte Stand - dann wird sie als "zuletzt" ausgewiesen
 * und blass dargestellt, statt eine Rolle zu behaupten, die es nicht mehr
 * gibt. Ohne das stand im Archiv z.B. "Aufsichtsperson" bei jemandem, der
 * auf Discord gar keine Rolle mehr hat.
 */
export default function RoleBadge({ role, veraltet }: { role: string; veraltet?: boolean }) {
  const label = ROLE_LABELS[role as RoleValue] ?? role;

  if (veraltet) {
    return (
      <span
        title="Zugang entzogen - das ist die zuletzt bekannte Rolle, keine aktuelle."
        className="inline-flex items-center rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted/70"
      >
        zuletzt: {label}
      </span>
    );
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        role === ROLES.OWNER && "border-accent/40 bg-accent/10 text-accent",
        role === ROLES.AUFSICHT && "border-accent-2/40 bg-accent-2/10 text-accent-2",
        role === ROLES.KUNDE && "border-border bg-surface-2 text-muted"
      )}
    >
      {label}
    </span>
  );
}
