/**
 * @file supporters.ts
 * @description Läser supporter-listan från Firestore-doc:et `config/supporters`.
 *
 * Doc:et skrivs av admin (webbens /admin-sida eller `scripts/set-supporters.mjs`)
 * och visas på tacksidan (`SupportersScreen`). Skrivskydd via firestore.rules —
 * `config/{docId}` är public read, endast admin-UIDer får skriva, så ingen
 * regeländring behövdes för den här funktionen.
 *
 * Doc-form:
 *   {
 *     names: string[],                       // en supporter per element, visas i ordning
 *     message?: { sv?: string, en?: string } // valfri intro som ersätter default-texten
 *     updatedAt?: number
 *   }
 */
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import type { LanguageCode } from "../i18n";

export type SupportersConfig = {
  names: string[];
  message?: Partial<Record<"sv" | "en", string>>;
  updatedAt?: number;
};

/**
 * Hämtar supporter-doc:et. Returnerar tom lista om doc:et saknas (funktionen
 * är då bara "inte ifylld än" — inget felläge). Nät-/permissionsfel kastas
 * vidare så skärmen kan visa retry istället för en falskt tom sida.
 */
export async function getSupporters(): Promise<SupportersConfig> {
  const snap = await getDoc(doc(db, "config", "supporters"));
  if (!snap.exists()) return { names: [] };

  const data = snap.data() as Partial<SupportersConfig>;
  // Defensiv scrub — doc:et skrivs manuellt/via admin-UI, så lita inte på
  // formen: behåll bara icke-tomma strängar och capa längden för rendering.
  const names = Array.isArray(data.names)
    ? data.names
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
        .map((n) => n.trim().slice(0, 100))
    : [];

  const message =
    data.message && typeof data.message === "object"
      ? {
          sv: typeof data.message.sv === "string" ? data.message.sv : undefined,
          en: typeof data.message.en === "string" ? data.message.en : undefined,
        }
      : undefined;

  return { names, message };
}

/** Plocka rätt språkversion av intro-texten, med sv-fallback. */
export function pickSupportersMessage(
  message: SupportersConfig["message"],
  language: LanguageCode
): string | null {
  if (!message) return null;
  const prefer = language === "en" ? "en" : "sv";
  return message[prefer] ?? message.sv ?? message.en ?? null;
}
