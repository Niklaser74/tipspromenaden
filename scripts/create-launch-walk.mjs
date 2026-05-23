#!/usr/bin/env node
/**
 * Skapar "curated launch-walks" direkt i Firestore för utvalda
 * landmärken (Skansen, Gamla stan, Drottningholm, Slottsskogen,
 * Visby, Pildammsparken, Falu koppargruva). Admin SDK bypassar
 * tap-to-place-flödet i appen så vi kan batcha in färdiga
 * promenader med exakta koordinater.
 *
 * Speglar src/utils/qr.ts generateId() för crypto-secure ID:n
 * (samma pattern som create-review-demo-walk.mjs).
 *
 * Usage:
 *   # Skapa EN specifik walk via dess key (definierad nedan):
 *   node scripts/create-launch-walk.mjs --uid=<your-uid> --walk=skansen
 *
 *   # Skapa ALLA definierade walks:
 *   node scripts/create-launch-walk.mjs --uid=<your-uid> --walk=all
 *
 *   # Eller använd --from-walk för att slippa veta uid:t:
 *   node scripts/create-launch-walk.mjs --from-walk=<egen walk-id> --walk=skansen
 *
 * Walks markeras som publika (`public: true`) med kategori "annat".
 * createdBy = uid → dyker upp under "Mina" i appens bibliotek så
 * du kan finjustera koordinater post-skapande via Skapa-vyn på
 * webben.
 *
 * Säkerhetsspärr: 3 sek delay efter UID-utskrift så ett felskrivet
 * --uid kan avbrytas med Ctrl+C innan något skrivs till Firestore.
 */
import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, "..", "firebase-admin-key.json");
admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(readFileSync(keyPath, "utf-8"))
  ),
});
const db = admin.firestore();

// ─── CLI ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const uidArg = argv
  .find((a) => a.startsWith("--uid="))
  ?.slice("--uid=".length);
const fromWalkArg = argv
  .find((a) => a.startsWith("--from-walk="))
  ?.slice("--from-walk=".length);
const walkArg =
  argv.find((a) => a.startsWith("--walk="))?.slice("--walk=".length) ??
  "all";

