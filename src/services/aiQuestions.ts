/**
 * @file aiQuestions.ts
 * @description AI-genererade frågor i appen — förbrukning av krediter som
 * redan finns på kontot.
 *
 * Appen anropar samma callable som webben (`generateQuestions` i
 * `functions/src/generate.ts`) och läser samma saldo (`billing/{uid}`).
 * Servern drar krediterna; klienten kan inte skriva i `billing/`.
 *
 * VIKTIGT — butiksvillkoren styr vad som får finnas här:
 *
 * - **Inget köp, inga priser och ingen länk till köp i appen.** Google
 *   Plays betalningspolicy tillåter att en app ger tillgång till sådant
 *   som betalats någon annanstans ("consumption-only"), men inte att den
 *   leder användaren till en annan betalmetod. Lägg aldrig till en
 *   köpknapp, en länk till webbens köpdialog eller säljande text.
 * - **Bara Android.** På iOS kräver App Store-riktlinje 3.1.1 köp i appen
 *   för att låsa upp funktioner, och 3.1.3(b) tillåter webbköpta krediter
 *   bara om samma krediter också säljs som köp i appen. iOS saknar
 *   dessutom App Check i appen, som funktionen kräver.
 * - **Fjärrflagga.** `config/aiQuestions.androidEnabled` måste vara `true`.
 *   Saknas dokumentet eller går det inte att läsa är funktionen av, så att
 *   den kan stängas utan ny release om Google invänder.
 * - Funktionen visas bara för konton som redan har ett `billing`-dokument,
 *   alltså konton som har haft krediter. Den ska inte marknadsföras för
 *   den som aldrig köpt.
 *
 * Utredningen står i vaultets projektnot "Tipspromenaden - AI-frågor och
 * Stripe" (2026-11-24). Kontraktet står i `docs/ai-questions-backend.md`.
 */
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import app, { db } from "../config/firebase";
import type { QuestionBattery } from "./tipspackValidator";

export type AiMode = "topic" | "text" | "place";
export type AiDifficulty = "easy" | "medium" | "hard";
export type AiAudience = "kids" | "adults" | "mixed";

export interface AiGenerateRequest {
  mode: AiMode;
  prompt: string;
  sourceText?: string;
  place?: { name: string; lat?: number; lng?: number };
  count: number;
  language: string;
  difficulty: AiDifficulty;
  audience: AiAudience;
  /** Samma id vid nytt försök ger inget dubbeldrag. */
  requestId: string;
}

export interface AiGenerateResponse {
  battery: QuestionBattery;
  notes: { explanation: string; sourceUrl: string }[];
  creditsLeft: number;
  cost: number;
}

/** Samma gränser som backendens `request.ts`. */
export const AI_LIMITS = {
  minCount: 5,
  maxCount: 30,
  maxPrompt: 500,
  minSourceText: 200,
  maxSourceText: 20_000,
  maxPlace: 200,
};

/** Språk som backenden kan skriva frågor på. */
export const AI_LANGUAGES = ["sv", "en", "de", "no", "da", "fi", "fr", "es"];

/**
 * Kreditkostnad — kopia av `creditCost()` i backendens `request.ts`.
 * Visas bara före anropet; servern drar det riktiga beloppet.
 */
export function creditCost(mode: AiMode, count: number): number {
  return (mode === "place" ? 2 : 1) + (count > 15 ? 1 : 0);
}

export type AiErrorReason =
  | "no-credits"
  | "rate-limited"
  | "in-progress"
  | "anonymous"
  | "generation-failed"
  | "app-check"
  | "network"
  | "unknown";

export class AiError extends Error {
  constructor(
    public reason: AiErrorReason,
    message: string
  ) {
    super(message);
  }
}

/** Översätter ett fel från callable-anropet till en orsak som UI:t kan visa. */
export function toAiError(e: unknown): AiError {
  const err = e as { code?: string; message?: string; details?: { reason?: string } };
  const reason = err?.details?.reason;
  const message = err?.message ?? String(e);
  if (
    reason === "no-credits" ||
    reason === "rate-limited" ||
    reason === "in-progress" ||
    reason === "anonymous" ||
    reason === "generation-failed"
  ) {
    return new AiError(reason, message);
  }
  const code = err?.code ?? "";
  // Avvisad App Check-token (t.ex. sidoladdad build utan Play Integrity).
  if (code === "functions/unauthenticated" || code === "functions/failed-precondition") {
    return new AiError("app-check", message);
  }
  if (code === "functions/unavailable" || code === "functions/deadline-exceeded" || code === "functions/internal") {
    return new AiError("network", message);
  }
  return new AiError("unknown", message);
}

export function newRequestId(): string {
  // RFC 4122 v4 utan beroende på crypto.randomUUID, som saknas i Hermes.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Genereringen tar ofta 20–60 s (platsläget längre) — backendens tak är 300 s. */
export async function generateQuestions(req: AiGenerateRequest): Promise<AiGenerateResponse> {
  const callable = httpsCallable<AiGenerateRequest, AiGenerateResponse>(
    getFunctions(app, "europe-north1"),
    "generateQuestions",
    { timeout: 300_000 }
  );
  try {
    return (await callable(req)).data;
  } catch (e) {
    throw toAiError(e);
  }
}

/**
 * Fjärrflaggan. `false` vid alla fel och på allt som inte är Android —
 * funktionen ska vara av om vi inte säkert vet att den får vara på.
 */
export async function isAiEnabledRemotely(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    const snap = await getDoc(doc(db, "config", "aiQuestions"));
    return snap.exists() && snap.data().androidEnabled === true;
  } catch {
    return false;
  }
}

export interface AiCredits {
  /** Köpta + Pro-krediter, samma summa som webben visar. */
  total: number;
}

/**
 * Om AI-funktionen ska visas, och i så fall saldot.
 *
 * `null` = visa ingenting: fel plattform, flaggan av, inte inloggad med
 * ett riktigt konto, eller ett konto som aldrig haft krediter.
 */
export function useAiCredits(uid: string | null | undefined, isAnonymous: boolean): AiCredits | null {
  const [enabled, setEnabled] = useState(false);
  const [credits, setCredits] = useState<AiCredits | null>(null);

  useEffect(() => {
    let cancelled = false;
    isAiEnabledRemotely().then((on) => {
      if (!cancelled) setEnabled(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !uid || isAnonymous) {
      setCredits(null);
      return;
    }
    return onSnapshot(
      doc(db, "billing", uid),
      (snap) => {
        if (!snap.exists()) {
          setCredits(null);
          return;
        }
        const d = snap.data();
        const purchased = typeof d.credits === "number" ? d.credits : 0;
        const subscription = typeof d.subscriptionCredits === "number" ? d.subscriptionCredits : 0;
        setCredits({ total: purchased + subscription });
      },
      () => setCredits(null)
    );
  }, [enabled, uid, isAnonymous]);

  return credits;
}
