"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SITE_NAME } from "@/lib/constants";

const LINKS = [
  { href: "#ablauf", label: "Ablauf" },
  { href: "#zahlen", label: "Zahlen" },
  { href: "#stimmen", label: "Stimmen" },
  { href: "#team", label: "Team" },
  // Der Abschnitt existiert nur, wenn Kooperationen gepflegt sind - sonst
  // wuerde der Punkt ins Leere fuehren.
  { href: "#kooperationen", label: "Kooperationen", nurMitPartnern: true },
  { href: "#fragen", label: "Fragen" },
];

/**
 * Kopfzeile der Startseite. Schwebt frei ueber dem Blockfeld und legt sich
 * erst beim Scrollen als kompakte Leiste mit Hintergrund an - so bleibt der
 * Einstieg offen und die Navigation trotzdem immer erreichbar.
 */
export default function LandingHeader({
  loggedIn,
  hatKooperationen,
}: {
  loggedIn: boolean;
  hatKooperationen: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-border/70 bg-background/80 backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="logo-mark">OL</span>
          <span className="font-display text-base font-extrabold tracking-tight">{SITE_NAME}</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {LINKS.filter((link) => !link.nurMitPartnern || hatKooperationen).map((link) => (
            <a key={link.href} href={link.href} className="nav-pill">
              {link.label}
            </a>
          ))}
        </nav>

        <Link href={loggedIn ? "/dashboard" : "/login"} className="btn-primary btn-sm">
          {loggedIn ? "Zum Dashboard" : "Anmelden"}
        </Link>
      </div>
    </header>
  );
}
