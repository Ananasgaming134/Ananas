/**
 * Ruhiger, dauerhaft bewegter Hintergrund fuer die gesamte Startseite: ein
 * feines Raster, das langsam wandert, und drei grosse, weich auslaufende
 * Farbflaechen, die traege umherziehen. Liegt hinter allem und faengt nie
 * Klicks ab. Bei reduzierter Bewegung steht alles still (siehe globals.css).
 */
export default function LandingAmbient() {
  return (
    <div className="landing-ambient" aria-hidden>
      <div className="bg-grid animate-drift-grid absolute inset-0 opacity-[0.35]" />

      <div className="ambient-blob ambient-blob-a animate-float-a" />
      <div className="ambient-blob ambient-blob-b animate-float-b" />
      <div className="ambient-blob ambient-blob-c animate-float-c" />

      {/* Feines Korn nimmt den Farbflaechen das Digitale. */}
      <div
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Zieht die Raender ab, damit der Inhalt in der Mitte im Fokus bleibt. */}
      <div className="ambient-vignette" />
    </div>
  );
}
