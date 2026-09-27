/**
 * @file rounds.ts
 * @description Schemalagt jobb som stänger övergivna rundor.
 *
 * Bakgrund: en runda (`sessions/{id}`) flippar till `completed` bara när
 * ALLA deltagare har `completedAt`. En avbruten deltagare håller den
 * öppen för alltid. Klienten *hoppar över* en övergiven runda när någon
 * startar på nytt, men den kan inte *stänga* den: `firestore.rules`
 * släpper bara igenom `status: completed` från walk-ägaren eller någon
 * som redan är deltagare i sessionen. Resultatet var 174 rundor som stod
 * öppna i upp till två veckor (mätt 2026-09-27), och för arrangören såg
 * det ut som att rundan pågick.
 *
 * Det här jobbet kör som admin, förbi reglerna, och gör det klienten
 * inte får. Regeln för vad som räknas som övergivet delas med appen via
 * `shared/staleRound.ts` (kopieras av `scripts/sync-shared.mjs`), så
 * klient och server dömer likadant.
 */
import { logger } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";
import { isRoundStale, STALE_ROUND_MS } from "./shared/staleRound";

/** Firestore tillåter 500 skrivningar per batch. */
const BATCH_LIMIT = 500;

interface SessionDoc {
  walkId?: string;
  status?: string;
  createdAt?: number;
}

/**
 * Stänger alla öppna rundor som ingen svarat i på `STALE_ROUND_MS`.
 * Pågående event lämnas i fred (datumfönstret styr där).
 *
 * Returnerar en sammanfattning så att den manuella engångskörningen kan
 * skriva ut samma siffror som schemat loggar.
 */
export async function closeStaleRoundsNow(now: number = Date.now()): Promise<{
  open: number;
  closed: number;
  skippedEvent: number;
  skippedFresh: number;
}> {
  const db = getFirestore();
  const open = await db
    .collection("sessions")
    .where("status", "in", ["waiting", "active"])
    .get();

  // Walk-dokumenten cachas: flera rundor delar ofta samma walk, och
  // event-kollen behöver bara läsa varje walk en gång.
  const walkCache = new Map<string, { event?: { startDate: string; endDate: string } } | null>();
  const getWalk = async (walkId: string) => {
    if (!walkCache.has(walkId)) {
      const snap = await db.collection("walks").doc(walkId).get();
      walkCache.set(walkId, snap.exists ? (snap.data() as any) : null);
    }
    return walkCache.get(walkId) ?? null;
  };

  const toClose: string[] = [];
  let skippedEvent = 0;
  let skippedFresh = 0;

  for (const doc of open.docs) {
    const session = doc.data() as SessionDoc;
    const createdAt = session.createdAt ?? 0;

    // Billig gallring: `createdAt` är golvet för senaste aktivitet, så en
    // runda som är yngre än tröskeln kan aldrig vara övergiven — och då
    // behöver vi inte läsa dess deltagare.
    if (now - createdAt < STALE_ROUND_MS) {
      skippedFresh++;
      continue;
    }

    const walk = session.walkId ? await getWalk(session.walkId) : null;
    const participants = await doc.ref.collection("participants").get();
    const stale = isRoundStale(
      { createdAt },
      participants.docs.map((p) => p.data() as any),
      walk,
      now,
      // Eventpromenader lämnas i fred här, även avslutade: en fryst
      // topplista går inte att öppna igen och arrangören kan visa upp
      // resultatet i dagar efteråt. Klienten startar ändå en ny runda
      // efter att fönstret stängt, så ingen ärver den gamla listan.
      { keepEventWalks: true }
    );
    if (!stale) {
      if (walk?.event) skippedEvent++;
      continue;
    }
    toClose.push(doc.id);
  }

  for (let i = 0; i < toClose.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const id of toClose.slice(i, i + BATCH_LIMIT)) {
      batch.update(db.collection("sessions").doc(id), { status: "completed" });
    }
    await batch.commit();
  }

  return {
    open: open.size,
    closed: toClose.length,
    skippedEvent,
    skippedFresh,
  };
}

/**
 * Kör varje timme. En timmes upplösning räcker: tröskeln är åtta timmar
 * och ingen väntar på just den här stängningen — klienten hoppar redan
 * över rundan direkt.
 */
export const closeStaleRounds = onSchedule(
  {
    // Inte `REGION` (europe-north1) som resten av funktionerna: Cloud
    // Scheduler i det här projektet accepterar bara us-central1, eftersom
    // schemaläggaren följer projektets App Engine-region. Deploy mot
    // europe-north1 failar med "Location europe-north1 is not a valid
    // location". Jobbet läser Firestore över regiongräns en gång i
    // timmen — försumbart för en batch som denna.
    region: "us-central1",
    schedule: "every 60 minutes",
    timeZone: "Europe/Stockholm",
    timeoutSeconds: 540,
    memory: "256MiB",
    retryCount: 0,
  },
  async () => {
    const result = await closeStaleRoundsNow();
    logger.info("closeStaleRounds", result);
  }
);
