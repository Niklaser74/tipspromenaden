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
 * `testerUids` är konton som ser funktionen även när flaggan är av — för
 * att prova i produktionsappen innan den släpps för alla. `--on`/`--off`
 * rör inte listan.
 *
 * Usage:
 *   node scripts/set-ai-questions.mjs                     # visar läget
 *   node scripts/set-ai-questions.mjs --on                # på för alla
 *   node scripts/set-ai-questions.mjs --off               # av (testare ser den ändå)
 *   node scripts/set-ai-questions.mjs --testers uid1,uid2 # sätter testarlistan
 *   node scripts/set-ai-questions.mjs --testers ""        # tömmer testarlistan
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
const testersIdx = process.argv.indexOf("--testers");
const patch = {};
if (on || off) patch.androidEnabled = on;
if (testersIdx >= 0) {
  patch.testerUids = (process.argv[testersIdx + 1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
if (Object.keys(patch).length > 0) {
  await ref.set({ ...patch, updatedAt: Date.now() }, { merge: true });
}
const snap = await ref.get();
console.log(
  "config/aiQuestions:",
  snap.exists ? JSON.stringify(snap.data()) : "saknas (= av)"
);
