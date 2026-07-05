#!/usr/bin/env node
/**
 * Skriver `config/supporters`-docen i Firestore — namnlistan som visas på
 * appens tacksida (Inställningar → Tack till våra supportrar).
 *
 * Brygga tills webbens /admin-sida får ett formulär för samma doc
 * (se docs/web-admin-supporters.md).
 *
 * Usage:
 *   node scripts/set-supporters.mjs --names "Anna Andersson, Bertil B, Cilla C"
 *   node scripts/set-supporters.mjs --file supporters.txt      # ett namn per rad
 *   node scripts/set-supporters.mjs --names "..." \
 *     [--messageSv "Egen intro-text"] [--messageEn "Custom intro"]
 *
 * Namnen ERSÄTTER hela listan (inte append) — kör med den kompletta listan
 * varje gång, så är scriptet idempotent och ordningen förutsägbar.
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

let names = [];
if (args.file) {
  names = readFileSync(resolve(process.cwd(), args.file), "utf8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
} else if (args.names) {
  names = args.names
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
} else {
  console.error('Missing --names "A, B, C" or --file <path>');
  process.exit(1);
}

const tooLong = names.filter((n) => n.length > 100);
if (tooLong.length > 0) {
  console.error("Names longer than 100 chars:", tooLong);
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
  names,
  updatedAt: Date.now(),
};

const message = {};
if (args.messageSv) message.sv = args.messageSv;
if (args.messageEn) message.en = args.messageEn;
if (Object.keys(message).length > 0) payload.message = message;

console.log("Writing config/supporters:");
console.log(JSON.stringify(payload, null, 2));

// Ingen merge — listan ska vara exakt vad som skickas in, och en borttagen
// --messageSv ska inte spöka kvar från en tidigare körning.
await db.collection("config").doc("supporters").set(payload);

console.log(`✓ Done. ${names.length} supporter(s) saved.`);
process.exit(0);
