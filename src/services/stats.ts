/**
 * @file stats.ts
 * @description Lokal stats-tjänst.
 *
 * Sparar användarens egna mätvärden (genomförda promenader, skapade
 * promenader, totalt rätt/fel) i AsyncStorage. Allt är device-lokalt
 * för att undvika beroende på inloggning eller backend — V1-stats ska
 * fungera även för anonyma deltagare och offline.
 *
 * När/om tokensystemet (se ROADMAP Fas 3.5) byggs blir detta källan
 * till intjäning: en Cloud Function speglar samma händelser server-side
 * mot ett krypterat token-saldo. Tills dess används bara den lokala
 * vyn i `StatsScreen`.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const STATS_KEY = "user_stats_v1";

/**
 * Bästa resultatet för en promenad. Behålls per `walkId` så att
 * upprepade försök på samma promenad bara ersätts vid förbättring
 * (eller första försöket).
 */
export interface BestScore {
  walkId: string;
  walkTitle: string;
  score: number;
  total: number;
  /** Unix-tidsstämpel när rekordet sattes. */
  achievedAt: number;
}

/**
 * Aggregerade stats för enheten. Versionera nyckeln (`STATS_KEY`) om
 * fältuppsättningen ändras inkompatibelt — vi vill aldrig krascha på
 * ett gammalt schema, hellre nollställa.
 */
export interface UserStats {
  /** Antal slutförda promenader (räknas en gång per walkId). */
  walksCompleted: number;
  /** Antal skapade promenader (räknas en gång per walkId). */
  walksCreated: number;
  /** Totalt antal frågor besvarade någonsin. */
  questionsAnswered: number;
  /** Totalt antal korrekta svar någonsin. */
  questionsCorrect: number;
  /** Set av walkIds som redan räknats som slutförda (anti-dubbel). */
  completedWalkIds: string[];
  /** Set av walkIds som redan räknats som skapade. */
  createdWalkIds: string[];
  /** Bästa resultat per walkId. */
  bestScores: Record<string, BestScore>;
  /** Unix-tidsstämpel för senaste uppdatering. */
  lastUpdated: number;
}

const EMPTY: UserStats = {
  walksCompleted: 0,
  walksCreated: 0,
  questionsAnswered: 0,
  questionsCorrect: 0,
  completedWalkIds: [],
  createdWalkIds: [],
  bestScores: {},
  lastUpdated: 0,
};

/**
 * Läser stats-objektet. Returnerar tomt objekt om inget finns sparat
 * eller om JSON är korrupt — stats är inte affärskritiskt och ska
 * aldrig stoppa appen.
 */
export async function getStats(): Promise<UserStats> {
  try {
    const raw = await AsyncStorage.getItem(STATS_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<UserStats>;
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

async function writeStats(stats: UserStats): Promise<void> {
  stats.lastUpdated = Date.now();
  await AsyncStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

/**
 * Registrerar att användaren slutfört en promenad. Idempotent på
 * `walkId` för totalt-räkningen (man får inte räkna upp `walksCompleted`
 * varje gång man går om samma promenad), men `questionsAnswered`/`questionsCorrect`
 * ackumuleras alltid eftersom varje försök är riktig "spelad tid".
 *
 * `bestScores[walkId]` uppdateras bara om nya poängen är bättre.
 */
export async function recordWalkCompletion(
  walkId: string,
  walkTitle: string,
  score: number,
  total: number
): Promise<void> {
  if (!walkId || total <= 0) return;
  const stats = await getStats();

  stats.questionsAnswered += total;
  stats.questionsCorrect += score;

  if (!stats.completedWalkIds.includes(walkId)) {
    stats.completedWalkIds.push(walkId);
    stats.walksCompleted = stats.completedWalkIds.length;
  }

  const prev = stats.bestScores[walkId];
  if (!prev || score > prev.score) {
    stats.bestScores[walkId] = {
      walkId,
      walkTitle,
      score,
      total,
      achievedAt: Date.now(),
    };
  }

  await writeStats(stats);
}

/**
 * Registrerar att användaren skapat en promenad. Idempotent — vi
 * vill inte räkna en redigering som ett nytt skapande.
 */
export async function recordWalkCreation(walkId: string): Promise<void> {
  if (!walkId) return;
  const stats = await getStats();
  if (stats.createdWalkIds.includes(walkId)) return;
  stats.createdWalkIds.push(walkId);
  stats.walksCreated = stats.createdWalkIds.length;
  await writeStats(stats);
}

/**
 * Härledd genomsnittlig korrekthet i procent (0–100). Returnerar 0
 * om inga frågor besvarats än.
 */
export function averageCorrectPct(stats: UserStats): number {
  if (stats.questionsAnswered === 0) return 0;
  return Math.round((stats.questionsCorrect / stats.questionsAnswered) * 100);
}

/**
 * Töm all stats-data. Används bl.a. när användaren raderar sitt konto
 * och förväntar sig att lokal historik försvinner.
 */
export async function clearStats(): Promise<void> {
  await AsyncStorage.removeItem(STATS_KEY);
}
