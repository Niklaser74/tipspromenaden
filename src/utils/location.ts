/**
 * @file location.ts
 * @description GPS- och platshjälpfunktioner för Tipspromenaden-appen.
 *
 * Innehåller verktyg för att:
 * - Beräkna avstånd mellan GPS-koordinater (Haversine-formeln).
 * - Hämta enhetens nuvarande position via `expo-location`.
 * - Starta kontinuerlig positionsövervakning för realtidsuppdateringar.
 *
 * Alla platsfunktioner kräver att användaren godkänner platstillstånd.
 * På webben kräver GPS HTTPS (fungerar ej på vanlig HTTP).
 */

import * as Location from "expo-location";

/**
 * Beräknar det ungefärliga avståndet i meter mellan två GPS-koordinater
 * med hjälp av Haversine-formeln. Tar hänsyn till jordens krökning men
 * ignorerar höjdskillnader.
 *
 * Används i `ActiveWalkScreen` för att avgöra om deltagaren befinner sig
 * tillräckligt nära en kontrollpunkt för att låsa upp frågan.
 *
 * @param lat1 - Latitud för startpunkten i decimalgrader.
 * @param lon1 - Longitud för startpunkten i decimalgrader.
 * @param lat2 - Latitud för målpunkten i decimalgrader.
 * @param lon2 - Longitud för målpunkten i decimalgrader.
 * @returns Avståndet i meter mellan de två koordinaterna.
 *
 * @example
 * // Kontrollera om deltagaren är inom 50 meter av en kontrollpunkt:
 * const dist = getDistanceInMeters(
 *   userLat, userLon,
 *   question.coordinate.latitude, question.coordinate.longitude
 * );
 * if (dist < 50) {
 *   // Lås upp frågan
 * }
 */
export function getDistanceInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Jordens radie i meter
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Intern hjälpfunktion som omvandlar grader till radianer.
 *
 * @param deg - Vinkel i grader.
 * @returns Vinkeln i radianer.
 */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Begär platstillstånd och hämtar enhetens nuvarande GPS-position.
 * Använder hög noggrannhet (`Location.Accuracy.High`) för bästa precision.
 *
 * Kräver att användaren godkänner platstillstånd första gången.
 * På webben krävs HTTPS för att GPS ska fungera i webbläsaren.
 *
 * @returns Enhetens nuvarande position med koordinater, noggrannhet och tidsstämpel.
 * @throws `Error("Platstillstånd nekades")` om användaren nekar tillstånd.
 * @throws Kastar ett Expo Location-fel om GPS-hämtningen misslyckas.
 *
 * @example
 * try {
 *   const location = await getCurrentLocation();
 *   const { latitude, longitude } = location.coords;
 *   console.log(`Position: ${latitude}, ${longitude}`);
 * } catch (e) {
 *   Alert.alert('GPS-fel', e.message);
 * }
 */
export async function getCurrentLocation(): Promise<Location.LocationObject> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Platstillstånd nekades");
  }
  return await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
}

/**
 * Begär platstillstånd och startar kontinuerlig GPS-positionsövervakning.
 * Anropar `callback` varje gång enheten rör sig minst 1 meter.
 * Använder hög noggrannhet för korrekt kontrollpunktsdetektion.
 *
 * Kom ihåg att avsluta prenumerationen när den inte längre behövs
 * för att spara batteri och undvika minneläckor.
 *
 * @param callback - Funktion som anropas med den uppdaterade positionen.
 * @returns En prenumerationsobjekt – anropa `.remove()` för att avsluta övervakningen.
 * @throws `Error("Platstillstånd nekades")` om användaren nekar tillstånd.
 *
 * @example
 * const subscription = await watchPosition((location) => {
 *   const { latitude, longitude } = location.coords;
 *   setUserPosition({ latitude, longitude });
 * });
 *
 * // Vid komponent-unmount:
 * subscription.remove();
 */
export async function watchPosition(
  callback: (location: Location.LocationObject) => void
): Promise<Location.LocationSubscription> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Platstillstånd nekades");
  }
  return await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 1, // Uppdatera varje meter
    },
    callback
  );
}
