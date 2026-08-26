"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const MINDESTABSTAND_MS = 8_000;

/**
 * Holt den Seiteninhalt neu, sobald der Tab wieder in den Vordergrund kommt.
 *
 * Hintergrund: Ausleihen und Rueckgaben passieren auch komplett in Discord.
 * Wer dort etwas ausleiht und dann zum offenen Tab zurueckwechselt, sah
 * vorher noch den alten Stand und musste von Hand neu laden. Der Abstand
 * verhindert, dass schnelles Hin- und Herwechseln eine Anfrage nach der
 * anderen ausloest.
 */
export default function FreshOnFocus() {
  const router = useRouter();
  const zuletzt = useRef(0);

  useEffect(() => {
    function aktualisieren() {
      if (document.visibilityState !== "visible") return;
      const jetzt = Date.now();
      if (jetzt - zuletzt.current < MINDESTABSTAND_MS) return;
      zuletzt.current = jetzt;
      router.refresh();
    }

    document.addEventListener("visibilitychange", aktualisieren);
    window.addEventListener("focus", aktualisieren);
    return () => {
      document.removeEventListener("visibilitychange", aktualisieren);
      window.removeEventListener("focus", aktualisieren);
    };
  }, [router]);

  return null;
}
