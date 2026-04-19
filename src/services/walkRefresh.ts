/**
 * @file walkRefresh.ts
 * @description Bakgrunds-refresh av sparade promenader.
 *
 * Promenader kan uppdateras av skaparen efter att andra har sparat
 * dem lokalt (via QR-scan). Utan refresh skulle deltagarna se gamla
 * frågor/positioner för alltid. Denna modul pollar Firestore vid
 * lämpliga tillfällen (startsidan fokus, innan promenad startar)
 * och uppdaterar den lokala cachen om något har ändrats.
 *
 * Throttling sker in-memory (`lastCheckedAt` per walkId) så att vi
 * slipper skriva tillbaka samma cache bara för att uppdatera
 * tidsstämpeln.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getWalk } from "./firestore";
import { getSavedWalks, SAVED_WALKS_KEY } from "./storage";
import { SavedWalk, Walk } from "../types";

const THROTTLE_MS = 60 * 1000;

/**
 * Per-walkId tidsstämpel för senaste Firestore-anrop. Persisteras inte
 * — efter en omstart börjar vi om, vilket är önskat (en färsk start
 * ska kolla efter uppdateringar).
 */
const lastCheckedAt = new Map<string, number>();

/**
 * Bedöm om två walks är innehållsmässigt lika. Föredrar `updatedAt`
 * när båda har det (snabb numerisk jämförelse). Saknas fältet på
 * någondera (cachad walk skapad innan fältet introducerades, eller
 * Firestore-dokument utan stamp) faller vi tillbaka på djup-jämförelse
 * via JSON.stringify — säkrare än att anta likhet.
 */
function walkContentEquals(a: Walk, b: Walk): boolean {
  if (a.updatedAt && b.updatedAt) return a.updatedAt === b.updatedAt;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Hämtar senaste versionen av en promenad från Firestore.
 * Returnerar den färska promenaden om den skiljer sig (och uppdaterar
 * cachen), annars `null`. Tyst vid offline/fel.
 */
export async function refreshSavedWalk(walkId: string): Promise<Walk | null> {
  try {
    const last = lastCheckedAt.get(walkId);
    if (last && Date.now() - last < THROTTLE_MS) return null;

    const saved = await getSavedWalks();
    const current = saved.find((w) => w.walk.id === walkId);
    if (!current) return null;

    const fresh = await getWalk(walkId);
    lastCheckedAt.set(walkId, Date.now());
    if (!fresh || walkContentEquals(current.walk, fresh)) return null;

    const updated = saved.map((w) =>
      w.walk.id === walkId ? { ...w, walk: fresh } : w
    );
    await AsyncStorage.setItem(SAVED_WALKS_KEY, JSON.stringify(updated));
    return fresh;
  } catch {
    return null;
  }
}

/**
 * Refresh:ar alla sparade promenader parallellt mot Firestore.
 * Läser AsyncStorage en gång, hämtar uppdateringar parallellt och
 * skriver tillbaka en gång om något ändrats.
 *
 * @returns Den uppdaterade listan om något ändrats, annars `null`.
 */
export async function refreshAllSavedWalks(): Promise<SavedWalk[] | null> {
  try {
    const saved = await getSavedWalks();
    const now = Date.now();

    const updates = await Promise.all(
      saved.map(async (sw) => {
        const last = lastCheckedAt.get(sw.walk.id);
        if (last && now - last < THROTTLE_MS) return null;
        try {
          const fresh = await getWalk(sw.walk.id);
          lastCheckedAt.set(sw.walk.id, Date.now());
          if (!fresh || walkContentEquals(sw.walk, fresh)) return null;
          return { id: sw.walk.id, walk: fresh };
        } catch {
          return null;
        }
      })
    );

    const changed = updates.filter((u): u is { id: string; walk: Walk } => u !== null);
    if (changed.length === 0) return null;

    const byId = new Map(changed.map((c) => [c.id, c.walk]));
    const next = saved.map((sw) =>
      byId.has(sw.walk.id) ? { ...sw, walk: byId.get(sw.walk.id)! } : sw
    );
    await AsyncStorage.setItem(SAVED_WALKS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}
