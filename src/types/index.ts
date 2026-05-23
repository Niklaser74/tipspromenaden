/**
 * @file index.ts
 * @description Centrala TypeScript-typer och gränssnitt för Tipspromenaden-appen.
 *
 * Alla delade datamodeller definieras här: promenader, sessioner, deltagare,
 * svar och hjälptyper för lokal lagring. Typerna speglar Firestore-dokumentstrukturen
 * och används konsekvent genom hela kodbasen.
 */

/**
 * En enskild fråga kopplad till en geografisk kontrollpunkt.
 * Varje fråga har svarsalternativ och en GPS-koordinat som deltagaren
 * måste befinna sig nära för att låsa upp frågan.
 */
export interface Question {
  /** Unikt ID för frågan, genererat med `generateId()`. */
  id: string;
  /** Frågetexten som visas för deltagaren. */
  text: string;
  /** Lista med svarsalternativ (vanligtvis 3 stycken, t.ex. ["Ja", "Nej", "Kanske"]). */
  options: string[];
  /** Index (0-baserat) för det korrekta svaret i `options`-arrayen. */
  correctOptionIndex: number;
  /** GPS-koordinaten för kontrollpunkten. */
  coordinate: {
    /** Latitud i decimalgrader. */
    latitude: number;
    /** Longitud i decimalgrader. */
    longitude: number;
  };
  /** Ordningsnumret för denna kontroll (1, 2, 3, ...). */
  order: number;
  /**
   * Valfri URL till en bild som visas tillsammans med frågan.
   * Pekar normalt mot Firebase Storage (`walks/{walkId}/questions/{qid}.jpg`).
   * Sätts av skaparen via `pickAndUploadQuestionImage`.
   */
  imageUrl?: string;
}

/**
 * En hel tipspromenad med alla dess frågor och metadata.
 * Sparas som ett dokument i Firestore-samlingen `walks`.
 */
export interface Walk {
  /** Unikt ID för promenaden, genererat med `generateId()`. */
  id: string;
  /** Titel på promenaden, t.ex. "Skogspromenad i Bergviken". */
  title: string;
  /** Valfri beskrivning av promenaden. */
  description?: string;
  /** Alla frågor/kontrollpunkter som ingår i promenaden. */
  questions: Question[];
  /** Firebase UID för den användare som skapade promenaden. */
  createdBy: string;
  /** Unix-tidsstämpel (millisekunder) för när promenaden skapades. */
  createdAt: number;
  /**
   * Unix-tidsstämpel (millisekunder) för senaste redigering.
   * Valfri för bakåtkompatibilitet — gamla promenader som skapats före
   * detta fält fick aldrig något `updatedAt` satt. Auto-refresh i
   * klienten faller tillbaka på djup-jämförelse när fältet saknas.
   */
  updatedAt?: number;
  /**
   * ISO 639-1-kod för det språk frågorna är skrivna på (t.ex. `"sv"`, `"en"`).
   * Valfri för bakåtkompatibilitet — äldre promenader saknar fältet.
   * Visas som flagg-emoji i promenadlistor.
   */
  language?: string;
  /**
   * Valfri eventinformation. Används i eventläge för att visa
   * resultaten under ett specifikt datumintervall.
   */
  event?: {
    /** Startdatum för eventet i ISO 8601-format (t.ex. "2025-06-01"). */
    startDate: string;
    /** Slutdatum för eventet i ISO 8601-format (t.ex. "2025-06-07"). */
    endDate: string;
  };
  /**
   * Om `true` syns promenaden i appens publika bibliotek under
   * "Promenader"-fliken. Skaparen opt-in:ar via toggle i CreateWalk.
   * Utan detta fält behandlas walken som privat (default).
   */
  public?: boolean;
  /**
   * Stad där promenaden är placerad — "Stockholm", "Visby" etc.
   * Skaparen anger manuellt vid publicering. Visas i bibliotekets
   * lista och kan filtreras på.
   */
  city?: string;
  /**
   * Kategori-tagg för biblioteket. Se `WALK_CATEGORIES` i
   * `src/constants/categories.ts` för giltiga värden. Driver
   * kategori-filter i biblioteket.
   */
  category?: import("../constants/categories").WalkCategory;
  /**
   * Centroid (mittpunkt) av alla frågekoordinater. Auto-beräknas vid
   * save i CreateWalk. Används för "nära mig"-sortering i biblioteket
   * (Iteration 2b — geo-bbox-query). Kan vara null om walken inte har
   * några frågor med koordinater än.
   */
  centroid?: {
    latitude: number;
    longitude: number;
  };
  /**
   * Aktivitetstyp — styr trigger-tröskel, kartzoom och badge i UI.
   * `"walk"` (default när fältet saknas, bakåtkompatibelt): 15 m
   * trigger, närmre kartzoom, ingen badge. `"bike"`: 50 m trigger,
   * större zoom, "närmar dig"-vibration vid 100 m, 🚲-badge på
   * walk-kort. Skaparen väljer vid skapande/redigering.
   */
  activityType?: "walk" | "bike";
  /**
   * Strict-order-läge — om `true` måste deltagaren besöka kontrollerna
   * i `order`-fältets ordning (#1 först, sen #2, ...). GPS-triggern
   * öppnar bara nästa-i-ordning, andra kontroller visas som låsta på
   * kartan tills föregående är besvarade. Default (saknad/false) =
   * bakåtkompatibelt fri-läge där närmaste obesvarade triggas.
   * Skaparen opt-in:ar via toggle i CreateWalk.
   */
  enforceSequentialOrder?: boolean;
}

