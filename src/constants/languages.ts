/**
 * @file languages.ts
 * @description Stödda språk för promenader och deras flagg-emojis.
 *
 * Listan hålls medvetet liten — lägg till koder allt eftersom behovet
 * växer. Varje post matchar en ISO 639-1-kod.
 */

export interface Language {
  /** ISO 639-1-kod (t.ex. "sv"). */
  code: string;
  /** Flagg-emoji för landet/regionen som primärt talar språket. */
  flag: string;
  /** Lokalt namn på språket. */
  label: string;
}

export const LANGUAGES: Language[] = [
  { code: "sv", flag: "🇸🇪", label: "Svenska" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "no", flag: "🇳🇴", label: "Norsk" },
  { code: "da", flag: "🇩🇰", label: "Dansk" },
  { code: "fi", flag: "🇫🇮", label: "Suomi" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "es", flag: "🇪🇸", label: "Español" },
];

/** Returnerar flagg-emoji för given språkkod, eller "" om okänd. */
export function flagForLanguage(code: string | undefined): string {
  if (!code) return "";
  return LANGUAGES.find((l) => l.code === code)?.flag ?? "";
}
