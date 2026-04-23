/**
 * @file storage.ts
 * @description Lokal lagringstjänst för Tipspromenaden-appen.
 *
 * Hanterar all persistent lokal lagring med hjälp av `@react-native-async-storage/async-storage`.
 * Modulen är uppdelad i två delar:
 *
 * **Sparade promenader** – promenader som skaparen har sparat lokalt för
 * att kunna visas och delas offline utan att hämtas från Firebase varje gång.
 *
 * **Väntande synkningar** – svar från deltagare som registrerats offline
 * och ännu inte synkroniserats till Firebase. Dessa hanteras av `offlineSync.ts`.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { SavedWalk, Answer } from "../types";

/**
 * AsyncStorage-nyckeln för listan av sparade promenader. Exporterad
 * så att `walkRefresh.ts` kan skriva tillbaka cachen direkt utan att
 * gå via en wrapper — bakgrunds-refresh läser/skriver hela listan
 * atomärt och vill inte trigga ytterligare läsningar.
 */
export const SAVED_WALKS_KEY = "saved_walks";
const PENDING_SYNC_KEY = "pending_sync";
const MAP_TYPE_KEY = "map_type";

// ===== Karttyp (persistent användarpreferens) =====

/** Karttyp som användaren kan cykla mellan via MapTypeToggle-knappen. */
export type MapType = "standard" | "hybrid" | "terrain";

const VALID_MAP_TYPES: readonly MapType[] = ["standard", "hybrid", "terrain"];

/**
 * Läser användarens valda karttyp. Faller tillbaka till "standard" om
 * inget är sparat eller värdet är ogiltigt (skyddar mot kass data efter
 * migrering/manipulation).
 */
export async function getMapType(): Promise<MapType> {
  const data = await AsyncStorage.getItem(MAP_TYPE_KEY);
  return VALID_MAP_TYPES.includes(data as MapType) ? (data as MapType) : "standard";
}

/** Sparar karttypsval. Tyst no-op vid AsyncStorage-fel — preferensen är inte kritisk. */
export async function setMapType(type: MapType): Promise<void> {
  await AsyncStorage.setItem(MAP_TYPE_KEY, type);
}

// ===== Sparade promenader (offline-stöd) =====

/**
 * Sparar en promenad i den lokala AsyncStorage-listan.
 * Om en promenad med samma ID redan finns ersätts den (uppdatering).
 * Annars läggs den till i listan.
 *
 * @param savedWalk - Promenaden att spara, inklusive tidsstämpel och QR-data.
 * @returns En Promise som löses när promenaden har sparats.
 * @throws Kastar ett AsyncStorage-fel vid lagringsproblem (t.ex. fullt lagringsutrymme).
 *
 * @example
 * await saveWalkLocally({
 *   walk: myWalk,
 *   savedAt: Date.now(),
 *   qrData: createQRData(myWalk),
 * });
 */
export async function saveWalkLocally(savedWalk: SavedWalk): Promise<void> {
  const existing = await getSavedWalks();
  // Ersätt om den redan finns, annars lägg till
  const updated = existing.filter((w) => w.walk.id !== savedWalk.walk.id);
  updated.push(savedWalk);
  await AsyncStorage.setItem(SAVED_WALKS_KEY, JSON.stringify(updated));
}

/**
 * Hämtar alla lokalt sparade promenader från AsyncStorage.
 * Returnerar en tom array om inga promenader är sparade eller
 * om lagringen inte kan läsas.
 *
 * @returns En array med alla sparade promenader (kan vara tom).
 *
 * @example
 * const walks = await getSavedWalks();
 * console.log(`${walks.length} promenader sparade lokalt`);
 */
