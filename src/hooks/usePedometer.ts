/**
 * @file usePedometer.ts
 * @description Hook som räknar steg under en aktiv promenad.
 *
 * Wrappar `expo-sensors`-Pedometer:n. Hanterar:
 *  - Tillgänglighetscheck (vissa enheter saknar stegsensor).
 *  - Behörigheter (ACTIVITY_RECOGNITION på Android 10+, CoreMotion på iOS).
 *  - Best-effort: vid fel returneras `undefined` så caller kan släppa
 *    fältet utan att blockera flödet — stegräkning är aldrig kritiskt.
 *
 * Returnerar `steps: number | undefined` (cumulativt från det att
 * `enabled` blev `true`), plus en flagga `available` så UI:et kan
 * dölja räknaren helt på enheter utan sensor.
 */
import { useEffect, useState } from "react";
import { Pedometer } from "expo-sensors";

interface PedometerState {
  /** Cumulativt antal steg sedan subscription startade. `undefined` om sensorn inte är tillgänglig eller behörighet saknas. */
  steps: number | undefined;
  /** `true` om enheten har sensor och vi har behörighet att läsa. */
  available: boolean;
}

export function usePedometer(enabled: boolean): PedometerState {
  const [state, setState] = useState<PedometerState>({
    steps: undefined,
    available: false,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let sub: { remove: () => void } | null = null;

    (async () => {
      try {
        const ok = await Pedometer.isAvailableAsync();
        if (!ok || cancelled) return;

        // På Android 10+ kräver detta ACTIVITY_RECOGNITION-permission.
        // På iOS: CoreMotion-prompten dyker upp första gången.
        const perm = await Pedometer.requestPermissionsAsync();
        if (!perm.granted || cancelled) return;

        if (cancelled) return;
        setState({ steps: 0, available: true });

        sub = Pedometer.watchStepCount((result) => {
          setState((prev) => ({
            ...prev,
            steps: result.steps,
          }));
        });
      } catch (e) {
        // Sensor som rapporterar fel mid-walk — släpp värdet tyst.
        // Promenaden ska aldrig avbrytas pga stegräknarproblem.
        console.warn("[usePedometer] failed:", e);
      }
    })();

    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
  }, [enabled]);

  return state;
}
