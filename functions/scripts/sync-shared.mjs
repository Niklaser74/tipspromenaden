/**
 * Kopierar delade, plattformsfria TS-filer från app-repots src/ in i
 * functions/src/shared/ före varje build. Samma regel som mellan app och
 * webb: filerna ska vara byte-för-byte identiska, och genom att kopiera
 * automatiskt kan den här tredje kopian aldrig glida isär.
 *
 * Målmappen är gitignorerad — sanningen bor i app-repots src/.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = join(here, "..", "..", "src");
const target = join(here, "..", "src", "shared");

const FILES = [["services/tipspackValidator.ts", "tipspackValidator.ts"]];

mkdirSync(target, { recursive: true });
for (const [from, to] of FILES) {
  copyFileSync(join(appSrc, from), join(target, to));
  console.log(`sync-shared: ${from} -> src/shared/${to}`);
}
