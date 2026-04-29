// Bygger social-media onepagers för att rekrytera fler testpiloter.
// Tre format produceras i en körning:
//
//   1. social-onepager-bli-testare.png        (1080×1350, 4:5)
//      Facebook/Instagram feed-portrait — primärformatet, kapas inte i flödet.
//
//   2. social-square-bli-testare.png          (1080×1080, 1:1)
//      LinkedIn + bakkompatibla flöden där 4:5 ibland kapas. Tightare layout.
//
//   3. social-story-bli-testare.png           (1080×1920, 9:16)
//      Instagram/Facebook Stories. Höjd-safe-zon: ~250 px topp + ~330 px botten
//      reserveras för systemUI (profil, "Skicka meddelande"-fält). Allt
//      kritiskt innehåll bor mellan y=250 och y=1590.
//
// Design: "Friluft Folio" — samma palett och typografi som de printade
// flygbladen, anpassad för skärmläsning i feed.

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
};

GlobalFonts.registerFromPath(path.join(FONTS, "Lora-Bold.ttf"), "LoraBold");
GlobalFonts.registerFromPath(path.join(FONTS, "Lora-Italic.ttf"), "LoraItalic");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Regular.ttf"), "InstSans");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Bold.ttf"), "InstSansBold");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Italic.ttf"), "InstSansItalic");

const iconImg = await loadImage(path.join(ROOT, "assets", "icon.png"));
const qrImg = await loadImage(path.join(__dirname, "qr-bli-testare.png"));

// ─── Renderer-fabrik ───────────────────────────────────────────────
function makeRenderer(W, H, opts) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const helpers = {
    trackedUpper(text, spacing = 1) {
      let out = "";
      for (let i = 0; i < text.length; i++) {
        out += text[i];
        if (i < text.length - 1) out += " ".repeat(spacing);
      }
      return out;
    },
    wrapText(text, maxW) {
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
    },
    roundRect(x, y, w, h, r) {
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
    },
  };

  return { canvas, ctx, helpers, W, H, ...opts };
}

// ─── Format 1: 4:5 feed (1080×1350) ────────────────────────────────
function render4x5() {
  const W = 1080, H = 1350;
  const MARGIN = 80;
  const CONTENT_W = W - 2 * MARGIN;
  const r = makeRenderer(W, H);
  const { ctx, helpers } = r;

  ctx.fillStyle = COLORS.cream;
  ctx.fillRect(0, 0, W, H);

  let y = 70;

  // Eyebrow
  ctx.fillStyle = COLORS.sage;
  ctx.font = `20px InstSansBold`;
  ctx.textAlign = "center";
  ctx.fillText(helpers.trackedUpper("TESTPILOTER SÖKES  ·  ANDROID", 1), W / 2, y);
  y += 20;

  ctx.strokeStyle = COLORS.green;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 26, y);
  ctx.lineTo(W / 2 + 26, y);
  ctx.stroke();
  y += 36;

  // App-ikon
  const iconSize = 140;
  ctx.drawImage(iconImg, W / 2 - iconSize / 2, y, iconSize, iconSize);
  y += iconSize + 30;

  // Headline
  ctx.fillStyle = COLORS.greenDark;
  ctx.font = `92px LoraBold`;
  ctx.fillText("Tipspromenaden", W / 2, y + 70);
  y += 110;

  // Sub
  ctx.fillStyle = COLORS.green;
  ctx.font = `italic 34px LoraItalic`;
  ctx.fillText("Hjälp mig kvalitetssäkra appen", W / 2, y + 28);
  y += 70;

  // Intro
  ctx.fillStyle = COLORS.text;
  ctx.font = `24px InstSans`;
  const intro =
    "Tipspromenaden är en app där ni går en quizpromenad utomhus med " +
    "mobilen som frågepapper. GPS visar var nästa kontroll finns och " +
    "frågan öppnas automatiskt när ni kommer fram. Den är i sluten " +
    "testning på Android — och behöver fler testare.";
  const introLines = helpers.wrapText(intro, CONTENT_W);
  for (let i = 0; i < introLines.length; i++) {
    ctx.fillText(introLines[i], W / 2, y + 28 + i * 33);
  }
  y += 28 + introLines.length * 33 + 24;

  // Divider
  ctx.strokeStyle = COLORS.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN + 200, y);
  ctx.lineTo(W - MARGIN - 200, y);
  ctx.stroke();
  y += 36;

  // Tre punkter
  ctx.textAlign = "left";
  function bullet(label, body, sy) {
    ctx.save();
    ctx.translate(MARGIN + 12, sy + 14);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = COLORS.green;
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();

    ctx.fillStyle = COLORS.greenDark;
    ctx.font = `22px InstSansBold`;
    ctx.fillText(label, MARGIN + 44, sy + 20);
    ctx.fillStyle = COLORS.text;
    ctx.font = `22px InstSans`;
    const lines = helpers.wrapText(body, CONTENT_W - 44);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], MARGIN + 44, sy + 52 + i * 30);
    }
    return sy + 52 + lines.length * 30 + 18;
  }
  y = bullet("Tidig tillgång.", "Du provar appen innan publik release.", y);
  y = bullet("Bygg egna promenader.", "Karta, frågor, QR-kod — på några minuter.", y);
  y = bullet("Forma slutprodukten.", "Din feedback styr vad jag prioriterar härnäst.", y);
  y += 4;

  // CTA
  drawCta(ctx, helpers, MARGIN, y, CONTENT_W, 250, {
    pad: 32,
    qrSize: 186,
    titleSize: 42,
    bodySize: 21,
    bodyLH: 28,
    bodyText:
      "Skanna QR-koden, tryck \"Bli testare\" → \"Ask to join\". " +
      "Du får tillgång inom några minuter.",
  });
  y += 250 + 22;

  // Footer
  ctx.fillStyle = COLORS.sage;
  ctx.font = `italic 20px InstSansItalic`;
  ctx.textAlign = "center";
  ctx.fillText("— Niklas Eriksson", W / 2, y + 20);
  y += 26;
  ctx.fillStyle = COLORS.green;
  ctx.font = `20px InstSansBold`;
  ctx.fillText("tipspromenaden.app@gmail.com", W / 2, y + 20);

  return r.canvas;
}

