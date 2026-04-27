// Renderar valda PDF-sidor till PNG för snabb preview/verifiering.
// Användning: node preview-pdf.mjs <input.pdf> <out-prefix>
//   skapar <out-prefix>-page1.png, -page2.png ...
import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const [, , input, prefix] = process.argv;
if (!input || !prefix) {
  console.error("usage: node preview-pdf.mjs <pdf> <out-prefix>");
  process.exit(1);
}

const data = new Uint8Array(fs.readFileSync(input));
const pdf = await pdfjsLib.getDocument({ data, disableFontFace: true }).promise;

for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const viewport = page.getViewport({ scale: 3 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const out = `${prefix}-page${i}.png`;
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log("OK:", out);
}
