/**
 * @file firestore.ts
 * @description Databastjänst för Tipspromenaden – hanterar all kommunikation med Firebase Firestore.
 *
 * Databasen är uppdelad i:
 * - **`walks`** – sparade tipspromenader skapade av Google-inloggade användare.
 * - **`sessions`** – aktiva och avslutade omgångar av promenader.
 * - **`sessions/{sid}/participants`** – deltagare per session, dokument-ID är
 *   deltagarens Firebase Auth UID. Detta gör att Firestore-reglerna kan låsa
 *   skrivning till respektive deltagare.
 *
 * Deltagare lagras alltså inte inbäddat i sessionsdokumentet; de hämtas via
 * `onSnapshot` på subkollektionen och denormaliseras till `Session.participants`
 * av `subscribeToSession`/`subscribeToWalkSessions` för bakåtkompatibilitet.
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { Walk, Session, Participant } from "../types";

const WALKS_COLLECTION = "walks";
const SESSIONS_COLLECTION = "sessions";
const PARTICIPANTS_SUBCOLLECTION = "participants";

// ===== PROMENADER =====

/**
 * Sparar eller uppdaterar en promenad i Firestore.
 * Använder `setDoc` vilket innebär att ett befintligt dokument med samma ID
 * skrivs över helt.
 *
 * Firestore-reglerna tillåter bara uppdatering om `createdBy` matchar den
 * inloggade användaren.
 */
/**
 * Tar rekursivt bort `undefined`-fält ur ett objekt/array innan det skickas
 * till Firestore. Firestore avvisar `undefined` med "Unsupported field value:
 * undefined" — TypeScript-typer hjälper inte alltid eftersom optional-fält
 * (t.ex. `Question.imageUrl`) lätt blir explicit `undefined` via spread eller
 * import från `.tipspack`-filer. Bevarar `null` (giltigt Firestore-värde).
 */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

export async function saveWalk(walk: Walk): Promise<void> {
  // updatedAt låter klienter snabbt avgöra om deras cache är inaktuell
  // utan att jämföra hela dokumentet.
  const stamped: Walk = stripUndefined({ ...walk, updatedAt: Date.now() });
  await setDoc(doc(db, WALKS_COLLECTION, walk.id), stamped);
}

/**
 * Hämtar en enskild promenad från Firestore med dess ID.
 */
export async function getWalk(walkId: string): Promise<Walk | null> {
  const snap = await getDoc(doc(db, WALKS_COLLECTION, walkId));
  return snap.exists() ? (snap.data() as Walk) : null;
}

/**
 * Hämtar alla promenader som skapats av en specifik användare.
 */
