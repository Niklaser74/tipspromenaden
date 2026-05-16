#!/usr/bin/env node
/**
 * Pre-submit-gate för native AAB-releaser. Vägrar fortsätta om
 * `docs/play-store-listing.md` saknar en release-notes-post för den
 * version som står i `app.config.js`.
 *
 * Motsvarar OTA-gaten i `update-all.mjs` men för AAB-cykeln (som inte
 * går via update-all och därför tidigare saknade skydd — AAB 1.8.0
 * glömdes på grund av just detta).
 *
 * Körs automatiskt av `npm run submit:internal` / `submit:production`.
 * Bypass: sätt env SKIP_RELEASE_NOTES_CHECK=1.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.env.SKIP_RELEASE_NOTES_CHECK === "1") {
  console.log("⚠ preflight: release-notes-check överhoppad (SKIP_RELEASE_NOTES_CHECK=1)");
  process.exit(0);
}

const config = readFileSync(resolve(repoRoot, "app.config.js"), "utf8");
const versionMatch = config.match(/version:\s*"([^"]+)"/);
if (!versionMatch) {
  console.error("✗ preflight: hittade inget version-fält i app.config.js");
  process.exit(1);
}
const version = versionMatch[1];

const listing = readFileSync(
  resolve(repoRoot, "docs/play-store-listing.md"),
  "utf8"
);

// Posten skrivs som "### AAB <version>" (ev. med "(build N)" efter).
// Vi kräver att versionssträngen förekommer i en AAB-rubrik.
const hasEntry = new RegExp(
  `###\\s+AAB\\s+${version.replace(/\./g, "\\.")}\\b`
).test(listing);

if (!hasEntry) {
  console.error(
    `\n✗ preflight: ingen release-notes-post för AAB ${version} i docs/play-store-listing.md.\n` +
      `  Lägg till en "### AAB ${version} — ..."-rubrik med sv + en-noter\n` +
      `  ÖVERST i What's new-sektionen och committa innan submit.\n` +
      `  Bypass (om du verkligen menar det): SKIP_RELEASE_NOTES_CHECK=1\n`
  );
  process.exit(1);
}

console.log(`✓ preflight: release notes finns för AAB ${version}`);
process.exit(0);
