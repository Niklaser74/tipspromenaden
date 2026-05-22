// Bygger lanseringsbanners: Tipspromenaden live på Play Store + iOS-testare sökes.
// Tre format i en körning, samma Friluft Folio-palett som övriga social-mallar:
//
//   1. social-launch-4x5.png       (1080×1350, 4:5)   — FB/IG feed-portrait
//   2. social-launch-square.png    (1080×1080, 1:1)   — LinkedIn / kvadratfeed
//   3. social-launch-story.png     (1080×1920, 9:16)  — IG/FB Stories
//
// Brand-regler som påverkat copy och layout:
// - Inga utropstecken i marknadstext.
// - Inga dekorativa emojis (🎉🚀🔥). 📱🍎 används endast som funktions-
//   indikatorer på plattform-pillarna.
// - Forest Green som enda "skrikande" färg. Gult endast som accent.
// - Eyebrow i versaler + tracking-wide. Headline i Lora Bold.

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

// ─── Helpers ────────────────────────────────────────────────────────
function makeRenderer(W, H) {
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

  return { canvas, ctx, helpers, W, H };
}

// Statuspill — visar plattformsstatus (Android live / iOS testperiod)
// Filled-variant för "live", outline-variant för "testperiod".
function drawStatusCard(ctx, helpers, x, y, w, h, opts) {
  const { variant, eyebrow, title, body } = opts;

  if (variant === "filled") {
    ctx.fillStyle = COLORS.greenDark;
    helpers.roundRect(x, y, w, h, 14);
    ctx.fill();
  } else {
    ctx.fillStyle = COLORS.cream;
    helpers.roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = COLORS.green;
    ctx.lineWidth = 2;
    helpers.roundRect(x, y, w, h, 14);
    ctx.stroke();
  }

  const textColor = variant === "filled" ? COLORS.cream : COLORS.greenDark;
  const eyebrowColor = variant === "filled" ? COLORS.yellow : COLORS.green;
  const bodyColor = variant === "filled" ? COLORS.ctaBody : COLORS.text;

  ctx.textAlign = "left";

  // Sekventiell baseline-tracking: cy = nuvarande baseline-y.
  let cy = y + opts.pad + opts.eyebrowSize * 0.85;

  ctx.fillStyle = eyebrowColor;
  ctx.font = `${opts.eyebrowSize}px InstSansBold`;
  ctx.fillText(helpers.trackedUpper(eyebrow, 1), x + opts.pad, cy);

  cy += opts.eyebrowSize * 0.6 + opts.titleSize * 0.95;
  ctx.fillStyle = textColor;
  ctx.font = `${opts.titleSize}px LoraBold`;
  ctx.fillText(title, x + opts.pad, cy);

  cy += opts.titleSize * 0.4 + opts.bodySize * 1.1;
  ctx.fillStyle = bodyColor;
  ctx.font = `${opts.bodySize}px InstSans`;
  ctx.font = `${opts.bodySize}px InstSans`;
  const bodyLines = helpers.wrapText(body, w - opts.pad * 2);
  const bodyLH = opts.bodySize + 8;
  for (let i = 0; i < bodyLines.length; i++) {
    ctx.fillText(bodyLines[i], x + opts.pad, cy + i * bodyLH);
  }
}

// Delad CTA-renderare (QR + text-block i greenDark)
function drawCta(ctx, helpers, x, y, w, h, opts) {
  ctx.fillStyle = COLORS.greenDark;
  helpers.roundRect(x, y, w, h, 18);
  ctx.fill();

  const qrX = x + w - opts.pad - opts.qrSize;
  const qrY = y + (h - opts.qrSize) / 2;

  ctx.fillStyle = COLORS.white;
  helpers.roundRect(qrX - 10, qrY - 10, opts.qrSize + 20, opts.qrSize + 20, 10);
  ctx.fill();
  ctx.drawImage(qrImg, qrX, qrY, opts.qrSize, opts.qrSize);

  const tx = x + opts.pad;
  const tw = qrX - tx - 28;

  ctx.fillStyle = COLORS.cream;
  ctx.font = `${opts.titleSize}px LoraBold`;
  ctx.textAlign = "left";
  ctx.fillText(opts.title, tx, y + opts.pad + opts.titleSize * 0.78);

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
    ctx.fillText(lines[i], tx, accentY + 30 + i * opts.bodyLH);
  }
}

