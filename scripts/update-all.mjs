#!/usr/bin/env node
/**
 * Publicerar en OTA-uppdatering till både `internal`- och `production`-
 * branches i följd. Körs via `npm run update:all -- --message "..."`.
 *
 * Varför båda? EAS-channel är bakad i varje AAB vid build-tid. Ett build
 * från `--profile internal` lyssnar på `internal`-branchen, ett build
 * från `--profile production` på `production`-branchen. Genom att alltid
 * publicera till båda når uppdateringen alla installerade varianter
 * (internt test, stängt test, och framtida produktion) med en kommandorad.
 *
 * Usage:
 *   npm run update:all -- --message "Beskrivning av ändringen"
 */

import { execSync } from "node:child_process";

const BRANCHES = ["internal", "production"];

// Plocka ut --message (resten ignoreras — låt EAS hantera eventuella övriga flaggor)
const argv = process.argv.slice(2);
const msgIdx = argv.indexOf("--message");
const message =
  msgIdx >= 0 && argv[msgIdx + 1] ? argv[msgIdx + 1] : "OTA update";

// Enkla säkerhetscheckar mot shell-injection — vi bygger kommandosträngen,
// så citattecken/backslash i meddelandet måste escapas innan de går in.
// Enklast: tillåt inte dubbla citattecken i message-argumentet, kasta om de finns.
if (message.includes('"')) {
  console.error(
    'Error: meddelandet får inte innehålla dubbla citattecken ("). Använd enkla citattecken eller parafrasera.'
  );
  process.exit(1);
}

for (const branch of BRANCHES) {
  console.log(`\n=== Publicerar till branch "${branch}" ===`);
  const cmd = `eas update --branch ${branch} --environment production --message "${message}" --non-interactive`;
  try {
    execSync(cmd, { stdio: "inherit" });
  } catch (e) {
    console.error(`\n❌ Publicering till "${branch}" misslyckades.`);
    process.exit(1);
  }
}

console.log("\n✅ Klar — uppdatering ute på båda branches.");
