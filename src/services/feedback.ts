/**
 * @file feedback.ts
 * @description Ljud + haptik-feedback. En central modul så call-sites
 * blir enradiga och allt går via samma av/på-preferens.
 *
 * - Ljud: tre genererade WAV:ar (se scripts/gen-sounds.mjs). Spelare
 *   skapas lazy vid första uppspelning; replay = seekTo(0)+play().
 * - Haptik: expo-haptics (notification/impact).
 * - Allt fail-safe: saknad enhet/permission/ljudfokus → tyst no-op,
 *   aldrig en kastad exception som kan nå ErrorBoundary.
 * - En gemensam toggle (`feedback_enabled_v1` i AsyncStorage, default
 *   på). Sätts från SettingsScreen. Cachas i minnet; första anropet
 *   läser disk, `setFeedbackEnabled` uppdaterar både disk och cache.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";

const PREF_KEY = "feedback_enabled_v1";

let enabledCache: boolean | null = null;

/** Läs preferensen (cachad). Default på. Tyst fallback vid läsfel. */
export async function isFeedbackEnabled(): Promise<boolean> {
  if (enabledCache !== null) return enabledCache;
  try {
    const raw = await AsyncStorage.getItem(PREF_KEY);
    enabledCache = raw === null ? true : raw === "1";
  } catch {
    enabledCache = true;
  }
  return enabledCache;
}

/** Synkron läsning för hot paths — kan vara null tills första async-läsning. */
function enabledNow(): boolean {
  // Om cachen inte hydrerats än: anta på (feedback ska inte tappas vid
  // app-start). Async-versionen hydrerar cachen vid första riktiga koll.
  return enabledCache !== false;
}

export async function setFeedbackEnabled(on: boolean): Promise<void> {
  enabledCache = on;
  try {
    await AsyncStorage.setItem(PREF_KEY, on ? "1" : "0");
  } catch {
    // Inte kritiskt — valet ligger i minnet till omstart.
  }
}

// ─── Ljud ───────────────────────────────────────────────────────────
// Lazy-skapade spelare. Skapas först vid behov så modulladdning inte
// drar igång ljud-subsystemet i onödan (t.ex. på web).
const sources = {
  correct: require("../../assets/sounds/correct.wav"),
  wrong: require("../../assets/sounds/wrong.wav"),
  complete: require("../../assets/sounds/complete.wav"),
} as const;
type SoundKey = keyof typeof sources;
const players: Partial<Record<SoundKey, AudioPlayer>> = {};

function play(key: SoundKey) {
  if (Platform.OS === "web") return; // expo-audio-replay opålitligt på web
  if (!enabledNow()) return;
  try {
    let p = players[key];
    if (!p) {
      p = createAudioPlayer(sources[key]);
      players[key] = p;
    }
    p.seekTo(0);
    p.play();
  } catch {
    // Ljudfokus/enhet saknas — tyst.
  }
}

// ─── Haptik ─────────────────────────────────────────────────────────
function notify(type: Haptics.NotificationFeedbackType) {
  if (!enabledNow()) return;
  Haptics.notificationAsync(type).catch(() => {});
}
function impact(style: Haptics.ImpactFeedbackStyle) {
  if (!enabledNow()) return;
  Haptics.impactAsync(style).catch(() => {});
}

// ─── Publika kombinerade helpers (enradiga call-sites) ───────────────

/** Rätt svar: pigg ton + success-haptik. */
export function feedbackCorrect() {
  play("correct");
  notify(Haptics.NotificationFeedbackType.Success);
}

/** Fel svar: låg ton + error-haptik. */
export function feedbackWrong() {
  play("wrong");
  notify(Haptics.NotificationFeedbackType.Error);
}

/** Promenad klar: arpeggio + success-haptik. */
export function feedbackComplete() {
  play("complete");
  notify(Haptics.NotificationFeedbackType.Success);
}

/** Ankomst till kontrollpunkt: medium impact (känns i fickan). */
export function feedbackArrival() {
  impact(Haptics.ImpactFeedbackStyle.Medium);
}

/** Hydrera cachen tidigt (anropas en gång från App.tsx). */
export function warmFeedbackPref() {
  void isFeedbackEnabled();
}
