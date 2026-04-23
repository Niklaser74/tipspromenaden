/**
 * @file useMapType.ts
 * @description Hook som laddar och persisterar användarens valda karttyp.
 *
 * Delas mellan ActiveWalkScreen (under promenad) och CreateWalkScreen
 * (ritar kontroller). Karttypen sparas i AsyncStorage så att valet
 * ligger kvar mellan sessioner.
 *
 * Cykelordning: standard → hybrid → terrain → standard.
 */

import { useCallback, useEffect, useState } from "react";
import { getMapType, setMapType, MapType } from "../services/storage";

const CYCLE_ORDER: readonly MapType[] = ["standard", "hybrid", "terrain"];

export function useMapType(): {
  mapType: MapType;
  cycleMapType: () => void;
} {
  // Startar med "standard" så kartan kan renderas direkt —
  // AsyncStorage-värdet appliceras när det laddats (vanligtvis < 50 ms).
  const [mapType, setMapTypeState] = useState<MapType>("standard");

  useEffect(() => {
    let cancelled = false;
    getMapType().then((saved) => {
      if (!cancelled) setMapTypeState(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const cycleMapType = useCallback(() => {
    setMapTypeState((current) => {
      const idx = CYCLE_ORDER.indexOf(current);
      const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
      // Fire-and-forget: preferensen är icke-kritisk, ingen anledning att
      // blockera UI eller bubbla upp AsyncStorage-fel.
      setMapType(next).catch(() => {});
      return next;
    });
  }, []);

  return { mapType, cycleMapType };
}
