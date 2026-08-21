/**
 * Erzeugt Profilbild und Banner fuer den Discord-Bot als PNG.
 *
 * Aufruf:  node scripts/generate-bot-branding.mjs
 * Ergebnis: public/brand/bot-avatar.png  (1024x1024)
 *           public/brand/bot-banner.png  (960x540)
 *
 * Farben und Formensprache stammen aus der Website (globals.css): dunkler
 * Grund, goldener Akzent, gruener Zweitakzent. Reines SVG -> PNG per sharp,
 * damit die Dateien reproduzierbar sind und keine externen Assets brauchen.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.join(process.cwd(), "public", "brand");

const GOLD = "#f2b544";
const GOLD_DEEP = "#c98d1f";
const GREEN = "#3ddc97";
const BG_0 = "#0d0f14";
const BG_1 = "#161a23";

/**
 * Stilisierte offene Kiste in Isometrie - das Wiedererkennungszeichen.
 * Der Deckel schwebt ueber dem Korpus, dazwischen leuchtet der Inhalt gruen
 * heraus ("hier gibt es was zu holen").
 */
function crate(x, y, size, opacity = 1) {
  const s = size;
  const w = s * 0.5; // halbe Breite der Grundflaeche
  const h = s * 0.25; // halbe Hoehe der isometrischen Raute
  const d = s * 0.42; // Tiefe des Korpus
  const lift = s * 0.34; // wie hoch der Deckel schwebt

  const rhombus = (cy, halfW, halfH) =>
    `M ${-halfW} ${cy} L 0 ${cy - halfH} L ${halfW} ${cy} L 0 ${cy + halfH} Z`;

  return `
  <g transform="translate(${x} ${y})" opacity="${opacity}">
    <!-- Korpus: linke und rechte Seitenflaeche -->
    <path d="M ${-w} 0 L 0 ${h} L 0 ${h + d} L ${-w} ${d} Z" fill="${GOLD_DEEP}"/>
    <path d="M ${w} 0 L 0 ${h} L 0 ${h + d} L ${w} ${d} Z" fill="#a8741a"/>

    <!-- Oeffnung oben: dunkler Innenraum mit gruenem Leuchten -->
    <path d="${rhombus(0, w, h)}" fill="#0b0d12"/>
    <path d="${rhombus(0, w * 0.72, h * 0.72)}" fill="${GREEN}" opacity="0.9"/>
    <path d="${rhombus(0, w * 0.4, h * 0.4)}" fill="#a8ffdc" opacity="0.85"/>

    <!-- schwebender Deckel mit etwas Materialstaerke -->
    <path d="M ${-w} ${-lift} L 0 ${-lift + h} L ${w} ${-lift} L 0 ${-lift - h} Z" fill="${GOLD}"/>
    <path d="M ${-w} ${-lift} L 0 ${-lift + h} L 0 ${-lift + h + s * 0.05} L ${-w} ${-lift + s * 0.05} Z"
          fill="${GOLD_DEEP}"/>
    <path d="M ${w} ${-lift} L 0 ${-lift + h} L 0 ${-lift + h + s * 0.05} L ${w} ${-lift + s * 0.05} Z"
          fill="#a8741a"/>
  </g>`;
}

