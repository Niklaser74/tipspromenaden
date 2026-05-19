/**
 * @file mapTileCache.ts
 * @description För-cachar kart-tiles (OpenTopoMap) lokalt så att
 *   terräng­kartan fungerar offline ute i skogen där täckningen är svag.
 *
 * `react-native-maps` `UrlTile` har en inbyggd disk-cache: sätter man
 * `tileCachePath` lagras hämtade tiles som `{path}/{z}/{x}/{y}` (filnamn
 * = y-koordinaten, UTAN filändelse) och med `offlineMode` läses de
 * tillbaka utan nät. Vi skriver för-cachade tiles i EXAKT samma schema
 * så att den inbyggda offline-läsningen hittar dem.
 *
 * `prefetchWalkTiles()` triggas best-effort från `saveWalkLocally()`
 * (precis som `questionImageCache.cacheWalkImages`). Misslyckas en
 * nedladdning gör det inget — kartan funkar online ändå och nästa save
 * försöker igen. Cachen är coordinate-addresserad och DELAS mellan alla
 * sparade promenader; därför finns ingen per-walk-radering (en tile kan
 * behövas av flera walks). `tileCacheMaxAge` på `UrlTile` + den globala
 * `clearAllMapTiles()` sköter städningen.
 *
 * Källan (OpenTopoMap) är samma som terräng-`UrlTile` i MapViewWeb —
 * måste hållas i synk så för-cachade tiles motsvarar dem kartan annars
 * skulle hämta. Attribution sker via `<MapAttribution>` (CC-BY-SA).
 */
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { Walk } from "../types";
import { walkBounds } from "../utils/walkGeo";

// Samma tile-server som terräng-overlayen i MapViewWeb. Byt på BÅDA
// ställena samtidigt om källan ändras.
const TILE_BASE = "https://a.tile.opentopomap.org";

const TILE_CACHE_DIR =
  Platform.OS === "web"
    ? null
    : `${FileSystem.documentDirectory}cache/map-tiles/`;

// Zoom-spann att för-cacha. ActiveWalk ligger normalt runt z15; spelare
// zoomar in till 16–17. OpenTopoMap har maxZoom 17. Lägre zoom (13–14)
// ger överblick + fungerar som fallback (offlineMode skalar upp en lägre
// zoom-tile om den exakta saknas, upp till 4 nivåer).
const MIN_Z = 13;
const MAX_Z = 17;

// ~250 m marginal runt bounding-boxen så rutten MELLAN kontrollerna och
// kanterna täcks, inte bara punkterna.
const PADDING_DEG = 0.0025;

// Hård tak-gräns: en patologiskt stor walk ska inte dra ner tusentals
// tiles. ~480 OpenTopoMap-tiles ≈ 10–15 MB i värsta fall; en normal
// 1–3 km-promenad landar på några dussin.
const MAX_TILES = 480;

// Skonsam mot OpenTopoMap (rate-limitad community-server): några i taget.
const CONCURRENCY = 6;

function lon2tileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}

function lat2tileY(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 -
      Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
      2) *
      Math.pow(2, z)
  );
}

/**
 * Katalogen som ska skickas till `UrlTile.tileCachePath`. Null på web
 * (ingen native tile-cache där — Leaflet använder browserns HTTP-cache).
 */
export function tileCacheDir(): string | null {
  return TILE_CACHE_DIR;
}

async function ensureDir(dir: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Ladda ned terräng-tiles som täcker promenadens område i bakgrunden.
 * Säker att kalla flera gånger — befintliga tiles hoppas över.
 * Best-effort: enskilda fel rapporteras inte.
 */
export async function prefetchWalkTiles(walk: Walk): Promise<void> {
  if (!TILE_CACHE_DIR) return;
  const bounds = walkBounds(walk);
  if (!bounds) return;
  if (!(await ensureDir(TILE_CACHE_DIR))) return;

  const minLat = bounds.minLat - PADDING_DEG;
  const maxLat = bounds.maxLat + PADDING_DEG;
  const minLng = bounds.minLng - PADDING_DEG;
  const maxLng = bounds.maxLng + PADDING_DEG;

  // Bygg hela listan {z,x,y}, börja på hög zoom (mest värdefull på plats)
  // och sluta vid taket så ett gigantiskt bbox ändå ger användbar cache.
  const tiles: { z: number; x: number; y: number }[] = [];
  outer: for (let z = MAX_Z; z >= MIN_Z; z--) {
    const x0 = lon2tileX(minLng, z);
    const x1 = lon2tileX(maxLng, z);
    // OBS: y växer söderut, så maxLat ger lägsta y.
    const y0 = lat2tileY(maxLat, z);
    const y1 = lat2tileY(minLat, z);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (tiles.length >= MAX_TILES) break outer;
        tiles.push({ z, x, y });
      }
    }
  }

  // Batcha så vi inte spammar OpenTopoMap med hundratals parallella anrop.
  for (let i = 0; i < tiles.length; i += CONCURRENCY) {
    const batch = tiles.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async ({ z, x, y }) => {
        // react-native-maps-schema: {path}/{z}/{x}/{y} utan filändelse.
        const dir = `${TILE_CACHE_DIR}${z}/${x}/`;
        const dest = `${dir}${y}`;
        try {
          const info = await FileSystem.getInfoAsync(dest);
          if (info.exists) return;
          if (!(await ensureDir(dir))) return;
          await FileSystem.downloadAsync(
            `${TILE_BASE}/${z}/${x}/${y}.png`,
            dest
          );
        } catch {
          // Tyst fail — online fungerar ändå, nästa save försöker igen.
        }
      })
    );
  }
}

/**
 * Rensar hela tile-cachen. Exporteras för en framtida
 * "Frigör utrymme"-knapp i Inställningar. Anropas inte automatiskt —
 * cachen delas mellan walks och `tileCacheMaxAge` sköter färskhet.
 */
export async function clearAllMapTiles(): Promise<void> {
  if (!TILE_CACHE_DIR) return;
  try {
    const info = await FileSystem.getInfoAsync(TILE_CACHE_DIR);
    if (!info.exists) return;
    await FileSystem.deleteAsync(TILE_CACHE_DIR, { idempotent: true });
  } catch {
    // Tyst fail
  }
}