export async function getSavedWalks(): Promise<SavedWalk[]> {
  const data = await AsyncStorage.getItem(SAVED_WALKS_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Tar bort en lokalt sparad promenad från AsyncStorage.
 * Gör ingenting om promenaden med angivet ID inte finns.
 *
 * @param walkId - ID för promenaden som ska tas bort.
 * @returns En Promise som löses när promenaden har tagits bort.
 * @throws Kastar ett AsyncStorage-fel vid lagringsproblem.
 *
 * @example
 * await removeSavedWalk(walk.id);
 */
export async function removeSavedWalk(walkId: string): Promise<void> {
  const existing = await getSavedWalks();
  const updated = existing.filter((w) => w.walk.id !== walkId);
  await AsyncStorage.setItem(SAVED_WALKS_KEY, JSON.stringify(updated));
}

/**
 * Sätter eller rensar ett lokalt alias på en sparad promenad.
 * Används när användaren vill särskilja flera promenader med samma
 * titel (vanligt för delade event-promenader). Tom sträng eller null
 * rensar alias och återgår till walk.title.
 *
 * @param walkId - ID för promenaden som ska få nytt alias.
 * @param alias - Aliaset, eller null/tom sträng för att rensa.
 * @returns Det normaliserade aliaset (`undefined` om rensat) så att
 *   anroparen kan göra en optimistisk state-uppdatering utan att
 *   återimplementera trim-regeln.
 */
export async function setWalkAlias(
  walkId: string,
  alias: string | null
): Promise<string | undefined> {
  const existing = await getSavedWalks();
  const normalized = alias?.trim() || undefined;
  const updated = existing.map((w) =>
    w.walk.id === walkId ? { ...w, alias: normalized } : w
  );
  await AsyncStorage.setItem(SAVED_WALKS_KEY, JSON.stringify(updated));
  return normalized;
}

/**
 * Visningstitel för en sparad promenad — alias om satt, annars
 * walk.title. Centraliserar fallback-regeln så att olika UI:n inte
 * driftar isär.
 */
export function displayWalkTitle(sw: SavedWalk): string {
  return sw.alias?.trim() || sw.walk.title;
}

// ===== Pending sync (offline answers) =====

/**
 * Datastruktur för ett väntande synkjobb.
 * Sparas i AsyncStorage när en deltagare svarar på frågor offline
 * och ska synkas till Firebase när anslutning finns.
 */
export interface PendingSyncData {
  /** ID för sessionen som svaren tillhör. */
  sessionId: string;
  /** ID för deltagaren som svarat (Firebase UID eller anonymt ID). */
  participantId: string;
  /** Deltagarens visningsnamn. */
  participantName: string;
  /** ID för promenaden. */
  walkId: string;
  /** Deltagarens svar som ska synkas. */
  answers: Answer[];
  /** Deltagarens poäng (antal korrekta svar). */
  score: number;
  /** Unix-tidsstämpel för när deltagaren avslutade, om promenaden är klar. */
  completedAt?: number;
  /** Unix-tidsstämpel för när synkjobbet skapades (för felsökning). */
  timestamp: number;
}

/**
 * Sparar ett synkjobb i den lokala kön av väntande synkningar.
 * Om ett jobb med samma `sessionId` och `participantId` redan finns
 * ersätts det (den senaste versionen av svaren vinner).
 *
 * Anropas av `ActiveWalkScreen` när deltagaren svarar på en fråga
 * och Firebase-uppdateringen misslyckas på grund av offlineläge.
 *
 * @param data - Synkjobbet att köa.
 * @returns En Promise som löses när jobbet har sparats.
 * @throws Kastar ett AsyncStorage-fel vid lagringsproblem.
 *
 * @example
 * await savePendingSync({
 *   sessionId: session.id,
 *   participantId: user.uid,
 *   participantName: user.displayName ?? 'Anonym',
 *   walkId: walk.id,
 *   answers: currentAnswers,
 *   score: currentScore,
 *   completedAt: Date.now(),
 *   timestamp: Date.now(),
 * });
 */
export async function savePendingSync(data: PendingSyncData): Promise<void> {
  const existing = await getPendingSyncs();
  // Replace if same session+participant, otherwise add
  const updated = existing.filter(
    (p) =>
      !(p.sessionId === data.sessionId && p.participantId === data.participantId)
  );
  updated.push(data);
  await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(updated));
}

/**
 * Hämtar alla väntande synkjobb från AsyncStorage.
 * Används av `offlineSync.ts` för att iterera och synka mot Firebase.
 * Returnerar en tom array om inga jobb finns i kön.
 *
 * @returns En array med alla väntande synkjobb (kan vara tom).
 *
 * @example
 * const pending = await getPendingSyncs();
 * console.log(`${pending.length} svar väntar på synkning`);
 */
export async function getPendingSyncs(): Promise<PendingSyncData[]> {
  const data = await AsyncStorage.getItem(PENDING_SYNC_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Tar bort ett specifikt synkjobb från kön efter lyckad synkronisering.
 * Matchar på kombinationen `sessionId` + `participantId`.
 *
 * @param sessionId - Sessions-ID för jobbet som ska tas bort.
 * @param participantId - Deltagar-ID för jobbet som ska tas bort.
 * @returns En Promise som löses när jobbet har tagits bort.
 * @throws Kastar ett AsyncStorage-fel vid lagringsproblem.
 *
 * @example
 * // I offlineSync.ts efter lyckad Firebase-uppdatering:
 * await removePendingSync(data.sessionId, data.participantId);
 */
export async function removePendingSync(
  sessionId: string,
  participantId: string
): Promise<void> {
  const existing = await getPendingSyncs();
  const updated = existing.filter(
    (p) =>
      !(p.sessionId === sessionId && p.participantId === participantId)
  );
  await AsyncStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(updated));
}

/**
 * Tömmer hela kön av väntande synkjobb.
 * Används vid felsökning eller när en session avslutas och
 * all lokal data ska rensas.
 *
 * @returns En Promise som löses när kön har tömts.
 * @throws Kastar ett AsyncStorage-fel vid lagringsproblem.
 *
 * @example
 * // Rensa alla väntande synkningar:
 * await clearPendingSyncs();
 */
export async function clearPendingSyncs(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_SYNC_KEY);
}
