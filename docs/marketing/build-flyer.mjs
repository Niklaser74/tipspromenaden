// Bygger A5-flygbladet "Friluft Folio" — Tipspromenaden för karateklubben.
// Output: flygblad-tipspromenaden.pdf + .png i samma mapp.
//
// Använder pdfkit (PDF) och @napi-rs/canvas (PNG-rastrerad spegelversion).
// Båda via npx — inga deps i projektet.

import PDFDocument from "pdfkit";
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

// A5 portrait at 72 dpi (PDF point space). PDFKit uses points by default.
const PT_PER_MM = 72 / 25.4;
const W = 148 * PT_PER_MM; // 419.5 pt
const H = 210 * PT_PER_MM; // 595.3 pt

const COLORS = {
  cream: "#F5F0E8",
  green: "#1B6B35",
  greenDark: "#1B3D2B",
  text: "#2C3E2D",
  sage: "#8A9A8D",
  yellow: "#E8B830",
  rule: "#D9D2C2",
  white: "#FFFFFF",
};

// ─── PDF -----------------------------------------------------------

const pdfPath = path.join(__dirname, "flygblad-tipspromenaden.pdf");
const doc = new PDFDocument({ size: [W, H], margin: 0, info: {
  Title: "Tipspromenaden — Bli testpilot",
  Author: "Niklas Eriksson",
}});
doc.pipe(fs.createWriteStream(pdfPath));

doc.registerFont("serif",        path.join(FONTS, "Lora-Bold.ttf"));
doc.registerFont("serif-it",     path.join(FONTS, "Lora-Italic.ttf"));
doc.registerFont("sans",         path.join(FONTS, "InstrumentSans-Regular.ttf"));
doc.registerFont("sans-bold",    path.join(FONTS, "InstrumentSans-Bold.ttf"));
doc.registerFont("sans-it",      path.join(FONTS, "InstrumentSans-Italic.ttf"));

// Cream ground
doc.rect(0, 0, W, H).fill(COLORS.cream);

const MARGIN = 14 * PT_PER_MM;
const CONTENT_W = W - 2 * MARGIN;
let y = 9 * PT_PER_MM;

// Top eyebrow rule + label
doc.font("sans-bold").fontSize(7).fillColor(COLORS.sage)
   .text("BARN  ·  FÖRÄLDRAR  ·  UTOMHUS", MARGIN, y, {
     characterSpacing: 1.5, width: CONTENT_W, align: "center"
   });
y += 16;
doc.moveTo(W/2 - 14, y).lineTo(W/2 + 14, y)
   .strokeColor(COLORS.green).lineWidth(0.7).stroke();
y += 18;

// App icon centered above headline (small — restraint)
const iconPath = path.join(ROOT, "assets", "icon.png");
if (fs.existsSync(iconPath)) {
  const iconSize = 48;
  doc.image(iconPath, W/2 - iconSize/2, y, { width: iconSize, height: iconSize });
  y += iconSize + 12;
}

// Headline
doc.font("serif").fontSize(40).fillColor(COLORS.greenDark)
   .text("Tipspromenaden", MARGIN, y, { width: CONTENT_W, align: "center" });
y += 56;

// Sub-headline
doc.font("serif-it").fontSize(15).fillColor(COLORS.green)
   .text("En quizpromenad i fickan", MARGIN, y, { width: CONTENT_W, align: "center" });
y += 28;

// Intro — använd faktisk renderad höjd istället för hårdkodad offset, annars
// hamnar dividerregeln nedanför ovanpå sista textraden vid 4-radig wrap.
const introText =
  "En app där ni går en tipspromenad utomhus med mobilen som frågepapper. " +
  "GPS visar var nästa kontroll finns och frågan öppnas automatiskt när " +
  "ni kommer fram. Familjeturen blir plötsligt en lagom-tävling.";
const introOpts = { width: CONTENT_W, align: "center", lineGap: 2 };
doc.font("sans").fontSize(10.5).fillColor(COLORS.text)
   .text(introText, MARGIN, y, introOpts);
