/**
 * @file request.ts
 * @description Validering av indata till `generateQuestions` och
 * kreditkostnaden per förfrågan. Rena funktioner utan Firebase-beroenden
 * så att de kan testas direkt.
 */

export const LANGUAGES = ["sv", "en", "de", "no", "da", "fi", "fr", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

export const MODES = ["topic", "text", "place"] as const;
export type Mode = (typeof MODES)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const AUDIENCES = ["kids", "adults", "mixed"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const MIN_COUNT = 5;
export const MAX_COUNT = 30;
export const MAX_PROMPT_LENGTH = 500;
export const MAX_SOURCE_TEXT_LENGTH = 20_000;
export const MAX_PLACE_NAME_LENGTH = 200;

export interface GenerateRequest {
  mode: Mode;
  /** Ämne/önskemål i fritext. Krävs för "topic", valfri tilläggsinstruktion annars. */
  prompt: string;
  /** Källtext — krävs för "text". */
  sourceText?: string;
  /** Plats — krävs för "place". */
  place?: { name: string; lat?: number; lng?: number };
  count: number;
  language: Language;
  difficulty: Difficulty;
  audience: Audience;
  /** Klientgenererat id — gör anropet idempotent. */
  requestId: string;
}

/** Fel som ska visas för klienten som `invalid-argument`. */
export class RequestError extends Error {}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new RequestError(`Ogiltigt värde för ${field}.`);
  }
  return value as T;
}

function optionalString(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new RequestError(`${field} måste vara text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new RequestError(`${field} är för lång (max ${max} tecken).`);
  return trimmed;
}

function optionalCoordinate(value: unknown, limit: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limit) {
    throw new RequestError("Ogiltig koordinat.");
  }
  return value;
}

export function parseGenerateRequest(data: unknown): GenerateRequest {
  if (!data || typeof data !== "object") throw new RequestError("Tom förfrågan.");
  const d = data as Record<string, unknown>;

  const mode = oneOf(d.mode, MODES, "mode");
  const language = oneOf(d.language, LANGUAGES, "language");
  const difficulty = oneOf(d.difficulty ?? "medium", DIFFICULTIES, "difficulty");
  const audience = oneOf(d.audience ?? "mixed", AUDIENCES, "audience");

  if (typeof d.count !== "number" || !Number.isInteger(d.count) || d.count < MIN_COUNT || d.count > MAX_COUNT) {
    throw new RequestError(`Antal frågor måste vara ${MIN_COUNT}–${MAX_COUNT}.`);
  }

  if (typeof d.requestId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(d.requestId)) {
    throw new RequestError("Ogiltigt requestId.");
  }

  const prompt = optionalString(d.prompt, "prompt", MAX_PROMPT_LENGTH);
  const req: GenerateRequest = {
    mode,
    prompt,
    count: d.count,
    language,
    difficulty,
    audience,
    requestId: d.requestId,
  };

  if (mode === "topic" && !prompt) {
    throw new RequestError("Beskriv vilket ämne frågorna ska handla om.");
  }
  if (mode === "text") {
    const sourceText = optionalString(d.sourceText, "sourceText", MAX_SOURCE_TEXT_LENGTH);
    if (sourceText.length < 200) {
      throw new RequestError("Texten är för kort — klistra in minst 200 tecken.");
    }
    req.sourceText = sourceText;
  }
  if (mode === "place") {
    const p = (d.place ?? {}) as Record<string, unknown>;
    const name = optionalString(p.name, "place.name", MAX_PLACE_NAME_LENGTH);
    if (!name) throw new RequestError("Ange en plats.");
    req.place = {
      name,
      lat: optionalCoordinate(p.lat, 90),
      lng: optionalCoordinate(p.lng, 180),
    };
  }
  return req;
}

/**
 * Kreditkostnad: platsläget kostar dubbelt (webbsökning), och fler än 15
 * frågor kostar en kredit extra.
 */
export function creditCost(req: Pick<GenerateRequest, "mode" | "count">): number {
  return (req.mode === "place" ? 2 : 1) + (req.count > 15 ? 1 : 0);
}
