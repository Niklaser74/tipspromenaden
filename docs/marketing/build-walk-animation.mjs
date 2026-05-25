// Bygger en illustrerad GIF-animation som visar app-flödet: karta →
// promenera till kontrollpunkt → fråga öppnas → svara → kontrollpunkt
// markeras som klar → promenera till nästa.
//
// Output: walk-animation.gif (~3MB, ~8 sekunder, loopar)
//
// Stil: Friluft Folio (samma som social-launch + flygblad). UI:t är
// canvas-tecknat från grunden — inte skärmdumpar — för konsekvent
// stil och full kontroll över animationen. Ingen telefon-frame
// (mockup-look känns konstgjord); bara skärm-innehållet.
//
// Användning:
//   cd tipspromenaden-app/docs/marketing
//   node build-walk-animation.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import GIFEncoder from "gif-encoder-2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS = path.resolve(
  process.env.APPDATA ?? "",
  "Claude/local-agent-mode-sessions/skills-plugin/6e3f3656-5b7f-48a4-9391-8a16ae2c491d/0a338210-3309-4e53-a4e7-c3d23bfbe37f/skills/canvas-design/canvas-fonts"
);

GlobalFonts.registerFromPath(path.join(FONTS, "Lora-Bold.ttf"), "LoraBold");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Regular.ttf"), "InstSans");
GlobalFonts.registerFromPath(path.join(FONTS, "InstrumentSans-Bold.ttf"), "InstSansBold");

// ─── Konfig ─────────────────────────────────────────────────────────
const W = 480;
const H = 854; // ~16:9 portrait, lättare än 1080-bredd för GIF-fil
const FPS = 15;
const TOTAL_FRAMES = 120; // 8 sek loop
const OUTPUT = path.join(__dirname, "walk-animation.gif");

const COLORS = {
  cream: "#F5F0E8",
  green: "#1B6B35",
  greenDark: "#1B3D2B",
  greenLight: "#C8E0CC",
  text: "#2C3E2D",
  sage: "#8A9A8D",
  rule: "#D9D2C2",
  white: "#FFFFFF",
  red: "#E53935",
  yellow: "#E8B830",
  userBlue: "#2874A6",
  mapPath: "#A9C0AB",
  mapWater: "#D4E5E6",
};

// ─── Scenes (frames -> what's on screen) ────────────────────────────
//
// Tidsplan i frames (15fps = 67ms/frame):
//   0-15    (0.0-1.0s): Statisk karta, användare nära start
//   15-30   (1.0-2.0s): Användare promenerar mot pin #1
//   30-40   (2.0-2.7s): Närmar sig pin #1, puls
//   40-55   (2.7-3.7s): Fråga-modal slider upp
//   55-80   (3.7-5.3s): Fråga + alternativ syns, väljer rätt
//   80-90   (5.3-6.0s): Rätt-feedback (grön highlight)
//   90-100  (6.0-6.7s): Modal slider ned, pin #1 → grön ✓
//   100-120 (6.7-8.0s): Användare promenerar mot pin #2, loop

// Kontrollpunkter i karta-koordinater (screen-space, hela bilden)
const POINTS = [
  { x: 140, y: 280, label: "1" },
  { x: 340, y: 380, label: "2" },
  { x: 220, y: 560, label: "3" },
];

// Användarens path från start till pin#1 till pin#2
const USER_START = { x: 100, y: 200 };

// ─── Helper: Lerp + easing ──────────────────────────────────────────
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ─── Helper: roundRect path ─────────────────────────────────────────
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

