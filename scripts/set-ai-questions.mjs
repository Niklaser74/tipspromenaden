#!/usr/bin/env node
/**
 * Fjärrflaggan för AI-frågor i Android-appen: `config/aiQuestions`.
 *
 * Appen visar AI-genereringen bara när `androidEnabled === true`
 * (`src/services/aiQuestions.ts`). Saknas dokumentet är funktionen av.
 * Flaggan finns för att kunna stänga funktionen direkt, utan ny release,
 * om Google Play invänder mot att appen förbrukar krediter som köpts på
 * webben. Bakgrunden står i `docs/ai-questions-backend.md` → "Appen".
 *
 * Ändringen slår igenom nästa gång skaparskärmen öppnas.
 *
 * Usage:
 *   node scripts/set-ai-questions.mjs            # visar läget
 *   node scripts/set-ai-questions.mjs --on       # slår på
 *   node scripts/set-ai-questions.mjs --off      # stänger av
 *
 * Kräver `firebase-admin-key.json` i repo-roten (gitignored).
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
initializeApp({
  credential: cert(JSON.parse(readFileSync(resolve(repoRoot, "firebase-admin-key.json"), "utf8"))),
});
const ref = getFirestore().collection("config").doc("aiQuestions");

const on = process.argv.includes("--on");
const off = process.argv.includes("--off");
if (on && off) {
  console.error("Ange --on eller --off, inte båda.");
  process.exit(1);
}
if (on || off) {
  await ref.set({ androidEnabled: on, updatedAt: Date.now() });
}
const snap = await ref.get();
console.log(
  "config/aiQuestions:",
  snap.exists ? JSON.stringify(snap.data()) : "saknas (= av)"
);
