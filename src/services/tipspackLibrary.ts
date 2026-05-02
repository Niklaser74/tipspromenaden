/**
 * @file tipspackLibrary.ts
 * @description Hämtar publika tipspacks från två källor och mergar:
 *
 *   1. **Curated** — statiska filer i `tipspromenaden-web/public/tipspack/`,
 *      hostade som tipspromenaden.app/tipspack/<slug>.tipspack. Metadata
 *      kommer via `tipspromenaden.app/tipspack/index.json` som genereras
 *      vid web-build.
 *
 *   2. **Uploaded** — användar-uppladdade pack i Firebase Storage med
 *      metadata i Firestore-collection `tipspacks` (där `isPublic: true`).
 *
 * `getLibraryTipspacks()` returnerar en mergad lista med alla pack
 * normaliserade till samma form. `fetchTipspackContent(slug)` hämtar
 * fullständig JSON för förhandsgranskning eller import.
 *
 * Mönstret speglar webbens `tipspromenaden-web/src/lib/tipspackLibrary.ts`
 * + `UserTipspacks.tsx` — vi visar samma data i appen som på /tipspack.
 */

import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import { db, storage } from "../config/firebase";
import { WEB_HOST, TIPSPACK_PATH } from "../constants/deepLinks";

/** En post i bibliotek-listan. Förenad shape för curated + uploaded. */
export interface LibraryTipspack {
  slug: string;
  name: string;
  description: string;
  author: string;
  language: string;
  questionCount: number;
  fileSizeBytes: number;
  /** "curated" = statisk fil hostad på webben, "uploaded" = Firebase Storage. */
  source: "curated" | "uploaded";
  /** Direkt nedladdnings-URL (för debug/sharing — appen använder fetchTipspackContent). */
  downloadUrl: string;
}

/** Curated-list från webben. */
async function fetchCurated(): Promise<LibraryTipspack[]> {
  try {
    const res = await fetch(`https://${WEB_HOST}/${TIPSPACK_PATH}/index.json`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data?.packs)) return [];
    return data.packs.map((p: any): LibraryTipspack => ({
      slug: p.slug,
      name: p.name,
      description: p.description || "",
      author: p.author || "Okänd",
      language: p.language || "sv",
      questionCount: p.questionCount,
      fileSizeBytes: p.fileSizeBytes ?? 0,
      source: "curated",
      downloadUrl: p.url,
    }));
  } catch {
    return [];
  }
}

/** Uploaded-list från Firestore. */
async function fetchUploaded(): Promise<LibraryTipspack[]> {
  try {
    const q = query(collection(db, "tipspacks"), where("isPublic", "==", true));
    const snap = await getDocs(q);
    const items: LibraryTipspack[] = [];
    for (const docSnap of snap.docs) {
      const d = docSnap.data() as any;
      let downloadUrl = "";
      try {
        downloadUrl = await getDownloadURL(ref(storage, `tipspack/${d.slug}`));
      } catch {
        // Fil kan saknas — skippa då hela posten är meningslös utan
        // download-möjlighet.
        continue;
      }
      items.push({
        slug: d.slug,
        name: d.name,
        description: d.description || "",
        author: d.author || d.ownerName || "Okänd",
        language: d.language || "sv",
        questionCount: d.questionCount,
        fileSizeBytes: d.fileSizeBytes ?? 0,
        source: "uploaded",
        downloadUrl,
      });
    }
    return items;
  } catch {
    return [];
  }
}

/**
 * Hämtar hela biblioteket (curated + uploaded), mergat och sorterat.
 *
 * Sortering: curated först (vi har kuraterat dem för en anledning),
 * sedan uploaded efter senaste först. Dubletter på slug avgörs till
 * curated:s fördel.
 */
export async function getLibraryTipspacks(): Promise<LibraryTipspack[]> {
  const [curated, uploaded] = await Promise.all([fetchCurated(), fetchUploaded()]);
  const seen = new Set<string>();
  const merged: LibraryTipspack[] = [];
  for (const p of curated) {
    if (!seen.has(p.slug)) {
      merged.push(p);
      seen.add(p.slug);
    }
  }
  for (const p of uploaded) {
    if (!seen.has(p.slug)) {
      merged.push(p);
      seen.add(p.slug);
    }
  }
  return merged;
}

/**
 * Hämtar fullständig .tipspack-JSON för förhandsgranskning eller import.
 * Använder downloadUrl från LibraryTipspack-objektet.
 */
export async function fetchTipspackContent(pack: LibraryTipspack): Promise<{
  questions: { text: string; options: string[]; correctOptionIndex: number }[];
  name: string;
  description?: string;
  author?: string;
  language?: string;
}> {
  const res = await fetch(pack.downloadUrl);
  if (!res.ok) {
    throw new Error(`Kunde inte hämta paketet (HTTP ${res.status}).`);
  }
  return res.json();
}
