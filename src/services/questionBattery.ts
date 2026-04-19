/**
 * @file questionBattery.ts
 * @description Hanterar import och validering av frågebatterier (.tipspack-filer).
 *
 * Ett frågebatteri är en JSON-fil med en lista av frågor utan koordinater.
 * Skaparen importerar filen i CreateWalkScreen och placerar sedan varje fråga
 * på kartan en efter en. Detta möjliggör försäljning av färdiga frågesamlingar
 * (t.ex. "Stockholms gamla stan") som köpare kan använda i egna promenader.
 *
 * Filformat (version 1.0):
 * ```json
 * {
 *   "format": "tipspack",
 *   "version": "1.0",
 *   "name": "Stockholms gamla stan",
 *   "description": "30 frågor om Stadsholmens historia",
 *   "author": "Tipspromenaden AB",
 *   "questions": [
 *     {
 *       "text": "Vilket år grundades Stockholm?",
 *       "options": ["1252", "1350", "1100", "1523"],
 *       "correctOptionIndex": 0
 *     }
 *   ]
 * }
 * ```
 */

import * as DocumentPicker from "expo-document-picker";
// SDK 55: nya File/Directory-API:t är inte stabilt än, så vi använder legacy.
import * as FileSystem from "expo-file-system/legacy";
import { Question } from "../types";
import { generateId } from "../utils/qr";

/** En fråga i batteriet — har ingen koordinat eller ordning än. */
export interface BatteryQuestion {
  text: string;
  options: string[];
  correctOptionIndex: number;
}

/** Metadata + frågor från en importerad .tipspack-fil. */
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
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
/** Max antal frågor per batteri — skyddar mot enorma arrayer. */
const MAX_QUESTIONS = 500;
/** Max längd på frågetext och svarsalternativ. */
const MAX_TEXT_LENGTH = 1000;

/**
 * Resultat från ett importförsök.
 * Antingen lyckades importen och vi har ett batteri, eller så finns ett felmeddelande.
 */
export type BatteryImportResult =
  | { success: true; battery: QuestionBattery }
  | { success: false; error: string };

/**
 * Validerar att ett okänt JSON-objekt har rätt struktur för ett frågebatteri.
 * Kastar Error med beskrivande meddelande vid problem.
 */
function validateBattery(data: any): asserts data is QuestionBattery {
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
    if (q.options.length > 10) {
      throw new Error(`${prefix} har för många svarsalternativ (max 10).`);
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

/**
 * Visar en filväljare och försöker läsa den valda filen som ett frågebatteri.
 * Returnerar `null` om användaren avbryter, annars ett resultat.
 *
 * @example
 * const result = await pickAndParseBattery();
 * if (result === null) return; // användaren avbröt
 * if (result.success) {
 *   console.log(`Importerade ${result.battery.questions.length} frågor`);
 * } else {
 *   Alert.alert("Fel", result.error);
 * }
 */
export async function pickAndParseBattery(): Promise<BatteryImportResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // Tillåter alla typer eftersom .tipspack är vårt eget format
    // (vissa Android-filhanterare visar inte .tipspack om vi begränsar för hårt).
    type: ["application/json", "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) {
    return null;
  }

  const file = result.assets?.[0];
  if (!file) {
    return { success: false, error: "Ingen fil valdes." };
  }

  // DocumentPicker ger `size` när det är tillgängligt (web + nyare native).
  // Avvisa stora filer tidigt för att slippa läsa in dem i minnet.
  if (typeof file.size === "number" && file.size > MAX_FILE_SIZE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      success: false,
      error: `Filen är för stor (${mb} MB). Max ${
        MAX_FILE_SIZE_BYTES / (1024 * 1024)
      } MB.`,
    };
  }

  try {
    const content = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    // Extra säkerhetsbälte om `file.size` saknades.
    if (content.length > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: `Filen är för stor. Max ${
          MAX_FILE_SIZE_BYTES / (1024 * 1024)
        } MB.`,
      };
    }
    const data = JSON.parse(content);
    validateBattery(data);
    return { success: true, battery: data };
  } catch (e: any) {
    if (e instanceof SyntaxError) {
      return { success: false, error: "Filen är inte giltig JSON." };
    }
    return {
      success: false,
      error: e?.message || "Okänt fel vid import av frågebatteri.",
    };
  }
}

/**
 * Konverterar en BatteryQuestion + koordinat till en fullständig Question.
 * Används när skaparen placerar en batterifråga på kartan.
 */
export function batteryQuestionToQuestion(
  bq: BatteryQuestion,
  coordinate: { latitude: number; longitude: number },
  order: number
): Question {
  return {
    id: generateId(),
    text: bq.text,
    options: [...bq.options],
    correctOptionIndex: bq.correctOptionIndex,
    coordinate,
    order,
  };
}
