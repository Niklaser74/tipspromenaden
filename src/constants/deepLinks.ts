/**
 * @file deepLinks.ts
 * @description Centrala konstanter för appens deep link-format.
 *
 * Två format stödjs parallellt:
 *   1. **Universal/App Link** — `https://tipspromenaden.app/walk/<id>`.
 *      Detta är primärformatet sedan v1.3.0 — klickbart i Messenger/SMS,
 *      auto-öppnar appen via Android App Links (verifierat via
 *      assetlinks.json). Genereras av buildWalkLink().
 *   2. **Custom scheme** — `tipspromenaden://walk/<id>`. Bevaras för
 *      bakåtkompat med redan delade länkar och accepteras fortfarande
 *      av parseQRData() i utils/qr.ts.
 *
 * Båda routar in i `OpenWalkScreen` via App.tsx > linking.prefixes.
 */

/** Appens custom scheme, registrerat i `app.config.js > scheme`. */
export const APP_SCHEME = "tipspromenaden";

/** Webb-host för universal/App Links (assetlinks.json publicerad där). */
export const WEB_HOST = "tipspromenaden.app";

/** Path-prefix för att öppna en promenad via dess walkId. */
export const WALK_PATH = "walk";

/**
 * Path-prefix för att öppna ett `.tipspack`-batteri via dess slug.
 *
 * Format: `tipspromenaden://tipspack/<slug>` — appen hämtar då filen från
 * `https://tipspromenaden.app/tipspack/<slug>.tipspack`, validerar och
 * navigerar till CreateWalk med batteriet förladdat. Användaren behöver
 * inte ladda ner filen separat. Tillagt i v1.4.0.
 *
 * Vi använder ENDAST custom-scheme för det här flödet, INTE App Links.
 * Skälet: `https://tipspromenaden.app/tipspack/<slug>.tipspack` serverar
 * JSON-filen direkt på webben — vi vill inte att appen ska intercepta
 * den URL:en (det skulle bryta nedladdning från webbsidan). Webbsidan
 * /tipspack genererar custom-scheme-länken i sin "Öppna i appen"-knapp.
 */
export const TIPSPACK_PATH = "tipspack";

/**
 * Bygger en delningsbar länk till en specifik promenad.
 *
 * Använder https-formatet sedan v1.3.0 — länken är klickbar i alla
 * meddelandeappar och auto-öppnar appen om den är installerad (Android
 * App Links efter assetlinks.json-verifiering). Om appen inte är
 * installerad öppnas tipspromenaden.app/walk/<id> i webbläsaren, där
 * 404.astro-fallbacken på webbsidan föreslår Play Store-installation.
 *
 * Mottagare med appen landar i `OpenWalkScreen` (se `App.tsx > linking`).
 */
export function buildWalkLink(walkId: string): string {
  return `https://${WEB_HOST}/${WALK_PATH}/${encodeURIComponent(walkId)}`;
}