y += doc.heightOfString(introText, introOpts) + 14;

// Hairline divider
doc.moveTo(MARGIN + 60, y).lineTo(W - MARGIN - 60, y)
   .strokeColor(COLORS.rule).lineWidth(0.5).stroke();
y += 16;

// Two columns
const COL_GAP = 14;
const COL_W = (CONTENT_W - COL_GAP) / 2;
const colYStart = y;

function drawColumn(x, label, items) {
  let cy = colYStart;
  doc.font("sans-bold").fontSize(7.5).fillColor(COLORS.green)
     .text(label, x, cy, { width: COL_W, align: "left", characterSpacing: 1.5 });
  cy += 18;
  doc.font("sans").fontSize(9.5).fillColor(COLORS.text);
  for (const item of items) {
    // Small green diamond marker
    doc.save();
    doc.translate(x + 2, cy + 5);
    doc.rotate(45);
    doc.rect(-2.2, -2.2, 4.4, 4.4).fill(COLORS.green);
    doc.restore();
    doc.font("sans").fontSize(9.5).fillColor(COLORS.text)
       .text(item, x + 14, cy, { width: COL_W - 14, lineGap: 1.5 });
    cy += doc.heightOfString(item, { width: COL_W - 14, lineGap: 1.5 }) + 8;
  }
  return cy;
}

const kidEnd = drawColumn(MARGIN, "FÖR DIG SOM ÄR BARN", [
  "Tävla på topplistan",
  "Bygg din egen tipspromenad",
  "Gör quiz om det du gillar",
  "GPS låser upp varje fråga",
  "Appen läser frågorna högt",
]);
const parentEnd = drawColumn(MARGIN + COL_W + COL_GAP, "FÖR DIG SOM ÄR FÖRÄLDER", [
  "Skärmtid blir frisk luft",
  "Hela familjen samma aktivitet",
  "Gratis under testperioden",
  "Inga annonser, inga köp",
  "Svenska och engelska",
]);
y = Math.max(kidEnd, parentEnd) + 14;

// CTA block — green, full width
const ctaH = 110;
doc.roundedRect(MARGIN, y, CONTENT_W, ctaH, 10).fill(COLORS.greenDark);

const ctaPad = 16;
const qrSize = 78;
const qrX = MARGIN + CONTENT_W - ctaPad - qrSize;
const qrY = y + (ctaH - qrSize) / 2;
const ctaTextX = MARGIN + ctaPad;
const ctaTextW = qrX - ctaTextX - 14;

doc.font("serif").fontSize(18).fillColor(COLORS.cream)
   .text("Vill du prova?", ctaTextX, y + ctaPad, { width: ctaTextW });
doc.font("sans").fontSize(9.5).fillColor("#E8E8DC")
   .text(
     "Appen är på Android i sluten testning just nu — vi behöver fler " +
     "testpiloter. Skanna QR-koden, tryck \"Ask to join\" och vänta på " +
     "godkännande från mig.",
     ctaTextX, y + ctaPad + 26,
     { width: ctaTextW, lineGap: 2 }
   );

// QR — white card with rounded corners
const qrPath = path.join(__dirname, "qr-bli-testare.png");
doc.roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 6).fill(COLORS.white);
doc.image(qrPath, qrX, qrY, { width: qrSize, height: qrSize });

y += ctaH + 12;

// Footer — signature + email
doc.font("sans-it").fontSize(9).fillColor(COLORS.sage)
   .text("— Niklas Eriksson", MARGIN, y, {
     width: CONTENT_W, align: "center"
   });
y += 14;
doc.font("sans-bold").fontSize(9).fillColor(COLORS.green)
   .text("tipspromenaden.app@gmail.com", MARGIN, y, {
     width: CONTENT_W, align: "center"
   });

doc.end();

// ─── PNG (canvas mirror) -------------------------------------------

