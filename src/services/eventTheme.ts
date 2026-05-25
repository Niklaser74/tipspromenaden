/**
 * @file eventTheme.ts
 * @description Service-lager för event-läge (branded customization).
 *
 * Ett "event" är en sponsorad anpassning av appen (t.ex. Scania Family Day):
 * egen logo, färgpalett, filtrerat bibliotek och välkomsttext. Användaren
 * aktiverar ett event genom att skanna en QR-kod (`tipspromenaden://event/<id>`)
 * eller mata in event-koden manuellt i Settings.
 *
 * Datakälla: Firestore-kollektion `events/{id}` (publik läsning, admin-
 * skriv via webbens /admin-flik). Aktivt event-id persistas i AsyncStorage
 * så att appen öppnas direkt i event-läge tills användaren stänger av det
 * eller `endDate` passerar.
 *
 * Inga React-beroenden här — context:en (`EventThemeContext`) konsumerar
 * dessa funktioner.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { EventBranding } from "../types";

const ACTIVE_EVENT_KEY = "active_event_v1";
const EVENT_CACHE_PREFIX = "event_cache_v1:";
const EVENTS_COLLECTION = "events";

/**
 * Validering av event-id. Samma policy som tipspack-slug: bara säkra
 * URL-tecken, max 100 tecken. Skyddar mot konstig input från QR-skanning.
 */
export function isValidEventId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id) && id.length > 0 && id.length <= 100;
}

/**
 * Hämtar event-doc:en från Firestore. Kastar om id är ogiltigt eller
 * doc:en inte finns. Cachas i AsyncStorage så att vi kan starta appen
 * i event-läge även offline.
 */
export async function fetchEvent(id: string): Promise<EventBranding> {
  if (!isValidEventId(id)) {
    throw new Error(`Ogiltig event-kod: "${id}"`);
  }
  const snap = await getDoc(doc(db, EVENTS_COLLECTION, id));
  if (!snap.exists()) {
    throw new Error(`Event "${id}" finns inte`);
  }
  const data = snap.data() as Omit<EventBranding, "id">;
  const event: EventBranding = { id, ...data };
  // Cacha för offline-uppstart
  try {
    await AsyncStorage.setItem(EVENT_CACHE_PREFIX + id, JSON.stringify(event));
  } catch {
    // ignorera cache-fel
  }
  return event;
}

/**
 * Läser cachad event-doc från AsyncStorage. Används när appen startar
 * och inte kan nå nätet — vi vill ändå rendera i event-läge.
 */
async function readCachedEvent(id: string): Promise<EventBranding | null> {
  try {
    const raw = await AsyncStorage.getItem(EVENT_CACHE_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as EventBranding;
  } catch {
    return null;
  }
}

/**
 * Sätter ett event som aktivt. Hämtar färsk doc från Firestore + cachar.
 * Vid offline används cachen om den finns; annars kastas felet vidare.
 */
export async function activateEvent(id: string): Promise<EventBranding> {
  let event: EventBranding;
  try {
    event = await fetchEvent(id);
  } catch (err) {
    // Försök falla tillbaka på cache vid offline
    const cached = await readCachedEvent(id);
    if (cached) {
      event = cached;
    } else {
      throw err;
    }
  }
  await AsyncStorage.setItem(ACTIVE_EVENT_KEY, id);
  return event;
}

/** Avaktiverar event-läget. */
export async function deactivateEvent(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_EVENT_KEY);
}

/**
 * Läser id för det aktiva eventet, om något. Returnerar null om
 * inget event är aktivt eller om läsning från AsyncStorage misslyckas.
 */
export async function getActiveEventId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_EVENT_KEY);
  } catch {
    return null;
  }
}

/**
 * Hydrerar det aktiva eventet vid app-start. Returnerar null om inget
 * är aktivt. Försöker först cache (snabb start), refresh:ar sedan från
 * Firestore i bakgrunden via `fetchEvent` om nätet är tillgängligt.
 *
 * Auto-avaktiverar om `endDate` har passerat (klient-side, best-effort —
 * vi gör inte detta server-side eftersom event:et kan vara "evigt").
 */
export async function hydrateActiveEvent(): Promise<EventBranding | null> {
  const id = await getActiveEventId();
  if (!id) return null;

  // Snabb start från cache
  const cached = await readCachedEvent(id);

  // Auto-expire baserat på endDate i cachad version
  if (cached?.endDate) {
    const end = new Date(cached.endDate);
    if (!Number.isNaN(end.getTime()) && end.getTime() < Date.now()) {
      await deactivateEvent();
      return null;
    }
  }

  // Försök refresha från Firestore (best-effort)
  try {
    const fresh = await fetchEvent(id);
    // Auto-expire post-refresh också
    if (fresh.endDate) {
      const end = new Date(fresh.endDate);
      if (!Number.isNaN(end.getTime()) && end.getTime() < Date.now()) {
        await deactivateEvent();
        return null;
      }
    }
    return fresh;
  } catch {
    // Offline / fel — använd cache om den finns
    return cached;
  }
}