export async function getMyWalks(userId: string): Promise<Walk[]> {
  const q = query(
    collection(db, WALKS_COLLECTION),
    where("createdBy", "==", userId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Walk);
}

/**
 * Hämtar alla publika promenader för bibliotekets "Promenader"-flik.
 * Sortering klient-side på createdAt desc — undviker att kräva ett
 * composite index (public + createdAt). Vid hobby-skala är payload
 * försumbar; om listan växer till hundratals kan vi byta till indexerad
 * server-query.
 */
export async function getPublicWalks(): Promise<Walk[]> {
  const q = query(collection(db, WALKS_COLLECTION), where("public", "==", true));
  const snap = await getDocs(q);
  const walks = snap.docs.map((d) => d.data() as Walk);
  walks.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return walks;
}

/**
 * Aggregerad statistik för en walk: alla sessioner, alla deltagare och
 * per-fråga-fördelning av svar. Kostnad: 1 walk-läsning + 1 sessions-query
 * + 1 participants-query per session. Inte gratis för walks med många
 * sessioner — målgrupp är skaparen som vill se hur deltagarna gått, inte
 * realtidsövervakning.
 */
export interface WalkInsights {
  walk: Walk;
  totalSessions: number;
  totalParticipants: number;
  completedParticipants: number;
  /** Snittpoäng (av completedParticipants) som procent av antal frågor. 0 om inga klara. */
  averageScorePct: number;
  /** Snittsteg (av completedParticipants som rapporterat steg). `null` om ingen rapporterat. */
  averageSteps: number | null;
  questionStats: Array<{
    questionId: string;
    questionText: string;
    options: string[];
    correctOptionIndex: number;
    /** Antal deltagare som svarat på denna fråga (alla sessioner). */
    totalAnswers: number;
    correctCount: number;
    /** Antal som valt varje option, samma index som options[]. */
    optionCounts: number[];
  }>;
}

export async function getWalkInsights(walkId: string): Promise<WalkInsights | null> {
  const walk = await getWalk(walkId);
  if (!walk) return null;

  const sessionsSnap = await getDocs(
    query(collection(db, SESSIONS_COLLECTION), where("walkId", "==", walkId))
  );
  const sessions = sessionsSnap.docs.map((d) => d.data() as Session);

  // Hämta deltagare för alla sessioner i parallell — annars blir det
  // sekventiellt vilket gör en walk med 10 sessioner märkbart segt.
  const participantsBySession = await Promise.all(
    sessions.map((s) => getParticipants(s.id))
  );
  const allParticipants = participantsBySession.flat();
  const completed = allParticipants.filter((p) => p.completedAt);

  const questionStats = walk.questions.map((q) => {
    const optionCounts = new Array(q.options.length).fill(0) as number[];
    let totalAnswers = 0;
    let correctCount = 0;
    for (const p of allParticipants) {
      const a = p.answers.find((ans) => ans.questionId === q.id);
      if (!a) continue;
      totalAnswers++;
      if (a.correct) correctCount++;
      if (a.selectedOptionIndex >= 0 && a.selectedOptionIndex < optionCounts.length) {
        optionCounts[a.selectedOptionIndex]++;
      }
    }
    return {
      questionId: q.id,
      questionText: q.text,
      options: q.options,
      correctOptionIndex: q.correctOptionIndex,
      totalAnswers,
      correctCount,
      optionCounts,
    };
  });

  const totalQuestions = walk.questions.length || 1;
  const averageScorePct =
    completed.length === 0
      ? 0
      : Math.round(
          (completed.reduce((sum, p) => sum + p.score, 0) /
            (completed.length * totalQuestions)) *
            100
        );

  // Snittsteg — bara över de completed som faktiskt rapporterat steg.
  // Äldre klienter saknar fältet helt och ska inte påverka snittet.
  const completedWithSteps = completed.filter((p) => typeof p.steps === "number");
  const averageSteps =
    completedWithSteps.length === 0
      ? null
      : Math.round(
          completedWithSteps.reduce((sum, p) => sum + (p.steps ?? 0), 0) /
            completedWithSteps.length
        );

  return {
    walk,
    totalSessions: sessions.length,
    totalParticipants: allParticipants.length,
    completedParticipants: completed.length,
    averageScorePct,
    averageSteps,
    questionStats,
  };
}

// ===== SESSIONER =====

/**
 * Skapar en ny session i Firestore.
 * Sessionen innehåller inte någon `participants`-array – deltagare läggs till
 * via `addParticipant` som skriver dem i subkollektionen.
 */
export async function createSession(session: Session): Promise<void> {
  // Stripe av participants-arrayen om anropare råkat fylla i den – den ska
  // inte sparas i sessionsdokumentet.
  const { participants: _unused, ...sessionDoc } = session as Session & {
    participants?: Participant[];
  };
  await setDoc(doc(db, SESSIONS_COLLECTION, session.id), sessionDoc);
}

/**
 * Hämtar en enskild session (utan deltagare) från Firestore.
 * För att få med deltagarna, använd `subscribeToSession` eller
 * `getSessionWithParticipants`.
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  const snap = await getDoc(doc(db, SESSIONS_COLLECTION, sessionId));
  if (!snap.exists()) return null;
  const data = snap.data() as Session;
  return { ...data, participants: [] };
}

/**
 * Hämtar en session inklusive alla deltagare i subkollektionen.
 */
export async function getSessionWithParticipants(
  sessionId: string
): Promise<Session | null> {
  const sessionSnap = await getDoc(doc(db, SESSIONS_COLLECTION, sessionId));
  if (!sessionSnap.exists()) return null;
  const session = sessionSnap.data() as Session;
  const participants = await getParticipants(sessionId);
  return { ...session, participants };
}

/**
 * Hämtar alla deltagare i en session (engångs-läsning).
 */
async function getParticipants(sessionId: string): Promise<Participant[]> {
  const snap = await getDocs(
    collection(db, SESSIONS_COLLECTION, sessionId, PARTICIPANTS_SUBCOLLECTION)
  );
  return snap.docs.map((d) => d.data() as Participant);
}

/**
 * Lägger till en deltagare i en session genom att skriva ett dokument i
 * subkollektionen `sessions/{sessionId}/participants/{participantId}`.
 * Firestore-reglerna kräver att `participantId === auth.uid`.
 *
 * Idempotent: om deltagaren redan finns skrivs posten inte över.
 */
export async function addParticipant(
  sessionId: string,
  participant: Participant
): Promise<void> {
  const ref = doc(
    db,
    SESSIONS_COLLECTION,
    sessionId,
    PARTICIPANTS_SUBCOLLECTION,
    participant.id
  );
  const existing = await getDoc(ref);
  if (existing.exists()) return;
  await setDoc(ref, participant);
}

/**
 * Uppdaterar en deltagares data (poäng, svar, completedAt). Skriver till
 * subkollektionsdokumentet. Firestore-reglerna säkerställer att bara
 * deltagaren själv (`auth.uid === participantId`) kan skriva.
 *
 * När deltagaren markeras som klar (`completedAt` satt) kontrolleras om alla
 * deltagare är klara och i så fall sätts sessionens status till `completed`.
 */
export async function updateParticipant(
  sessionId: string,
  participant: Participant
): Promise<void> {
  await setDoc(
    doc(
      db,
      SESSIONS_COLLECTION,
      sessionId,
      PARTICIPANTS_SUBCOLLECTION,
      participant.id
    ),
    participant
  );

  if (participant.completedAt) {
    try {
      const all = await getParticipants(sessionId);
      if (all.length > 0 && all.every((p) => p.completedAt)) {
        await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
          status: "completed",
        });
      }
    } catch {
      // Det är inte kritiskt om statusuppdateringen misslyckas — topplistan
      // beräknar själv `allDone` från deltagarnas completedAt.
    }
  }
}

