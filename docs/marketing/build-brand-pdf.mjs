/**
 * @file build-brand-pdf.mjs
 * @description Bygger BRAND.pdf från BRAND.md i Friluft Folio-stil.
 *
 * Pipeline:
 *   1. Läs BRAND.md, rendera till HTML med `marked`
 *   2. Wrappa i en HTML-mall med brand-CSS (Lora + Instrument Sans
 *      från Google Fonts, cream/green-paletten, A4-print-CSS)
 *   3. Spara som _brand-build/brand.html (cacheas, ignored av git)
 *   4. Spawna headless Chrome med --print-to-pdf → BRAND.pdf
 *
 * Användning:
 *   cd tipspromenaden-app/docs/marketing
 *   npm install --no-save marked   # om inte redan installerat
 *   node build-brand-pdf.mjs
 *
 * Beroenden: `marked` (npm) + Chrome installerad i standard-path.
 * Sökvägar för Chrome är hårdkodade till Windows; anpassa
 * CHROME_CANDIDATES för andra OS.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(join(__dirname, "BRAND.md"), "utf8");
const bodyHtml = marked.parse(md, { mangle: false, headerIds: true });

const html = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>Tipspromenaden — Brand Guidelines</title>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --cream: #F5F0E8;
    --green: #1B6B35;
    --green-dark: #1B3D2B;
    --text-warm: #2C3E2D;
    --sage: #8A9A8D;
    --rule: #D9D2C2;
    --yellow: #E8B830;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--cream);
    color: var(--text-warm);
    font-family: "Instrument Sans", system-ui, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
  }
  .page { max-width: 720px; margin: 0 auto; padding: 56px 64px; }
  h1, h2, h3, h4 {
    font-family: "Lora", Georgia, serif;
    color: var(--green-dark);
    line-height: 1.2;
    page-break-after: avoid;
  }
  h1 { font-size: 28pt; font-weight: 700; margin: 0 0 8px; color: var(--green); }
  h2 { font-size: 18pt; font-weight: 600; margin: 32px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--rule); }
  h3 { font-size: 13pt; font-weight: 600; margin: 22px 0 8px; }
  h4 { font-size: 11pt; font-weight: 600; margin: 18px 0 6px; }
  hr { border: 0; border-top: 1px solid var(--rule); margin: 28px 0; }
  blockquote {
    border-left: 3px solid var(--green);
    background: rgba(27, 107, 53, 0.04);
    margin: 14px 0;
    padding: 10px 16px;
    color: var(--green-dark);
    font-style: italic;
  }
  blockquote p { margin: 0; }
  ul, ol { padding-left: 22px; }
  li { margin: 4px 0; }
  code {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 9pt;
    background: rgba(27, 61, 43, 0.06);
    padding: 1px 5px;
    border-radius: 3px;
    color: var(--green-dark);
  }
  pre code {
    display: block;
    padding: 10px 12px;
    background: white;
    border: 1px solid var(--rule);
    border-radius: 6px;
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid var(--rule);
    padding: 6px 10px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: rgba(27, 107, 53, 0.06);
    color: var(--green-dark);
    font-weight: 600;
  }
  a { color: var(--green); text-decoration: none; }
  a:hover { text-decoration: underline; }
  strong { color: var(--green-dark); }
  em { font-style: italic; }
  .eyebrow {
    font-family: "Instrument Sans", sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 9pt;
    color: var(--sage);
    margin-bottom: 8px;
  }
  /* Print: A4 med små marginaler eftersom .page redan har padding */
  @page { size: A4; margin: 0; }
  @media print {
    body { background: var(--cream); }
    .page { padding: 24mm 22mm; max-width: none; }
    h2 { page-break-before: auto; }
  }
</style>
</head>
<body>
  <div class="page">
    <p class="eyebrow">Tipspromenaden · 2026-05-06</p>
    ${bodyHtml}
  </div>
</body>
</html>`;

const outDir = join(__dirname, "_brand-build");
mkdirSync(outDir, { recursive: true });
const htmlPath = join(outDir, "brand.html");
writeFileSync(htmlPath, html, "utf8");
console.log(`✓ HTML: ${htmlPath}`);

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

const fs = await import("node:fs");
const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error("Hittade ingen Chrome/Edge — printa HTML:en manuellt istället.");
  process.exit(1);
}

// Chrome headless kan inte skriva till godtyckliga sökvägar pga sandboxing
// — vi printar till %TEMP% och flyttar sedan resultatet.
const tmpDir = process.env.TEMP || process.env.TMP || "/tmp";
const tmpPdf = join(tmpDir, `tipspromenaden-brand-${Date.now()}.pdf`);
const finalPdf = join(__dirname, "BRAND.pdf");

await new Promise((resolve, reject) => {
  const args = [
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${tmpPdf}`,
    `file:///${htmlPath.replace(/\\/g, "/")}`,
  ];
  const proc = spawn(chrome, args, { stdio: ["ignore", "pipe", "pipe"] });
  proc.stderr.on("data", () => {}); // tysta USB- och webapp-warnings
  proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Chrome exit ${code}`))));
});

const { renameSync } = await import("node:fs");
renameSync(tmpPdf, finalPdf);
console.log(`✓ PDF: ${finalPdf}`);