await new Promise((resolve) => doc.on("end", resolve));

// Now build a PNG version at 300 dpi for sharing/preview
const DPI = 300;
const PX_PER_MM = DPI / 25.4;
const PW = Math.round(148 * PX_PER_MM);
const PH = Math.round(210 * PX_PER_MM);
const SCALE = PW / W; // points → pixels

GlobalFonts.registerFromPath(path.join(FONTS, "Lora-Bold.ttf"), "LoraBold");
GlobalFonts.registerFromPath(path.join(FONTS, "Lora-Italic.ttf"), "LoraItalic");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Regular.ttf"), "InstSans");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Bold.ttf"), "InstSansBold");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Italic.ttf"), "InstSansItalic");

const canvas = createCanvas(PW, PH);
const ctx = canvas.getContext("2d");

ctx.fillStyle = COLORS.cream;
ctx.fillRect(0, 0, PW, PH);

// Convert pt → px helper
const px = (pt) => pt * SCALE;
const M = px(MARGIN);
const CW = PW - 2 * M;

let cy = px(9 * PT_PER_MM);

// Eyebrow
ctx.fillStyle = COLORS.sage;
ctx.font = `${px(7)}px InstSansBold`;
ctx.textAlign = "center";
const eyebrow = "BARN  ·  FÖRÄLDRAR  ·  UTOMHUS";
// Simulate letter-spacing manually
let eb = "";
for (const ch of eyebrow) eb += ch + " ";
ctx.fillText(eb, PW / 2, cy + px(7));
cy += px(16);

ctx.strokeStyle = COLORS.green;
ctx.lineWidth = px(0.7);
ctx.beginPath();
ctx.moveTo(PW / 2 - px(14), cy);
ctx.lineTo(PW / 2 + px(14), cy);
ctx.stroke();
cy += px(18);

// Icon
const iconImg = await loadImage(iconPath);
const iconSizePx = px(48);
ctx.drawImage(iconImg, PW / 2 - iconSizePx / 2, cy, iconSizePx, iconSizePx);
cy += iconSizePx + px(12);

// Headline
ctx.fillStyle = COLORS.greenDark;
ctx.font = `${px(40)}px LoraBold`;
ctx.fillText("Tipspromenaden", PW / 2, cy + px(34));
cy += px(56);

// Sub
ctx.fillStyle = COLORS.green;
ctx.font = `${px(15)}px LoraItalic`;
ctx.fillText("En quizpromenad i fickan", PW / 2, cy + px(13));
cy += px(28);

// Intro paragraph (manual wrap)
ctx.fillStyle = COLORS.text;
ctx.font = `${px(10.5)}px InstSans`;
ctx.textAlign = "center";
const intro =
  "En app där ni går en tipspromenad utomhus med mobilen som frågepapper. " +
  "GPS visar var nästa kontroll finns och frågan öppnas automatiskt när " +
  "ni kommer fram. Familjeturen blir plötsligt en lagom-tävling.";
function wrapText(text, maxW) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
const introLines = wrapText(intro, CW);
const introLH = px(13);
for (let i = 0; i < introLines.length; i++) {
  ctx.fillText(introLines[i], PW / 2, cy + px(10) + i * introLH);
}
cy += px(10) + introLines.length * introLH + px(8);

// Divider
ctx.strokeStyle = COLORS.rule;
ctx.lineWidth = px(0.5);
ctx.beginPath();
ctx.moveTo(M + px(60), cy);
ctx.lineTo(PW - M - px(60), cy);
ctx.stroke();
cy += px(16);

// Two columns
const colGap = px(14);
const colW = (CW - colGap) / 2;
ctx.textAlign = "left";

