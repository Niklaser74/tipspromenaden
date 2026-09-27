/**
 * @file staleRound.ts
 * @description När räknas en runda som övergiven?
 *
 * Regeln bor här, plattformsfri och utan Firebase-beroenden, så att
 * klienten och det schemalagda Cloud Function-jobbet dömer likadant.
 * Klienten *hoppar över* en övergiven runda (nästa start får en ny);
 * jobbet *stänger* den, vilket bara servern får enligt reglerna.
 *
 * `functions/scripts/sync-shared.mjs` kopierar filen till
 * `functions/src/shared/` före varje build — sanningen bor här.
 */

/**
 * Hur länge en öppen runda får ligga helt stilla innan den räknas som
 * övergiven. En tipspromenad tar sällan mer än ett par timmar; åtta
 * timmar utan ett enda besvarat frågetecken betyder att ingen går kvar.
 */
export const STALE_ROUND_MS = 8 * 60 * 60 * 1000;

/** Det minimum av en session som staleness-regeln behöver. */
export interface StaleRoundSession {
  createdAt: number;
}

/** Det minimum av en deltagare som staleness-regeln behöver. */
export interface StaleRoundParticipant {
  answers?: unknown[];
  completedAt?: number;
  lastActivityAt?: number;
}

/** Det minimum av en walk som staleness-regeln behöver. */
export interface StaleRoundWalk {
  event?: { startDate: string; endDate: string };
}

/**
 * Har deltagaren gjort något som räknas? Bara besvarade frågor och
 * målgång räknas — **inte** att ha anslutit och skrivit in sitt namn.
 *
 * Utan den avgränsningen kunde en person som ansluter och går därifrån
 * hålla rundan vid liv i åtta timmar till, och nästa som gjorde samma
 * sak förlängde den igen. Det höll rundor öppna i dagar i produktion
 * (mätt 2026-09-27).
 */
function hasRealActivity(p: StaleRoundParticipant): boolean {
  return !!p.completedAt || (p.answers?.length ?? 0) > 0;
}

/**
 * Senaste livstecknet i en runda: nyaste tidsstämpeln bland deltagare som
 * faktiskt svarat, annars när sessionen skapades. `createdAt` som golv
 * skyddar en nystartad runda där ingen hunnit svara än.
 *
 * `lastActivityAt` saknas på deltagare skrivna av klienter äldre än
 * 1.9.2 — då används `completedAt`.
 */
export function lastRoundActivity(
  session: StaleRoundSession,
  participants: StaleRoundParticipant[]
): number {
  let latest = session.createdAt;
  for (const p of participants) {
    if (!hasRealActivity(p)) continue;
    const t = Math.max(p.lastActivityAt ?? 0, p.completedAt ?? 0);
    if (t > latest) latest = t;
  }
  return latest;
}

/**
 * Är promenaden ett event som pågår just nu? Pågående event lämnas i
 * fred: deltagare ansluter under hela datumfönstret och en lucka på en
 * natt mellan två dagar är helt normal.
 */
export function isEventWindowOpen(
  walk: StaleRoundWalk | undefined | null,
  now: Date = new Date()
): boolean {
  if (!walk?.event) return false;
  const today = now.toISOString().split("T")[0];
  return today >= walk.event.startDate && today <= walk.event.endDate;
}

/**
 * Är rundan övergiven?
 *
 * Pågående event är aldrig övergivna. Ett event vars datumfönster har
 * passerat är det däremot — för klienten, som då startar en ny runda i
 * stället för att ärva den gamla topplistan.
 *
 * `keepEventWalks` gör bedömningen strängare: då lämnas **alla**
 * eventpromenader i fred, även avslutade. Det schemalagda jobbet kör med
 * den flaggan, eftersom att stänga en runda är oåterkalleligt och fryser
 * en topplista som arrangören kanske fortfarande visar upp efter eventet.
 * Arrangören kan alltid stänga själv med "Avsluta rundan".
 */
export function isRoundStale(
  session: StaleRoundSession,
  participants: StaleRoundParticipant[],
  walk: StaleRoundWalk | undefined | null,
  now: number = Date.now(),
  opts: { keepEventWalks?: boolean } = {}
): boolean {
  if (walk?.event && opts.keepEventWalks) return false;
  if (isEventWindowOpen(walk, new Date(now))) return false;
  return now - lastRoundActivity(session, participants) >= STALE_ROUND_MS;
}
