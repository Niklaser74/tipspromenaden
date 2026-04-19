// Genererar feature-grafik 1024×500 PNG för Google Play Store.
// Kör: node scripts/generate-feature-graphic.mjs
//
// Färgpalett följer appens hero-sektion:
//   Grön (primär):  #1B6B35
//   Grön (sekundär): #2D7A3A
//   Beige (text):    #F5F0E8
//   Guld (accent):   #E8B830

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "docs", "store-assets");
fs.mkdirSync(OUT_DIR, { recursive: true });

const WIDTH = 1024;
const HEIGHT = 500;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1B6B35"/>
      <stop offset="100%" stop-color="#2D7A3A"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.25" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#4A9A5A" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#1B6B35" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Bakgrund -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>

  <!-- Subtila kontrollpunkter som prickad GPS-linje -->
  <g opacity="0.18" stroke="#F5F0E8" stroke-width="3" fill="none" stroke-dasharray="4,10" stroke-linecap="round">
    <path d="M 60 420 Q 260 360 420 410 T 820 380 T 980 440"/>
  </g>
  <g fill="#E8B830" opacity="0.8">
    <circle cx="60" cy="420" r="7"/>
    <circle cx="420" cy="410" r="7"/>
    <circle cx="820" cy="380" r="7"/>
    <circle cx="980" cy="440" r="7"/>
  </g>

  <!-- Stor ikoncirkel till vänster -->
  <circle cx="200" cy="250" r="120" fill="#F5F0E8" opacity="0.08"/>
  <circle cx="200" cy="250" r="90" fill="#F5F0E8" opacity="0.1"/>

  <!-- Kompass-emoji (samma som i appens hero) -->
  <text x="200" y="295" font-size="130" text-anchor="middle" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif">🧭</text>

  <!-- Titel -->
  <text x="380" y="220" font-family="Segoe UI, Helvetica, Arial, sans-serif"
        font-size="82" font-weight="800" fill="#F5F0E8" letter-spacing="-2">
    Tipspromenaden
  </text>

  <!-- Tagline (guld) -->
  <text x="380" y="265" font-family="Segoe UI, Helvetica, Arial, sans-serif"
        font-size="22" font-weight="700" fill="#E8B830" letter-spacing="4">
    QUIZ &amp; ÄVENTYR
  </text>

  <!-- Underrubrik -->
  <text x="380" y="320" font-family="Segoe UI, Helvetica, Arial, sans-serif"
        font-size="26" font-weight="500" fill="#F5F0E8" opacity="0.85">
    Digital tipspromenad med GPS, frågor och topplista
  </text>

  <!-- Feature-badges -->
  <g font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="18" font-weight="600" fill="#F5F0E8">
    <g transform="translate(380, 360)">
      <rect width="155" height="44" rx="22" fill="#F5F0E8" opacity="0.12"/>
      <text x="22" y="29">📍 GPS-styrt</text>
    </g>
    <g transform="translate(548, 360)">
      <rect width="130" height="44" rx="22" fill="#F5F0E8" opacity="0.12"/>
      <text x="22" y="29">❓ Quiz</text>
    </g>
    <g transform="translate(691, 360)">
      <rect width="175" height="44" rx="22" fill="#F5F0E8" opacity="0.12"/>
      <text x="22" y="29">🏆 Topplista</text>
    </g>
  </g>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: WIDTH },
  font: {
    loadSystemFonts: true,
    defaultFontFamily: "Segoe UI",
  },
});

const pngData = resvg.render().asPng();
const outPath = path.join(OUT_DIR, "feature-graphic.png");
fs.writeFileSync(outPath, pngData);

console.log(`✓ Skrev ${outPath} (${pngData.length.toLocaleString()} bytes)`);
