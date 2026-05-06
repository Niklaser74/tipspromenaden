/**
 * @file build-brand-pack.mjs
 * @description Bygger en zip-fil med BRAND.pdf + ikoner + bilder +
 *   flygblad-PDF:er som kan delas med externa system / partners.
 *
 * Användning:
 *   cd tipspromenaden-app/docs/marketing
 *   node build-brand-pdf.mjs        # bygger BRAND.pdf först
 *   node build-brand-pack.mjs       # paketerar allt
 *
 * Resultat: tipspromenaden-brand-pack-YYYY-MM-DD.zip i samma mapp.
 *
 * Beroenden: archiver (npm). Inga andra externa verktyg behövs —
 * Compress-Archive på Windows fungerar också men cross-platform via
 * archiver är enklare.
 */

import { createWriteStream, mkdirSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import archiver from "archiver";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, "..", "..");
const ASSETS = join(APP_ROOT, "assets");

const today = new Date().toISOString().slice(0, 10);
const zipPath = join(__dirname, `tipspromenaden-brand-pack-${today}.zip`);

const README = `Tipspromenaden — Brand Pack
============================
Genererad: ${today}
Källa:     https://github.com/Niklaser74/tipspromenaden
Kontakt:   tipspromenaden.app@gmail.com

Innehåll
--------
BRAND.pdf                     Brand guidelines (huvuddokument, A4)
BRAND.md                      Brand guidelines som markdown-källa

icons/
  icon.png                    App-ikon, raster (1024x1024)
  icon-source.svg             App-ikon, vektor-källa
  icon-foreground.svg         Adaptiv Android-ikon, foreground-lager
  icon-monochrome.svg         Mono-version för themed icons
  android-icon-background.png Adaptiv Android-ikon, bakgrund
  android-icon-foreground.png Adaptiv Android-ikon, foreground (raster)
  android-icon-monochrome.png Themed-icon-fallback
  favicon.png                 Webbplats-favicon
  play-store-icon.png         Play Store listing-ikon (512x512)

images/
  feature-graphic.png         Play Store feature-graphic (1024x500)
  feature-graphic.svg         Vektor-källa
  og-image.png                Social media preview (1200x630)
  flygblad-tipspromenaden.png Förhandsvisning av primärt A5-flygblad
  flygblad-hammardammen.png   Förhandsvisning av lokalt event-flygblad

flyers-pdf/
  flygblad-tipspromenaden.pdf       Primärt A5-flygblad
  flygblad-tipspromenaden-2up.pdf   2-up A4 (klipp till två A5)
  flygblad-tipspromenaden-bifold.pdf Bifold A4 (vikt)
  flygblad-hammardammen.pdf         Lokal event-variant
  flygblad-hammardammen-2up.pdf     2-up A4 av lokal variant

brand-tokens/
  colors.txt                  Hex-värden i plain text
  design-philosophy.md        Friluft Folio-filosofin (originaldokument)


Användningsregler i korthet
---------------------------
- Färger: forest green (#1B6B35) är enda viktade accenten — använd
  sparsamt. Cream (#F5F0E8) som bakgrund.
- Typsnitt: Lora (serif, rubriker) + Instrument Sans (body, UI).
  Båda Google Fonts, latin + latin-ext räcker.
- App-ikonen: ändra aldrig färger, rotera aldrig, distorera aldrig.
- Wordmark: "Tipspromenaden" satt i Lora 600, forest green på cream.

Detaljerade regler i BRAND.pdf.


Licens
------
Dessa filer är upphovsrättsskyddade av projektet Tipspromenaden.
Användning för partnersamarbeten och redaktionellt material som
beskriver Tipspromenaden är OK; kontakta tipspromenaden.app@gmail.com
för andra användningsområden.
`;

const COLORS = `Tipspromenaden — Färgpalett
============================

Primärpalett
------------
Cream         #F5F0E8    Standard bakgrund (uncoated paper-känsla)
Forest Green  #1B6B35    Primär accent — headlines, CTA, primärknappar
Green Dark    #1B3D2B    Mörkare grön — större ytor, footer, kontrast
Text Warm     #2C3E2D    Brödtext (varm svart med grön underton)
Sage          #8A9A8D    Sekundärtext, captions, hjälptext
Rule          #D9D2C2    Tunna avskiljare, kortkanter
Yellow        #E8B830    Sparsam accent — dela-knappar, små highlights


Tillgänglighet (kontrast på Cream-bakgrund)
-------------------------------------------
Forest Green   5.4:1   WCAG AA för text
Text Warm      9.8:1   WCAG AAA
Sage           3.1:1   Endast för stora texter (>=18 px) eller dekoration


Tailwind-klasser (om relevant)
------------------------------
bg-cream       text-cream
bg-green       text-green
bg-green-dark  text-green-dark
text-text-warm
text-sage
border-rule
bg-yellow

Källfil: tipspromenaden-web/src/styles/global.css
`;

if (!existsSync(join(__dirname, "BRAND.pdf"))) {
  console.error("BRAND.pdf saknas. Kör 'node build-brand-pdf.mjs' först.");
  process.exit(1);
}

const output = createWriteStream(zipPath);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  console.log(`✓ ${zipPath}`);
  console.log(`  ${(archive.pointer() / 1024).toFixed(0)} KB, ${archive.pointer().toLocaleString()} bytes`);
});

archive.on("error", (err) => { throw err; });
archive.pipe(output);

// Top-level
archive.file(join(__dirname, "BRAND.pdf"), { name: "BRAND.pdf" });
archive.file(join(__dirname, "BRAND.md"),  { name: "BRAND.md" });
archive.append(README, { name: "README.txt" });

// Icons
const iconNames = [
  "icon.png", "icon-source.svg", "icon-foreground.svg", "icon-monochrome.svg",
  "android-icon-background.png", "android-icon-foreground.png", "android-icon-monochrome.png",
  "favicon.png", "play-store-icon.png",
];
for (const name of iconNames) {
  const p = join(ASSETS, name);
  if (existsSync(p)) archive.file(p, { name: `icons/${name}` });
}

// Images (mix från assets/ + marketing/)
for (const name of ["feature-graphic.png", "feature-graphic.svg"]) {
  const p = join(ASSETS, name);
  if (existsSync(p)) archive.file(p, { name: `images/${name}` });
}
for (const name of ["og-image.png", "flygblad-tipspromenaden.png", "flygblad-hammardammen.png"]) {
  const p = join(__dirname, name);
  if (existsSync(p)) archive.file(p, { name: `images/${name}` });
}

// Flyer PDFs
for (const name of [
  "flygblad-tipspromenaden.pdf",
  "flygblad-tipspromenaden-2up.pdf",
  "flygblad-tipspromenaden-bifold.pdf",
  "flygblad-hammardammen.pdf",
  "flygblad-hammardammen-2up.pdf",
]) {
  const p = join(__dirname, name);
  if (existsSync(p)) archive.file(p, { name: `flyers-pdf/${name}` });
}

// Brand tokens
archive.append(COLORS, { name: "brand-tokens/colors.txt" });
archive.file(join(__dirname, "design-philosophy.md"), { name: "brand-tokens/design-philosophy.md" });

archive.finalize();
