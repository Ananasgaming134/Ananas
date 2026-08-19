"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type RouteTitle = { path: string; title: string; exact?: boolean };

// Absteigend nach Pfadlaenge sortiert wird beim Nachschlagen erzwungen, damit
// z.B. "/dashboard/verwaltung/items/neu" nicht faelschlich schon bei
// "/dashboard/verwaltung/items" landet.
const ROUTE_TITLES: RouteTitle[] = [
  { path: "/dashboard", title: "Übersicht", exact: true },
  { path: "/dashboard/items", title: "Items" },
  { path: "/dashboard/statistik", title: "Statistik" },
  { path: "/dashboard/abo", title: "Abo" },
  { path: "/dashboard/tickets", title: "Tickets" },
  { path: "/dashboard/bewertungen", title: "Bewertungen" },
  { path: "/dashboard/anleitung", title: "Anleitung" },
  { path: "/dashboard/hilfe", title: "Hilfe" },
  { path: "/dashboard/akte", title: "Profil" },
  { path: "/dashboard/verwaltung/statistik", title: "Statistik" },
  { path: "/dashboard/verwaltung/items/neu", title: "Neues Item" },
  { path: "/dashboard/verwaltung/items/kategorien", title: "Kategorien" },
  { path: "/dashboard/verwaltung/items", title: "Items verwalten" },
  { path: "/dashboard/verwaltung/bewerbungen", title: "Bewerbungen" },
  { path: "/dashboard/verwaltung/tickets", title: "Tickets" },
  { path: "/dashboard/verwaltung/kunden", title: "Kunden" },
  { path: "/dashboard/verwaltung/mitglieder", title: "Mitglieder-Archiv" },
  { path: "/dashboard/verwaltung/logs", title: "Logs" },
  { path: "/dashboard/verwaltung/zahlungen", title: "Zahlungen" },
  { path: "/dashboard/verwaltung/bot", title: "Discord-Server" },
  { path: "/dashboard/verwaltung", title: "Verwaltung", exact: true },
];

function resolveTitle(pathname: string): { title: string; section: "Kundenbereich" | "Verwaltung" } {
  const sorted = [...ROUTE_TITLES].sort((a, b) => b.path.length - a.path.length);
  const match = sorted.find((r) => (r.exact ? pathname === r.path : pathname.startsWith(r.path)));
  const section = pathname.startsWith("/dashboard/verwaltung") ? "Verwaltung" : "Kundenbereich";
  return { title: match?.title ?? "Dashboard", section };
}

/**
 * Schlanke Titelleiste ueber dem eigentlichen Seiteninhalt, in beiden
 * Bereichen (Kundenbereich/Verwaltung) sichtbar - gibt jeder Unterseite
 * sofort Kontext (Bereich + Titel), statt dass man sich nur an der
 * Sidebar-Markierung orientieren kann. Im Kundenbereich zusaetzlich ein
 * Schnellzugriff auf die Hilfe-Seite.
 */
export default function DashboardTopbar() {
  const pathname = usePathname();
  const { title, section } = resolveTitle(pathname);
  const inKundenbereich = section === "Kundenbereich";

  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted/70">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          {section}
        </p>
        {/* Im Kundenbereich traegt die Topbar den Seitentitel (die Unterseiten
            selbst haben dort keine eigene H1 mehr, um Dopplung zu vermeiden).
            In der Verwaltung behalten die Seiten ihre eigene Ueberschrift -
            hier reicht die kleine Bereichs-Kennzeichnung oben. */}
        {inKundenbereich && <h1 className="text-lg font-semibold sm:text-xl">{title}</h1>}
      </div>
      {inKundenbereich && pathname !== "/dashboard/hilfe" && (
        <Link
          href="/dashboard/hilfe"
          className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground sm:flex"
        >
          <span aria-hidden>💬</span>
          Hilfe
        </Link>
      )}
    </div>
  );
}
