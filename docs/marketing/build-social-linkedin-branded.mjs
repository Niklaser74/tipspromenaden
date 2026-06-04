// LinkedIn-specifik 1080×1080-banner som kombinerar dual-launch-firandet
// med branding-tillvalet. Vänster sida: text om att appen är live på båda
// plattformarna. Höger sida: telefon-mockup med en brandad ACME-skärm,
// som visar "för ert event kan den se ut så här".
//
// Output: social-linkedin-branded-square.png
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const FONTS = path.resolve(
  process.env.APPDATA ?? "",
  "Claude/local-agent-mode-sessions/skills-plugin/6e3f3656-5b7f-48a4-9391-8a16ae2c491d/0a338210-3309-4e53-a4e7-c3d23bfbe37f/skills/canvas-design/canvas-fonts"
);

const COLORS = {
  cream: "#F5F0E8",
  green: "#1B6B35",
  greenDark: "#1B3D2B",
  text: "#2C3E2D",
  sage: "#8A9A8D",
  rule: "#D9D2C2",
  white: "#FFFFFF",
  ctaBody: "#E8E8DC",
  yellow: "#E8B830",
  amberSoft: "#FFF3D6",
};

GlobalFonts.registerFromPath(path.join(FONTS, "Lora-Bold.ttf"), "LoraBold");
GlobalFonts.registerFromPath(path.join(FONTS, "Lora-Italic.ttf"), "LoraItalic");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Regular.ttf"), "InstSans");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Bold.ttf"), "InstSansBold");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Italic.ttf"), "InstSansItalic");

const iconImg = await loadImage(path.join(ROOT, "assets", "icon.png"));
const qrImg   = await loadImage(path.join(__dirname, "qr-bli-testare.png"));
const acmeImg = await loadImage(path.join("C:/dev/produktblad/screenshots/Home.jpg"));

// ─── Hjälpare ────────────────────────────────────────
function trackedUpper(text, spacing = 1) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    out += text[i];
    if (i < text.length - 1) out += " ".repeat(spacing);
  }
  return out;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
function wrapText(ctx, text, maxW) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// ─── Render ──────────────────────────────────────────
const W = 1080, H = 1080;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

// Bakgrund
ctx.fillStyle = COLORS.cream;
ctx.fillRect(0, 0, W, H);

// ─── Topp-eyebrow (centrerat) ────────────────────────
let y = 70;
ctx.fillStyle = COLORS.sage;
ctx.font = `20px InstSansBold`;
ctx.textAlign = "center";
ctx.fillText(trackedUpper("NU LIVE  ·  ANDROID OCH iOS", 1), W / 2, y);
y += 22;
ctx.strokeStyle = COLORS.green;
ctx.lineWidth = 1.6;
ctx.beginPath();
ctx.moveTo(W / 2 - 30, y);
ctx.lineTo(W / 2 + 30, y);
ctx.stroke();

// ─── Hero-titel (centrerad) ───────────────────────────
y += 50;
const iconSize = 90;
ctx.drawImage(iconImg, W / 2 - iconSize / 2, y, iconSize, iconSize);
y += iconSize + 18;

ctx.fillStyle = COLORS.greenDark;
ctx.font = `78px LoraBold`;
ctx.textAlign = "center";
ctx.fillText("Tipspromenaden", W / 2, y + 56);
y += 80;

ctx.fillStyle = COLORS.green;
ctx.font = `italic 24px LoraItalic`;
ctx.fillText("Nu i Google Play och App Store", W / 2, y + 24);
y += 60;

// ─── Två-kolumns sektion ─────────────────────────────
// Vänster: text om publika appen + tack-rad
// Höger: telefon-mockup med ACME-brandad skärm
const sectionY = y + 20;
const sectionH = 460;
const MARGIN = 70;
const colGap = 26;
const colW = (W - 2 * MARGIN - colGap) / 2;

// ── Vänster kolumn — kort med text ──
ctx.fillStyle = COLORS.white;
roundRect(ctx, MARGIN, sectionY, colW, sectionH, 22);
ctx.fill();
ctx.strokeStyle = COLORS.rule;
ctx.lineWidth = 1.5;
roundRect(ctx, MARGIN, sectionY, colW, sectionH, 22);
ctx.stroke();

let lx = MARGIN + 30;
let ly = sectionY + 44;
ctx.textAlign = "left";
ctx.fillStyle = COLORS.yellow;
ctx.font = `15px InstSansBold`;
ctx.fillText(trackedUpper("FÖR ALLA", 1), lx, ly);
ly += 32;

ctx.fillStyle = COLORS.greenDark;
ctx.font = `34px LoraBold`;
ctx.fillText("Den publika", lx, ly);
ly += 38;
ctx.fillText("appen", lx, ly);
ly += 30;