/**
 * Prenumererar på realtidsuppdateringar för en session + dess deltagare.
 * Kombinerar sessionsdokumentet och deltagar-subkollektionen och anropar
 * `callback` med ett syntetiserat `Session`-objekt där `participants` är
 * populerad.
 */
export function subscribeToSession(
  sessionId: string,
  callback: (session: Session) => void
): Unsubscribe {
  let latestSession: Session | null = null;
  let latestParticipants: Participant[] = [];

  const emit = () => {
    if (latestSession) {
      callback({ ...latestSession, participants: latestParticipants });
    }
  };

  const unsubSession = onSnapshot(
    doc(db, SESSIONS_COLLECTION, sessionId),
    (snap) => {
      if (snap.exists()) {
        latestSession = snap.data() as Session;
        emit();
      }
    }
  );

  const unsubParticipants = onSnapshot(
    collection(db, SESSIONS_COLLECTION, sessionId, PARTICIPANTS_SUBCOLLECTION),
    (snap) => {
      latestParticipants = snap.docs.map((d) => d.data() as Participant);
      emit();
    }
  );

  return () => {
    unsubSession();
    unsubParticipants();
  };
}

/**
 * Söker efter en aktiv eller väntande session för en given promenad.
 */
export async function findActiveSession(
  walkId: string
): Promise<Session | null> {
  const q = query(
    collection(db, SESSIONS_COLLECTION),
    where("walkId", "==", walkId),
    where("status", "in", ["waiting", "active"])
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const sessions = snap.docs.map((d) => {
    const data = d.data() as Session;
    return { ...data, participants: [] };
  });
  sessions.sort((a, b) => b.createdAt - a.createdAt);
  return sessions[0];
}

/**
 * Raderar alla promenader (och deras sessioner och deltagare) som ägs av
 * angiven användare. Används vid kontoborttagning för GDPR-rensning.
 *
 * Anropet är best-effort: om en enskild radering misslyckas (t.ex. nätverk)
 * fortsätter resten. Klienten anropar `deleteAccountAndData` i auth.ts som
 * sedan kör `auth.deleteUser` för att slutligen ta bort själva auth-kontot.
 */
export async function deleteAllDataForUser(userId: string): Promise<void> {
  const walks = await getMyWalks(userId);

  for (const walk of walks) {
    // Hämta alla sessioner kopplade till promenaden
    const sessionsSnap = await getDocs(
      query(
        collection(db, SESSIONS_COLLECTION),
        where("walkId", "==", walk.id)
      )
    );

    for (const sessionDoc of sessionsSnap.docs) {
      const sid = sessionDoc.id;
      // Radera alla deltagare i subkollektionen
      const participantsSnap = await getDocs(
        collection(db, SESSIONS_COLLECTION, sid, PARTICIPANTS_SUBCOLLECTION)
      );
      for (const p of participantsSnap.docs) {
        try {
          await deleteDoc(p.ref);
        } catch (e) {
          console.log("Kunde inte radera deltagare", p.id, e);
        }
      }
      // Radera sessionsdokumentet
      try {
        await deleteDoc(sessionDoc.ref);
      } catch (e) {
        console.log("Kunde inte radera session", sid, e);
      }
    }

    // Radera själva promenaden
    try {
      await deleteDoc(doc(db, WALKS_COLLECTION, walk.id));
    } catch (e) {
      console.log("Kunde inte radera promenad", walk.id, e);
    }
  }
}

/**
 * Raderar en enskild promenad + alla kopplade sessioner och deltagare.
 * Används när skaparen tar bort en promenad från startsidan.
 *
 * Best-effort: enskilda deletes loggas men kastas inte vidare, så att en
 * hängande deltagare inte blockerar att själva walk-dokumentet försvinner.
 */
export async function deleteWalkCompletely(walkId: string): Promise<void> {
  const sessionsSnap = await getDocs(
    query(collection(db, SESSIONS_COLLECTION), where("walkId", "==", walkId))
  );

  for (const sessionDoc of sessionsSnap.docs) {
    const sid = sessionDoc.id;
    const participantsSnap = await getDocs(
      collection(db, SESSIONS_COLLECTION, sid, PARTICIPANTS_SUBCOLLECTION)
    );
    for (const p of participantsSnap.docs) {
      try {
        await deleteDoc(p.ref);
      } catch (e) {
        console.log("Kunde inte radera deltagare", p.id, e);
      }
    }
    try {
      await deleteDoc(sessionDoc.ref);
    } catch (e) {
      console.log("Kunde inte radera session", sid, e);
    }
  }

  // Best-effort på själva walk-doc:et: om det redan är raderat (t.ex. via
  // webb-gränssnittet på tipspromenaden.app/skapa) så behandlar vi det som
  // success. Firestore-rule:en `allow delete: if resource.data.createdBy
  // == auth.uid` failar med permission-denied när doc:et inte finns
  // eftersom resource är null — så vi kollar existence först.
  const walkRef = doc(db, WALKS_COLLECTION, walkId);
  const walkSnap = await getDoc(walkRef);
  if (walkSnap.exists()) {
    await deleteDoc(walkRef);
  }
}

/**
 * Markerar en session som avslutad (`status: "completed"`).
 */
export async function completeSession(sessionId: string): Promise<void> {
  await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
    status: "completed",
  });
}