/**
 * En aktiv session – en omgång av en specifik promenad.
 * En promenad kan ha flera sessioner (t.ex. en per dag under ett event).
 * Sparas som ett dokument i Firestore-samlingen `sessions`.
 *
 * Obs: `participants` lagras **inte** i sessionsdokumentet utan i subcollection
 * `sessions/{sid}/participants/{uid}`. Fältet fylls i klientside av
 * `subscribeToSession`/`subscribeToWalkSessions` för bakåtkompatibilitet.
 */
export interface Session {
  /** Unikt ID för sessionen. */
  id: string;
  /** ID för den promenad som sessionen tillhör. */
  walkId: string;
  /**
   * Sessionens nuvarande status:
   * - `"waiting"`: Skapad men ingen har börjat.
   * - `"active"`: Minst en deltagare är aktiv.
   * - `"completed"`: Alla deltagare har avslutat.
   */
  status: "waiting" | "active" | "completed";
  /** Unix-tidsstämpel (millisekunder) för när sessionen skapades. */
  createdAt: number;
  /**
   * Deltagare i sessionen. Populeras klientside från subcollection — finns
   * **inte** i själva Firestore-dokumentet.
   */
  participants: Participant[];
}

/**
 * En deltagare i en session.
 * Sparas som eget dokument i `sessions/{sessionId}/participants/{uid}`
 * där dokument-ID:t alltid är deltagarens Firebase Auth UID.
 */
export interface Participant {
  /** Unikt ID för deltagaren (Firebase UID eller anonymt ID). */
  id: string;
  /** Deltagarens visningsnamn, angivet vid anslutning. */
  name: string;
  /** Lista med deltagarens svar på frågorna. */
  answers: Answer[];
  /** Unix-tidsstämpel (millisekunder) för när deltagaren avslutade promenaden. Saknas om inte klar. */
  completedAt?: number;
  /** Deltagarens poäng (antal korrekta svar). */
  score: number;
  /**
   * Antal steg under promenaden, från hårdvaru-stegräknaren via Pedometer.
   * Saknas om enheten inte har sensor, användaren nekade behörigheten,
   * eller om klienten är äldre än 1.2.0. Visas som extra-statistik
   * bredvid score — påverkar inte rangordningen i topplistan.
   */
  steps?: number;
}

/**
 * Ett enskilt svar på en fråga, registrerat av en deltagare.
 * Sparas som en del av `Participant.answers`-arrayen.
 */
export interface Answer {
  /** ID för den fråga som besvarades. */
  questionId: string;
  /** Index (0-baserat) för det valda svarsalternativet. */
  selectedOptionIndex: number;
  /** Huruvida svaret var korrekt. */
  correct: boolean;
  /** Unix-tidsstämpel (millisekunder) för när svaret registrerades. */
  answeredAt: number;
}

/**
 * En lokalt sparad promenad för offlineanvändning.
 * Lagras i AsyncStorage för att promenaden ska vara tillgänglig
 * utan internetanslutning.
 */
export interface SavedWalk {
  /** Den fullständiga promenadsdata. */
  walk: Walk;
  /** Unix-tidsstämpel (millisekunder) för när promenaden sparades lokalt. */
  savedAt: number;
  /** JSON-strängen som kodades i QR-koden när promenaden skapades. */
  qrData: string;
  /**
   * Lokalt användar-alias som visas istället för walk.title i listor.
   * Gör att deltagare kan särskilja flera promenader med samma namn
   * utan att ändra själva promenaden (vilket bara skaparen kan göra).
   * Om odefinierat eller tom sträng används walk.title.
   */
  alias?: string;
}

/**
 * Användarens feedback efter en slutförd promenad. Samlas i Firestore-
 * kollektionen `walkFeedback/{feedbackId}` så att skaparen kan se vad
 * deltagarna tyckte om sin walk (typiskt i en framtida WalkInsights-
 * sektion). Lagras separat från Participant så att en deltagare kan
 * radera sin spelhistorik utan att deras feedback följer med — och
 * tvärtom.
 *
 * Kategori-fälten är `null` när användaren bara gav övergripande tumme-
 * upp (eller hoppade över detaljen).
 */
export interface WalkFeedback {
  /** Genererad av klienten (utils/qr.ts generateId()) — används som doc-id. */
  id: string;
  /** Vilken walk feedback:en gäller (matchar `walks/{walkId}.id`). */
  walkId: string;
  /** Vilken session den slutfördes i. */
  sessionId: string;
  /** Skribentens Firebase Auth UID. */
  userId: string;
  /** Övergripande omdöme — tumme upp eller tumme ner. */
  overall: "up" | "down";
  /**
   * Detalj-omdömen — bara satta när användaren följde upp en tumme-ner
   * med specifika kategori-omdömen. `null` = "ingen åsikt / hoppade
   * över". Hjälper skaparen pinpointa vad i en mindre lyckad runda
   * som var dåligt.
   */
  details?: {
    /** Frågornas kvalitet (text, alternativ, svårighetsgrad). */
    questions: "up" | "down" | null;
    /** Punkternas placering (GPS-koordinater, svårtfunna kontroller). */
    points: "up" | "down" | null;
    /** Gränssnittet / appens upplevelse. */
    ui: "up" | "down" | null;
  };
  /** Unix-tidsstämpel (millisekunder). */
  createdAt: number;
}