// ─── Format 1: 4:5 feed (1080×1350) — Facebook / Instagram ─────────
function render4x5() {
  const W = 1080, H = 1350;
  const MARGIN = 80;
  const CONTENT_W = W - 2 * MARGIN;
  const r = makeRenderer(W, H);
  const { ctx, helpers } = r;

  ctx.fillStyle = COLORS.cream;
  ctx.fillRect(0, 0, W, H);

  let y = 80;

  // Eyebrow
  ctx.fillStyle = COLORS.sage;
  ctx.font = `20px InstSansBold`;
  ctx.textAlign = "center";
  ctx.fillText(helpers.trackedUpper("NU LIVE  ·  PLAY STORE", 1), W / 2, y);
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
  y += iconSize + 28;

  // Headline
  ctx.fillStyle = COLORS.greenDark;
  ctx.font = `92px LoraBold`;
  ctx.fillText("Tipspromenaden", W / 2, y + 70);
  y += 110;

  // Sub
  ctx.fillStyle = COLORS.green;
  ctx.font = `italic 32px LoraItalic`;
  ctx.fillText("Quizpromenader, ute, med mobilen som frågepapper", W / 2, y + 26);
  y += 70;

  // Intro
  ctx.fillStyle = COLORS.text;
  ctx.font = `24px InstSans`;
  const intro =
    "Efter månader av kvällar och helger är appen ute för Android. " +
    "iOS-versionen testas just nu — och behöver fler testpiloter.";
  const introLines = helpers.wrapText(intro, CONTENT_W);
  for (let i = 0; i < introLines.length; i++) {
    ctx.fillText(introLines[i], W / 2, y + 28 + i * 33);
  }
  y += 28 + introLines.length * 33 + 30;

  // Två status-kort sida vid sida
  const colGap = 24;
  const colW = (CONTENT_W - colGap) / 2;
  const cardH = 220;

  drawStatusCard(ctx, helpers, MARGIN, y, colW, cardH, {
    variant: "filled",
    eyebrow: "ANDROID",
    title: "Live på Play Store",
    body: "Gratis att ladda ner. Sök \"Tipspromenaden\" i Google Play.",
    pad: 24,
    eyebrowSize: 17,
    titleSize: 28,
    bodySize: 19,
  });
  drawStatusCard(ctx, helpers, MARGIN + colW + colGap, y, colW, cardH, {
    variant: "outline",
    eyebrow: "iOS",
    title: "Testpiloter sökes",
    body: "TestFlight-inbjudan inför publik App Store-release. Skriv DM.",
    pad: 24,
    eyebrowSize: 17,
    titleSize: 28,
    bodySize: 19,
  });
  y += cardH + 30;

  // CTA
  drawCta(ctx, helpers, MARGIN, y, CONTENT_W, 220, {
    pad: 30,
    qrSize: 168,
    titleSize: 40,
    bodySize: 21,
    bodyLH: 28,
    title: "Ladda ner eller testa",
    bodyText:
      "Skanna QR-koden. Android öppnar Play Store direkt. " +
      "iPhone? Skriv DM så lägger jag in dig i TestFlight.",
  });
  y += 220 + 22;

  // Footer
  ctx.fillStyle = COLORS.sage;
  ctx.font = `italic 20px InstSansItalic`;
  ctx.textAlign = "center";
  ctx.fillText("tipspromenaden.app", W / 2, y + 20);

  return r.canvas;
}

