/**
 * @file date.ts
 * @description Hjälpfunktioner för datumformatering.
 *
 * Vi lagrar event-datum som ISO-strängar i format `YYYY-MM-DD` (lokal tid)
 * eftersom det är vad Firestore-reglerna och strängjämförelser i
 * `JoinWalkScreen` förväntar sig. `Date.toISOString()` ger UTC och kan
 * skifta dagen vid midnatt i andra tidszoner — därför använder vi lokala
 * fält här istället.
 */

/**
 * Formatera ett `Date` som `YYYY-MM-DD` i lokal tidszon.
 */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parsa en `YYYY-MM-DD`-sträng till ett `Date` (lokal midnatt).
 * Returnerar `null` om formatet är ogiltigt.
 */
export function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}
