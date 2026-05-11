/**
 * @file appUpdate.ts
 * @description Uppdaterings-flöden — både native (ny AAB i Play) och OTA.
 *
 * Native-gate: `config/appUpdate`-dokumentet i Firestore styr när användaren
 * ska uppmanas att hämta en ny AAB från Play Store. Vi jämför enhetens
 * `nativeBuildVersion` (versionCode på Android) mot `latestBuild`. Om det
 * understiger `minBuild` är uppdateringen tvingande, annars frivillig.
 *
 * OTA: `Constants.expoConfig.extra.releaseNotes` bakas in i varje bundle.
 * När en ny OTA hämtats och aktiverats läser vi noterna och visar en banner
 * en gång per `updateId` (state i AsyncStorage).
 *
 * ADMIN: doc:et `config/appUpdate` skrivs manuellt från Firebase-konsolen,
 * eller via admin-UI:t på webben. Skrivskydd via firestore.rules → endast
 * admin-UIDer (samma lista som `moderation/hidden`).
 */
import { Platform } from "react-native";
import { doc, getDoc } from "firebase/firestore";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "../config/firebase";
import type { LanguageCode } from "../i18n";

const PLAY_STORE_FALLBACK =
  "https://play.google.com/store/apps/details?id=com.tipspromenaden.app";

/**
 * Försvar-på-djupet mot komprometterat admin-konto: om någon lyckas ändra
 * `playStoreUrl` i Firestore till en phishing-/javascript-URL ska vi vägra
 * öppna den. Endast `https://play.google.com/`-URL:er accepteras.
 */
function sanitizePlayStoreUrl(raw: unknown): string {
  if (typeof raw !== "string") return PLAY_STORE_FALLBACK;
  if (!raw.startsWith("https://play.google.com/")) return PLAY_STORE_FALLBACK;
  return raw;
}

/** Doc-form i Firestore (`config/appUpdate`). */
export type AppUpdateConfig = {
  latestBuild?: number;
  minBuild?: number;
  latestVersion?: string;
  playStoreUrl?: string;
  releaseNotes?: Partial<Record<"sv" | "en", string>>;
};

export type NativeUpdateStatus =
  | { kind: "none" }
  | {
      kind: "optional" | "required";
      latestVersion?: string;
      playStoreUrl: string;
      releaseNotes?: Partial<Record<"sv" | "en", string>>;
    };

function getNativeBuildNumber(): number | null {
  // Android: versionCode (integer). iOS: build-string, t.ex. "14".
  const raw = Application.nativeBuildVersion;
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Hämtar config:en och avgör om en native-uppdatering behövs. Returnerar
 * `{ kind: "none" }` vid alla soft-fel (offline, doc saknas, ogiltig data)
 * så att en hängande nät-läsning aldrig blockerar app-start.
 */
export async function checkNativeUpdate(): Promise<NativeUpdateStatus> {
  if (Platform.OS === "web") return { kind: "none" };
  try {
    const current = getNativeBuildNumber();
    if (current == null) return { kind: "none" };

    const snap = await getDoc(doc(db, "config", "appUpdate"));
    if (!snap.exists()) return { kind: "none" };
    const data = snap.data() as AppUpdateConfig;

    const latest =
      typeof data.latestBuild === "number" ? data.latestBuild : null;
    const min = typeof data.minBuild === "number" ? data.minBuild : 0;
    if (latest == null || current >= latest) return { kind: "none" };

    return {
      kind: current < min ? "required" : "optional",
      latestVersion: data.latestVersion,
      playStoreUrl: sanitizePlayStoreUrl(data.playStoreUrl),
      releaseNotes: data.releaseNotes,
    };
  } catch {
    return { kind: "none" };
  }
}

/**
 * Release notes från den bundle som just nu körs. Stoppa nya OTA-noter i
 * `app.config.js` `extra.releaseNotes` i samma commit som triggar `eas update`,
 * så följer noterna med bundeln automatiskt.
 */
export function getEmbeddedReleaseNotes(): Partial<
  Record<"sv" | "en", string>
> | null {
  const notes = (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
    ?.releaseNotes;
  if (!notes || typeof notes !== "object") return null;
  return notes as Partial<Record<"sv" | "en", string>>;
}

/** Plocka rätt språkversion av release notes, med sv-fallback. */
export function pickNotes(
  notes: Partial<Record<"sv" | "en", string>> | null | undefined,
  language: LanguageCode
): string | null {
  if (!notes) return null;
  const prefer = language === "en" ? "en" : "sv";
  return notes[prefer] ?? notes.sv ?? notes.en ?? null;
}

// ─── OTA "har vi redan visat noterna för denna update?" ───
const OTA_SHOWN_KEY = "app.ota.lastShownUpdateId";

export async function getLastShownOtaUpdateId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(OTA_SHOWN_KEY);
  } catch {
    return null;
  }
}

export async function markOtaUpdateShown(updateId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(OTA_SHOWN_KEY, updateId);
  } catch {
    // best-effort — om vi misslyckas visas bannern en gång till, no big deal
  }
}

/** True om en OTA är aktiv (Updates.updateId finns och vi inte visat den än). */
export async function shouldShowOtaBanner(): Promise<boolean> {
  const id = Updates.updateId;
  if (!id) return false;
  const last = await getLastShownOtaUpdateId();
  return last !== id;
}
