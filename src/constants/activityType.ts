/**
 * @file constants/activityType.ts
 * @description Konfiguration per aktivitetstyp (walk/bike).
 *
 * En walk är default — 15 m trigger-tröskel passar promenadtempo (folk
 * stannar nära kontrollpunkten). En bike-walk har 50 m trigger eftersom
 * cyklist sällan stannar exakt vid en koordinat och GPS-noise + fart
 * gör snäv tröskel oanvändbar. "Approaching"-tröskeln är dubbla
 * trigger — ger ~3 sekunders förvarning vid 30 km/h cykelfart, lagom
 * tid att förbereda sig på att stanna.
 */

import type { Walk } from "../types";

export type ActivityType = "walk" | "bike";

/** Default när Walk.activityType saknas (bakåtkompatibelt). */
export const DEFAULT_ACTIVITY_TYPE: ActivityType = "walk";

export interface ActivityConfig {
  /** Tröskel i meter för att låsa upp en kontrollpunkt. */
  triggerDistanceMeters: number;
  /**
   * Tröskel i meter för "närmar dig"-varning. När användaren går från
   * utanför detta avstånd till innanför ger vi en kort vibration som
   * heads-up — så de hinner stanna. Bara meningsfullt för bike där
   * man rör sig snabbt; sätts lika med trigger för walk så ingen
   * extra varning utlöses.
   */
  approachingDistanceMeters: number;
  /**
   * Map-zoom som default när skärmen öppnas. Större delta = mer
   * utzoomat. Bike behöver mer kontext eftersom rutterna är längre.
   */
  initialLatitudeDelta: number;
  /** Emoji-badge på walk-kort. Tom sträng = ingen badge. */
  badgeEmoji: string;
}

const CONFIGS: Record<ActivityType, ActivityConfig> = {
  walk: {
    triggerDistanceMeters: 15,
    approachingDistanceMeters: 15, // Lika = ingen separat varning
    initialLatitudeDelta: 0.005,
    badgeEmoji: "",
  },
  bike: {
    triggerDistanceMeters: 50,
    approachingDistanceMeters: 100,
    initialLatitudeDelta: 0.02,
    badgeEmoji: "🚲",
  },
};

/** Hämta config för en walk. Faller tillbaka på "walk" om fältet saknas. */
export function getActivityConfig(walk?: Pick<Walk, "activityType">): ActivityConfig {
  const type = walk?.activityType ?? DEFAULT_ACTIVITY_TYPE;
  return CONFIGS[type] ?? CONFIGS.walk;
}

/** Bekväm getter för bara aktivitetstypen med default. */
export function getActivityType(walk?: Pick<Walk, "activityType">): ActivityType {
  return walk?.activityType ?? DEFAULT_ACTIVITY_TYPE;
}
