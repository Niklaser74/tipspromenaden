// Bifold-brochyr: en A4 landscape som viks på mitten ger 4 A5-sidor.
//
// Print-imposition:
//   Page 1 (utsida på vikt papper):  [BAKSIDA | FRAMSIDA]
//   Page 2 (insida på vikt papper):  [INSIDA-VÄNSTER | INSIDA-HÖGER]
//
// Skriv ut dubbelsidigt, vänd på långsidan, vik på mitten.
// Output: flygblad-tipspromenaden-bifold.pdf

import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const FONTS = path.resolve(
  process.env.APPDATA ?? "",
  "Claude/local-agent-mode-sessions/skills-plugin/6e3f3656-5b7f-48a4-9391-8a16ae2c491d/0a338210-3309-4e53-a4e7-c3d23bfbe37f/skills/canvas-design/canvas-fonts"
);

const PT_PER_MM = 72 / 25.4;
const A4W = 297 * PT_PER_MM;  // landscape
const A4H = 210 * PT_PER_MM;
const PANEL_W = A4W / 2;       // 148.5 mm = A5 portrait width
const PANEL_H = A4H;           // 210 mm  = A5 portrait height

const C = {
  cream:     "#F5F0E8",
  green:     "#1B6B35",
  greenDark: "#1B3D2B",
  text:      "#2C3E2D",
  sage:      "#8A9A8D",
  rule:      "#D9D2C2",
  white:     "#FFFFFF",
  bodyOnDark:"#E8E8DC",
};

const PAD = 14 * PT_PER_MM;     // panel-margin

const out = path.join(__dirname, "flygblad-tipspromenaden-bifold.pdf");
const doc = new PDFDocument({ size: [A4W, A4H], margin: 0, info: {
  Title: "Tipspromenaden — Bifold A5",
  Author: "Niklas Eriksson",
}});
doc.pipe(fs.createWriteStream(out));

doc.registerFont("serif",     path.join(FONTS, "Lora-Bold.ttf"));
doc.registerFont("serif-it",  path.join(FONTS, "Lora-Italic.ttf"));
doc.registerFont("sans",      path.join(FONTS, "InstrumentSans-Regular.ttf"));
doc.registerFont("sans-bold", path.join(FONTS, "InstrumentSans-Bold.ttf"));
doc.registerFont("sans-it",   path.join(FONTS, "InstrumentSans-Italic.ttf"));

// ── Helpers ────────────────────────────────────────────────────────

function fillPanel(x, color = C.cream) {
  doc.rect(x, 0, PANEL_W, PANEL_H).fill(color);
}

function eyebrow(x, text, opts = {}) {
  const w = PANEL_W - 2 * PAD;
  const color = opts.color ?? C.sage;
  doc.font("sans-bold").fontSize(7).fillColor(color)
     .text(text, x + PAD, opts.y ?? (12 * PT_PER_MM), {
       width: w, align: "center", characterSpacing: 1.5,
     });
  // Hairline below
  const lineY = (opts.y ?? (12 * PT_PER_MM)) + 16;
  doc.moveTo(x + PANEL_W / 2 - 14, lineY)
     .lineTo(x + PANEL_W / 2 + 14, lineY)
     .strokeColor(opts.lineColor ?? C.green).lineWidth(0.7).stroke();
  return lineY + 6;
}

function diamond(x, y, color = C.green) {
  doc.save();
  doc.translate(x, y);
  doc.rotate(45);
  doc.rect(-2.2, -2.2, 4.4, 4.4).fill(color);
  doc.restore();
}

// ── Panel A: FRAMSIDA ──────────────────────────────────────────────

function drawFront(x) {
  fillPanel(x);
  let y = eyebrow(x, "BARN  ·  FÖRÄLDRAR  ·  UTOMHUS");
  y += 14;

  // App icon
  const iconSize = 64;
  const iconPath = path.join(ROOT, "assets", "icon.png");
  if (fs.existsSync(iconPath)) {
    doc.image(iconPath, x + PANEL_W / 2 - iconSize / 2, y, {
      width: iconSize, height: iconSize,
    });
    y += iconSize + 18;
  }

  // Headline
  doc.font("serif").fontSize(40).fillColor(C.greenDark)
     .text("Tipspromenaden", x + PAD, y, {
       width: PANEL_W - 2 * PAD, align: "center",
     });
  y += 56;

  doc.font("serif-it").fontSize(15).fillColor(C.green)
     .text("En quizpromenad i fickan", x + PAD, y, {
       width: PANEL_W - 2 * PAD, align: "center",
     });
  y += 32;

  // Single-line tagline
  doc.font("sans").fontSize(11).fillColor(C.text)
     .text(
       "GPS visar var nästa kontroll finns. Frågan öppnas automatiskt " +
       "när ni kommer fram. Familjeturen blir plötsligt en lagom-tävling.",
       x + PAD, y,
       { width: PANEL_W - 2 * PAD, align: "center", lineGap: 2.5 }
     );

  // Bottom hint — "öppna och läs"
  doc.font("sans-it").fontSize(9).fillColor(C.sage)
     .text("→  Vik upp och läs mer", x + PAD, PANEL_H - 26 * PT_PER_MM, {
       width: PANEL_W - 2 * PAD, align: "center",
     });

  // Bottom signature
  doc.font("sans-bold").fontSize(9).fillColor(C.green)
     .text("tipspromenaden.app@gmail.com", x + PAD, PANEL_H - 14 * PT_PER_MM, {
       width: PANEL_W - 2 * PAD, align: "center",
     });
}

