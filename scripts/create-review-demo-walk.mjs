#!/usr/bin/env node
/**
 * Skapar en "App Review Demo"-promenad direkt i Firestore för Apple
 * App Review. Tre engelska frågor placerade vid Apple Park, Cupertino
 * — granskaren kan simulera GPS dit i iPad-simulatorn.
 *
 * Usage:
 *   # Använd ägar-UID från en befintlig walk du redan skapat:
 *   node scripts/create-review-demo-walk.mjs --from-walk=<någon walk-id du äger>
 *
 *   # Eller explicit uid (om du redan vet det):
 *   node scripts/create-review-demo-walk.mjs --uid=<your-firebase-uid>
 *
 * Skriver ut: walk-id, deep-link, universal-link, första kontrollens
 * koordinater (för simulator-konfig) + centroid.
 */
import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, "..", "firebase-admin-key.json");
admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(readFileSync(keyPath, "utf-8"))
  ),
});
const db = admin.firestore();

const argv = process.argv.slice(2);
const uidArg = argv
  .find((a) => a.startsWith("--uid="))
  ?.slice("--uid=".length);
const fromWalkArg = argv
  .find((a) => a.startsWith("--from-walk="))
  ?.slice("--from-walk=".length);

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
  console.log(`Using createdBy from walk ${fromWalkArg}: ${createdBy}`);
} else {
  console.error(
    "Usage: node scripts/create-review-demo-walk.mjs " +
      "--uid=<uid> | --from-walk=<walkId>"
  );
  process.exit(1);
}

function generateId() {
  // Samma stil som utils/qr.ts generateId — 24 tecken random
  return (
    Math.random().toString(36).slice(2, 14) +
    Math.random().toString(36).slice(2, 14)
  );
}

const walkId = generateId();
const questions = [
  {
    id: generateId(),
    text: "What is the name of Apple's headquarters?",
    options: ["Apple Park", "Apple Plaza", "Apple Center", "Apple Tower"],
    correctOptionIndex: 0,
    coordinate: { latitude: 37.3348, longitude: -122.0089 },
    order: 1,
  },
  {
    id: generateId(),
    text: "Apple Park is shaped like which symbol?",
    options: ["A ring", "A square", "A star", "A triangle"],
    correctOptionIndex: 0,
    coordinate: { latitude: 37.33301, longitude: -122.00688 },
    order: 2,
  },
  {
    id: generateId(),
    text: "Which company built this app?",
    options: ["Tipspromenaden", "Apple", "Google", "Microsoft"],
    correctOptionIndex: 0,
    coordinate: { latitude: 37.33186, longitude: -122.03067 },
    order: 3,
  },
];

const centroid = {
  latitude:
    questions.reduce((s, q) => s + q.coordinate.latitude, 0) /
    questions.length,
  longitude:
    questions.reduce((s, q) => s + q.coordinate.longitude, 0) /
    questions.length,
};

const walk = {
  id: walkId,
  title: "App Review Demo",
  description:
    "English demo walk for Apple App Review. Three quick questions at Apple Park, Cupertino.",
  questions,
  createdBy,
  createdAt: Date.now(),
  language: "en",
  public: true,
  city: "Cupertino",
  category: "education",
  centroid,
};

await db.collection("walks").doc(walkId).set(walk);

console.log(`\n✅ Walk skapad!\n`);
console.log(`Walk ID:         ${walkId}`);
console.log(`Deep link:       tipspromenaden://walk/${walkId}`);
console.log(`Universal link:  https://tipspromenaden.app/walk/${walkId}`);
console.log(`Centroid:        ${centroid.latitude}, ${centroid.longitude}`);
console.log(`\nFörsta kontroll (för simulator GPS-override):`);
console.log(`  Latitude:  ${questions[0].coordinate.latitude}`);
console.log(`  Longitude: ${questions[0].coordinate.longitude}`);
console.log(``);

process.exit(0);
