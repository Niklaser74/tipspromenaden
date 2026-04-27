// Lokal A5-flygblad: tipspromenad runt Hammardammen för föräldrar
// medan barnen tränar karate. Output:
//   flygblad-hammardammen.pdf      (A5 portrait, en sida)
//   flygblad-hammardammen.png      (preview)
//   flygblad-hammardammen-2up.pdf  (A4 landscape, två A5 sida vid sida)

import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { PDFDocument as PDFLib } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const FONTS = path.resolve(
  process.env.APPDATA ?? "",
  "Claude/local-agent-mode-sessions/skills-plugin/6e3f3656-5b7f-48a4-9391-8a16ae2c491d/0a338210-3309-4e53-a4e7-c3d23bfbe37f/skills/canvas-design/canvas-fonts"
);

const PT_PER_MM = 72 / 25.4;
const W = 148 * PT_PER_MM;
const H = 210 * PT_PER_MM;

const C = {
  cream:     "#F5F0E8",
  green:     "#1B6B35",
  greenDark: "#1B3D2B",
  text:      "#2C3E2D",
  sage:      "#8A9A8D",
  rule:      "#D9D2C2",
  white:     "#FFFFFF",
};

const MARGIN = 14 * PT_PER_MM;
const CONTENT_W = W - 2 * MARGIN;

const ICON_PATH = path.join(ROOT, "assets", "icon.png");
const QR_PATH = path.join(__dirname, "qr-hammardammen.png");
const PDF_PATH = path.join(__dirname, "flygblad-hammardammen.pdf");
const PNG_PATH = path.join(__dirname, "flygblad-hammardammen.png");
const PDF_2UP = path.join(__dirname, "flygblad-hammardammen-2up.pdf");

// ─── PDF ───────────────────────────────────────────────────────────

const doc = new PDFDocument({ size: [W, H], margin: 0, info: {
  Title: "Tipspromenad — Hammardammen",
  Author: "Niklas Eriksson",
}});
doc.pipe(fs.createWriteStream(PDF_PATH));

doc.registerFont("serif",     path.join(FONTS, "Lora-Bold.ttf"));
doc.registerFont("serif-it",  path.join(FONTS, "Lora-Italic.ttf"));
doc.registerFont("sans",      path.join(FONTS, "InstrumentSans-Regular.ttf"));
doc.registerFont("sans-bold", path.join(FONTS, "InstrumentSans-Bold.ttf"));
doc.registerFont("sans-it",   path.join(FONTS, "InstrumentSans-Italic.ttf"));

doc.rect(0, 0, W, H).fill(C.cream);

let y = 9 * PT_PER_MM;

// Eyebrow
doc.font("sans-bold").fontSize(7).fillColor(C.sage)
   .text("EN STILLA STUND  ·  HAMMARDAMMEN", MARGIN, y, {
     width: CONTENT_W, align: "center", characterSpacing: 1.5,
   });
y += 16;
doc.moveTo(W/2 - 14, y).lineTo(W/2 + 14, y)
   .strokeColor(C.green).lineWidth(0.7).stroke();
y += 18;

// App icon
const iconSize = 44;
if (fs.existsSync(ICON_PATH)) {
  doc.image(ICON_PATH, W/2 - iconSize/2, y, { width: iconSize, height: iconSize });
  y += iconSize + 12;
}

// Headline
doc.font("serif").fontSize(28).fillColor(C.greenDark)
   .text("Medan barnen tränar.", MARGIN, y, {
     width: CONTENT_W, align: "center",
   });
y += 38;

doc.font("serif-it").fontSize(15).fillColor(C.green)
   .text("Ta en promenad runt Hammardammen.", MARGIN, y, {
     width: CONTENT_W, align: "center",
   });
y += 32;

// Intro
const intro =
  "En tipspromenad du gör på egen hand. Kontrollerna ligger längs " +
  "en lugn slinga runt dammen — perfekt för en stund för dig själv " +
  "medan barnen är i dojon. Frågorna öppnas automatiskt när du kommer " +
  "fram till varje punkt.";
const introOpts = { width: CONTENT_W, align: "center", lineGap: 3 };
doc.font("sans").fontSize(10.5).fillColor(C.text)
   .text(intro, MARGIN, y, introOpts);
y += doc.heightOfString(intro, introOpts) + 16;

// Spec-line
doc.font("sans-bold").fontSize(9).fillColor(C.sage)
   .text("15 kontroller  ·  ca 35 minuter  ·  gratis", MARGIN, y, {
     width: CONTENT_W, align: "center", characterSpacing: 1.2,
   });
y += 22;

// QR card
const qrSize = 150;
const qrX = W/2 - qrSize/2;
doc.roundedRect(qrX - 10, y - 10, qrSize + 20, qrSize + 20, 10)
   .fill(C.white);
doc.image(QR_PATH, qrX, y, { width: qrSize, height: qrSize });
y += qrSize + 22;

// Caption under QR
doc.font("sans-it").fontSize(10).fillColor(C.text)
   .text("Skanna med kameran så öppnas promenaden i appen.", MARGIN, y, {
     width: CONTENT_W, align: "center",
   });
y += 16;
doc.font("sans").fontSize(9).fillColor(C.sage)
   .text("Har du inte appen? Sök \"Tipspromenaden\" i Play Store.",
     MARGIN, y, { width: CONTENT_W, align: "center" });

// Footer
doc.font("sans-it").fontSize(9).fillColor(C.sage)
   .text("— Niklas Eriksson", MARGIN, H - 22 * PT_PER_MM, {
     width: CONTENT_W, align: "center",
   });
doc.font("sans-bold").fontSize(9).fillColor(C.green)
   .text("tipspromenaden.app@gmail.com", MARGIN, H - 12 * PT_PER_MM, {
     width: CONTENT_W, align: "center",
   });