/**
 * Prenumererar på alla sessioner kopplade till en promenad, inklusive
 * deltagare i respektive subkollektion. Används för eventläget där
 * skaparen vill se topplista över alla grupper/sessioner samlat.
 *
 * Implementationen prenumererar på sessionslistan och öppnar/stänger
 * sub-prenumerationer på `participants` dynamiskt i takt med att sessioner
 * tillkommer eller försvinner.
 */
export function subscribeToWalkSessions(
  walkId: string,
  callback: (sessions: Session[]) => void
): Unsubscribe {
  const sessionsQuery = query(
    collection(db, SESSIONS_COLLECTION),
    where("walkId", "==", walkId)
  );

  // sessionId -> senaste sessionsdata (utan participants)
  const sessionDocs = new Map<string, Session>();
  // sessionId -> senaste participants-array
  const participantsBySession = new Map<string, Participant[]>();
  // sessionId -> unsubscribe för participants-lyssnaren
  const participantUnsubs = new Map<string, Unsubscribe>();

  const emit = () => {
    const merged: Session[] = [];
    for (const [sid, s] of sessionDocs.entries()) {
      merged.push({
        ...s,
        participants: participantsBySession.get(sid) ?? [],
      });
    }
    callback(merged);
  };

  const unsubSessions = onSnapshot(sessionsQuery, (snap) => {
    const seen = new Set<string>();
    snap.docs.forEach((d) => {
      const data = d.data() as Session;
      sessionDocs.set(d.id, data);
      seen.add(d.id);

      if (!participantUnsubs.has(d.id)) {
        const unsub = onSnapshot(
          collection(
            db,
            SESSIONS_COLLECTION,
            d.id,
            PARTICIPANTS_SUBCOLLECTION
          ),
          (pSnap) => {
            participantsBySession.set(
              d.id,
              pSnap.docs.map((pd) => pd.data() as Participant)
            );
            emit();
          }
        );
        participantUnsubs.set(d.id, unsub);
      }
    });

    // Rensa sessioner som försvunnit
    for (const sid of Array.from(sessionDocs.keys())) {
      if (!seen.has(sid)) {
        sessionDocs.delete(sid);
        participantsBySession.delete(sid);
        const u = participantUnsubs.get(sid);
        if (u) {
          u();
          participantUnsubs.delete(sid);
        }
      }
    }

    emit();
  });

  return () => {
    unsubSessions();
    for (const u of participantUnsubs.values()) u();
    participantUnsubs.clear();
  };
}
