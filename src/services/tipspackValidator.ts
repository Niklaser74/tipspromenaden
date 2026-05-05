/**
 * @file tipspackValidator.ts
 * @description Delad validator + typer för `.tipspack`-filformatet.
 *
 * Den här filen är **medvetet ren TypeScript** utan RN-, Expo-, Astro-
 * eller Firebase-deps, så att den kan vara identisk i app- och web-repot.
 *
 * **HÅRT KRAV:** håll i synk med `tipspromenaden-web/src/lib/tipspackValidator.ts`.
 * När formatet ändras (nytt fält, ändrade gränser): redigera båda filerna
 * i samma PR. De ska vara byte-för-byte identiska.
 *
 * Filformat (version 1.0):
 * ```json
 * {
 *   "format": "tipspack",
 *   "version": "1.0",
 *   "name": "Stockholms gamla stan",
 *   "description": "30 frågor om Stadsholmens historia",
 *   "author": "Tipspromenaden AB",
 *   "language": "sv",
 *   "questions": [
 *     { "text": "...", "options": ["...", "..."], "correctOptionIndex": 0 }
 *   ]
 * }
 * ```
 */

/** En fråga i batteriet — har ingen koordinat eller ordning än. */
export interface BatteryQuestion {
  text: string;
  options: string[];
  correctOptionIndex: number;
}

/** Komplett batteri (tipspack-fil) efter parsing + validering. */
export interface QuestionBattery {
  format: "tipspack";
  version: string;
  name: string;
  description?: string;
  author?: string;
  /**
   * ISO 639-1-kod för det språk frågorna är skrivna på (t.ex. `"sv"`, `"en"`).
   * Om fältet finns sätter appen automatiskt promenadspråket vid import,
   * så att skaparen slipper välja manuellt.
   */
  language?: string;
  questions: BatteryQuestion[];
}

/** Max filstorlek (bytes) — skyddar mot DoS vid import av uppblåsta filer. */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
/** Max antal frågor per batteri — skyddar mot enorma arrayer. */
export const MAX_QUESTIONS = 500;
/** Max längd på frågetext och svarsalternativ. */
export const MAX_TEXT_LENGTH = 1000;
/** Max antal svarsalternativ per fråga. */
export const MAX_OPTIONS = 10;

/**
 * Validerar att ett okänt JSON-objekt har rätt struktur för ett frågebatteri.
 * Kastar `Error` med beskrivande svenskt meddelande vid problem så det går
 * att visa direkt i UI utan vidare bearbetning.
 */
export function validateBattery(data: any): asserts data is QuestionBattery {
  if (!data || typeof data !== "object") {
    throw new Error("Filen är inte ett giltigt JSON-objekt.");
  }
  if (data.format !== "tipspack") {
    throw new Error(
      `Fel filformat. Förväntade "tipspack" men fick "${data.format}".`
    );
  }
  if (typeof data.version !== "string") {
    throw new Error("Saknar versionsfält.");
  }
  if (typeof data.name !== "string" || !data.name.trim()) {
    throw new Error("Saknar namn på frågebatteriet.");
  }
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error("Frågebatteriet innehåller inga frågor.");
  }
  if (data.questions.length > MAX_QUESTIONS) {
    throw new Error(
      `Frågebatteriet har för många frågor (max ${MAX_QUESTIONS}).`
    );
  }
  data.questions.forEach((q: any, idx: number) => {
    const prefix = `Fråga ${idx + 1}:`;
    if (typeof q.text !== "string" || !q.text.trim()) {
      throw new Error(`${prefix} saknar frågetext.`);
    }
    if (q.text.length > MAX_TEXT_LENGTH) {
      throw new Error(`${prefix} frågetexten är för lång.`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`${prefix} måste ha minst 2 svarsalternativ.`);
    }
    if (q.options.length > MAX_OPTIONS) {
      throw new Error(
        `${prefix} har för många svarsalternativ (max ${MAX_OPTIONS}).`
      );
    }
    if (
      q.options.some(
        (o: any) =>
          typeof o !== "string" || !o.trim() || o.length > MAX_TEXT_LENGTH
      )
    ) {
      throw new Error(`${prefix} har tomma eller för långa svarsalternativ.`);
    }
    if (
      typeof q.correctOptionIndex !== "number" ||
      q.correctOptionIndex < 0 ||
      q.correctOptionIndex >= q.options.length
    ) {
      throw new Error(`${prefix} har ogiltigt rätt-svar-index.`);
    }
  });
}
