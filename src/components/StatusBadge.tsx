import clsx from "clsx";
import { MEMBER_STATUS, MEMBER_STATUS_LABELS, type MemberStatusValue } from "@/lib/constants";

export default function StatusBadge({ status }: { status: string }) {
  const label = MEMBER_STATUS_LABELS[status as MemberStatusValue] ?? status;
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        status === MEMBER_STATUS.ACTIVE && "border-accent-2/40 bg-accent-2/10 text-accent-2",
        status === MEMBER_STATUS.REVOKED && "border-yellow-500/40 bg-yellow-500/10 text-yellow-500",
        status === MEMBER_STATUS.BANNED && "border-danger/40 bg-danger/10 text-danger"
      )}
    >
      {label}
    </span>
  );
}
