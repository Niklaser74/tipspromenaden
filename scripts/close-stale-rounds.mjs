#!/usr/bin/env node
/**
 * Manuell svep: stänger övergivna rundor direkt, utan att vänta på det
 * schemalagda jobbet `closeStaleRounds` (functions/src/rounds.ts).
 *
 * Användes första gången 2026-09-27 för att städa de rundor som stod
 * öppna sedan innan jobbet fanns. Behåll för felsökning och för att
 * kunna städa på beställning.
 *
 * Regeln för vad som är övergivet importeras från den delade filen som
 * både appen och jobbet använder — kör `npm --prefix functions run build`
 * först om `functions/lib/` är gammal.
 *
 * Eventpromenader lämnas i fred som standard, även avslutade — samma
 * försiktighet som jobbet. `--include-ended-events` tar med event vars
 * datumfönster har passerat.
 *
 * Usage:
 *   node scripts/close-stale-rounds.mjs            # torrkörning, skriver bara ut
 *   node scripts/close-stale-rounds.mjs --apply    # stänger på riktigt
 *
 * Kräver `firebase-admin-key.json` i repo-roten (gitignored).
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { isRoundStale, STALE_ROUND_MS } = await import(
  "file://" + resolve(repoRoot, "functions/lib/shared/staleRound.js")
);

const apply = process.argv.includes("--apply");
const includeEndedEvents = process.argv.includes("--include-ended-events");
initializeApp({
  credential: cert(JSON.parse(readFileSync(resolve(repoRoot, "firebase-admin-key.json"), "utf8"))),
});
const db = getFirestore();
const now = Date.now();
const h = (ms) => (ms / 3600000).toFixed(0) + " h";

const open = await db
  .collection("sessions")
  .where("status", "in", ["waiting", "active"])
  .get();

const walkCache = new Map();
const getWalk = async (walkId) => {
  if (!walkCache.has(walkId)) {
    const snap = await db.collection("walks").doc(walkId).get();
    walkCache.set(walkId, snap.exists ? snap.data() : null);
  }
  return walkCache.get(walkId);
};

const toClose = [];
let fresh = 0;
let keptEvent = 0;

for (const doc of open.docs) {
  const s = doc.data();
  const createdAt = s.createdAt ?? 0;
  if (now - createdAt < STALE_ROUND_MS) {
    fresh++;
    continue;
  }
  const walk = s.walkId ? await getWalk(s.walkId) : null;
  const ps = await doc.ref.collection("participants").get();
  const parts = ps.docs.map((p) => p.data());
  if (!isRoundStale({ createdAt }, parts, walk, now, { keepEventWalks: !includeEndedEvents })) {
    if (walk?.event) keptEvent++;
    continue;
  }
  const answered = parts.filter((p) => p.completedAt || (p.answers?.length ?? 0) > 0).length;
  toClose.push({
    id: doc.id,
    title: walk?.title ?? "(raderad walk)",
    idle: now - createdAt,
    parts: parts.length,
    answered,
  });
}

toClose.sort((a, b) => b.idle - a.idle);
for (const r of toClose) {
  console.log(
    `${h(r.idle).padStart(6)} gammal  ${String(r.parts).padStart(2)} deltagare ` +
      `(${r.answered} svarade)  ${r.title.slice(0, 40)}`
  );
}
console.log(
  `\n${open.size} öppna rundor: ${toClose.length} övergivna, ` +
    `${fresh} yngre än 8 h, ${keptEvent} pågående event.`
);

if (!apply) {
  console.log("Torrkörning — inget ändrat. Kör med --apply för att stänga.");
  process.exit(0);
}

for (let i = 0; i < toClose.length; i += 500) {
  const batch = db.batch();
  for (const r of toClose.slice(i, i + 500)) {
    batch.update(db.collection("sessions").doc(r.id), { status: "completed" });
  }
  await batch.commit();
}
console.log(`${toClose.length} rundor stängda.`);