// ─── Format 2: 1:1 kvadrat (1080×1080) ─────────────────────────────
// Två parallella punkter side-by-side i Friluft Folio-anda istället för
// staplad lista — utnyttjar kvadratens horisontella balans och fyller
// ytan så det inte blir död luft i nedre halvan.
function renderSquare() {
  const W = 1080, H = 1080;
  const MARGIN = 70;
  const CONTENT_W = W - 2 * MARGIN;
  const r = makeRenderer(W, H);
  const { ctx, helpers } = r;

  ctx.fillStyle = COLORS.cream;
  ctx.fillRect(0, 0, W, H);

  let y = 78;

  // Eyebrow
  ctx.fillStyle = COLORS.sage;
  ctx.font = `19px InstSansBold`;
  ctx.textAlign = "center";
  ctx.fillText(helpers.trackedUpper("TESTPILOTER SÖKES  ·  ANDROID", 1), W / 2, y);
  y += 20;
  ctx.strokeStyle = COLORS.green;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 24, y);
  ctx.lineTo(W / 2 + 24, y);
  ctx.stroke();
  y += 32;

  // Ikon
  const iconSize = 124;
  ctx.drawImage(iconImg, W / 2 - iconSize / 2, y, iconSize, iconSize);
  y += iconSize + 28;

  // Headline
  ctx.fillStyle = COLORS.greenDark;
  ctx.font = `86px LoraBold`;
  ctx.fillText("Tipspromenaden", W / 2, y + 66);
  y += 96;

  // Sub
  ctx.fillStyle = COLORS.green;
  ctx.font = `italic 30px LoraItalic`;
  ctx.fillText("Hjälp mig kvalitetssäkra appen", W / 2, y + 24);
  y += 60;

  // Intro
  ctx.fillStyle = COLORS.text;
  ctx.font = `23px InstSans`;
  const intro =
    "Tipspromenaden är en app där ni går en quizpromenad utomhus " +
    "med mobilen som frågepapper. I sluten testning på Android — " +
    "vi behöver fler testare.";
  const introLines = helpers.wrapText(intro, CONTENT_W);
  for (let i = 0; i < introLines.length; i++) {
    ctx.fillText(introLines[i], W / 2, y + 28 + i * 32);
  }
  y += 28 + introLines.length * 32 + 38;

  // Divider
  ctx.strokeStyle = COLORS.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN + 180, y);
  ctx.lineTo(W - MARGIN - 180, y);
  ctx.stroke();
  y += 38;

  // Två parallella punkter side-by-side
  ctx.textAlign = "left";
  const colGap = 28;
  const colW = (CONTENT_W - colGap) / 2;

  function twoCol(x, label, body, sy) {
    ctx.save();
    ctx.translate(x + 8, sy + 12);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = COLORS.green;
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();

    ctx.fillStyle = COLORS.greenDark;
    ctx.font = `21px InstSansBold`;
    ctx.fillText(label, x + 36, sy + 18);

    ctx.fillStyle = COLORS.text;
    ctx.font = `20px InstSans`;
    const lines = helpers.wrapText(body, colW - 36);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x + 36, sy + 48 + i * 26);
    }
  }
  twoCol(MARGIN, "Tidig tillgång.", "Använd appen innan publik release.", y);
  twoCol(MARGIN + colW + colGap, "Bygg egna promenader.", "Karta, frågor, QR — på minuter.", y);
  y += 130;

  // CTA
  drawCta(ctx, helpers, MARGIN, y, CONTENT_W, 220, {
    pad: 30,
    qrSize: 168,
    titleSize: 38,
    bodySize: 20,
    bodyLH: 27,
    bodyText:
      "Skanna QR-koden, tryck \"Bli testare\" → \"Ask to join\". " +
      "Tillgång inom några minuter.",
  });
  y += 220 + 30;

  // Footer
  ctx.fillStyle = COLORS.sage;
  ctx.font = `italic 18px InstSansItalic`;
  ctx.textAlign = "center";
  ctx.fillText("— Niklas Eriksson", W / 2, y + 16);
  y += 22;
  ctx.fillStyle = COLORS.green;
  ctx.font = `18px InstSansBold`;
  ctx.fillText("tipspromenaden.app@gmail.com", W / 2, y + 16);

  return r.canvas;
}

