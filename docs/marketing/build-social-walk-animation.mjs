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
import { execFileSync } from "node:child_process";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import GIFEncoder from "gif-encoder-2";
import ffmpegPath from "ffmpeg-static";

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
function hasFlag(name) {
  return process.argv.some((a) => a === `--${name}` || a === `--${name}=true`);
}
const OUTPUT_NAME = getArg("output", "social-walk-animation.gif");
const OUTPUT = path.join(__dirname, OUTPUT_NAME);

// Format-flagga: feed (4:5, 1080×1350) eller stories (9:16, 1080×1920)
const FORMAT = getArg("format", "feed"); // "feed" | "stories"
const IS_STORIES = FORMAT === "stories";

// Theme-flagga: dark (cream/varmt, default) eller light (pure white/luftigt)
const THEME = getArg("theme", "dark"); // "dark" | "light"
const IS_LIGHT = THEME === "light";

// MP4-export efter GIF (kräver ffmpeg i PATH)
const MAKE_MP4 = hasFlag("mp4");

// Banner-dimensioner (format-styrt)
const W = 1080;
const H = IS_STORIES ? 1920 : 1350;
const MARGIN = IS_STORIES ? 90 : 80;

// I Stories-format: vertical offset så hela kompositionen sjunker mot
// mitten — överst ~200px reserverat för IG/FB Story-overlay (profil),
// nederst ~330px för "Svara"-fält + sticker-yta. Säker zon: 200-1590.
const TOP_OFFSET = IS_STORIES ? 100 : 0;

