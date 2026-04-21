/**
 * @file walkSync.ts
 * @description Synk av *egna* promenader från Firestore till lokal AsyncStorage.
 *
 * Hemskärmen visar promenader från den lokala listan (SavedWalk i
 * AsyncStorage). Vid nyinstallation, byte av telefon eller när
 * appdata rensas är den listan tom — men användarens promenader
 * ligger kvar i Firestore under `createdBy == uid`. Utan en pull
 * från molnet ser hemskärmen därmed tom ut trots att datan finns.
 *
 * Denna modul kör en "merge"-synk:
 *   - Hämtar alla walks i Firestore där createdBy = inloggad uid
 *   - Slår ihop med befintlig lokal lista (behåller alias + savedAt
 *     för promenader som redan fanns lokalt)
 *   - Lägger till nya lokala rader för promenader som bara fanns i
 *     molnet, med genererad qrData via createQRData()
 *
 * Inga borttag sker — om användaren har en lokal kopia av en annans
 * delade promenad (t.ex. QR-scannad) lämnas den ifred även om den
 * inte tillhör inloggad användare.
 */

import { getMyWalks } from "./firestore";
import { getSavedWalks, saveWalkLocally } from "./storage";
import { createQRData } from "../utils/qr";
import { SavedWalk } from "../types";

/**
 * Hämtar alla egna promenader från Firestore och mergar dem till
 * den lokala SavedWalk-listan. Säker att köra upprepade gånger.
 *
 * @param userId Firebase UID för inloggad användare.
 * @returns Antalet nya promenader som lades till lokalt (0 om inget
 *   nytt). Om användaren redan har allt i cache returneras 0.
 */
export async function syncMyWalksFromCloud(userId: string): Promise<number> {
  const [cloudWalks, savedLocally] = await Promise.all([
    getMyWalks(userId),
    getSavedWalks(),
  ]);

  const existingIds = new Set(savedLocally.map((sw) => sw.walk.id));
  const newOnes = cloudWalks.filter((w) => !existingIds.has(w.id));

  if (newOnes.length === 0) return 0;

  // saveWalkLocally hanterar en i taget — skriv en ny list-skrivning per
  // promenad. Det är lite overkill vid 20+ nya promenader men gör koden
  // okomplicerad och förhindrar race mellan denna synk och andra skrivare.
  for (const walk of newOnes) {
    const savedWalk: SavedWalk = {
      walk,
      savedAt: Date.now(),
      qrData: createQRData(walk),
    };
    await saveWalkLocally(savedWalk);
  }

  return newOnes.length;
}
