/**
 * @file offlineSync.ts
 * @description Offline-synkroniseringstjänst för Tipspromenaden-appen.
 *
 * Hanterar scenariot där en deltagare svarar på frågor utan internetanslutning.
 * Svaren sparas lokalt via `storage.ts` och synkroniseras automatiskt mot
 * Firebase Firestore när anslutningen återställs.
 *
 * Tjänsten erbjuder:
 * - En engångssynkronisering (`syncPendingData`) som kan anropas manuellt.
 * - En bakgrundsloop (`startBackgroundSync`) som kontrollerar och synkar periodiskt.
 *
 * Nätverksstatusen kontrolleras plattformsanpassat: `navigator.onLine` på webben
 * och ett faktiskt HEAD-anrop mot Google på nativa plattformar.
 */

import { getPendingSyncs, removePendingSync, PendingSyncData } from "./storage";
import { updateParticipant } from "./firestore";
import { Participant } from "../types";
import { Platform } from "react-native";

/**
 * Intern hjälpfunktion som kontrollerar om enheten har internetanslutning.
 * På webben används `navigator.onLine`. På nativa plattformar (iOS/Android)
 * skickas ett HEAD-anrop mot Google för att verifiera faktisk anslutning.
 *
 * @returns `true` om enheten verkar ha internetanslutning, annars `false`.
 */
async function isOnline(): Promise<boolean> {
  // On web, use navigator.onLine
  if (Platform.OS === "web") {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  }
  // On native, try a simple approach
  try {
    const response = await fetch("https://clients3.google.com/generate_204", {
      method: "HEAD",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Försöker synkronisera alla väntande offline-svar till Firebase.
 * Hämtar alla poster från den lokala kön, försöker uppdatera varje deltagare
 * i Firestore och tar bort posten från kön vid lyckat resultat.
 * Misslyckade poster lämnas kvar och försöks igen nästa gång.
 *
 * Gör ingenting och returnerar noll-räknare om enheten är offline.
 *
 * @returns Ett objekt med räknare för lyckade (`synced`) och misslyckade (`failed`) synkningar.
 *
 * @example
 * const result = await syncPendingData();
 * if (result.synced > 0) {
 *   console.log(`${result.synced} svar synkades till Firebase`);
 * }
 * if (result.failed > 0) {
 *   console.warn(`${result.failed} svar kunde inte synkas`);
 * }
 */
export async function syncPendingData(): Promise<{
  synced: number;
  failed: number;
}> {
  const online = await isOnline();
  if (!online) return { synced: 0, failed: 0 };

  const pending = await getPendingSyncs();
  let synced = 0;
  let failed = 0;

  for (const data of pending) {
    try {
      const participant: Participant = {
        id: data.participantId,
        name: data.participantName,
        answers: data.answers,
        score: data.score,
        completedAt: data.completedAt,
        ...(typeof data.steps === "number" ? { steps: data.steps } : {}),
      };

      await updateParticipant(data.sessionId, participant);
      await removePendingSync(data.sessionId, data.participantId);
      synced++;
    } catch (e) {
      console.log("Sync failed for", data.sessionId, e);
      failed++;
    }
  }

  return { synced, failed };
}

/** Intern referens till det aktiva bakgrundsintervallet, eller `null` om det inte körs. */
let syncInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Startar en bakgrundsloop som periodiskt synkroniserar väntande offline-svar.
 * Anropar även `syncPendingData` omedelbart vid start.
 * Gör ingenting om loopen redan är igång (förhindrar dubbla intervall).
 *
 * Stoppa loopen med `stopBackgroundSync` när komponenten avmonteras
 * eller när appen går till bakgrunden.
 *
 * @param intervalMs - Intervall i millisekunder mellan synkförsök. Standardvärde: 30 000 ms (30 s).
 *
 * @example
 * // Starta synkning när appen laddas:
 * startBackgroundSync(60000); // Synka var 60:e sekund
 *
 * // Stoppa vid cleanup:
 * stopBackgroundSync();
 */
export function startBackgroundSync(intervalMs: number = 30000): void {
  if (syncInterval) return;

  syncInterval = setInterval(async () => {
    const result = await syncPendingData();
    if (result.synced > 0) {
      console.log(`Synkade ${result.synced} väntande uppdateringar`);
    }
  }, intervalMs);

  // Also sync immediately
  syncPendingData();
}

/**
 * Stoppar bakgrundssynkloopen som startades av `startBackgroundSync`.
 * Rensar intervallet och nollställer den interna referensen.
 * Säker att anropa även om loopen inte är igång.
 *
 * @example
 * // I en React useEffect cleanup:
 * useEffect(() => {
 *   startBackgroundSync();
 *   return () => stopBackgroundSync();
 * }, []);
 */
export function stopBackgroundSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
