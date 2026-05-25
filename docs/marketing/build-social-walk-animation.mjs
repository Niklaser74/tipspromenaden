// Bygger en social-media-GIF där hela inlägget är levande:
// social-banner-layout (header + tack-rad + plattformspillar + CTA med
// QR) som omsluter en telefon-frame där walk-animationen spelar inne.
//
// Output: social-walk-animation-4x5.png... nej, walk-animation.gif.
//
// Format: 1080×1350 (4:5 portrait, FB/IG feed-optimerat).
//
// Storlekstänk: 120 frames × 1080×1350 → typisk GIF ~5-8 MB. Acceptabelt
// för IG/FB feed (max 8MB). Om för stort: kör med lägre FPS eller
// crop:a frames. För Stories (9:16) byt aspektrelations-konstanterna.
//
// Användning:
//   node build-social-walk-animation.mjs
//
// Med anpassad fråga (matchas till walk-animationens parametrisering):
//   node build-social-walk-animation.mjs \
//     --question="Vilken är internets roligaste app?" \
//     --options="Tipsrundan,Strava,Tipspromenaden,Wordle" \
//     --correct=2 \
//     --output=social-walk-fun.gif

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import GIFEncoder from "gif-encoder-2";

// Importera renderFrame från walk-animation-scriptet
import { renderFrame, WALK_W, WALK_H, TOTAL_FRAMES, FPS } from "./build-walk-animation.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const FONTS = path.resolve(
  process.env.APPDATA ?? "",
  "Claude/local-agent-mode-sessions/skills-plugin/6e3f3656-5b7f-48a4-9391-8a16ae2c491d/0a338210-3309-4e53-a4e7-c3d23bfbe37f/skills/canvas-design/canvas-fonts"
);

GlobalFonts.registerFromPath(path.join(FONTS, "Lora-Bold.ttf"), "LoraBold");
GlobalFonts.registerFromPath(path.join(FONTS, "Lora-Italic.ttf"), "LoraItalic");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Regular.ttf"), "InstSans");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Bold.ttf"), "InstSansBold");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Italic.ttf"), "InstSansItalic");

const iconImg = await loadImage(path.join(ROOT, "assets", "icon.png"));
const qrImg = await loadImage(path.join(__dirname, "qr-bli-testare.png"));

// ─── CLI-args (samma som walk-animation, för konsistens) ────────────
function getArg(name, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(`--${name}=`.length) : fallback;
}
const OUTPUT_NAME = getArg("output", "social-walk-animation.gif");
const OUTPUT = path.join(__dirname, OUTPUT_NAME);

// Banner-dimensioner
const W = 1080;
const H = 1350;
const MARGIN = 80;

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
  phoneBezel: "#2C3E2D",
};

// Telefon-frame: justerat för 1080×1350-banner så det får plats med
// header ovanför + CTA nedanför utan att klippas.
const PHONE = (() => {
  // 400 wide × ~711 tall — proportionellt 9:16, ramar in skärmen utan
  // att kannibalisera CTA-blocket.
  const phoneW = 400;
  const phoneH = Math.round(phoneW * (WALK_H / WALK_W)); // 400 * 854/480 = 711
  return {
    x: (W - phoneW) / 2,
    y: 380,
    w: phoneW,
    h: phoneH,
    bezel: 14,
    cornerR: 42,
  };
})();

// ─── Helpers ────────────────────────────────────────────────────────
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

