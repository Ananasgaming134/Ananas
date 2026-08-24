"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { hasAtLeastRole, ROLES, type RoleValue } from "@/lib/constants";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  minRole?: RoleValue;
};

type NavGroup = { heading?: string; items: NavItem[] };

const KUNDENBEREICH_GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Übersicht", icon: "🏠" },
      { href: "/dashboard/items", label: "Items", icon: "📦" },
      { href: "/dashboard/statistik", label: "Statistik", icon: "📊" },
    ],
  },
  {
    heading: "Mein Konto",
    items: [
      { href: "/dashboard/abo", label: "Abo", icon: "💳" },
      { href: "/dashboard/akte", label: "Profil", icon: "👤" },
    ],
  },
  {
    heading: "Kontakt",
    items: [
      { href: "/dashboard/tickets", label: "Tickets", icon: "🎫" },
      { href: "/dashboard/bewertungen", label: "Bewertungen", icon: "⭐" },
      { href: "/dashboard/regelwerk", label: "Regelwerk", icon: "📗" },
      { href: "/dashboard/anleitung", label: "Anleitung", icon: "📖" },
      { href: "/dashboard/hilfe", label: "Hilfe", icon: "💬" },
    ],
  },
];

const VERWALTUNG_GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/dashboard/verwaltung", label: "Übersicht", icon: "🏠" },
      { href: "/dashboard/verwaltung/statistik", label: "Statistik", icon: "📊" },
    ],
  },
  {
    heading: "Menschen",
    items: [
      { href: "/dashboard/verwaltung/kunden", label: "Kunden", icon: "👥" },
      { href: "/dashboard/verwaltung/bewerbungen", label: "Bewerbungen", icon: "📝", minRole: ROLES.OWNER },
      { href: "/dashboard/verwaltung/tickets", label: "Tickets", icon: "🎫" },
      { href: "/dashboard/verwaltung/mitglieder", label: "Mitglieder-Archiv", icon: "🗃️" },
      { href: "/dashboard/verwaltung/rote-liste", label: "Rote Liste", icon: "🚫" },
    ],
  },
  {
    heading: "Betrieb",
    items: [
      { href: "/dashboard/verwaltung/ausleihen", label: "Derzeit ausgeliehen", icon: "🔄" },
      { href: "/dashboard/verwaltung/items", label: "Items", icon: "📦", minRole: ROLES.OWNER },
      { href: "/dashboard/verwaltung/zahlungen", label: "Zahlungen", icon: "💰" },
      { href: "/dashboard/verwaltung/logs", label: "Logs", icon: "📜" },
      { href: "/dashboard/verwaltung/regelwerk", label: "Regelwerk", icon: "📗", minRole: ROLES.OWNER },
      { href: "/dashboard/verwaltung/kooperationen", label: "Kooperationen", icon: "🤝", minRole: ROLES.OWNER },
      { href: "/dashboard/verwaltung/impressum", label: "Impressum", icon: "⚖️", minRole: ROLES.OWNER },
      { href: "/dashboard/verwaltung/bot", label: "Discord-Server", icon: "🤖", minRole: ROLES.OWNER },
    ],
  },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={clsx(
        "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-accent/15 text-accent shadow-[inset_2px_0_0_0_var(--accent)]"
          : "text-muted hover:bg-surface-2 hover:text-foreground"
      )}
    >
      <span
        className={clsx("text-base leading-none transition", active ? "" : "opacity-60 group-hover:opacity-100")}
        aria-hidden
      >
        {item.icon}
      </span>
      {item.label}
    </Link>
  );
}

function renderGroups(groups: NavGroup[], role: string, pathname: string, exactRoot: string) {
  return groups.map((group, i) => {
    const visible = group.items.filter((item) => !item.minRole || hasAtLeastRole(role, item.minRole));
    if (visible.length === 0) return null;

    return (
      <div key={group.heading ?? `group-${i}`} className={i > 0 ? "mt-4" : undefined}>
        {group.heading && (
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted/60">
            {group.heading}
          </p>
        )}
        <div className="flex flex-col gap-0.5">
          {visible.map((item) => {
            const active = item.href === exactRoot ? pathname === item.href : pathname.startsWith(item.href);
            return <NavLink key={item.href} item={item} active={active} />;
          })}
        </div>
      </div>
    );
  });
}

export default function DashboardNav({ role }: { role: string }) {
  const pathname = usePathname();
  const inVerwaltung = pathname.startsWith("/dashboard/verwaltung");
  const isAufsichtPlus = hasAtLeastRole(role, ROLES.AUFSICHT);

  if (inVerwaltung) {
    return (
      <nav className="flex flex-col">
        <Link
          href="/dashboard"
          className="mb-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
        >
          ← Kundenbereich
        </Link>
        {renderGroups(VERWALTUNG_GROUPS, role, pathname, "/dashboard/verwaltung")}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col">
      {renderGroups(KUNDENBEREICH_GROUPS, role, pathname, "/dashboard")}
      {isAufsichtPlus && (
        <Link
          href="/dashboard/verwaltung"
          className="mt-4 flex items-center justify-between rounded-lg border border-[#5b8cff]/30 bg-[#5b8cff]/10 px-3 py-2 text-sm font-medium text-[#5b8cff] transition hover:bg-[#5b8cff]/20"
        >
          <span className="flex items-center gap-2.5">
            <span className="text-base leading-none" aria-hidden>
              🛠️
            </span>
            Verwaltung
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}
    </nav>
  );
}