// ─── Ritar statusbar + appheader (alltid synlig) ───────────────────
function drawHeader(ctx, frame) {
  // Status bar (iPhone-style faux)
  ctx.fillStyle = COLORS.cream;
  ctx.fillRect(0, 0, W, 44);
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold 14px InstSansBold`;
  ctx.textAlign = "left";
  ctx.fillText("9:41", 24, 28);
  // Signal-bars + battery (vänsteralignade ikoner till höger)
  ctx.textAlign = "right";
  ctx.font = `12px InstSansBold`;
  ctx.fillText("●●●●  ◐  100%", W - 24, 28);

  // App-header
  ctx.fillStyle = COLORS.green;
  ctx.fillRect(0, 44, W, 56);

  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.cream;
  ctx.font = `bold 18px LoraBold`;
  ctx.fillText("Skogspromenaden", 24, 80);

  // Score-pill till höger i headern
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  roundRect(ctx, W - 110, 60, 86, 28, 14);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.cream;
  ctx.font = `bold 13px InstSansBold`;

  // Score: 0 i början, 1 efter rätt svar (frame 80+)
  const score = frame >= 80 ? 1 : 0;
  ctx.fillText(`${score} p`, W - 67, 79);
}

// ─── Ritar karta-bakgrund med stigar + grönytor ────────────────────
function drawMap(ctx) {
  // Mapyta börjar under headern (y=100) och slutar 80px från botten
  // (för plats för "Avstånd"-pill).
  const mapTop = 100;
  const mapBot = H - 80;

  // Cream bakgrund
  ctx.fillStyle = COLORS.cream;
  ctx.fillRect(0, mapTop, W, mapBot - mapTop);

  // Grönyta (skogs-park, organisk form)
  ctx.fillStyle = COLORS.greenLight;
  ctx.beginPath();
  ctx.moveTo(0, mapTop + 50);
  ctx.bezierCurveTo(100, 130, 220, 200, 320, 180);
  ctx.bezierCurveTo(400, 165, 450, 250, W, 230);
  ctx.lineTo(W, mapBot);
  ctx.lineTo(0, mapBot);
  ctx.closePath();
  ctx.fill();

  // Liten vatten-yta nere
  ctx.fillStyle = COLORS.mapWater;
  ctx.beginPath();
  ctx.ellipse(380, 680, 110, 50, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Stigar mellan kontrollerna (streckade)
  ctx.strokeStyle = COLORS.mapPath;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(USER_START.x, USER_START.y);
  ctx.lineTo(POINTS[0].x, POINTS[0].y);
  ctx.lineTo(POINTS[1].x, POINTS[1].y);
  ctx.lineTo(POINTS[2].x, POINTS[2].y);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ─── Ritar en kontrollpunkt-pin ────────────────────────────────────
function drawPin(ctx, x, y, label, state, pulse = 0) {
  // state: "done" | "active" | "next" | "locked"
  let bg, fg;
  if (state === "done") {
    bg = COLORS.greenDark;
    fg = COLORS.cream;
    label = "✓";
  } else if (state === "active") {
    bg = COLORS.red;
    fg = COLORS.white;
  } else if (state === "next") {
    bg = COLORS.red;
    fg = COLORS.white;
  } else {
    bg = COLORS.sage;
    fg = COLORS.white;
  }

  // Puls-ring runt active-pin
  if (state === "active" && pulse > 0) {
    const ringR = 22 + pulse * 24;
    const ringAlpha = 0.5 * (1 - pulse);
    ctx.strokeStyle = `rgba(229,57,53,${ringAlpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Trigger-cirkel (radius 30 = 15m vid karta-skala)
  if (state === "active" || state === "next") {
    ctx.strokeStyle = "rgba(229,57,53,0.5)";
    ctx.fillStyle = "rgba(229,57,53,0.1)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Pin-kropp
  const r = state === "active" ? 18 : 15;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.cream;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Label
  ctx.fillStyle = fg;
  ctx.font = `bold ${state === "active" ? 14 : 12}px InstSansBold`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y + 1);
  ctx.textBaseline = "alphabetic"; // reset
}

// ─── Ritar användar-position (blå dot med ring) ────────────────────
function drawUserDot(ctx, x, y) {
  // Yttre puls-ring (alpha-fadande)
  ctx.fillStyle = "rgba(40,116,166,0.18)";
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.fill();

  // Vit ring
  ctx.fillStyle = COLORS.white;
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.fill();

  // Inre blå dot
  ctx.fillStyle = COLORS.userBlue;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Ritar avstånd-pill överst i kartan ────────────────────────────
function drawDistancePill(ctx, distance, target) {
  const x = W / 2;
  const y = 130;
  const w = 240;
  const h = 36;

  ctx.fillStyle = "rgba(255,255,255,0.96)";
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 18);
  ctx.fill();
  ctx.strokeStyle = COLORS.rule;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = COLORS.text;
  ctx.font = `bold 13px InstSansBold`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let text;
  if (distance < 15) {
    text = `📍 Nästan framme!`;
  } else {
    text = `${Math.round(distance)} m till kontroll ${target}`;
  }
  ctx.fillText(text, x, y);
  ctx.textBaseline = "alphabetic";
}

// ─── Ritar fråga-modal (slidar in/ut beroende på t = 0..1) ────────
function drawQuestionModal(ctx, t, selectedAnswer = -1, showCorrect = false) {
  if (t <= 0) return;

  // Modalen är 80% av höjden, slider upp från botten
  const modalH = H * 0.78;
  const modalTopFull = H - modalH; // när helt synlig
  const modalTopHidden = H; // helt utanför skärm
  const modalTop = lerp(modalTopHidden, modalTopFull, easeInOut(t));

  // Backdrop
  ctx.fillStyle = `rgba(0,0,0,${0.4 * t})`;
  ctx.fillRect(0, 0, W, H);

  // Modal-bakgrund
  ctx.fillStyle = COLORS.cream;
  roundRect(ctx, 0, modalTop, W, modalH, 24);
  ctx.fill();

  // Drag-handle överst
  ctx.fillStyle = COLORS.rule;
  roundRect(ctx, W / 2 - 24, modalTop + 12, 48, 4, 2);
  ctx.fill();

  // Innehåll (bara om vi är >50% inne)
  if (t < 0.5) return;
  const contentAlpha = (t - 0.5) * 2;
  ctx.globalAlpha = contentAlpha;

  // "KONTROLL 1"-eyebrow
  ctx.fillStyle = COLORS.sage;
  ctx.font = `bold 11px InstSansBold`;
  ctx.textAlign = "left";
  ctx.fillText("K O N T R O L L   1", 32, modalTop + 56);

  // Frågetext
  ctx.fillStyle = COLORS.greenDark;
  ctx.font = `bold 22px LoraBold`;
  const question = "Hur många meter över havet";
  const question2 = "ligger denna plats?";
  ctx.fillText(question, 32, modalTop + 96);
  ctx.fillText(question2, 32, modalTop + 124);

  // Svarsalternativ
  const options = ["12 m", "47 m", "108 m", "203 m"];
  const correctIdx = 1; // "47 m"
  const optY = modalTop + 170;
  const optH = 60;
  const optGap = 12;

  for (let i = 0; i < options.length; i++) {
    const y = optY + i * (optH + optGap);
    let bg = COLORS.white;
    let border = COLORS.rule;
    let fg = COLORS.text;

    if (showCorrect && i === correctIdx) {
      bg = "#E8F5E9";
      border = COLORS.green;
      fg = COLORS.greenDark;
    } else if (selectedAnswer === i && !showCorrect) {
      // Just selected, ej feedback än
      bg = "#F0EDE5";
    }

    ctx.fillStyle = bg;
    roundRect(ctx, 24, y, W - 48, optH, 14);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = showCorrect && i === correctIdx ? 2.5 : 1.5;
    ctx.stroke();

    ctx.fillStyle = fg;
    ctx.font = `bold 17px InstSansBold`;
    ctx.textAlign = "left";
    ctx.fillText(options[i], 44, y + 38);

    if (showCorrect && i === correctIdx) {
      ctx.fillStyle = COLORS.green;
      ctx.font = `bold 20px InstSansBold`;
      ctx.textAlign = "right";
      ctx.fillText("✓", W - 44, y + 40);
    }
  }

  ctx.globalAlpha = 1;
}

// ─── Position längs en path (segment-baserad) ───────────────────────
function pointAlongPath(t, segments) {
  // segments: [{from, to, weight}]
  const totalWeight = segments.reduce((s, x) => s + x.weight, 0);
  let cum = 0;
  for (const seg of segments) {
    const segStart = cum / totalWeight;
    const segEnd = (cum + seg.weight) / totalWeight;
    if (t <= segEnd) {
      const local = (t - segStart) / (segEnd - segStart);
      return {
        x: lerp(seg.from.x, seg.to.x, local),
        y: lerp(seg.from.y, seg.to.y, local),
      };
    }
    cum += seg.weight;
  }
  return segments[segments.length - 1].to;
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ─── Render en frame ────────────────────────────────────────────────
function renderFrame(frame) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Bas: header + karta
  drawHeader(ctx, frame);
  drawMap(ctx);

  // Beräkna användar-position baserat på fas
  let userPos;
  let modalT = 0;
  let selectedAnswer = -1;
  let showCorrect = false;
  let pin1State = "active"; // ändras till "done" efter frame 90
  let pulsePhase = 0;

  if (frame < 15) {
    // Statisk start, användare nära USER_START
    userPos = USER_START;
  } else if (frame < 30) {
    // Promenera mot pin #1 (frame 15-30)
    const t = (frame - 15) / 15;
    userPos = {
      x: lerp(USER_START.x, POINTS[0].x, easeInOut(t)),
      y: lerp(USER_START.y, POINTS[0].y, easeInOut(t)),
    };
  } else if (frame < 40) {
    // Pulsera vid pin #1 (frame 30-40)
    userPos = POINTS[0];
    pulsePhase = ((frame - 30) / 10) % 1;
  } else if (frame < 55) {
    // Modal slidar upp (frame 40-55)
    userPos = POINTS[0];
    modalT = (frame - 40) / 15;
  } else if (frame < 75) {
    // Fråga + alternativ syns (frame 55-75)
    userPos = POINTS[0];
    modalT = 1;
  } else if (frame < 80) {
    // User väljer alternativ (frame 75-80)
    userPos = POINTS[0];
    modalT = 1;
    selectedAnswer = 1;
  } else if (frame < 90) {
    // Rätt-feedback (frame 80-90)
    userPos = POINTS[0];
    modalT = 1;
    selectedAnswer = 1;
    showCorrect = true;
  } else if (frame < 100) {
    // Modal slidar ned, pin #1 → done (frame 90-100)
    userPos = POINTS[0];
    modalT = lerp(1, 0, (frame - 90) / 10);
    pin1State = "done";
  } else {
    // Promenera mot pin #2 (frame 100-120)
    pin1State = "done";
    const t = (frame - 100) / 20;
    userPos = {
      x: lerp(POINTS[0].x, POINTS[1].x, easeInOut(t)),
      y: lerp(POINTS[0].y, POINTS[1].y, easeInOut(t)),
    };
  }

  // Rita pins
  // Pin 1
  drawPin(ctx, POINTS[0].x, POINTS[0].y, "1",
    pin1State === "done" ? "done" : "active",
    pulsePhase
  );
  // Pin 2 — "next" om pin1 done, annars locked-ish
  drawPin(ctx, POINTS[1].x, POINTS[1].y, "2",
    pin1State === "done" ? "active" : "locked"
  );
  // Pin 3 — locked tills tidigare är klara
  drawPin(ctx, POINTS[2].x, POINTS[2].y, "3", "locked");

  // Användar-position
  drawUserDot(ctx, userPos.x, userPos.y);

  // Avstånds-pill (visar avstånd till "next active" pin)
  const target = pin1State === "done" ? 2 : 1;
  const targetPos = pin1State === "done" ? POINTS[1] : POINTS[0];
  const dist = distance(userPos, targetPos);
  // Skala ner — 1 pixel ≈ 1m, men låt det kännas realistiskt
  drawDistancePill(ctx, dist, target);

  // Fråga-modal (rita SIST så den hamnar överst)
  drawQuestionModal(ctx, modalT, selectedAnswer, showCorrect);

  return canvas;
}

// ─── Bygg GIF ───────────────────────────────────────────────────────
console.log(`Bygger ${TOTAL_FRAMES} frames @ ${FPS}fps (${(TOTAL_FRAMES / FPS).toFixed(1)}s loop)…`);

const encoder = new GIFEncoder(W, H, "neuquant", true);
encoder.setDelay(Math.round(1000 / FPS));
encoder.setRepeat(0); // 0 = loop oändligt
encoder.setQuality(10); // 1-30, lägre = bättre kvalitet, större fil
encoder.start();

for (let i = 0; i < TOTAL_FRAMES; i++) {
  const canvas = renderFrame(i);
  encoder.addFrame(canvas.getContext("2d"));
  if (i % 10 === 0) {
    process.stdout.write(`  frame ${i}/${TOTAL_FRAMES}\r`);
  }
}

encoder.finish();
fs.writeFileSync(OUTPUT, encoder.out.getData());

const stats = fs.statSync(OUTPUT);
console.log(`\n✅ Klar: ${path.basename(OUTPUT)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