// ─── Format 3: 9:16 Stories (1080×1920) ─────────────────────────────
// Stories: top ~250 px + bottom ~330 px har systemUI-överlägg. Allt
// kritiskt innehåll mellan y=250 och y=1590. Generösare typografi.
function renderStory() {
  const W = 1080, H = 1920;
  const MARGIN = 90;
  const CONTENT_W = W - 2 * MARGIN;
  const r = makeRenderer(W, H);
  const { ctx, helpers } = r;

  ctx.fillStyle = COLORS.cream;
  ctx.fillRect(0, 0, W, H);

  // Säker zon: y in [260, 1580]
  let y = 280;

  // Eyebrow
  ctx.fillStyle = COLORS.sage;
  ctx.font = `22px InstSansBold`;
  ctx.textAlign = "center";
  ctx.fillText(helpers.trackedUpper("TESTPILOTER SÖKES  ·  ANDROID", 1), W / 2, y);
  y += 22;
  ctx.strokeStyle = COLORS.green;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 30, y);
  ctx.lineTo(W / 2 + 30, y);
  ctx.stroke();
  y += 44;

  // Ikon
  const iconSize = 170;
  ctx.drawImage(iconImg, W / 2 - iconSize / 2, y, iconSize, iconSize);
  y += iconSize + 38;

  // Headline
  ctx.fillStyle = COLORS.greenDark;
  ctx.font = `108px LoraBold`;
  ctx.fillText("Tipspromenaden", W / 2, y + 80);
  y += 130;

  // Sub
  ctx.fillStyle = COLORS.green;
  ctx.font = `italic 38px LoraItalic`;
  ctx.fillText("Hjälp mig kvalitetssäkra appen", W / 2, y + 32);
  y += 78;

  // Intro
  ctx.fillStyle = COLORS.text;
  ctx.font = `26px InstSans`;
  const intro =
    "Tipspromenaden är en app där ni går en quizpromenad utomhus " +
    "med mobilen som frågepapper. GPS visar var nästa kontroll finns " +
    "och frågan öppnas automatiskt när ni kommer fram. Just nu i " +
    "sluten testning på Android — och vi behöver fler testare.";
  const introLines = helpers.wrapText(intro, CONTENT_W);
  for (let i = 0; i < introLines.length; i++) {
    ctx.fillText(introLines[i], W / 2, y + 30 + i * 36);
  }
  y += 30 + introLines.length * 36 + 36;

  // Divider
  ctx.strokeStyle = COLORS.rule;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(MARGIN + 220, y);
  ctx.lineTo(W - MARGIN - 220, y);
  ctx.stroke();
  y += 50;

  // Tre punkter
  ctx.textAlign = "left";
  function bullet(label, body, sy) {
    ctx.save();
    ctx.translate(MARGIN + 14, sy + 16);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = COLORS.green;
    ctx.fillRect(-8, -8, 16, 16);
    ctx.restore();

    ctx.fillStyle = COLORS.greenDark;
    ctx.font = `26px InstSansBold`;
    ctx.fillText(label, MARGIN + 52, sy + 24);
    ctx.fillStyle = COLORS.text;
    ctx.font = `25px InstSans`;
    const lines = helpers.wrapText(body, CONTENT_W - 52);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], MARGIN + 52, sy + 60 + i * 34);
    }
    return sy + 60 + lines.length * 34 + 22;
  }
  y = bullet("Tidig tillgång.", "Du provar appen innan publik release.", y);
  y = bullet("Bygg egna promenader.", "Karta, frågor, QR-kod — på några minuter.", y);
  y = bullet("Forma slutprodukten.", "Din feedback styr vad jag prioriterar härnäst.", y);
  y += 14;

  // CTA — högre block, större QR
  drawCta(ctx, helpers, MARGIN, y, CONTENT_W, 290, {
    pad: 36,
    qrSize: 218,
    titleSize: 50,
    bodySize: 24,
    bodyLH: 32,
    bodyText:
      "Skanna QR-koden, tryck \"Bli testare\" → \"Ask to join\". " +
      "Du får tillgång inom några minuter.",
  });
  y += 290 + 28;

  // Footer (men håll oss inom 1580)
  ctx.fillStyle = COLORS.sage;
  ctx.font = `italic 22px InstSansItalic`;
  ctx.textAlign = "center";
  ctx.fillText("— Niklas Eriksson", W / 2, y + 22);
  y += 30;
  ctx.fillStyle = COLORS.green;
  ctx.font = `22px InstSansBold`;
  ctx.fillText("tipspromenaden.app@gmail.com", W / 2, y + 22);

  return r.canvas;
}