doc.end();
await new Promise((resolve) => doc.on("end", resolve));
console.log("OK:", PDF_PATH);

// ─── PNG ──────────────────────────────────────────────────────────

GlobalFonts.registerFromPath(path.join(FONTS, "Lora-Bold.ttf"), "LoraBold");
GlobalFonts.registerFromPath(path.join(FONTS, "Lora-Italic.ttf"), "LoraItalic");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Regular.ttf"), "InstSans");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Bold.ttf"), "InstSansBold");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Italic.ttf"), "InstSansIt");

const DPI = 300;
const SCALE = DPI / 72;
const PW = Math.round(W * SCALE);
const PH = Math.round(H * SCALE);
const px = (pt) => pt * SCALE;
const M = px(MARGIN);
const CW = PW - 2 * M;

const canvas = createCanvas(PW, PH);
const ctx = canvas.getContext("2d");
ctx.fillStyle = C.cream;
ctx.fillRect(0, 0, PW, PH);

let cy = px(9 * PT_PER_MM);
ctx.fillStyle = C.sage;
ctx.font = `${px(7)}px InstSansBold`;
ctx.textAlign = "center";
let eb = "";
for (const ch of "EN STILLA STUND  ·  HAMMARDAMMEN") eb += ch + " ";
ctx.fillText(eb, PW/2, cy + px(7));
cy += px(16);
ctx.strokeStyle = C.green;
ctx.lineWidth = px(0.7);
ctx.beginPath();
ctx.moveTo(PW/2 - px(14), cy);
ctx.lineTo(PW/2 + px(14), cy);
ctx.stroke();
cy += px(18);

const iconImg = await loadImage(ICON_PATH);
const iconSizePx = px(44);
ctx.drawImage(iconImg, PW/2 - iconSizePx/2, cy, iconSizePx, iconSizePx);
cy += iconSizePx + px(12);

ctx.fillStyle = C.greenDark;
ctx.font = `${px(28)}px LoraBold`;
ctx.fillText("Medan barnen tränar.", PW/2, cy + px(24));
cy += px(38);

ctx.fillStyle = C.green;
ctx.font = `${px(15)}px LoraItalic`;
ctx.fillText("Ta en promenad runt Hammardammen.", PW/2, cy + px(13));
cy += px(32);

function wrap(text, maxW) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

ctx.fillStyle = C.text;
ctx.font = `${px(10.5)}px InstSans`;
const introLines = wrap(intro, CW);
const introLH = px(13.5);
for (let i = 0; i < introLines.length; i++) {
  ctx.fillText(introLines[i], PW/2, cy + px(10) + i * introLH);
}
cy += px(10) + introLines.length * introLH + px(10);

ctx.fillStyle = C.sage;
ctx.font = `${px(9)}px InstSansBold`;
let spec = "";
for (const ch of "15 kontroller  ·  ca 35 minuter  ·  gratis") spec += ch + " ";
ctx.fillText(spec, PW/2, cy + px(9));
cy += px(22);

// QR card
const qrSizePx = px(150);
const qrXpx = PW/2 - qrSizePx/2;
function roundRect(x, y, w, h, r) {
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
ctx.fillStyle = C.white;
roundRect(qrXpx - px(10), cy - px(10), qrSizePx + px(20), qrSizePx + px(20), px(10));
ctx.fill();
const qrImg = await loadImage(QR_PATH);
ctx.drawImage(qrImg, qrXpx, cy, qrSizePx, qrSizePx);
cy += qrSizePx + px(22);

ctx.fillStyle = C.text;
ctx.font = `${px(10)}px InstSansIt`;
ctx.fillText("Skanna med kameran så öppnas promenaden i appen.", PW/2, cy + px(9));
cy += px(16);
ctx.fillStyle = C.sage;
ctx.font = `${px(9)}px InstSans`;
ctx.fillText("Har du inte appen? Sök \"Tipspromenaden\" i Play Store.",
  PW/2, cy + px(8));

ctx.fillStyle = C.sage;
ctx.font = `${px(9)}px InstSansIt`;
ctx.fillText("— Niklas Eriksson", PW/2, PH - px(22 * PT_PER_MM) + px(8));
ctx.fillStyle = C.green;
ctx.font = `${px(9)}px InstSansBold`;
ctx.fillText("tipspromenaden.app@gmail.com", PW/2, PH - px(12 * PT_PER_MM) + px(8));

fs.writeFileSync(PNG_PATH, canvas.toBuffer("image/png"));
console.log("OK:", PNG_PATH);

// ─── 2-up A4 landscape ────────────────────────────────────────────

const A4W = 297 * PT_PER_MM;
const A4H = 210 * PT_PER_MM;

const srcBytes = fs.readFileSync(PDF_PATH);
const out = await PDFLib.create();
const src = await PDFLib.load(srcBytes);
const [embedded] = await out.embedPdf(src, [0]);

const page = out.addPage([A4W, A4H]);
const yOffset = (A4H - H) / 2;
const xLeft = (A4W / 2 - W) / 2;
const xRight = A4W / 2 + (A4W / 2 - W) / 2;

page.drawPage(embedded, { x: xLeft,  y: yOffset, width: W, height: H });
page.drawPage(embedded, { x: xRight, y: yOffset, width: W, height: H });

page.drawLine({
  start: { x: A4W / 2, y: yOffset + 4 },
  end:   { x: A4W / 2, y: yOffset + H - 4 },
  thickness: 0.3, opacity: 0.25, dashArray: [3, 3],
});

fs.writeFileSync(PDF_2UP, await out.save());
console.log("OK:", PDF_2UP);
