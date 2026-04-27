// Bygger en 2-up A4-version av flygbladet — två identiska A5:or sida vid
// sida på A4 landscape, redo att printa på en A4 och klippas i mitten.
// Källa: flygblad-tipspromenaden.pdf (måste vara byggd först).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PT_PER_MM = 72 / 25.4;
const A4_W = 297 * PT_PER_MM; // landscape
const A4_H = 210 * PT_PER_MM;
const A5_W = 148 * PT_PER_MM; // portrait
const A5_H = 210 * PT_PER_MM;

const srcBytes = fs.readFileSync(path.join(__dirname, "flygblad-tipspromenaden.pdf"));
const out = await PDFDocument.create();
const src = await PDFDocument.load(srcBytes);
const [embedded] = await out.embedPdf(src, [0]);

const page = out.addPage([A4_W, A4_H]);
const yOffset = (A4_H - A5_H) / 2;            // centra vertikalt
const xLeft = (A4_W / 2 - A5_W) / 2;           // centra vänster halva
const xRight = A4_W / 2 + (A4_W / 2 - A5_W) / 2; // centra höger halva

page.drawPage(embedded, { x: xLeft,  y: yOffset, width: A5_W, height: A5_H });
page.drawPage(embedded, { x: xRight, y: yOffset, width: A5_W, height: A5_H });

// Tunn skärlinje i mitten — diskret prickad linje gör det lätt att se
// var man ska klippa, utan att det syns på det färdiga flygbladet eftersom
// linjen ligger i marginalen mellan dem.
page.drawLine({
  start: { x: A4_W / 2, y: yOffset + 4 },
  end:   { x: A4_W / 2, y: yOffset + A5_H - 4 },
  thickness: 0.3,
  opacity: 0.25,
  dashArray: [3, 3],
});

const outPath = path.join(__dirname, "flygblad-tipspromenaden-2up.pdf");
fs.writeFileSync(outPath, await out.save());
console.log("OK:", outPath);