// ─── Delad CTA-renderare ───────────────────────────────────────────
function drawCta(ctx, helpers, x, y, w, h, opts) {
  ctx.fillStyle = COLORS.greenDark;
  helpers.roundRect(x, y, w, h, 18);
  ctx.fill();

  const qrX = x + w - opts.pad - opts.qrSize;
  const qrY = y + (h - opts.qrSize) / 2;

  // Vit QR-ram
  ctx.fillStyle = COLORS.white;
  helpers.roundRect(qrX - 10, qrY - 10, opts.qrSize + 20, opts.qrSize + 20, 10);
  ctx.fill();
  ctx.drawImage(qrImg, qrX, qrY, opts.qrSize, opts.qrSize);

  const tx = x + opts.pad;
  const tw = qrX - tx - 28;

  ctx.fillStyle = COLORS.cream;
  ctx.font = `${opts.titleSize}px LoraBold`;
  ctx.textAlign = "left";
  ctx.fillText("Vill du testa?", tx, y + opts.pad + opts.titleSize * 0.78);

  // Gul accent under titeln
  ctx.strokeStyle = COLORS.yellow;
  ctx.lineWidth = 3;
  const accentY = y + opts.pad + opts.titleSize * 0.78 + 14;
  ctx.beginPath();
  ctx.moveTo(tx, accentY);
  ctx.lineTo(tx + 56, accentY);
  ctx.stroke();

  ctx.fillStyle = COLORS.ctaBody;
  ctx.font = `${opts.bodySize}px InstSans`;
  const lines = helpers.wrapText(opts.bodyText, tw);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(
      lines[i],
      tx,
      accentY + 30 + i * opts.bodyLH
    );
  }
}

// ─── Skriv alla tre filer ──────────────────────────────────────────
const outputs = [
  { name: "social-onepager-bli-testare.png", canvas: render4x5(), label: "1080×1350 (4:5 portrait, FB/IG feed)" },
  { name: "social-square-bli-testare.png",   canvas: renderSquare(), label: "1080×1080 (1:1 kvadrat, LinkedIn)" },
  { name: "social-story-bli-testare.png",    canvas: renderStory(), label: "1080×1920 (9:16 portrait, Stories)" },
];

for (const out of outputs) {
  const p = path.join(__dirname, out.name);
  fs.writeFileSync(p, out.canvas.toBuffer("image/png"));
  console.log(`OK: ${out.name}  ${out.label}`);
}
