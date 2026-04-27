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
const QR_WALK = path.join(__dirname, "qr-hammardammen.png");
const QR_MAIL = path.join(__dirname, "qr-bli-testare.png");
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

// Intro — kortare för att ge plats åt två QR
const intro =
  "En tipspromenad du gör på egen hand längs en lugn slinga runt " +
  "dammen — perfekt för en stund för dig själv medan barnen är i dojon.";
const introOpts = { width: CONTENT_W, align: "center", lineGap: 3 };
doc.font("sans").fontSize(10.5).fillColor(C.text)
   .text(intro, MARGIN, y, introOpts);
y += doc.heightOfString(intro, introOpts) + 14;

// Spec-line
doc.font("sans-bold").fontSize(8.5).fillColor(C.sage)
   .text("15 KONTROLLER  ·  CA 35 MINUTER  ·  GRATIS", MARGIN, y, {
     width: CONTENT_W, align: "center", characterSpacing: 1.5,
   });
y += 22;

// Två steg: bli testare → starta promenaden
// Appen är inte släppt i Play Store än, så STEG 1 (mejl-QR) måste göras
// först. STEG 2 (walk-QR) kan bara användas av redan-godkända testare.
const qrSize = 96;
const colGap = 14;
const colW = (CONTENT_W - colGap) / 2;
const leftX = MARGIN;
const rightX = MARGIN + colW + colGap;
const stepY = y;

function drawStep(colX, num, title, qrPath, caption) {
  // Step number + title
  doc.font("sans-bold").fontSize(7.5).fillColor(C.green)
     .text(`STEG ${num}`, colX, stepY, {
       width: colW, align: "center", characterSpacing: 1.5,
     });
  doc.font("serif").fontSize(13).fillColor(C.greenDark)
     .text(title, colX, stepY + 14, {
       width: colW, align: "center",
     });

  // QR card centered in column
  const qrX = colX + (colW - qrSize) / 2;
  const qrY = stepY + 38;
  doc.roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 8)
     .fill(C.white);
  doc.image(qrPath, qrX, qrY, { width: qrSize, height: qrSize });

  // Caption under QR
  doc.font("sans").fontSize(8.5).fillColor(C.text)
     .text(caption, colX, qrY + qrSize + 10, {
       width: colW, align: "center", lineGap: 2,
     });
}

drawStep(leftX, "1", "Bli testare", QR_MAIL,
  "Skannar ett färdigt mejl. Tryck Skicka — så bjuder jag in dig till testgruppen.");
drawStep(rightX, "2", "Starta promenaden", QR_WALK,
  "Skanna när du har fått appen installerad — promenaden öppnas direkt.");

y = stepY + 38 + qrSize + 36;

// Liten förklaring längst ner
doc.font("sans-it").fontSize(9).fillColor(C.sage)
   .text(
     "Appen är i sluten testning — den finns inte i Play Store ännu. " +
     "Skanna QR 1 så fixar jag inbjudan.",
     MARGIN, y,
     { width: CONTENT_W, align: "center", lineGap: 2 }
   );

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
ctx.font = `${px(8.5)}px InstSansBold`;
let spec = "";
for (const ch of "15 KONTROLLER  ·  CA 35 MINUTER  ·  GRATIS") spec += ch + " ";
ctx.fillText(spec, PW/2, cy + px(8.5));
cy += px(22);

// Två-stegs-block — samma layout som PDF:en
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

const qrSizePx = px(96);
const colGapPx = px(14);
const colWPx = (CW - colGapPx) / 2;
const stepYpx = cy;

const qrMailImg = await loadImage(QR_MAIL);
const qrWalkImg = await loadImage(QR_WALK);

async function drawStepPng(colXpx, num, title, qrImg, caption) {
  ctx.fillStyle = C.green;
  ctx.font = `${px(7.5)}px InstSansBold`;
  ctx.textAlign = "center";
  let lab = "";
  for (const ch of `STEG ${num}`) lab += ch + " ";
  ctx.fillText(lab, colXpx + colWPx / 2, stepYpx + px(7));

  ctx.fillStyle = C.greenDark;
  ctx.font = `${px(13)}px LoraBold`;
  ctx.fillText(title, colXpx + colWPx / 2, stepYpx + px(14) + px(11));

  const qrXpx = colXpx + (colWPx - qrSizePx) / 2;
  const qrYpx = stepYpx + px(38);
  ctx.fillStyle = C.white;
  roundRect(qrXpx - px(6), qrYpx - px(6), qrSizePx + px(12), qrSizePx + px(12), px(8));
  ctx.fill();
  ctx.drawImage(qrImg, qrXpx, qrYpx, qrSizePx, qrSizePx);

  ctx.fillStyle = C.text;
  ctx.font = `${px(8.5)}px InstSans`;
  const capLines = wrap(caption, colWPx);
  const capLH = px(11);
  for (let i = 0; i < capLines.length; i++) {
    ctx.fillText(capLines[i], colXpx + colWPx / 2,
      qrYpx + qrSizePx + px(10) + px(8.5) + i * capLH);
  }
}

await drawStepPng(M, "1", "Bli testare", qrMailImg,
  "Skannar ett färdigt mejl. Tryck Skicka — så bjuder jag in dig till testgruppen.");
await drawStepPng(M + colWPx + colGapPx, "2", "Starta promenaden", qrWalkImg,
  "Skanna när du har fått appen installerad — promenaden öppnas direkt.");

cy = stepYpx + px(38) + qrSizePx + px(36);

// Förklaring längst ner
ctx.fillStyle = C.sage;
ctx.font = `${px(9)}px InstSansIt`;
const expl =
  "Appen är i sluten testning — den finns inte i Play Store ännu. " +
  "Skanna QR 1 så fixar jag inbjudan.";
const explLines = wrap(expl, CW);
const explLH = px(11.5);
for (let i = 0; i < explLines.length; i++) {
  ctx.fillText(explLines[i], PW/2, cy + px(8) + i * explLH);
}

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