ctx.fillStyle = COLORS.text;
ctx.font = `19px InstSans`;
const leftLines = [
  "Skapa egna tipspromenader med",
  "GPS-frågor. Dela med en QR-kod.",
  "Inbyggd stegräkning, topplista",
  "och offline-stöd.",
];
for (const line of leftLines) {
  ctx.fillText(line, lx, ly);
  ly += 27;
}

ly += 14;
// liten amber accent + tack
ctx.strokeStyle = COLORS.yellow;
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(lx, ly);
ctx.lineTo(lx + 50, ly);
ctx.stroke();
ly += 22;
ctx.fillStyle = COLORS.green;
ctx.font = `italic 18px LoraItalic`;
ctx.fillText("Tack till alla testare", lx, ly);
ly += 22;
ctx.fillText("som hjälpte oss hit.", lx, ly);

// ── Höger kolumn — telefon-mockup med ACME ──
const rx = MARGIN + colW + colGap;
// Bakgrund-kort
ctx.fillStyle = COLORS.greenDark;
roundRect(ctx, rx, sectionY, colW, sectionH, 22);
ctx.fill();

// Etikett överst på högra kortet
ctx.fillStyle = COLORS.yellow;
ctx.font = `15px InstSansBold`;
ctx.textAlign = "left";
ctx.fillText(trackedUpper("FÖR FÖRETAG", 1), rx + 28, sectionY + 40);

ctx.fillStyle = COLORS.cream;
ctx.font = `28px LoraBold`;
ctx.fillText("Brandad för", rx + 28, sectionY + 76);
ctx.fillText("ert event", rx + 28, sectionY + 110);

// Telefon-mockup
const phoneW = 200;
const phoneH = 380;
const phoneX = rx + (colW - phoneW) / 2;
const phoneY = sectionY + 130;

// Yttre ram (telefon-svart)
ctx.fillStyle = "#0F1A14";
roundRect(ctx, phoneX - 6, phoneY - 6, phoneW + 12, phoneH + 12, 28);
ctx.fill();

// Skärmen (clip till rundade hörn)
ctx.save();
roundRect(ctx, phoneX, phoneY, phoneW, phoneH, 22);
ctx.clip();
// Skala ACME-bilden så den fyller telefon-skärmen
const ar = acmeImg.width / acmeImg.height;
const targetAr = phoneW / phoneH;
let drawW, drawH, drawX, drawY;
if (ar > targetAr) {
  drawH = phoneH;
  drawW = drawH * ar;
  drawX = phoneX - (drawW - phoneW) / 2;
  drawY = phoneY;
} else {
  drawW = phoneW;
  drawH = drawW / ar;
  drawX = phoneX;
  drawY = phoneY - (drawH - phoneH) / 2;
}
ctx.drawImage(acmeImg, drawX, drawY, drawW, drawH);
ctx.restore();

// liten notch/högtalare-detalj
ctx.fillStyle = "#0F1A14";
roundRect(ctx, phoneX + phoneW / 2 - 24, phoneY + 6, 48, 6, 3);
ctx.fill();

// ─── CTA-band längst ner ─────────────────────────────
const ctaY = sectionY + sectionH + 28;
const ctaH = 150;

ctx.fillStyle = COLORS.greenDark;
roundRect(ctx, MARGIN, ctaY, W - 2 * MARGIN, ctaH, 20);
ctx.fill();

// QR-vit-kort höger
const qrSize = 110;
const qrX = MARGIN + (W - 2 * MARGIN) - 30 - qrSize;
const qrY = ctaY + (ctaH - qrSize) / 2;
ctx.fillStyle = COLORS.white;
roundRect(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 10);
ctx.fill();
ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

// CTA-text vänster
const ctx_tx = MARGIN + 32;
ctx.fillStyle = COLORS.cream;
ctx.font = `30px LoraBold`;
ctx.textAlign = "left";
ctx.fillText("En QR — båda mobiler", ctx_tx, ctaY + 50);

ctx.strokeStyle = COLORS.yellow;
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(ctx_tx, ctaY + 64);
ctx.lineTo(ctx_tx + 56, ctaY + 64);
ctx.stroke();

ctx.fillStyle = COLORS.ctaBody;
ctx.font = `17px InstSans`;
const ctaLines = wrapText(ctx, "Android öppnar Play Store, iPhone öppnar App Store — automatiskt.", qrX - ctx_tx - 30);
let cy = ctaY + 92;
for (const line of ctaLines) { ctx.fillText(line, ctx_tx, cy); cy += 22; }

// ─── Footer (inom dark CTA-bandet) ───────────────────
ctx.fillStyle = COLORS.ctaBody;
ctx.font = `italic 16px InstSansItalic`;
ctx.textAlign = "center";
ctx.fillText("tipspromenaden.app", W / 2, ctaY + ctaH - 14);

const outPath = path.join(__dirname, "social-linkedin-branded-square.png");
fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
console.log(`OK: ${outPath}`);