// ─── Format 2: 1:1 kvadrat (1080×1080) — LinkedIn ──────────────────
function renderSquare() {
  const W = 1080, H = 1080;
  const MARGIN = 70;
  const CONTENT_W = W - 2 * MARGIN;
  const r = makeRenderer(W, H);
  const { ctx, helpers } = r;

  ctx.fillStyle = COLORS.cream;
  ctx.fillRect(0, 0, W, H);

  let y = 70;

  ctx.fillStyle = COLORS.sage;
  ctx.font = `19px InstSansBold`;
  ctx.textAlign = "center";
  ctx.fillText(helpers.trackedUpper("NU LIVE  ·  PLAY STORE", 1), W / 2, y);
  y += 20;
  ctx.strokeStyle = COLORS.green;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 24, y);
  ctx.lineTo(W / 2 + 24, y);
  ctx.stroke();
  y += 26;

  const iconSize = 110;
  ctx.drawImage(iconImg, W / 2 - iconSize / 2, y, iconSize, iconSize);
  y += iconSize + 22;

  ctx.fillStyle = COLORS.greenDark;
  ctx.font = `78px LoraBold`;
  ctx.fillText("Tipspromenaden", W / 2, y + 60);
  y += 88;

  ctx.fillStyle = COLORS.green;
  ctx.font = `italic 26px LoraItalic`;
  ctx.fillText("Ute för Android — iOS-testare sökes", W / 2, y + 22);
  y += 56;

  ctx.fillStyle = COLORS.text;
  ctx.font = `21px InstSans`;
  const intro =
    "Promenad är en av våra mest underskattade friskvårdsaktiviteter. " +
    "Lägg till en frågesport på vägen och du engagerar både huvud och kropp.";
  const introLines = helpers.wrapText(intro, CONTENT_W);
  for (let i = 0; i < introLines.length; i++) {
    ctx.fillText(introLines[i], W / 2, y + 26 + i * 30);
  }
  y += 26 + introLines.length * 30 + 26;

  // Status-kort sida vid sida
  const colGap = 20;
  const colW = (CONTENT_W - colGap) / 2;
  const cardH = 180;
  drawStatusCard(ctx, helpers, MARGIN, y, colW, cardH, {
    variant: "filled",
    eyebrow: "ANDROID",
    title: "Live på Play Store",
    body: "Gratis. Sök \"Tipspromenaden\".",
    pad: 22,
    eyebrowSize: 16,
    titleSize: 24,
    bodySize: 18,
  });
  drawStatusCard(ctx, helpers, MARGIN + colW + colGap, y, colW, cardH, {
    variant: "outline",
    eyebrow: "iOS",
    title: "Testpiloter sökes",
    body: "Skriv DM för TestFlight-inbjudan.",
    pad: 22,
    eyebrowSize: 16,
    titleSize: 24,
    bodySize: 18,
  });
  y += cardH + 24;

  drawCta(ctx, helpers, MARGIN, y, CONTENT_W, 200, {
    pad: 28,
    qrSize: 150,
    titleSize: 34,
    bodySize: 19,
    bodyLH: 26,
    title: "Ladda ner eller testa",
    bodyText:
      "Skanna QR-koden. Android → Play Store. " +
      "iPhone → DM:a mig för TestFlight.",
  });
  y += 200 + 16;

  ctx.fillStyle = COLORS.sage;
  ctx.font = `italic 18px InstSansItalic`;
  ctx.textAlign = "center";
  ctx.fillText("tipspromenaden.app", W / 2, y + 16);

  return r.canvas;
}

