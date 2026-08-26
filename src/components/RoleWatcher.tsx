"use client";

import { useEffect, useRef } from "react";
import { signOut } from "next-auth/react";

const CHECK_INTERVAL_MS = 60_000;

/**
 * Prueft im Hintergrund per /api/auth/role-check, ob die Discord-Rolle des
 * eingeloggten Nutzers noch gueltig und unveraendert ist. Bei Entzug oder
 * Aenderung wird sofort abgemeldet, damit nie mit veralteten Rechten
 * weitergearbeitet werden kann. Rendert nichts sichtbares.
 *
 * Einmal pro Minute reicht: eine Rollenaenderung faellt der dauerhaften
 * Gateway-Verbindung sofort auf und wird dort schon in den Datensatz
 * geschrieben - dieser Takt ist nur das Netz fuer offene Tabs. Frueher lief
 * er alle 10 Sekunden und hat mit jedem Tab eine eigene Discord-Abfrage
 * ausgeloest.
 */
export default function RoleWatcher() {
  const loggingOutRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (loggingOutRef.current) return;
      try {
        const res = await fetch("/api/auth/role-check", { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) return; // Sitzung ohnehin schon weg
        const data = (await res.json()) as { ok: boolean };
        if (!data.ok && !loggingOutRef.current) {
          loggingOutRef.current = true;
          await signOut({ callbackUrl: "/login" });
        }
      } catch {
        // Netzwerkfehler bei der Pruefung selbst - nicht abmelden, naechster Versuch spaeter.
      }
    }

    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return null;
}