function avatarSvg() {
  const S = 1024;
  const c = S / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="72%">
      <stop offset="0%" stop-color="${BG_1}"/>
      <stop offset="100%" stop-color="${BG_0}"/>
    </radialGradient>
    <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${GOLD}"/>
      <stop offset="55%" stop-color="${GREEN}"/>
      <stop offset="100%" stop-color="${GOLD}"/>
    </linearGradient>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="46"/>
    </filter>
  </defs>

  <rect width="${S}" height="${S}" fill="url(#bg)"/>

  <!-- weicher Schein hinter der Kiste -->
  <circle cx="${c}" cy="${c - 90}" r="230" fill="${GOLD}" opacity="0.22" filter="url(#soft)"/>

  <!-- Akzentring -->
  <circle cx="${c}" cy="${c}" r="452" fill="none" stroke="url(#ring)" stroke-width="20" opacity="0.92"/>
  <circle cx="${c}" cy="${c}" r="418" fill="none" stroke="${GOLD}" stroke-width="3" opacity="0.28"/>

  ${crate(c, c - 145, 380)}

  <!-- Schriftzug -->
  <text x="${c}" y="${c + 185}" text-anchor="middle"
        font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="96" font-weight="700"
        fill="#ffffff" letter-spacing="8">LEIH</text>
  <text x="${c}" y="${c + 285}" text-anchor="middle"
        font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="96" font-weight="700"
        fill="${GOLD}" letter-spacing="8">CENTER</text>
</svg>`;
}

function bannerSvg() {
  const W = 960;
  const H = 540;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BG_1}"/>
      <stop offset="60%" stop-color="${BG_0}"/>
      <stop offset="100%" stop-color="#0a0c11"/>
    </linearGradient>
    <linearGradient id="line" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0"/>
      <stop offset="35%" stop-color="${GOLD}"/>
      <stop offset="65%" stop-color="${GREEN}"/>
      <stop offset="100%" stop-color="${GREEN}" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="60"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Lichtstimmung -->
  <circle cx="${W * 0.76}" cy="${H * 0.40}" r="180" fill="${GOLD}" opacity="0.26" filter="url(#glow)"/>
  <circle cx="${W * 0.20}" cy="${H * 0.76}" r="150" fill="${GREEN}" opacity="0.14" filter="url(#glow)"/>

  <!-- dezentes Raster -->
  <g opacity="0.055" stroke="#ffffff" stroke-width="1">
    ${Array.from({ length: 19 }, (_, i) => `<line x1="${i * 52}" y1="0" x2="${i * 52}" y2="${H}"/>`).join("\n    ")}
    ${Array.from({ length: 11 }, (_, i) => `<line x1="0" y1="${i * 52}" x2="${W}" y2="${i * 52}"/>`).join("\n    ")}
  </g>

  ${crate(W * 0.78, H * 0.46, 290)}
  ${crate(W * 0.60, H * 0.17, 96, 0.20)}

  <!-- Text -->
  <text x="72" y="212" font-family="Segoe UI, Arial, Helvetica, sans-serif"
        font-size="30" font-weight="600" fill="${GOLD}" letter-spacing="7">OPSUCHT</text>
  <text x="72" y="300" font-family="Segoe UI, Arial, Helvetica, sans-serif"
        font-size="82" font-weight="700" fill="#ffffff" letter-spacing="1">OP-LeihCenter</text>
  <text x="72" y="352" font-family="Segoe UI, Arial, Helvetica, sans-serif"
        font-size="27" font-weight="400" fill="#9aa4b8">Leih dir die besten Items — direkt hier im Discord.</text>

  <rect x="72" y="392" width="330" height="4" rx="2" fill="url(#line)"/>

  <!-- Statuspunkt bewusst als Kreis statt Emoji: das Rendering haengt sonst
       davon ab, ob auf dem Rechner ein Farb-Emoji-Font installiert ist. -->
  <circle cx="80" cy="439" r="8" fill="${GREEN}"/>
  <text x="102" y="446" font-family="Segoe UI, Arial, Helvetica, sans-serif"
        font-size="23" fill="${GREEN}">Live-Verfügbarkeit</text>
  <text x="292" y="446" font-family="Segoe UI, Arial, Helvetica, sans-serif"
        font-size="23" fill="#9aa4b8">· 2 Std. Leihdauer · Abo-System</text>
</svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const avatar = path.join(OUT_DIR, "bot-avatar.png");
  const banner = path.join(OUT_DIR, "bot-banner.png");

  await sharp(Buffer.from(avatarSvg())).png().toFile(avatar);
  await sharp(Buffer.from(bannerSvg())).png().toFile(banner);

  // SVG-Quellen mit ablegen, damit spaetere Anpassungen ohne dieses Skript gehen.
  await writeFile(path.join(OUT_DIR, "bot-avatar.svg"), avatarSvg(), "utf8");
  await writeFile(path.join(OUT_DIR, "bot-banner.svg"), bannerSvg(), "utf8");

  console.log("Fertig:");
  console.log("  " + avatar);
  console.log("  " + banner);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
