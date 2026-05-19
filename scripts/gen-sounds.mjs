#!/usr/bin/env node
/**
 * Genererar appens ljudeffekter som syntetiserade sine-WAV:ar.
 *
 * Varför genererade istället för nedladdade: noll upphovsrätts-risk,
 * inga externa assets att hålla reda på, deterministiskt och
 * reproducerbart. Korta toner med snabb attack + exponentiell decay
 * (undviker klick). 16-bit PCM mono 22050 Hz.
 *
 * Kör: node scripts/gen-sounds.mjs  → assets/sounds/{correct,wrong,complete}.wav
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/sounds");
const RATE = 22050;

// notes: [{ freq, durMs }] spelas i följd. gain-envelope per not.
function renderWav(notes, { gap = 0 } = {}) {
  const samples = [];
  for (const { freq, durMs } of notes) {
    const n = Math.floor((durMs / 1000) * RATE);
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const dur = durMs / 1000;
      // attack 8 ms, sedan exponentiell decay till slutet
      const atk = Math.min(1, t / 0.008);
      const dec = Math.exp(-3.2 * (t / dur));
      const env = atk * dec;
      // grundton + svag oktav-overton för lite liv
      const s =
        env *
        (0.78 * Math.sin(2 * Math.PI * freq * t) +
          0.18 * Math.sin(2 * Math.PI * freq * 2 * t));
      samples.push(Math.max(-1, Math.min(1, s)));
    }
    for (let i = 0; i < Math.floor((gap / 1000) * RATE); i++) samples.push(0);
  }
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE((v * 32767) | 0, i * 2));

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// correct: stigande A5 → E6, pigg och kort
writeFileSync(
  resolve(OUT, "correct.wav"),
  renderWav([
    { freq: 880, durMs: 90 },
    { freq: 1318.5, durMs: 160 },
  ])
);
// wrong: låg, kort, lätt dissonant — tydlig men inte hård
writeFileSync(
  resolve(OUT, "wrong.wav"),
  renderWav([
    { freq: 196, durMs: 110 },
    { freq: 155.6, durMs: 150 },
  ])
);
// complete: C-dur-arpeggio C5-E5-G5-C6, firande
writeFileSync(
  resolve(OUT, "complete.wav"),
  renderWav(
    [
      { freq: 523.25, durMs: 110 },
      { freq: 659.25, durMs: 110 },
      { freq: 783.99, durMs: 110 },
      { freq: 1046.5, durMs: 260 },
    ],
    { gap: 8 }
  )
);

console.log("✓ assets/sounds/{correct,wrong,complete}.wav genererade");
