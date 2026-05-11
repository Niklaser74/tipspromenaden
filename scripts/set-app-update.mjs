#!/usr/bin/env node
/**
 * Skriver `config/appUpdate`-docen i Firestore. Används vid release för att
 * meddela klienterna att en nyare AAB finns i Play Store.
 *
 * Usage:
 *   node scripts/set-app-update.mjs \
 *     --latestBuild 19 \
 *     --latestVersion 1.6.0 \
 *     [--minBuild 0] \
 *     [--notesSv "..."] \
 *     [--notesEn "..."]
 *
 * Default playStoreUrl används om inget annat anges.
 *
 * Kräver `firebase-admin-key.json` i repo-roten (gitignored — Firebase Admin
 * SDK-nyckel från Firebase Console → Project Settings → Service Accounts).
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.tipspromenaden.app";

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      out[key] = val;
      i++;
    }
  }
  return out;
}

const args = parseArgs();

if (!args.latestBuild) {
  console.error("Missing --latestBuild <number>");
  process.exit(1);
}

const latestBuild = parseInt(args.latestBuild, 10);
const minBuild = args.minBuild ? parseInt(args.minBuild, 10) : 0;
if (!Number.isFinite(latestBuild) || !Number.isFinite(minBuild)) {
  console.error("latestBuild and minBuild must be integers");
  process.exit(1);
}

const serviceAccount = JSON.parse(
  readFileSync(resolve(repoRoot, "firebase-admin-key.json"), "utf8")
);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const payload = {
  latestBuild,
  minBuild,
  playStoreUrl: args.playStoreUrl ?? PLAY_STORE_URL,
};

if (args.latestVersion) payload.latestVersion = args.latestVersion;

const releaseNotes = {};
if (args.notesSv) releaseNotes.sv = args.notesSv;
if (args.notesEn) releaseNotes.en = args.notesEn;
if (Object.keys(releaseNotes).length > 0) payload.releaseNotes = releaseNotes;

console.log("Writing config/appUpdate:");
console.log(JSON.stringify(payload, null, 2));

await db.collection("config").doc("appUpdate").set(payload, { merge: true });

console.log("✓ Done.");
process.exit(0);