// Färg-paletter — "light" = pure white background, ljusare text-tone,
// resten av greens/yellow stannar för brand-konsistens.
const DARK_PALETTE = {
  cream: "#F5F0E8",
  bg: "#F5F0E8",
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
const LIGHT_PALETTE = {
  cream: "#FAFAF7",       // nästan vit, drag av cream
  bg: "#FFFFFF",          // pure white-yta
  green: "#1B6B35",       // brand-grön behålls
  greenDark: "#1B3D2B",   // brand-mörk-grön behålls
  text: "#1B3D2B",        // mörkare text för bättre kontrast mot vitt
  sage: "#6B7B6E",        // något mörkare sage så det syns på vit bg
  rule: "#E6E2D6",        // mjukare divider
  white: "#FFFFFF",
  ctaBody: "#E8E8DC",
  yellow: "#E8B830",
  phoneBezel: "#1B3D2B",
};
const COLORS = IS_LIGHT ? LIGHT_PALETTE : DARK_PALETTE;

// Telefon-frame: ner-skalad så att release-budskapet får dominera
// kompositionen. Animationen är "supporting evidence", inte huvudfokus.
const PHONE = (() => {
  // Feed (4:5): kompakt 280×498 så textmassan dominerar.
  // Stories (9:16): något större 320×569 eftersom vi har mer höjd
  // att fördela och animationen tål att synas tydligare.
  const phoneW = IS_STORIES ? 320 : 280;
  const phoneH = Math.round(phoneW * (WALK_H / WALK_W));
  return {
    x: (W - phoneW) / 2,
    y: IS_STORIES ? 690 : 440,
    w: phoneW,
    h: phoneH,
    bezel: IS_STORIES ? 12 : 10,
    cornerR: IS_STORIES ? 32 : 28,
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
//
// Layout (release-meddelandet är hjälten, animationen supporting):
//   y= 50:  Eyebrow "NU LIVE · ANDROID OCH iOS"
//   y= 80:  Hairline
//   y=120:  "Tipspromenaden" headline (Lora Bold)
//   y=200:  Sub-headline (italic)
//   y=270:  Release-meddelande (huvudtext, 3-4 rader)
//   y=540:  Telefon-frame med walk-animation (300×534, centrerad)
//   y=1110: Hairline divider
//   y=1140: Tack-rad italic (2 rader)
//   y=1240: CTA-block (kompakt, QR + "Skanna här")
//   y=1320: Footer "tipspromenaden.app"
function drawBanner(ctx) {
  // Bakgrund (cream på dark-theme, pure white på light-theme)
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // ─── EYEBROW + HEADLINE ────────────────────────────────────────
  let y = 56 + TOP_OFFSET;

  ctx.fillStyle = COLORS.sage;
  ctx.font = `18px InstSansBold`;
  ctx.textAlign = "center";
  ctx.fillText(trackedUpper("NU LIVE  ·  ANDROID OCH iOS", 1), W / 2, y);
  y += 18;

  ctx.strokeStyle = COLORS.green;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 24, y);
  ctx.lineTo(W / 2 + 24, y);
  ctx.stroke();
  y += 36;

  ctx.fillStyle = COLORS.greenDark;
  ctx.font = `68px LoraBold`;
  ctx.fillText("Tipspromenaden", W / 2, y + 56);
  y += 84;

  ctx.fillStyle = COLORS.green;
  ctx.font = `italic 26px LoraItalic`;
  ctx.fillText("På App Store och Google Play", W / 2, y + 22);
  y += 60;

  // ─── RELEASE-MEDDELANDE (HJÄLTEN) ──────────────────────────────
  // Lora regular-vikt skulle vara estetiskt finare men vi har inte
  // Lora Regular i font-paketet — InstSans får göra jobbet i större
  // storlek så det känns betydligt.
  ctx.fillStyle = COLORS.text;
  ctx.font = `24px InstSans`;
  ctx.textAlign = "center";
  const messageBlock1 = "Nu kan ni äntligen testa Tipspromenaden!";
  const messageBlock2 =
    "I biblioteket i appen hittar du promenader nära dig — eller skapar egna.";

  // Linje 1: bolded för att kalla på blicken
  ctx.font = `bold 26px InstSansBold`;
  ctx.fillStyle = COLORS.greenDark;
  ctx.fillText(messageBlock1, W / 2, y + 24);
  y += 50;

  // Linje 2: vanlig sub-message, kan wrappa
  ctx.font = `22px InstSans`;
  ctx.fillStyle = COLORS.text;
  const subLines = wrapText(ctx, messageBlock2, W - 2 * MARGIN);
  for (let i = 0; i < subLines.length; i++) {
    ctx.fillText(subLines[i], W / 2, y + 22 + i * 32);
  }

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

  // ─── DIVIDER ───────────────────────────────────────────────────
  const phoneBottom = PHONE.y + PHONE.h + PHONE.bezel;
  const dividerY = phoneBottom + 30;
  ctx.strokeStyle = COLORS.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN + 80, dividerY);
  ctx.lineTo(W - MARGIN - 80, dividerY);
  ctx.stroke();

  // ─── TACK-RAD ───────────────────────────────────────────────────
  ctx.fillStyle = COLORS.green;
  ctx.font = `italic 22px LoraItalic`;
  ctx.textAlign = "center";
  const thanksLines = [
    "Stort tack till alla testare som varit med",
    "och gjort detta möjligt.",
  ];
  for (let i = 0; i < thanksLines.length; i++) {
    ctx.fillText(thanksLines[i], W / 2, dividerY + 36 + i * 30);
  }

  // ─── CTA: QR + "Skanna här" ────────────────────────────────────
  // Större block nu när vi har plats. QR växt från 76 → 130px så
  // den är skannings-bar även när bilden visas mindre i feed:en.
  const ctaTop = dividerY + 105;
  const ctaH = 170;
  const ctaW = 640;
  const ctaX = (W - ctaW) / 2;

  ctx.fillStyle = COLORS.greenDark;
  roundRect(ctx, ctaX, ctaTop, ctaW, ctaH, 18);
  ctx.fill();

  // QR till vänster i CTA-block
  const qrSize = 130;
  const qrX = ctaX + 20;
  const qrY = ctaTop + (ctaH - qrSize) / 2;
  ctx.fillStyle = COLORS.white;
  roundRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 6);
  ctx.fill();
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // Text höger om QR
  const tx = qrX + qrSize + 28;
  ctx.fillStyle = COLORS.cream;
  ctx.font = `bold 28px LoraBold`;
  ctx.textAlign = "left";
  ctx.fillText("Skanna för", tx, ctaTop + 52);
  ctx.fillText("installation", tx, ctaTop + 88);

  ctx.strokeStyle = COLORS.yellow;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tx, ctaTop + 102);
  ctx.lineTo(tx + 56, ctaTop + 102);
  ctx.stroke();

  ctx.fillStyle = COLORS.ctaBody;
  ctx.font = `16px InstSans`;
  ctx.fillText("Android → Play Store", tx, ctaTop + 128);
  ctx.fillText("iPhone → App Store", tx, ctaTop + 152);

  // ─── FOOTER ─────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.sage;
  ctx.font = `italic 18px InstSansItalic`;
  ctx.textAlign = "center";
  ctx.fillText("tipspromenaden.app", W / 2, H - 26);
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

// ─── MP4-konvertering (för IG-stöd) ──────────────────────────────────
// IG/Reels föredrar MP4 över GIF: bättre kvalitet, mindre fil, autoplay
// med ljud. ffmpeg-static buntar ffmpeg-binär så vi slipper systemdep.
//
// Render-frames sparas till temp-katalog och stitchas till h264-mp4.
// Frame-rate matchar GIF FPS (15). pix_fmt yuv420p för kompatibilitet
// med IG/FB-spelare (kräver jämn dimension; W=1080, H=1350 eller 1920
// är alla jämna).
if (MAKE_MP4) {
  console.log(`\nKonverterar till MP4…`);
  const tmpDir = path.join(__dirname, `.mp4-tmp-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Rendera om frames som PNG i temp-mapp (en gång till — alternativet
    // är att hålla alla Canvas i minne, vilket äter RAM för 120 stora
    // frames).
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const canvas = renderCombinedFrame(i);
      const fname = `frame-${String(i).padStart(4, "0")}.png`;
      fs.writeFileSync(path.join(tmpDir, fname), canvas.toBuffer("image/png"));
      if (i % 10 === 0) {
        process.stdout.write(`  mp4-frame ${i}/${TOTAL_FRAMES}\r`);
      }
    }

    const mp4Out = OUTPUT.replace(/\.gif$/, ".mp4");
    execFileSync(
      ffmpegPath,
      [
        "-y",                                       // overwrite
        "-framerate", String(FPS),
        "-i", path.join(tmpDir, "frame-%04d.png"),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "23",                               // kvalitet (0-51, lägre=bättre)
        "-movflags", "+faststart",                  // streaming-optimering
        "-loop", "0",                               // loopa (h264 ignorerar men dokumentation)
        mp4Out,
      ],
      { stdio: "inherit" }
    );

    const mp4Stats = fs.statSync(mp4Out);
    console.log(
      `\n✅ MP4: ${path.basename(mp4Out)} (${(mp4Stats.size / 1024 / 1024).toFixed(2)} MB)`
    );
  } finally {
    // Rensa temp
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
