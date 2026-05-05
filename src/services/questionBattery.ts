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
import {
  validateBattery,
  MAX_FILE_SIZE_BYTES,
  type BatteryQuestion,
  type QuestionBattery,
} from "./tipspackValidator";

// Återexport så befintliga callsites (CreateWalkScreen m.fl.) inte behöver
// uppdatera sina imports.
export type { BatteryQuestion, QuestionBattery };

/**
 * Resultat från ett importförsök.
 * Antingen lyckades importen och vi har ett batteri, eller så finns ett felmeddelande.
 */
export type BatteryImportResult =
  | { success: true; battery: QuestionBattery }
  | { success: false; error: string };

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
