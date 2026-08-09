"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { hasAtLeastRole, ROLES, type RoleValue } from "@/lib/constants";

type NavItem = {
  href: string;
  label: string;
  minRole?: RoleValue;
};

const KUNDENBEREICH_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Übersicht" },
  { href: "/dashboard/items", label: "Items" },
  { href: "/dashboard/akte", label: "Profil" },
];

const VERWALTUNG_ITEMS: NavItem[] = [
  { href: "/dashboard/verwaltung", label: "Übersicht" },
  { href: "/dashboard/verwaltung/kunden", label: "Kunden" },
  { href: "/dashboard/verwaltung/mitglieder", label: "Mitglieder-Archiv" },
  { href: "/dashboard/verwaltung/logs", label: "Logs" },
  { href: "/dashboard/verwaltung/zahlungen", label: "Zahlungen" },
  { href: "/dashboard/verwaltung/items", label: "Items", minRole: ROLES.OWNER },
  { href: "/dashboard/verwaltung/bot", label: "Discord-Server", minRole: ROLES.OWNER },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={clsx(
        "rounded-lg px-3 py-2 text-sm font-medium transition",
        active ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground"
      )}
    >
      {item.label}
    </Link>
  );
}

export default function DashboardNav({ role }: { role: string }) {
  const pathname = usePathname();
  const inVerwaltung = pathname.startsWith("/dashboard/verwaltung");
  const isAufsichtPlus = hasAtLeastRole(role, ROLES.AUFSICHT);

  if (inVerwaltung) {
    return (
      <nav className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="mb-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
        >
          ← Kundenbereich
        </Link>
        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Verwaltung
        </p>
        {VERWALTUNG_ITEMS.filter((item) => !item.minRole || hasAtLeastRole(role, item.minRole)).map(
          (item) => {
            const active =
              item.href === "/dashboard/verwaltung"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            return <NavLink key={item.href} item={item} active={active} />;
          }
        )}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-1">
      {KUNDENBEREICH_ITEMS.map((item) => {
        const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
        return <NavLink key={item.href} item={item} active={active} />;
      })}
      {isAufsichtPlus && (
        <Link
          href="/dashboard/verwaltung"
          className="mt-3 flex items-center justify-between rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition hover:bg-accent/20"
        >
          Verwaltung
          <span aria-hidden>→</span>
        </Link>
      )}
    </nav>
  );
}
