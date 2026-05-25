/**
 * @file EventThemeContext.tsx
 * @description React-kontext för det aktiva event-läget (branded customization).
 *
 * När en användare aktiverar ett event (via deep link, QR eller Settings-input)
 * sparar `services/eventTheme.ts` event-id:t i AsyncStorage. Den här
 * provider:n hydrerar vid mount, exponerar `useEventTheme()` så att skärmar
 * och komponenter kan plocka logo, färger och `walkIds`-filter.
 *
 * Bakåtkompatibelt: när inget event är aktivt returnerar `useEventTheme()`
 * `{ event: null, isActive: false, colors: <TP-defaults> }`, så befintliga
 * skärmar kan migrera till hooken stegvis utan att brytas.
 *
 * Mountas i `App.tsx` innanför `AuthProvider` så att alla skärmar (inklusive
 * deep-link-mottagare) har tillgång till event-state.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { EventBranding } from "../types";
import { TP } from "../theme/colors";
import {
  activateEvent as activateEventService,
  deactivateEvent as deactivateEventService,
  hydrateActiveEvent,
} from "../services/eventTheme";

/**
 * Färg-tokens som komponenter kan läsa via `useEventTheme().colors`. Defaultar
 * till `TP`-paletten; ersätter `forest` och `pin` när ett event har egna
 * färger. Övriga TP-tokens hålls oförändrade — vi vill bara byta accent-
 * färgerna, inte hela paletten (annars riskerar vi kontrast-bugs).
 */
export interface EventColors {
  /** Primär accent — knappar, rubriker, header. Default `TP.forest`. */
  primary: string;
  /** Checkpoint-pin på kartan. Default `TP.pin`. */
  accent: string;
  /** Hela TP-paletten — för komponenter som behöver mer än bara accenterna. */
  tp: typeof TP;
}

interface EventThemeContextType {
  /** Det aktiva eventet, eller null om inget är aktivt. */
  event: EventBranding | null;
  /** Convenience-flagga = `event !== null`. */
  isActive: boolean;
  /** True medan hydration från AsyncStorage + Firestore pågår. */
  loading: boolean;
  /** Patchad färgpalett (TP + event-overrides). */
  colors: EventColors;
  /**
   * Aktivera ett event via dess id. Hämtar från Firestore, cachar, sätter
   * som aktivt i AsyncStorage och uppdaterar context-state. Kastar vid
   * okänt id eller offline utan cache.
   */
  activateEvent: (id: string) => Promise<EventBranding>;
  /** Avaktiverar event-läget. */
  deactivateEvent: () => Promise<void>;
}

const defaultColors: EventColors = {
  primary: TP.forest,
  accent: TP.pin,
  tp: TP,
};

const EventThemeContext = createContext<EventThemeContextType>({
  event: null,
  isActive: false,
  loading: true,
  colors: defaultColors,
  activateEvent: async () => {
    throw new Error("EventThemeProvider not mounted");
  },
  deactivateEvent: async () => {},
});

export function EventThemeProvider({ children }: { children: React.ReactNode }) {
  const [event, setEvent] = useState<EventBranding | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    hydrateActiveEvent()
      .then((e) => {
        if (!cancelled) setEvent(e);
      })
      .catch((err) => {
        console.warn("[EventThemeProvider] hydration failed:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activateEvent = useCallback(async (id: string) => {
    const fresh = await activateEventService(id);
    setEvent(fresh);
    return fresh;
  }, []);

  const deactivateEvent = useCallback(async () => {
    await deactivateEventService();
    setEvent(null);
  }, []);

  const colors = useMemo<EventColors>(() => {
    if (!event) return defaultColors;
    return {
      primary: event.primaryColor || TP.forest,
      accent: event.accentColor || TP.pin,
      tp: TP,
    };
  }, [event]);

  const value = useMemo<EventThemeContextType>(
    () => ({
      event,
      isActive: event !== null,
      loading,
      colors,
      activateEvent,
      deactivateEvent,
    }),
    [event, loading, colors, activateEvent, deactivateEvent]
  );

  return (
    <EventThemeContext.Provider value={value}>
      {children}
    </EventThemeContext.Provider>
  );
}

/**
 * Hook för att läsa det aktiva event-läget. Säker att anropa även utan
 * provider — returnerar defaultvärden då (inget event aktivt, TP-färger).
 *
 * @example
 * function MyButton() {
 *   const { colors, isActive, event } = useEventTheme();
 *   return (
 *     <TouchableOpacity style={{ backgroundColor: colors.primary }}>
 *       <Text>{isActive ? `${event.name}` : "Tipspromenaden"}</Text>
 *     </TouchableOpacity>
 *   );
 * }
 */
export function useEventTheme() {
  return useContext(EventThemeContext);
}
