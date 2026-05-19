/**
 * @file walkGeo.ts
 * @description Geografiska hjälpfunktioner som opererar på hela
 *   `Walk`-objekt — till skillnad från `location.ts` som är generell.
 *
 *   Används främst av HomeScreen för "Närmast"-sortering: en promenad
 *   har inte en egen koordinat lagrad, utan summeras av alla sina
 *   kontrollpunkters koordinater.
 */

import { Walk } from "../types";
import { getDistanceInMeters } from "./location";

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Plockar ut alla giltiga, placerade kontrollkoordinater ur en walk.
 *
 * Hoppar över koordinater som är `(0, 0)` — appen använder dem som
 * sentinel för "ej placerad" (Atlanten är inte intressant) och de skulle
 * annars dra centroid/bounds mot havet för halvfärdiga walks.
 */
function validCoords(walk: Walk): LatLng[] {
  return (walk.questions || [])
    .map((q) => q.coordinate)
    .filter(
      (c): c is LatLng =>
        !!c &&
        typeof c.latitude === "number" &&
        typeof c.longitude === "number" &&
        Number.isFinite(c.latitude) &&
        Number.isFinite(c.longitude) &&
        !(c.latitude === 0 && c.longitude === 0)
    );
}

/**
 * Räknar ut centrum-koordinaten för en promenad genom att ta medelvärdet
 * av alla frågors koordinater. Medelvärde är ok för sortering; exakt
 * geografisk centroid på en sfär är overkill här eftersom promenaderna
 * sträcker sig över hundratals meter, inte grader.
 *
 * Returnerar null om promenaden saknar giltiga placerade koordinater.
 */
export function walkCentroid(walk: Walk): LatLng | null {
  const coords = validCoords(walk);
  if (coords.length === 0) return null;

  const sum = coords.reduce(
    (acc, c) => {
      acc.latitude += c.latitude;
      acc.longitude += c.longitude;
      return acc;
    },
    { latitude: 0, longitude: 0 }
  );
  return {
    latitude: sum.latitude / coords.length,
    longitude: sum.longitude / coords.length,
  };
}

/**
 * Avstånd i meter från en given användarposition till en promenads centrum.
 * Returnerar `Infinity` om promenaden saknar koordinater så att den sorteras
 * sist i "Närmast"-listan utan att behöva specialfall i anroparen.
 */
export function distanceToWalk(user: LatLng, walk: Walk): number {
  const c = walkCentroid(walk);
  if (!c) return Infinity;
  return getDistanceInMeters(
    user.latitude,
    user.longitude,
    c.latitude,
    c.longitude
  );
}

export interface LatLngBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Omslutande box (min/max lat+lng) för alla placerade kontrollpunkter.
 * Används av `mapTileCache` för att veta vilket geografiskt område som
 * ska för-cachas så kartan funkar offline på plats.
 *
 * Returnerar null om promenaden saknar giltiga placerade koordinater.
 */
export function walkBounds(walk: Walk): LatLngBounds | null {
  const coords = validCoords(walk);
  if (coords.length === 0) return null;
  return coords.reduce<LatLngBounds>(
    (b, c) => ({
      minLat: Math.min(b.minLat, c.latitude),
      maxLat: Math.max(b.maxLat, c.latitude),
      minLng: Math.min(b.minLng, c.longitude),
      maxLng: Math.max(b.maxLng, c.longitude),
    }),
    {
      minLat: coords[0].latitude,
      maxLat: coords[0].latitude,
      minLng: coords[0].longitude,
      maxLng: coords[0].longitude,
    }
  );
}