let createdBy;
if (uidArg) {
  createdBy = uidArg;
} else if (fromWalkArg) {
  const snap = await db.collection("walks").doc(fromWalkArg).get();
  if (!snap.exists) {
    console.error(`✗ Walk ${fromWalkArg} not found`);
    process.exit(1);
  }
  createdBy = snap.data().createdBy;
} else {
  console.error(
    "Usage: node scripts/create-launch-walk.mjs " +
      "(--uid=<uid> | --from-walk=<walkId>) [--walk=<key|all>]"
  );
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────
function generateId() {
  const bytes = randomBytes(12);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return Date.now().toString(36) + hex;
}

function buildWalk(spec) {
  const walkId = generateId();
  const questions = spec.questions.map((q, i) => ({
    id: generateId(),
    text: q.text,
    options: q.options,
    correctOptionIndex: q.correct,
    coordinate: { latitude: q.lat, longitude: q.lng },
    order: i + 1,
  }));
  const centroid = {
    latitude:
      questions.reduce((s, q) => s + q.coordinate.latitude, 0) /
      questions.length,
    longitude:
      questions.reduce((s, q) => s + q.coordinate.longitude, 0) /
      questions.length,
  };
  return {
    id: walkId,
    title: spec.title,
    description: spec.description,
    questions,
    createdBy,
    createdAt: Date.now(),
    language: "sv",
    public: true,
    city: spec.city,
    category: spec.category,
    centroid,
    ...(spec.activityType ? { activityType: spec.activityType } : {}),
  };
}

// ─── Walks-katalog ──────────────────────────────────────────────────
//
// Koordinater är hämtade från Google Maps + Street View och landar
// typiskt inom 10-30 m från idealpunkten. Trigger-zonen är 15 m i
// walk-mode → mindre finjusteringar kan behövas på plats. Justera
// via Skapa-vyn på webben efter testpromenad.

const WALKS = {
  // ===== SKANSEN, STOCKHOLM =====
  skansen: {
    title: "Skansen — En runda i världens äldsta friluftsmuseum",
    description:
      "En lugn runda mellan ikoniska hus och hägn på Skansen, Djurgården. Tio frågor om svensk natur, kultur och Skansens egen historia. Cirka 1 km gångväg.",
    city: "Stockholm",
    category: "kultur",
    questions: [
      {
        text: "Vilket år grundades Skansen av Artur Hazelius?",
        options: ["1891", "1850", "1925", "1873"],
        correct: 0,
        lat: 59.32641,
        lng: 18.10256,
      },
      {
        text: "Vilket är Sveriges nationaldjur, som finns på Skansen?",
        options: ["Älg", "Björn", "Lo", "Räv"],
        correct: 0,
        lat: 59.32710,
        lng: 18.10434,
      },
      {
        text: "Vad kallas det årliga TV-evenemanget som sänds från Sollidenscenen varje sommar?",
        options: [
          "Allsång på Skansen",
          "Lotta på Liseberg",
          "Sommarkväll",
          "Diggiloo",
        ],
        correct: 0,
        lat: 59.32524,
        lng: 18.10561,
      },
      {
        text: "Skansens välkända djur — vilket av dessa är inte ett rovdjur?",
        options: ["Visent", "Varg", "Järv", "Björn"],
        correct: 0,
        lat: 59.32753,
        lng: 18.10207,
      },
      {
        text: "Vilken högtid firas extra stort på Skansen med marknad och julgransbelysning?",
        options: ["Jul", "Påsk", "Midsommar", "Valborg"],
        correct: 0,
        lat: 59.32595,
        lng: 18.10318,
      },
      {
        text: "Skansens akvarium har ett ovanligt djur som ser ut som en korsning mellan apa och valross. Vilket?",
        options: ["Manat", "Späckhuggare", "Sjölejon", "Pingvin"],
        correct: 0,
        lat: 59.32519,
        lng: 18.10174,
      },
      {
        text: "Vilken byggnad på Skansen kommer från Älvros i Härjedalen och är en kyrka?",
        options: [
          "Seglora kyrka",
          "Husbystugan",
          "Bollnästorget",
          "Skogaholm herrgård",
        ],
        correct: 0,
        lat: 59.32668,
        lng: 18.10142,
      },
      {
        text: "Vilket fenomen firas på Skansen den 30 april med stora brasor och körsång?",
        options: ["Valborgsmässoafton", "Midsommar", "Lucia", "Påsk"],
        correct: 0,
        lat: 59.32612,
        lng: 18.10489,
      },
      {
        text: "Skansen-akvariets glasblåsare visar upp ett urgammalt hantverk. Vad är huvudmaterialet i glas?",
        options: ["Sand (kiseldioxid)", "Lera", "Trä", "Kalksten"],
        correct: 0,
        lat: 59.32569,
        lng: 18.10082,
      },
      {
        text: "Vilket träd är vanligast i svenska skogar och växer även på Skansen?",
        options: ["Gran", "Tall", "Björk", "Ek"],
        correct: 0,
        lat: 59.32726,
        lng: 18.10379,
      },
    ],
  },
};

// ─── Main ────────────────────────────────────────────────────────────
const targets = walkArg === "all" ? Object.keys(WALKS) : [walkArg];
for (const key of targets) {
  if (!WALKS[key]) {
    console.error(`✗ Okänd walk-key: ${key}. Tillgängliga: ${Object.keys(WALKS).join(", ")}`);
    process.exit(1);
  }
}

console.log(`\n⚠️  Kommer att skapa följande walks under uid: ${createdBy}`);
for (const key of targets) {
  console.log(`  • ${key}: "${WALKS[key].title}"`);
}
console.log(`\n   Avbryt med Ctrl+C inom 3 sekunder om något ser fel ut.\n`);
await new Promise((resolve) => setTimeout(resolve, 3000));

for (const key of targets) {
  const walk = buildWalk(WALKS[key]);
  await db.collection("walks").doc(walk.id).set(walk);
  console.log(`✅ Skapad: ${walk.title}`);
  console.log(`   Walk ID: ${walk.id}`);
  console.log(`   URL:     https://tipspromenaden.app/walk/${walk.id}`);
  console.log(`   Frågor:  ${walk.questions.length} st`);
  console.log(``);
}

console.log(`Klart! Walks är synliga i:`);
console.log(`  • Mobilappens Bibliotek → Upptäck`);
console.log(`  • Skapa-vyn på webben → din egen "Mina"-lista (för finjustering)`);
process.exit(0);
