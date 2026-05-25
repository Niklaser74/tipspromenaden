// Bygger en illustrerad GIF-animation som visar app-flödet: karta →
// promenera till kontrollpunkt → fråga öppnas → svara → kontrollpunkt
// markeras som klar → promenera till nästa.
//
// Output: walk-animation.gif (~1.5MB, ~8 sekunder, loopar)
//
// Stil: Friluft Folio (samma som social-launch + flygblad). UI:t är
// canvas-tecknat från grunden — inte skärmdumpar — för konsekvent
// stil och full kontroll över animationen. Ingen telefon-frame
// (mockup-look känns konstgjord); bara skärm-innehållet.
//
// Användning (default-värdena är det vi har idag):
//   node build-walk-animation.mjs
//
// Anpassa frågan + alternativ + output:
//   node build-walk-animation.mjs \
//     --question "Vilken är internets roligaste app?" \
//     --options "Tipsrundan,Strava,Tipspromenaden,Wordle" \
//     --correct 2 \
//     --output walk-animation-fun.gif

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

// ─── CLI-args ───────────────────────────────────────────────────────
// Defaults: realistisk höjd-fråga (samma som första versionen). Override
// via --question / --options / --correct / --output för andra varianter.
function getArg(name, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(`--${name}=`.length) : fallback;
}

const QUESTION = getArg(
  "question",
  "Hur många meter över havet ligger denna plats?"
);
const OPTIONS_RAW = getArg("options", "12 m,47 m,108 m,203 m");
const OPTIONS = OPTIONS_RAW.split(",").map((s) => s.trim());
const CORRECT_IDX = parseInt(getArg("correct", "1"), 10);
const OUTPUT_NAME = getArg("output", "walk-animation.gif");
const OUTPUT = path.join(__dirname, OUTPUT_NAME);

if (OPTIONS.length !== 4) {
  console.error(
    `--options måste vara exakt 4 kommaseparerade alternativ (fick ${OPTIONS.length})`
  );
  process.exit(1);
}
if (CORRECT_IDX < 0 || CORRECT_IDX > 3) {
  console.error(`--correct måste vara 0-3 (fick ${CORRECT_IDX})`);
  process.exit(1);
}

// Dela frågetexten i två rader om den är lång. Brytpunkt vid mellanslag
// nära mitten så typografi-rytmen blir balanserad.
function wrapQuestion(text) {
  if (text.length < 32) return [text, ""];
  const mid = Math.floor(text.length / 2);
  // Sök närmaste mellanslag före och efter mitten, ta den som ger
  // jämnast split
  let breakAt = mid;
  for (let i = 0; i < 15; i++) {
    if (text[mid - i] === " ") {
      breakAt = mid - i;
      break;
    }
    if (text[mid + i] === " ") {
      breakAt = mid + i;
      break;
    }
  }
  return [text.slice(0, breakAt).trim(), text.slice(breakAt).trim()];
}
const [QUESTION_L1, QUESTION_L2] = wrapQuestion(QUESTION);

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
//   0-12    (0.0-0.8s): Statisk karta, användare nära start
//   12-25   (0.8-1.7s): Användare promenerar mot pin #1
//   25-32   (1.7-2.1s): Närmar sig pin #1, puls
//   32-44   (2.1-2.9s): Fråga-modal slider upp
//   44-62   (2.9-4.1s): Fråga + alternativ syns
//   62-68   (4.1-4.5s): User markerar svar (highlight)
//   68-92   (4.5-6.1s): RÄTT!-feedback (badge + sparkles + pulserande ✓)
//   92-102  (6.1-6.8s): Modal slidar ned, pin #1 → grön ✓
//   102-120 (6.8-8.0s): Användare promenerar mot pin #2, loop

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
    text = `Nästan framme!`;
  } else {
    text = `${Math.round(distance)} m till kontroll ${target}`;
  }
  ctx.fillText(text, x, y);
  ctx.textBaseline = "alphabetic";
}