// ── Panel B: BAKSIDA — CTA + QR ────────────────────────────────────

function drawBack(x) {
  fillPanel(x, C.greenDark);
  // Eyebrow på mörk bakgrund
  doc.font("sans-bold").fontSize(7).fillColor(C.bodyOnDark)
     .text("VILL DU PROVA?", x + PAD, 14 * PT_PER_MM, {
       width: PANEL_W - 2 * PAD, align: "center", characterSpacing: 2,
     });

  let y = 14 * PT_PER_MM + 16;
  doc.moveTo(x + PANEL_W / 2 - 14, y)
     .lineTo(x + PANEL_W / 2 + 14, y)
     .strokeColor(C.cream).lineWidth(0.7).stroke();
  y += 22;

  // Headline
  doc.font("serif").fontSize(34).fillColor(C.cream)
     .text("Bli testpilot.", x + PAD, y, {
       width: PANEL_W - 2 * PAD, align: "center",
     });
  y += 44;

  doc.font("serif-it").fontSize(13).fillColor(C.bodyOnDark)
     .text("Skanna och skicka.", x + PAD, y, {
       width: PANEL_W - 2 * PAD, align: "center",
     });
  y += 28;

  // QR card
  const qrSize = 130;
  const qrX = x + PANEL_W / 2 - qrSize / 2;
  const qrY = y;
  doc.roundedRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 8).fill(C.cream);
  doc.image(path.join(__dirname, "qr-bli-testare.png"), qrX, qrY, {
    width: qrSize, height: qrSize,
  });
  y += qrSize + 22;

  doc.font("sans").fontSize(10).fillColor(C.bodyOnDark)
     .text(
       "QR-koden öppnar ett färdigt mejl till mig — skicka, så bjuder " +
       "jag in dig till testgruppen i Google Play.",
       x + PAD, y,
       { width: PANEL_W - 2 * PAD, align: "center", lineGap: 2 }
     );
  y += doc.heightOfString(
    "QR-koden öppnar ett färdigt mejl till mig — skicka, så bjuder jag in dig till testgruppen i Google Play.",
    { width: PANEL_W - 2 * PAD, align: "center", lineGap: 2 }
  ) + 18;

  // Footer block
  doc.font("sans-it").fontSize(9).fillColor(C.bodyOnDark)
     .text("— Niklas Eriksson", x + PAD, PANEL_H - 30 * PT_PER_MM, {
       width: PANEL_W - 2 * PAD, align: "center",
     });
  doc.font("sans-bold").fontSize(9).fillColor(C.cream)
     .text("tipspromenaden.app@gmail.com", x + PAD, PANEL_H - 22 * PT_PER_MM, {
       width: PANEL_W - 2 * PAD, align: "center",
     });
  doc.font("sans").fontSize(8).fillColor(C.sage)
     .text("Just nu endast för Android.", x + PAD, PANEL_H - 12 * PT_PER_MM, {
       width: PANEL_W - 2 * PAD, align: "center",
     });
}

// ── Panel C: INSIDA-VÄNSTER — Vad är det? + bullets ────────────────

