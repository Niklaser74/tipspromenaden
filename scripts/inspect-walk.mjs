#!/usr/bin/env node
/**
 * Engångs-diagnostik: hitta en walk på (del av) titel och dumpa dess
 * sessioner + deltagare så vi ser om `completedAt`/answers faktiskt
 * finns server-side. Read-only.
 *
 * Usage: node scripts/inspect-walk.mjs "Gdansk tour"
 *
 * Kräver `firebase-admin-key.json` i repo-roten (gitignored).
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const needle = (process.argv[2] || "").toLowerCase().trim();
if (!needle) {
  console.error('Usage: node scripts/inspect-walk.mjs "<del av titel>"');
  process.exit(1);
}

initializeApp({
  credential: cert(
    JSON.parse(readFileSync(resolve(repoRoot, "firebase-admin-key.json"), "utf8"))
  ),
});
const db = getFirestore();

const walksSnap = await db.collection("walks").get();
const matches = walksSnap.docs.filter((d) =>
  String(d.data().title || "").toLowerCase().includes(needle)
);

if (matches.length === 0) {
  console.log(`Ingen walk vars titel innehåller "${needle}".`);
  process.exit(0);
}

for (const w of matches) {
  const walk = w.data();
  console.log("\n=== WALK ===");
  console.log("id:        ", w.id);
  console.log("title:     ", walk.title);
  console.log("createdBy: ", walk.createdBy);
  console.log("event:     ", JSON.stringify(walk.event ?? null));
  console.log("questions: ", (walk.questions || []).length);

  const sessSnap = await db
    .collection("sessions")
    .where("walkId", "==", w.id)
    .get();
  console.log(`\nsessions (walkId == ${w.id}): ${sessSnap.size}`);

  for (const s of sessSnap.docs) {
    const sd = s.data();
    console.log(`\n  -- session ${s.id} status=${sd.status} createdAt=${sd.createdAt}`);
    const partSnap = await db
      .collection("sessions")
      .doc(s.id)
      .collection("participants")
      .get();
    if (partSnap.empty) {
      console.log("     (inga deltagare)");
      continue;
    }
    for (const p of partSnap.docs) {
      const pd = p.data();
      console.log(
        `     • ${pd.name} (id=${p.id}) score=${pd.score} ` +
          `answers=${(pd.answers || []).length} ` +
          `completedAt=${pd.completedAt ?? "—"} ` +
          `steps=${pd.steps ?? "—"}`
      );
    }
  }
}

process.exit(0);
