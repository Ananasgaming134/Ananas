"use client";

import { usePathname } from "next/navigation";

/**
 * Setzt data-area="kunde"/"verwaltung" auf den Wurzel-Container des
 * Dashboards - globals.css definiert darueber ein eigenes Farbschema fuer
 * die Verwaltung (kuehles Blau statt dem warmen Kundenbereich-Gold), damit
 * beide Bereiche auf den ersten Blick unterscheidbar sind, nicht nur per
 * Sidebar-Label. Alle bestehenden accent-Klassen (bg-accent, text-accent,
 * border-accent/40, ring-accent/40, .card-hover-Glow, ...) faerben sich
 * dadurch automatisch um, ohne dass einzelne Seiten angepasst werden muessen.
 */
export default function AreaScope({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const area = pathname.startsWith("/dashboard/verwaltung") ? "verwaltung" : "kunde";

  return (
    <div data-area={area} className="relative min-h-screen">
      {children}
    </div>
  );
}
