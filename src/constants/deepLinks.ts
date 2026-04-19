/**
 * @file deepLinks.ts
 * @description Centrala konstanter för appens deep link-format.
 *
 * Byts ut mot `https://tipspromenaden.se` + universal links när sajten är
 * live — då måste uppdateringen bara göras här, inte i varje screen.
 */

/** Appens custom scheme, registrerat i `app.config.js > scheme`. */
export const APP_SCHEME = "tipspromenaden";

/** Path-prefix för att öppna en promenad via dess walkId. */
export const WALK_PATH = "walk";

/**
 * Bygger en delningsbar länk till en specifik promenad.
 * Mottagare med appen landar i `OpenWalkScreen` (se `App.tsx > linking`).
 */
export function buildWalkLink(walkId: string): string {
  return `${APP_SCHEME}://${WALK_PATH}/${encodeURIComponent(walkId)}`;
}
