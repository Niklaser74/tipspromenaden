// Bygger en Open Graph-bild (1200×630) för delningar av tipspromenaden.app.
// Output: og-image.png — kopieras till tipspromenaden-web/public/og-image.png
// efter generering.
//
// 1200×630 är OG-standardformatet — Facebook, LinkedIn, Twitter/X, iMessage,
// Slack, Discord m.fl. läser detta exakta förhållande och visar bilden som
// preview-kort när någon delar en länk till tipspromenaden.app.
//
// Design: Friluft Folio. Cream-bakgrund, app-ikon vänster, headline + sub
// + URL höger. Generös luft, ingen visuell brus. Samma palett som social-
// onepagern och det printade flygbladet.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const WEB_PUBLIC = path.resolve(ROOT, "..", "tipspromenaden-web", "public");
const FONTS = path.resolve(
  process.env.APPDATA ?? "",
  "Claude/local-agent-mode-sessions/skills-plugin/6e3f3656-5b7f-48a4-9391-8a16ae2c491d/0a338210-3309-4e53-a4e7-c3d23bfbe37f/skills/canvas-design/canvas-fonts"
);

const COLORS = {
  cream:      "#F5F0E8",
  green:      "#1B6B35",
  greenDark:  "#1B3D2B",
  text:       "#2C3E2D",
  sage:       "#8A9A8D",
  rule:       "#D9D2C2",
  yellow:     "#E8B830",
};

GlobalFonts.registerFromPath(path.join(FONTS, "Lora-Bold.ttf"), "LoraBold");
GlobalFonts.registerFromPath(path.join(FONTS, "Lora-Italic.ttf"), "LoraItalic");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Regular.ttf"), "InstSans");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Bold.ttf"), "InstSansBold");

const W = 1200;
const H = 630;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

// ─── Bakgrund ──────────────────────────────────────────────────────
ctx.fillStyle = COLORS.cream;
ctx.fillRect(0, 0, W, H);

// Subtil hairline-ram inåt för att ge "kort"-känsla
ctx.strokeStyle = COLORS.rule;
ctx.lineWidth = 1.5;
ctx.strokeRect(40, 40, W - 80, H - 80);

// ─── Vänster: ikon ─────────────────────────────────────────────────
const iconImg = await loadImage(path.join(ROOT, "assets", "icon.png"));
const iconSize = 240;
const iconX = 110;
const iconY = (H - iconSize) / 2;
ctx.drawImage(iconImg, iconX, iconY, iconSize, iconSize);

// ─── Höger: text-block ─────────────────────────────────────────────
const textX = iconX + iconSize + 70;

// Eyebrow
ctx.fillStyle = COLORS.sage;
ctx.font = `22px InstSansBold`;
ctx.textAlign = "left";
let eyebrow = "";
const eyebrowText = "QUIZPROMENAD I FICKAN";
for (let i = 0; i < eyebrowText.length; i++) {
  eyebrow += eyebrowText[i];
  if (i < eyebrowText.length - 1) eyebrow += " ";
}
ctx.fillText(eyebrow, textX, 200);

// Hairline-streck under eyebrow
ctx.strokeStyle = COLORS.green;
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(textX, 220);
ctx.lineTo(textX + 50, 220);
ctx.stroke();

// Headline
ctx.fillStyle = COLORS.greenDark;
ctx.font = `94px LoraBold`;
ctx.fillText("Tipspromenaden", textX, 320);

// Sub
ctx.fillStyle = COLORS.green;
ctx.font = `italic 32px LoraItalic`;
ctx.fillText("En quizpromenad ni går utomhus", textX, 380);

// Body
ctx.fillStyle = COLORS.text;
ctx.font = `24px InstSans`;
ctx.fillText("Skaparen ritar punkter på kartan, deltagare", textX, 440);
ctx.fillText("går till varje punkt och svarar på frågan.", textX, 472);

// URL/footer
ctx.fillStyle = COLORS.green;
ctx.font = `26px InstSansBold`;
ctx.fillText("tipspromenaden.app", textX, 540);

// ─── Skriv fil ──────────────────────────────────────────────────────
const outPath = path.join(__dirname, "og-image.png");
fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
console.log(`OK: ${outPath}  (${W}×${H})`);

// Kopiera direkt till web-projektets public/ så vi inte behöver duplicera
// manuellt. Layout.astro pekar på /og-image.png från meta-taggarna.
const webOg = path.join(WEB_PUBLIC, "og-image.png");
fs.copyFileSync(outPath, webOg);
console.log(`OK: ${webOg}  (kopierad till web public)`);
