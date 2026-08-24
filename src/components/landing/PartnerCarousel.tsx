"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PartnerCard = {
  id: string;
  name: string;
  description: string | null;
  discordUrl: string | null;
  bannerUrl: string | null;
  avatarUrl: string | null;
};

const WECHSEL_MS = 3500;

/**
 * Zeigt die Visitenkarten der Kooperationen. Bei genau einer Karte steht sie
 * einfach da; bei mehreren wechseln sie sich alle paar Sekunden ab, mit
 * Punkten zum direkten Anspringen. Der Wechsel pausiert, solange der Zeiger
 * auf der Karte liegt oder etwas darin den Tastaturfokus hat - sonst springt
 * einem der Inhalt beim Lesen weg.
 */
export default function PartnerCarousel({ partners }: { partners: PartnerCard[] }) {
  const [index, setIndex] = useState(0);
  const [pausiert, setPausiert] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const weiter = useCallback(() => {
    setIndex((i) => (i + 1) % partners.length);
  }, [partners.length]);

  useEffect(() => {
    if (partners.length < 2 || pausiert) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    timer.current = setInterval(weiter, WECHSEL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [partners.length, pausiert, weiter]);

  if (partners.length === 0) return null;

  return (
    <div
      onMouseEnter={() => setPausiert(true)}
      onMouseLeave={() => setPausiert(false)}
      onFocusCapture={() => setPausiert(true)}
      onBlurCapture={() => setPausiert(false)}
    >
      <div className="relative">
        {partners.map((partner, i) => (
          <div
            key={partner.id}
            className={`partner-slide${i === index ? " partner-slide-active" : ""}`}
            aria-hidden={i !== index}
          >
            <PartnerVisitenkarte partner={partner} sichtbar={i === index} />
          </div>
        ))}
      </div>

      {partners.length > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {partners.map((partner, i) => (
            <button
              key={partner.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Kooperation ${partner.name} anzeigen`}
              aria-current={i === index}
              className={`partner-dot${i === index ? " partner-dot-active" : ""}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PartnerVisitenkarte({ partner, sichtbar }: { partner: PartnerCard; sichtbar: boolean }) {
  const inhalt = (
    <>
      <div className="partner-banner">
        {partner.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={partner.bannerUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="partner-banner-leer" />
        )}
      </div>

      <div className="relative px-6 pb-6 sm:px-8 sm:pb-8">
        {partner.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={partner.avatarUrl} alt="" className="partner-avatar object-cover" />
        ) : (
          <div className="partner-avatar flex items-center justify-center text-xl font-bold text-muted">
            {partner.name.slice(0, 2).toUpperCase()}
          </div>
        )}

        <h3 className="mt-4 font-display text-xl font-extrabold tracking-tight">{partner.name}</h3>
        {partner.description && (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{partner.description}</p>
        )}

        {partner.discordUrl && (
          <span className="partner-cta">
            Discord öffnen
            <span aria-hidden className="btn-arrow">
              →
            </span>
          </span>
        )}
      </div>
    </>
  );

  if (!partner.discordUrl) {
    return <div className="partner-card">{inhalt}</div>;
  }

  return (
    <a
      href={partner.discordUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="partner-card"
      // Ausgeblendete Karten sollen nicht per Tabulator erreichbar sein.
      tabIndex={sichtbar ? undefined : -1}
    >
      {inhalt}
    </a>
  );
}
