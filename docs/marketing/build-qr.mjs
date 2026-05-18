// Genererar QR-koden som flygblads-/social-generatorerna bäddar in.
//
// Pekar på https://tipspromenaden.app/get-app — en smart-redirect som
// skickar Android → Google Play, iPhone → /stod, desktop → val. Att låta
// QR:n peka på /get-app (inte direkt på Play) gör att samma QR funkar
// oavsett OS OCH att vi kan ändra destinationen utan att trycka om
// flygblad.
//
// Filnamnet `qr-bli-testare.png` behålls för att inte röra de fyra
// layout-scripten som refererar det vid namn — innehållet är nu en
// nedladdnings-QR, inte en testpilot-värvnings-QR. (Fullständig
// copy/layout-omskrivning är en separat ROADMAP-punkt.)
//
// Kör: node docs/marketing/build-qr.mjs
import QRCode from "qrcode";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET = "https://tipspromenaden.app/get-app";
const OUT = path.join(__dirname, "qr-bli-testare.png");

await QRCode.toFile(OUT, TARGET, {
  width: 600,
  margin: 2,
  errorCorrectionLevel: "H", // tål tryck-slitage / logotyp-overlay
  color: { dark: "#000000", light: "#FFFFFF" }, // svart/vit = bäst scan
});

console.log(`✓ ${OUT}\n  → ${TARGET}`);