function drawColumnPng(x, label, items, startY) {
  let yy = startY;
  ctx.fillStyle = COLORS.green;
  ctx.font = `${px(7.5)}px InstSansBold`;
  let lab = "";
  for (const ch of label) lab += ch + " ";
  ctx.fillText(lab, x, yy + px(7));
  yy += px(18);

  ctx.font = `${px(9.5)}px InstSans`;
  ctx.fillStyle = COLORS.text;
  for (const item of items) {
    // diamond
    ctx.save();
    ctx.translate(x + px(2), yy + px(5));
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = COLORS.green;
    ctx.fillRect(-px(2.2), -px(2.2), px(4.4), px(4.4));
    ctx.restore();

    ctx.fillStyle = COLORS.text;
    ctx.font = `${px(9.5)}px InstSans`;
    const lines = wrapText(item, colW - px(14));
    const lh = px(11.5);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x + px(14), yy + px(8) + i * lh);
    }
    yy += lines.length * lh + px(6);
  }
  return yy;
}

const kidEndPx = drawColumnPng(M, "FÖR DIG SOM ÄR BARN", [
  "Tävla på topplistan",
  "Bygg din egen tipspromenad",
  "Gör quiz om det du gillar",
  "GPS låser upp varje fråga",
  "Appen läser frågorna högt",
], cy);
const parentEndPx = drawColumnPng(M + colW + colGap, "FÖR DIG SOM ÄR FÖRÄLDER", [
  "Skärmtid blir frisk luft",
  "Hela familjen samma aktivitet",
  "Gratis under testperioden",
  "Inga annonser, inga köp",
  "Svenska och engelska",
], cy);
cy = Math.max(kidEndPx, parentEndPx) + px(14);

// CTA block
const ctaHpx = px(110);
const ctaR = px(10);
ctx.fillStyle = COLORS.greenDark;
roundRect(ctx, M, cy, CW, ctaHpx, ctaR);
ctx.fill();

const ctaPadPx = px(16);
const qrSizePx = px(78);
const qrXpx = M + CW - ctaPadPx - qrSizePx;
const qrYpx = cy + (ctaHpx - qrSizePx) / 2;
const ctaTextXpx = M + ctaPadPx;
const ctaTextWpx = qrXpx - ctaTextXpx - px(14);

ctx.fillStyle = COLORS.cream;
ctx.font = `${px(18)}px LoraBold`;
ctx.textAlign = "left";
ctx.fillText("Vill du prova?", ctaTextXpx, cy + ctaPadPx + px(15));

ctx.fillStyle = "#E8E8DC";
ctx.font = `${px(9.5)}px InstSans`;
const ctaBody =
  "Appen är på Android i sluten testning just nu — vi behöver fler " +
  "testpiloter. Skanna QR-koden så öppnas ett färdigt mejl till mig.";
const ctaLines = wrapText(ctaBody, ctaTextWpx);
const ctaLH = px(13);
for (let i = 0; i < ctaLines.length; i++) {
  ctx.fillText(ctaLines[i], ctaTextXpx, cy + ctaPadPx + px(36) + i * ctaLH);
}

// QR card
ctx.fillStyle = COLORS.white;
roundRect(ctx, qrXpx - px(6), qrYpx - px(6), qrSizePx + px(12), qrSizePx + px(12), px(6));
ctx.fill();
const qrImg = await loadImage(qrPath);
ctx.drawImage(qrImg, qrXpx, qrYpx, qrSizePx, qrSizePx);

cy += ctaHpx + px(12);

// Footer
ctx.fillStyle = COLORS.sage;
ctx.font = `${px(9)}px InstSansItalic`;
ctx.textAlign = "center";
ctx.fillText("— Niklas Eriksson", PW / 2, cy + px(8));
cy += px(14);
ctx.fillStyle = COLORS.green;
ctx.font = `${px(9)}px InstSansBold`;
ctx.fillText("tipspromenaden.app@gmail.com", PW / 2, cy + px(8));

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

const pngPath = path.join(__dirname, "flygblad-tipspromenaden.png");
fs.writeFileSync(pngPath, canvas.toBuffer("image/png"));

console.log("OK:", pdfPath);
console.log("OK:", pngPath);