// ─── Format 3: 9:16 Stories (1080×1920) ────────────────────────────
function renderStory() {
  const W = 1080, H = 1920;
  const MARGIN = 90;
  const CONTENT_W = W - 2 * MARGIN;
  const r = makeRenderer(W, H);
  const { ctx, helpers } = r;

  ctx.fillStyle = COLORS.cream;
  ctx.fillRect(0, 0, W, H);

  // Safe zone: y in [260, 1580]
  let y = 290;

  ctx.fillStyle = COLORS.sage;
  ctx.font = `22px InstSansBold`;
  ctx.textAlign = "center";
  ctx.fillText(helpers.trackedUpper("NU LIVE  ·  PLAY STORE", 1), W / 2, y);
  y += 22;
  ctx.strokeStyle = COLORS.green;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 30, y);
  ctx.lineTo(W / 2 + 30, y);
  ctx.stroke();
  y += 44;

  const iconSize = 170;
  ctx.drawImage(iconImg, W / 2 - iconSize / 2, y, iconSize, iconSize);
  y += iconSize + 38;

  ctx.fillStyle = COLORS.greenDark;
  ctx.font = `100px LoraBold`;
  ctx.fillText("Tipspromenaden", W / 2, y + 78);
  y += 124;

  ctx.fillStyle = COLORS.green;
  ctx.font = `italic 36px LoraItalic`;
  ctx.fillText("Ute för Android — iOS-testare sökes", W / 2, y + 32);
  y += 78;

  ctx.fillStyle = COLORS.text;
  ctx.font = `26px InstSans`;
  const intro =
    "Quizpromenader utomhus med mobilen som frågepapper. " +
    "GPS visar nästa kontroll och frågan öppnas när du kommer fram.";
  const introLines = helpers.wrapText(intro, CONTENT_W);
  for (let i = 0; i < introLines.length; i++) {
    ctx.fillText(introLines[i], W / 2, y + 30 + i * 36);
  }
  y += 30 + introLines.length * 36 + 36;

  // Status-kort staplade (mer vertikalt utrymme i story)
  const cardH = 200;
  drawStatusCard(ctx, helpers, MARGIN, y, CONTENT_W, cardH, {
    variant: "filled",
    eyebrow: "ANDROID",
    title: "Live på Play Store",
    body: "Gratis att ladda ner. Sök \"Tipspromenaden\" i Google Play.",
    pad: 32,
    eyebrowSize: 20,
    titleSize: 38,
    bodySize: 24,
  });
  y += cardH + 24;

  drawStatusCard(ctx, helpers, MARGIN, y, CONTENT_W, cardH, {
    variant: "outline",
    eyebrow: "iOS",
    title: "Testpiloter sökes",
    body: "TestFlight-inbjudan inför publik App Store-release. Skriv DM.",
    pad: 32,
    eyebrowSize: 20,
    titleSize: 38,
    bodySize: 24,
  });
  y += cardH + 36;

  drawCta(ctx, helpers, MARGIN, y, CONTENT_W, 270, {
    pad: 36,
    qrSize: 200,
    titleSize: 46,
    bodySize: 23,
    bodyLH: 30,
    title: "Ladda ner eller testa",
    bodyText:
      "Skanna QR-koden. Android öppnar Play Store. " +
      "iPhone? DM:a mig så lägger jag in dig i TestFlight.",
  });
  y += 270 + 24;

  ctx.fillStyle = COLORS.sage;
  ctx.font = `italic 22px InstSansItalic`;
  ctx.textAlign = "center";
  ctx.fillText("tipspromenaden.app", W / 2, y + 22);

  return r.canvas;
}

// ─── Skriv alla tre filer ──────────────────────────────────────────
const outputs = [
  { name: "social-launch-4x5.png",    canvas: render4x5(),    label: "1080×1350 (4:5 portrait, FB/IG feed)" },
  { name: "social-launch-square.png", canvas: renderSquare(), label: "1080×1080 (1:1 kvadrat, LinkedIn)" },
  { name: "social-launch-story.png",  canvas: renderStory(),  label: "1080×1920 (9:16 portrait, Stories)" },
];

for (const out of outputs) {
  const p = path.join(__dirname, out.name);
  fs.writeFileSync(p, out.canvas.toBuffer("image/png"));
  console.log(`OK: ${out.name}  ${out.label}`);
}
