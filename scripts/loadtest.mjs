#!/usr/bin/env node
/**
 * Lasttest: simulerar N deltagare som spelar en promenad samtidigt och
 * mäter Firestore-skrivgenomströmning + toppliste-läs-fan-out. Tänkt
 * att köras INNAN man lovar en kund ett storgrupps-event (~200).
 *
 * VIKTIGT — vad detta mäter och INTE mäter:
 *  - Mäter: Firestore write-throughput vid hög samtidighet, wall-clock,
 *    fel/throttling, samt läs-amplifiering (hur många dok-ändringar en
 *    toppliste-lyssnare får serverat = ungefärlig läs-debitering).
 *  - Mäter INTE säkerhetsreglerna: firebase-admin BYPASSAR rules. Den
 *    completed-frys-risk vi härdade mot ligger i klientlogik
 *    (updateParticipant, event-grenen) + rules, inte här. Scriptet
 *    skriver realistisk data (matchar hasValid*Shape) så ett ev.
 *    framtida rules-on-test kan återanvända samma mönster.
 *
 * Skapar en egen `loadtest-<ts>`-walk (public:false → syns ALDRIG i
 * biblioteket) + en session, kör testet, städar upp (om inte --keep).
 *
 * Usage:
 *   node scripts/loadtest.mjs --participants 200 --questions 15 \
 *        --listeners 50 --concurrency 50 [--event] [--keep]
 *
 * Kräver firebase-admin-key.json i repo-roten (gitignored).
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}
const PARTICIPANTS = parseInt(arg("participants", "200"), 10);
const QUESTIONS = parseInt(arg("questions", "15"), 10);
const LISTENERS = parseInt(arg("listeners", "50"), 10);
const CONCURRENCY = parseInt(arg("concurrency", "50"), 10);
const IS_EVENT = !!arg("event", false);
const KEEP = !!arg("keep", false);

initializeApp({
  credential: cert(
    JSON.parse(readFileSync(resolve(repoRoot, "firebase-admin-key.json"), "utf8"))
  ),
});
const db = getFirestore();

const ts = Date.now();
const walkId = `loadtest-${ts}`;
const sessionId = `loadtest-sess-${ts}`;

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

async function setup() {
  const questions = Array.from({ length: QUESTIONS }, (_, i) => ({
    id: `q${i}`,
    text: `Lasttest-fråga ${i + 1}?`,
    options: ["A", "B", "C"],
    correctOptionIndex: 0,
    coordinate: { latitude: 59.3 + i * 0.001, longitude: 18.07 },
    order: i,
  }));
  await db.collection("walks").doc(walkId).set({
    id: walkId,
    title: `LASTTEST ${new Date(ts).toISOString()}`,
    createdBy: "loadtest",
    createdAt: ts,
    questions,
    public: false, // syns aldrig i biblioteket
    ...(IS_EVENT
      ? {
          event: {
            startDate: new Date(ts - 3600e3).toISOString().slice(0, 10),
            endDate: new Date(ts + 7 * 864e5).toISOString().slice(0, 10),
          },
        }
      : {}),
  });
  await db.collection("sessions").doc(sessionId).set({
    id: sessionId,
    walkId,
    status: "active",
    createdAt: ts,
  });
  log(`Setup klar: walk=${walkId} session=${sessionId} event=${IS_EVENT}`);
}

// En deltagare: skriv participant-doc + QUESTIONS progressiva
// answer-updates (speglar updateParticipant: full setDoc per svar).
async function simulateParticipant(idx) {
  const pid = `lt-${idx}`;
  const ref = db
    .collection("sessions")
    .doc(sessionId)
    .collection("participants")
    .doc(pid);
  const answers = [];
  let writes = 0;
  await ref.set({ id: pid, name: `Tester ${idx}`, answers: [], score: 0 });
  writes++;
  for (let q = 0; q < QUESTIONS; q++) {
    answers.push({
      questionId: `q${q}`,
      selectedOptionIndex: q % 3,
      correct: q % 3 === 0,
      answeredAt: Date.now(),
    });
    const score = answers.filter((a) => a.correct).length;
    const isLast = q === QUESTIONS - 1;
    await ref.set({
      id: pid,
      name: `Tester ${idx}`,
      answers,
      score,
      ...(isLast ? { completedAt: Date.now() } : {}),
    });
    writes++;
  }
  return writes;
}

// Kör i batchar om CONCURRENCY för att inte öppna 200 sockets på en gång.
async function runParticipants() {
  let totalWrites = 0;
  let errors = 0;
  const start = Date.now();
  for (let i = 0; i < PARTICIPANTS; i += CONCURRENCY) {
    const batch = [];
    for (let j = i; j < Math.min(i + CONCURRENCY, PARTICIPANTS); j++) {
      batch.push(
        simulateParticipant(j).then(
          (w) => (totalWrites += w),
          (e) => {
            errors++;
            if (errors <= 3) log("deltagar-fel:", e.code || e.message);
          }
        )
      );
    }
    await Promise.all(batch);
    log(`  ...${Math.min(i + CONCURRENCY, PARTICIPANTS)}/${PARTICIPANTS} klara`);
  }
  const secs = (Date.now() - start) / 1000;
  return { totalWrites, errors, secs };
}

async function main() {
  await setup();

  // Toppliste-fan-out: LISTENERS lyssnare på participants-collection.
  // Räkna serverade dok-ändringar = ~Firestore-läsdebitering.
  let docReadsDelivered = 0;
  const unsubs = [];
  for (let l = 0; l < LISTENERS; l++) {
    unsubs.push(
      db
        .collection("sessions")
        .doc(sessionId)
        .collection("participants")
        .onSnapshot((snap) => {
          docReadsDelivered += snap.docChanges().length;
        })
    );
  }
  log(`${LISTENERS} toppliste-lyssnare aktiva`);

  log(`Startar ${PARTICIPANTS} deltagare (concurrency ${CONCURRENCY})...`);
  const { totalWrites, errors, secs } = await runParticipants();

  // Låt sista snapshot-bursten landa innan vi mäter läsningar.
  await new Promise((r) => setTimeout(r, 4000));
  unsubs.forEach((u) => u());

  console.log("\n========== RESULTAT ==========");
  console.log(`Deltagare:            ${PARTICIPANTS}`);
  console.log(`Frågor/deltagare:     ${QUESTIONS}`);
  console.log(`Skrivningar totalt:   ${totalWrites}`);
  console.log(`Fel:                  ${errors}`);
  console.log(`Tid:                  ${secs.toFixed(1)} s`);
  console.log(`Skriv/s:              ${(totalWrites / secs).toFixed(0)}`);
  console.log(`Toppliste-lyssnare:   ${LISTENERS}`);
  console.log(`Dok-läs serverade:    ${docReadsDelivered}  (≈ Firestore-läsdebitering för topplistan)`);
  console.log(
    `Uppskattad kostnad:   skriv ~$${((totalWrites / 1e5) * 0.108).toFixed(3)}, läs ~$${(
      (docReadsDelivered / 1e5) *
      0.036
    ).toFixed(3)} (Firestore-pris, ungefär)`
  );
  console.log("==============================\n");

  if (!KEEP) {
    log("Städar upp testdata...");
    const ps = await db
      .collection("sessions")
      .doc(sessionId)
      .collection("participants")
      .listDocuments();
    for (let i = 0; i < ps.length; i += 400) {
      const b = db.batch();
      ps.slice(i, i + 400).forEach((d) => b.delete(d));
      await b.commit();
    }
    await db.collection("sessions").doc(sessionId).delete();
    await db.collection("walks").doc(walkId).delete();
    log("Uppstädat.");
  } else {
    log(`--keep: behöll ${walkId} / ${sessionId} (städa manuellt)`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Lasttest kraschade:", e);
  process.exit(1);
});