// ─── Banner template (statisk del, samma varje frame) ──────────────
function drawBanner(ctx) {
  // Bakgrund
  ctx.fillStyle = COLORS.cream;
  ctx.fillRect(0, 0, W, H);

  // ─── HEADER ─────────────────────────────────────────────────────
  let y = 56;

  // Eyebrow
  ctx.fillStyle = COLORS.sage;
  ctx.font = `18px InstSansBold`;
  ctx.textAlign = "center";
  ctx.fillText(trackedUpper("NU LIVE  ·  ANDROID OCH iOS", 1), W / 2, y);
  y += 18;

  // Hairline
  ctx.strokeStyle = COLORS.green;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 24, y);
  ctx.lineTo(W / 2 + 24, y);
  ctx.stroke();
  y += 24;

  // App-ikon liten — bredvid headline istället för ovanför så vi
  // sparar höjd och får tightare layout
  const iconSize = 64;
  ctx.drawImage(iconImg, W / 2 - 270, y + 6, iconSize, iconSize);

  // Headline (centrerad bredvid ikonen)
  ctx.fillStyle = COLORS.greenDark;
  ctx.font = `64px LoraBold`;
  ctx.textAlign = "left";
  ctx.fillText("Tipspromenaden", W / 2 - 190, y + 56);
  y += 88;

  // Italic sub
  ctx.fillStyle = COLORS.green;
  ctx.font = `italic 24px LoraItalic`;
  ctx.textAlign = "center";
  ctx.fillText("Så här fungerar det", W / 2, y + 18);

  // ─── PHONE FRAME ────────────────────────────────────────────────
  // Yttre svart bezel (rundad rektangel)
  ctx.fillStyle = COLORS.phoneBezel;
  roundRect(
    ctx,
    PHONE.x - PHONE.bezel,
    PHONE.y - PHONE.bezel,
    PHONE.w + PHONE.bezel * 2,
    PHONE.h + PHONE.bezel * 2,
    PHONE.cornerR + PHONE.bezel
  );
  ctx.fill();

  // (Walk-frame ritas separat i renderCombinedFrame eftersom den
  // varierar per frame.)

  // ─── CTA-fot ────────────────────────────────────────────────────
  const ctaTop = PHONE.y + PHONE.h + PHONE.bezel * 2 + 30;
  const ctaH = 130;
  const ctaW = W - 2 * MARGIN;

  ctx.fillStyle = COLORS.greenDark;
  roundRect(ctx, MARGIN, ctaTop, ctaW, ctaH, 16);
  ctx.fill();

  // QR-kod till höger
  const qrSize = 100;
  const qrX = MARGIN + ctaW - 20 - qrSize;
  const qrY = ctaTop + (ctaH - qrSize) / 2;
  ctx.fillStyle = COLORS.white;
  roundRect(ctx, qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 6);
  ctx.fill();
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // Text till vänster
  const tx = MARGIN + 24;
  const tw = qrX - tx - 18;
  ctx.fillStyle = COLORS.cream;
  ctx.font = `bold 24px LoraBold`;
  ctx.textAlign = "left";
  ctx.fillText("En QR för båda", tx, ctaTop + 38);

  ctx.strokeStyle = COLORS.yellow;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(tx, ctaTop + 52);
  ctx.lineTo(tx + 44, ctaTop + 52);
  ctx.stroke();

  ctx.fillStyle = COLORS.ctaBody;
  ctx.font = `16px InstSans`;
  const ctaLines = wrapText(
    ctx,
    "Skanna — Android öppnar Play Store, iPhone öppnar App Store.",
    tw
  );
  for (let i = 0; i < ctaLines.length; i++) {
    ctx.fillText(ctaLines[i], tx, ctaTop + 78 + i * 22);
  }

  // ─── Footer ─────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.sage;
  ctx.font = `italic 18px InstSansItalic`;
  ctx.textAlign = "center";
  ctx.fillText("tipspromenaden.app", W / 2, H - 30);
}

// ─── Composite frame: banner + walk-animation inuti telefonen ──────
function renderCombinedFrame(walkFrameIdx) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  drawBanner(ctx);

  // Hämta walk-animation-frame som canvas
  const walkCanvas = renderFrame(walkFrameIdx);

  // Klippmask för telefonens rundade hörn
  ctx.save();
  roundRect(ctx, PHONE.x, PHONE.y, PHONE.w, PHONE.h, PHONE.cornerR);
  ctx.clip();

  // Rita walk-frame skalad in i telefon-skärm-området
  ctx.drawImage(walkCanvas, PHONE.x, PHONE.y, PHONE.w, PHONE.h);

  ctx.restore();

  return canvas;
}

// ─── Preview single frame? ─────────────────────────────────────────
const previewFrame = parseInt(getArg("preview-frame", "-1"), 10);
if (previewFrame >= 0 && previewFrame < TOTAL_FRAMES) {
  const canvas = renderCombinedFrame(previewFrame);
  const previewPath = OUTPUT.replace(/\.gif$/, `-frame${previewFrame}.png`);
  fs.writeFileSync(previewPath, canvas.toBuffer("image/png"));
  console.log(`✅ Preview: ${path.basename(previewPath)}`);
  process.exit(0);
}

// ─── Bygg GIF ───────────────────────────────────────────────────────
console.log(
  `Bygger social-walk-animation: ${TOTAL_FRAMES} frames @ ${FPS}fps → ${W}×${H}…`
);

const encoder = new GIFEncoder(W, H, "neuquant", true);
encoder.setDelay(Math.round(1000 / FPS));
encoder.setRepeat(0);
encoder.setQuality(15); // Lite lägre kvalitet för mindre fil-storlek
encoder.start();

for (let i = 0; i < TOTAL_FRAMES; i++) {
  const canvas = renderCombinedFrame(i);
  encoder.addFrame(canvas.getContext("2d"));
  if (i % 5 === 0) {
    process.stdout.write(`  frame ${i}/${TOTAL_FRAMES}\r`);
  }
}

encoder.finish();
fs.writeFileSync(OUTPUT, encoder.out.getData());

const stats = fs.statSync(OUTPUT);
console.log(
  `\n✅ Klar: ${path.basename(OUTPUT)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
);
