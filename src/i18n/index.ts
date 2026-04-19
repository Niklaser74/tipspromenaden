/**
 * @file i18n/index.ts
 * @description Internationalisering.
 *
 * För att lägga till ett nytt språk: skapa `src/locales/<kod>.json` med
 * samma nycklar som `sv.json`, registrera i `translations` och lägg till
 * i `availableLanguages`.
 */

import { I18n } from "i18n-js";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState, useSyncExternalStore } from "react";

import sv from "../locales/sv.json";
import en from "../locales/en.json";

/** Nyckel i AsyncStorage där användarens språkval ligger. */
const STORAGE_KEY = "app.language";

/** Specialvärde som betyder "följ systemspråket". */
export const SYSTEM_LANGUAGE = "system";

export type LanguageCode = "sv" | "en" | typeof SYSTEM_LANGUAGE;

/** Språk som visas i språkväljaren. Lägg till fler här när du lägger till nya locales. */
export const availableLanguages: { code: LanguageCode; labelKey: string }[] = [
  { code: SYSTEM_LANGUAGE, labelKey: "settings.languageSystem" },
  { code: "sv", labelKey: "settings.languageSwedish" },
  { code: "en", labelKey: "settings.languageEnglish" },
];

/** Översättningstabell. Registrera nya språk här. */
const translations = { sv, en };

/** Global i18n-instans. */
export const i18n = new I18n(translations);
i18n.enableFallback = true;
i18n.defaultLocale = "sv";

/**
 * Räknar ut vilket lokalspråk som ska användas just nu givet användarens val
 * (som kan vara `"system"`) och enhetens språk.
 */
function resolveLocale(userChoice: LanguageCode): string {
  if (userChoice !== SYSTEM_LANGUAGE) return userChoice;
  const deviceLocale = Localization.getLocales()[0]?.languageCode ?? "sv";
  // Om enhetsspråket inte stöds — fall tillbaka till svenska.
  return deviceLocale in translations ? deviceLocale : "sv";
}

// Egen external store istället för Context — undviker att varje Provider-
// render triggar rerender av hela appen vid språkbyte.
let currentChoice: LanguageCode = SYSTEM_LANGUAGE;
const listeners = new Set<() => void>();

function applyLocale() {
  i18n.locale = resolveLocale(currentChoice);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string {
  return i18n.locale;
}

/**
 * Initialiserar i18n. Ska anropas en gång vid app-start, innan något UI
 * renderas. Läser sparat val från AsyncStorage och sätter locale därefter.
 */
export async function initI18n(): Promise<void> {
  try {
    const saved = (await AsyncStorage.getItem(STORAGE_KEY)) as LanguageCode | null;
    currentChoice = saved ?? SYSTEM_LANGUAGE;
  } catch {
    currentChoice = SYSTEM_LANGUAGE;
  }
  applyLocale();
}

/**
 * Returnerar användarens aktuella språkval (kan vara `"system"`).
 * Används av SettingsScreen för att markera vilket val som är aktivt.
 */
export function getLanguageChoice(): LanguageCode {
  return currentChoice;
}

/**
 * Sätter appspråk och persistar valet. Alla komponenter som använder
 * `useTranslation()` rerenderas automatiskt.
 */
export async function setLanguage(choice: LanguageCode): Promise<void> {
  if (choice === currentChoice) return;
  currentChoice = choice;
  applyLocale();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Inte kritiskt — valet ligger kvar i minnet till omstart.
  }
}

/**
 * Hook: returnerar en översättningsfunktion `t` som automatiskt uppdateras
 * när språket ändras.
 */
export function useTranslation() {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    t: (key: string, options?: Record<string, any>) => i18n.t(key, options),
    locale: i18n.locale,
  };
}

/**
 * Hook: returnerar användarens val (inkl `"system"`). Användbart i
 * SettingsScreen där vi vill visa "Systemspråk" som eget alternativ.
 */
export function useLanguageChoice(): LanguageCode {
  const [choice, setChoice] = useState<LanguageCode>(currentChoice);
  useEffect(() => {
    const unsub = subscribe(() => setChoice(currentChoice));
    return unsub;
  }, []);
  return choice;
}
