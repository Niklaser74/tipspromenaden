/**
 * @file eventRound.ts
 * @description Vilka rundor hör till den aktuella omgången av ett event?
 *
 * En eventpromenad går att köra om år efter år med nya datum, men
 * topplistan har hittills slagit ihop varje session som någonsin körts på
 * walken (`subscribeToWalkSessions` filtrerar bara på `walkId`). Förra
 * årets deltagare stod alltså kvar på listan, och en återkommande
 * deltagare med samma uid kunde visas med gammal poäng.
 *
 * Regeln här scopar topplistan till eventets datumfönster: sessioner som
 * startats inom fönstret räknas, övriga inte. Att arrangören flyttar
 * datumen blir därmed det som startar en ny omgång — medan en
 * stavfelsrättning mitt i ett pågående event inte påverkar någonting.
 *
 * Det här är en **vy-regel**. Ingenting raderas och ingenting skrivs:
 * flyttas datumen tillbaka är den gamla listan där igen.
 *
 * Filen är plattformsfri (inga Firebase- eller RN-beroenden) och speglas
 * till `functions/src/shared/` av `functions/scripts/sync-shared.mjs`, så
 * att regeln kan testas med repots enda testharness (`cd functions &&
 * npm test`).
 */
import { parseIsoDate } from "./date";

/**
 * Marginal efter eventets sista dag. Skyddar en runda som startats sent
 * sista kvällen mot att klockan på deltagarens enhet går fel — `createdAt`
 * sätts av klienten, inte av servern.
 */
export const EVENT_ROUND_GRACE_MS = 12 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Det minimum av en walk som regeln behöver. */
export interface EventRoundWalk {
  event?: { startDate: string; endDate: string };
}

/**
 * Det minimum av en deltagare som regeln behöver.
 *
 * Regeln går på DELTAGAREN, inte på sessionen. Mätning mot produktions-
 * data 2026-09-28: arrangörer testar promenaden dagar före eventet, och
 * eftersom `findActiveSession` återanvänder en öppen runda ansluter
 * sedan alla riktiga deltagare till just den sessionen. Sessionens
 * `createdAt` pekar alltså på testrundan, inte på eventet — ett filter på
 * den hade dolt hela topplistan för t.ex. Medborgarskapspromenaden (41
 * deltagare, session skapad 21 aug, målgång 25 aug).
 */
export interface EventRoundParticipant {
  completedAt?: number;
  lastActivityAt?: number;
}

/**
 * Tidsfönstret för eventets aktuella omgång, eller `null` när walken inte
 * är ett event eller datumen inte går att tolka.
 *
 * `parseIsoDate` ger **lokal** midnatt. Det är avsiktligt: `new
 * Date("2026-06-01")` tolkas som UTC-midnatt, alltså 02:00 svensk
 * sommartid, och en runda startad 00:30 på första dagen hade då hamnat
 * utanför fönstret. `createdAt` sätts av samma enhetsklocka som avgör
 * vilken kalenderdag användaren upplever.
 */
export function eventRoundWindow(
  walk: EventRoundWalk | null | undefined
): { from: number; to: number } | null {
  const event = walk?.event;
  if (!event?.startDate || !event?.endDate) return null;

  const start = parseIsoDate(event.startDate);
  const end = parseIsoDate(event.endDate);
  if (!start || !end) return null;

  const from = start.getTime();
  // Bakvänt intervall betyder trasig data (reglerna validerar inte
  // event-fälten). Kollas före marginalen läggs på — annars ser ett
  // slutdatum en dag före startdatum ut som ett giltigt 12-timmarsfönster.
  if (end.getTime() < from) return null;

  // Slutdagen räknas i sin helhet: midnatt + ett dygn, sedan marginalen.
  const to = end.getTime() + DAY_MS + EVENT_ROUND_GRACE_MS;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;

  return { from, to };
}

/**
 * Gick deltagaren promenaden under eventets aktuella omgång?
 *
 * Fail-open: saknas eventet, går datumen inte att tolka eller saknar
 * deltagaren tidsstämplar räknas hen som med. En vy-regel får aldrig gömma
 * riktiga resultat på grund av ett fält som inte finns — deltagare skrivna
 * av klienter äldre än 1.9.2 saknar `lastActivityAt`, och har de inte gått
 * i mål har de ingen `completedAt` heller.
 */
export function isParticipantInEventRound(
  participant: EventRoundParticipant,
  walk: EventRoundWalk | null | undefined
): boolean {
  const window = eventRoundWindow(walk);
  if (!window) return true;

  const stamps = [participant?.completedAt, participant?.lastActivityAt].filter(
    (t): t is number => typeof t === "number" && Number.isFinite(t)
  );
  if (stamps.length === 0) return true;

  // Minst en aktivitet inom fönstret räcker: den som började strax före
  // midnatt sista dagen och gick i mål efteråt hör till omgången.
  return stamps.some((t) => t >= window.from && t < window.to);
}

/**
 * Filtrerar deltagare till eventets aktuella omgång. Returnerar listan
 * oförändrad när ingen regel går att tillämpa (t.ex. en vanlig promenad
 * utan event).
 */
export function filterParticipantsToEventRound<T extends EventRoundParticipant>(
  participants: T[],
  walk: EventRoundWalk | null | undefined
): T[] {
  if (!eventRoundWindow(walk)) return participants;
  return participants.filter((p) => isParticipantInEventRound(p, walk));
}

/**
 * Pekar två event-fält ut samma omgång? Används när en walk sparas för att
 * avgöra om en tidigare redovisning (`resultsRevealedAt`) ska följa med:
 * oförändrade datum = samma omgång = topplistan förblir redovisad.
 */
export function isSameEventWindow(
  a: EventRoundWalk["event"] | null | undefined,
  b: EventRoundWalk["event"] | null | undefined
): boolean {
  if (!a || !b) return !a && !b;
  return a.startDate === b.startDate && a.endDate === b.endDate;
}