function drawInsideLeft(x) {
  fillPanel(x);
  let y = eyebrow(x, "VAD ÄR DET?");
  y += 18;

  doc.font("serif").fontSize(26).fillColor(C.greenDark)
     .text("En tipspromenad", x + PAD, y, {
       width: PANEL_W - 2 * PAD, align: "left",
     });
  y += 30;
  doc.font("serif-it").fontSize(20).fillColor(C.green)
     .text("som öppnar sig av sig själv.", x + PAD, y, {
       width: PANEL_W - 2 * PAD, align: "left",
     });
  y += 36;

  const intro =
    "Ladda ner appen, gå utomhus, och låt mobilen vara frågepappret. " +
    "GPS:en känner igen varje kontroll — frågan dyker upp i samma stund " +
    "som ni kommer fram. Inga lappar att tappa, ingen som behöver " +
    "stå still och läsa. Bara en promenad där alla har en anledning att " +
    "titta upp.";
  const introOpts = { width: PANEL_W - 2 * PAD, align: "left", lineGap: 3 };
  doc.font("sans").fontSize(10.5).fillColor(C.text)
     .text(intro, x + PAD, y, introOpts);
  y += doc.heightOfString(intro, introOpts) + 22;

  // Bullets — en sammanslagen lista
  const bullets = [
    "Tävla på topplistan — eller kör utan press",
    "Bygg din egen promenad med dina egna frågor",
    "GPS låser upp varje fråga när ni är på plats",
    "Appen kan läsa frågorna högt om man vill",
    "Färdiga frågebatterier att importera (.tipspack)",
    "Svenska och engelska, gratis under testperioden",
  ];
  doc.font("sans").fontSize(10).fillColor(C.text);
  for (const b of bullets) {
    diamond(x + PAD + 2, y + 5);
    const itemOpts = { width: PANEL_W - 2 * PAD - 14, lineGap: 1.5 };
    doc.font("sans").fontSize(10).fillColor(C.text)
       .text(b, x + PAD + 14, y, itemOpts);
    y += doc.heightOfString(b, itemOpts) + 8;
  }
}

// ── Panel D: INSIDA-HÖGER — Skärmdumpar ────────────────────────────

function drawInsideRight(x) {
  fillPanel(x);
  let y = eyebrow(x, "SÅHÄR SER DET UT");
  y += 18;

  doc.font("serif").fontSize(22).fillColor(C.greenDark)
     .text("Tre vyer från appen", x + PAD, y, {
       width: PANEL_W - 2 * PAD, align: "left",
     });
  y += 30;

  // Lägg ut skärmdumparna i en vertikal rad: tre porträtt-bilder
  const shots = [
    {
      file: "Screenshot_20260421_191742_tipspromenaden-app.jpg",
      caption: "Karta med kontroller — gå dit punkten är, så öppnas frågan.",
    },
    {
      file: "Screenshot_20260421_191823_tipspromenaden-app.jpg",
      caption: "Frågan visas när du är framme. Tre alternativ, ett rätt.",
    },
    {
      file: "Screenshot_20260421_191854_tipspromenaden-app.jpg",
      caption: "Topplistan i realtid — alla i samma session syns här.",
    },
  ];

  // Tre rader: bild | text. Bilden 32mm hög, texten till höger.
  const rowH = 36 * PT_PER_MM;
  const imgH = 30 * PT_PER_MM;
  // Anta porträtt-skärmdump 9:16, bredd ~ imgH * 9/16
  const imgW = imgH * 9 / 16;

  for (const s of shots) {
    const imgPath = path.join(ROOT, "assets", s.file);
    if (fs.existsSync(imgPath)) {
      // Rundad mask via clip-rect
      doc.save();
      doc.roundedRect(x + PAD, y, imgW, imgH, 6).clip();
      doc.image(imgPath, x + PAD, y, {
        fit: [imgW, imgH], align: "center", valign: "center",
      });
      doc.restore();
      // Tunn ram
      doc.roundedRect(x + PAD, y, imgW, imgH, 6)
         .strokeColor(C.rule).lineWidth(0.5).stroke();
    }

    // Caption till höger
    const capX = x + PAD + imgW + 12;
    const capW = PANEL_W - PAD - capX;
    const capOpts = { width: capW, align: "left", lineGap: 2 };
    doc.font("sans").fontSize(10).fillColor(C.text)
       .text(s.caption, capX, y + 4, capOpts);

    y += rowH;
  }

  // Bottenstreck + uppmaning att vända till baksidan
  doc.font("sans-it").fontSize(9).fillColor(C.sage)
     .text("→  Vänd för att bli testpilot", x + PAD, PANEL_H - 16 * PT_PER_MM, {
       width: PANEL_W - 2 * PAD, align: "right",
     });
}

// ── Sida 1: utsida (BAK | FRAM) ────────────────────────────────────
drawBack(0);
drawFront(PANEL_W);

// ── Sida 2: insida (INSIDA-V | INSIDA-H) ───────────────────────────
doc.addPage({ size: [A4W, A4H], margin: 0 });
drawInsideLeft(0);
drawInsideRight(PANEL_W);

doc.end();

await new Promise((resolve) => doc.on("end", resolve));
console.log("OK:", out);
