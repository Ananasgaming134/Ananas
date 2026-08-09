import clsx from "clsx";
import { ROLES, ROLE_LABELS, type RoleValue } from "@/lib/constants";

export default function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABELS[role as RoleValue] ?? role;
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
