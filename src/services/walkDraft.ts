/**
 * @file walkDraft.ts
 * @description Lokalt utkast (autospar) för pågående walk-redigering i
 * `CreateWalkScreen`. Sparar i AsyncStorage på debouncad basis så att en
 * krasch, omstart eller misstagklick inte raderar 30 minuters jobb.
 *
 * En draft är inte en komplett `Walk` — den saknar `createdBy`/`createdAt`
 * (de fylls vid `saveWalk`) och kan ha ofullständiga frågor (tomma fält).
 * Dessutom bär den `savedAt` så vi kan jämföra mot en ev. molnversions
 * `updatedAt` och bara erbjuda restore när drafter är nyare.
 *
 * Lifecycle:
 *   - CreateWalkScreen mount → `loadDraft(walkId)` → erbjud restore
 *   - State-ändring → debouncad `saveDraft(walkId, draft)`
 *   - Lyckad `saveWalk()` → `clearDraft(walkId)`
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Question } from "../types";

const KEY_PREFIX = "walk_draft_";

export interface WalkDraft {
  /** walkId — samma som det blivande Walk-dokumentet får. */
  id: string;
  title: string;
  questions: Question[];
  language?: string;
  isEvent: boolean;
  eventStartDate: string;
  eventEndDate: string;
  /** ms-timestamp för när drafted senast sparades lokalt. */
  savedAt: number;
}

function keyFor(walkId: string): string {
  return `${KEY_PREFIX}${walkId}`;
}

export async function saveDraft(draft: WalkDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(draft.id), JSON.stringify(draft));
  } catch (e) {
    // Disk full / corrupt storage — autospar är best-effort, blockera inte
    // användaren. Logga så vi ser om det börjar hända ofta.
    console.warn("[walkDraft] saveDraft failed:", e);
  }
}

export async function loadDraft(walkId: string): Promise<WalkDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(walkId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WalkDraft;
    // Sanity-check — om strukturen är trasig kasta tyst, vi vill inte
    // återställa korrupt data.
    if (typeof parsed.id !== "string" || !Array.isArray(parsed.questions)) {
      return null;
    }
    return parsed;
  } catch (e) {
    console.warn("[walkDraft] loadDraft failed:", e);
    return null;
  }
}

export async function clearDraft(walkId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(walkId));
  } catch (e) {
    console.warn("[walkDraft] clearDraft failed:", e);
  }
}