// ─── Ritar sparkles/confetti som flyger ut från rätt svar ─────────
function drawSparkles(ctx, x, y, progress) {
  // progress = 0..1 — 0 = nyss exploderat, 1 = nästan borta
  // Slumpmässig-ish men deterministisk position så det loopar fint.
  // 12 partiklar i en cirkel runt sourcepunkten.
  const count = 12;
  const maxDist = 90;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + 0.3;
    const dist = maxDist * progress;
    const px = x + Math.cos(angle) * dist;
    const py = y + Math.sin(angle) * dist - progress * 20; // lite tyngdkraft
    const size = 4 * (1 - progress);
    const alpha = 1 - progress;
    // Växla mellan grön och gul för variation
    ctx.fillStyle = i % 2 === 0
      ? `rgba(232,184,48,${alpha})` // yellow
      : `rgba(27,107,53,${alpha})`; // green
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Ritar fråga-modal (slidar in/ut beroende på t = 0..1) ────────
function drawQuestionModal(ctx, t, selectedAnswer = -1, showCorrect = false, correctPhase = 0) {
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

  // Frågetext (parametriserad via CLI --question)
  ctx.fillStyle = COLORS.greenDark;
  ctx.font = `bold 22px LoraBold`;
  ctx.fillText(QUESTION_L1, 32, modalTop + 96);
  if (QUESTION_L2) ctx.fillText(QUESTION_L2, 32, modalTop + 124);

  // Svarsalternativ (parametriserade via CLI --options + --correct)
  const options = OPTIONS;
  const correctIdx = CORRECT_IDX;
  const optY = modalTop + (QUESTION_L2 ? 170 : 140);
  const optH = 60;
  const optGap = 12;

  // För rätt-alternativet i feedback-läge: subtil pulsering så ✓ andas
  // (sinus-baserad scale 1.0 ↔ 1.15 över hela feedback-fasen).
  const checkPulse = 1 + Math.sin(correctPhase * Math.PI * 4) * 0.08;
  // Bakgrunden ramper in starkare grön i början av feedback (0..0.3),
  // sen stannar mättad resten av tiden.
  const greenIntensity = Math.min(1, correctPhase / 0.3);

  for (let i = 0; i < options.length; i++) {
    const y = optY + i * (optH + optGap);
    let bg = COLORS.white;
    let border = COLORS.rule;
    let fg = COLORS.text;
    let strokeW = 1.5;

    if (showCorrect && i === correctIdx) {
      // Starkare grön bakgrund: lerp från ljus till mättad mellan
      // svit-färgerna. greenIntensity styr.
      const r = Math.round(lerp(232, 200, greenIntensity));
      const g = Math.round(lerp(245, 230, greenIntensity));
      const b = Math.round(lerp(233, 204, greenIntensity));
      bg = `rgb(${r},${g},${b})`;
      border = COLORS.green;
      fg = COLORS.greenDark;
      strokeW = 3;
    } else if (selectedAnswer === i && !showCorrect) {
      // Just selected, ej feedback än
      bg = "#F0EDE5";
    } else if (showCorrect && i !== correctIdx) {
      // Övriga alternativ dimmas något i feedback-fasen så ögat dras
      // till det rätta.
      ctx.globalAlpha = contentAlpha * (1 - greenIntensity * 0.4);
    }

    ctx.fillStyle = bg;
    roundRect(ctx, 24, y, W - 48, optH, 14);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = strokeW;
    ctx.stroke();

    ctx.fillStyle = fg;
    ctx.font = `bold 17px InstSansBold`;
    ctx.textAlign = "left";
    ctx.fillText(options[i], 44, y + 38);

    if (showCorrect && i === correctIdx) {
      // Pulserande checkmark — ritad som path istället för Unicode
      // eftersom våra fonter (Lora/InstSans) inte täcker ✓-tecknet.
      // Center på den högra delen av rutan, scalas pulserande.
      const checkX = W - 50;
      const checkY = y + 30;
      const checkSize = 14 * checkPulse;
      ctx.save();
      ctx.strokeStyle = COLORS.green;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(checkX - checkSize, checkY);
      ctx.lineTo(checkX - checkSize / 3, checkY + checkSize);
      ctx.lineTo(checkX + checkSize, checkY - checkSize);
      ctx.stroke();
      ctx.restore();
    }

    // Återställ alpha för nästa iteration
    ctx.globalAlpha = contentAlpha;
  }

  // RÄTT!-badge — flyger in från botten ovanför första alternativet
  // i början av feedback-fasen, sen stannar uppe.
  if (showCorrect && correctPhase > 0) {
    const badgePopT = Math.min(1, correctPhase / 0.2); // pop-in 0..20% av fasen
    const badgeY = lerp(optY - 10, optY - 50, easeInOut(badgePopT));
    const badgeAlpha = badgePopT;
    const badgeScale = lerp(0.6, 1, easeInOut(badgePopT));

    ctx.save();
    ctx.globalAlpha = contentAlpha * badgeAlpha;
    ctx.translate(W / 2, badgeY);
    ctx.scale(badgeScale, badgeScale);

    // Badge-bakgrund — fyll
    const badgeW = 130;
    const badgeH = 44;
    ctx.fillStyle = COLORS.green;
    roundRect(ctx, -badgeW / 2, -badgeH / 2, badgeW, badgeH, 22);
    ctx.fill();
    // Gul accent-kant under
    ctx.fillStyle = COLORS.yellow;
    roundRect(ctx, -badgeW / 2, badgeH / 2 - 4, badgeW, 4, 2);
    ctx.fill();

    // Text (utan emoji eftersom våra fonter inte stöder 🎉 — ersatt
    // med ! + en liten stjärna ritad som path till höger).
    ctx.fillStyle = COLORS.cream;
    ctx.font = `bold 22px LoraBold`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("RÄTT!", -16, 1);
    ctx.textBaseline = "alphabetic";

    // Liten gul stjärna som "celebration"-accent
    ctx.fillStyle = COLORS.yellow;
    const starX = 28;
    const starY = 0;
    const starR = 7;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const x = starX + Math.cos(a) * starR;
      const y = starY + Math.sin(a) * starR;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      const ai = a + Math.PI / 5;
      const xi = starX + Math.cos(ai) * starR * 0.4;
      const yi = starY + Math.sin(ai) * starR * 0.4;
      ctx.lineTo(xi, yi);
    }
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // Sparkles — flyger ut från rätt-alternativets center i början av
  // feedback-fasen, fadar ut efter ~50% av fasen.
  if (showCorrect && correctPhase < 0.5) {
    const sparkleX = W - 44;
    const sparkleY = optY + correctIdx * (optH + optGap) + 30;
    const sparkleT = correctPhase / 0.5;
    ctx.globalAlpha = contentAlpha;
    drawSparkles(ctx, sparkleX, sparkleY, sparkleT);
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
  let correctPhase = 0; // 0..1 inom feedback-fasen, styr sparkles + RÄTT-badge
  let pin1State = "active"; // ändras till "done" efter feedback
  let pulsePhase = 0;

  if (frame < 12) {
    // Statisk start
    userPos = USER_START;
  } else if (frame < 25) {
    // Promenera mot pin #1
    const t = (frame - 12) / 13;
    userPos = {
      x: lerp(USER_START.x, POINTS[0].x, easeInOut(t)),
      y: lerp(USER_START.y, POINTS[0].y, easeInOut(t)),
    };
  } else if (frame < 32) {
    // Pulsera vid pin #1
    userPos = POINTS[0];
    pulsePhase = ((frame - 25) / 7) % 1;
  } else if (frame < 44) {
    // Modal slidar upp
    userPos = POINTS[0];
    modalT = (frame - 32) / 12;
  } else if (frame < 62) {
    // Fråga + alternativ syns
    userPos = POINTS[0];
    modalT = 1;
  } else if (frame < 68) {
    // User markerar svar (highlight, ej rätt-feedback än)
    userPos = POINTS[0];
    modalT = 1;
    selectedAnswer = CORRECT_IDX;
  } else if (frame < 92) {
    // RÄTT!-feedback (frame 68-92 = 24 frames = 1.6s)
    userPos = POINTS[0];
    modalT = 1;
    selectedAnswer = CORRECT_IDX;
    showCorrect = true;
    correctPhase = (frame - 68) / 24;
  } else if (frame < 102) {
    // Modal slidar ned, pin #1 → done
    userPos = POINTS[0];
    modalT = lerp(1, 0, (frame - 92) / 10);
    pin1State = "done";
  } else {
    // Promenera mot pin #2
    pin1State = "done";
    const t = (frame - 102) / 18;
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
  drawQuestionModal(ctx, modalT, selectedAnswer, showCorrect, correctPhase);

  return canvas;
}

// ─── Exports för andra scripts (build-social-walk-animation m.fl.) ─
// Andra scripts kan importera renderFrame + metadata utan att GIF-
// genereringen nedan körs som side-effect.
export { renderFrame, W as WALK_W, H as WALK_H, TOTAL_FRAMES, FPS };

// ─── Main-guard: kör bara GIF-genereringen om scriptet körs direkt ─
// Detta tillåter import utan side-effects. Pattern: jämför import.meta.url
// med process.argv[1] (det script som node kördes med).
const __filename = fileURLToPath(import.meta.url);
const isMain =
  process.argv[1] === __filename ||
  process.argv[1]?.replace(/\\/g, "/").endsWith("build-walk-animation.mjs");

if (!isMain) {
  // Importeras från annat script — gör inget mer. (Exports ovan räcker.)
  // eslint-disable-next-line no-empty
} else {

// ─── Preview single frame? (för att inspektera utan att öppna GIF) ─
const previewFrame = parseInt(getArg("preview-frame", "-1"), 10);
if (previewFrame >= 0 && previewFrame < TOTAL_FRAMES) {
  const canvas = renderFrame(previewFrame);
  const previewPath = OUTPUT.replace(/\.gif$/, `-frame${previewFrame}.png`);
  fs.writeFileSync(previewPath, canvas.toBuffer("image/png"));
  console.log(`✅ Preview-frame: ${path.basename(previewPath)}`);
  process.exit(0);
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

} // ← stänger main-guarden ovan
