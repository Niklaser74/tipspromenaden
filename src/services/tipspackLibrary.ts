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
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  deleteDoc,
} from "firebase/firestore";
import { ref, getDownloadURL, deleteObject } from "firebase/storage";
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
 * Tipspack-metadata som ligger i Firestore. Speglar webbens
 * `lib/tipspackLibrary.ts` `TipspackMeta`. App-sidan behöver detta för
 * "Mina paket"-vyn där vi listar både publika och hemliga pack ägda av
 * den inloggade användaren.
 */
export interface MyTipspack {
  slug: string;
  ownerUid: string;
  ownerName?: string;
  name: string;
  description?: string;
  author?: string;
  language?: string;
  questionCount: number;
  fileSizeBytes: number;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Hämtar alla tipspacks ägda av en specifik uid. Inkluderar både
 * `isPublic: true` (synliga i biblioteket) och `false` (hemliga,
 * delas via länk). Sorteras klient-side på createdAt desc.
 */
export async function getMyTipspacks(uid: string): Promise<MyTipspack[]> {
  const q = query(collection(db, "tipspacks"), where("ownerUid", "==", uid));
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => d.data() as MyTipspack);
  list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return list;
}

/** Hämta direkt download-URL för en tipspack (signed Firebase Storage URL). */
export async function getTipspackDownloadUrl(slug: string): Promise<string> {
  return getDownloadURL(ref(storage, `tipspack/${slug}`));
}

/** Toggla isPublic på ett tipspack. Bara ägaren får göra detta (Firestore-rules). */
export async function setTipspackPublic(slug: string, isPublic: boolean): Promise<void> {
  const docRef = doc(db, "tipspacks", slug);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Pack hittades inte");
  const current = snap.data() as MyTipspack;
  await setDoc(docRef, { ...current, isPublic, updatedAt: Date.now() });
}

/** Radera tipspack — både Firestore-doc och Storage-fil. */
export async function deleteMyTipspack(slug: string): Promise<void> {
  await deleteObject(ref(storage, `tipspack/${slug}`)).catch(() => {
    // Filen kan saknas (om upload failade) — ignorera
  });
  await deleteDoc(doc(db, "tipspacks", slug));
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
