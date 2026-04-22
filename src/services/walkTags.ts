/**
 * @file walkTags.ts
 * @description Lokal hantering av privata taggar för promenader.
 *
 * Taggarna är per enhet och ligger bara i AsyncStorage — de synkar inte
 * mot Firestore. Tanken är att användaren kan organisera sina egna
 * promenader (både skapade och scannade) i mappar som "Kunder", "Tester",
 * "Vinter 2026" utan att ändra på själva walk-dokumentet.
 *
 * En framtida v2 kan lägga till **delade** taggar som ligger direkt på
 * walk-dokumentet (skaparen sätter, alla som scannar ser). De två
 * uppsättningarna är avsiktligt separata — privata är organisation,
 * delade är kategorisering.
 *
 * Schema i AsyncStorage:
 *   walk_tags_v1 = {
 *     catalog: Tag[],                         // alla taggar användaren skapat
 *     byWalk: Record<walkId, tagId[]>         // vilka taggar en walk har
 *   }
 *
 * Taggar sparas som egna objekt med stabil id. Det gör att byta namn på
 * en tagg inte kräver att man rör `byWalk`-mappningen — bara `catalog`.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { generateId } from "../utils/qr";

const WALK_TAGS_KEY = "walk_tags_v1";

export interface Tag {
  id: string;
  name: string;
  createdAt: number;
}

interface TagStore {
  catalog: Tag[];
  byWalk: Record<string, string[]>;
}

const EMPTY: TagStore = { catalog: [], byWalk: {} };

async function readStore(): Promise<TagStore> {
  try {
    const raw = await AsyncStorage.getItem(WALK_TAGS_KEY);
    if (!raw) return { catalog: [], byWalk: {} };
    const parsed = JSON.parse(raw) as Partial<TagStore>;
    return {
      catalog: Array.isArray(parsed.catalog) ? parsed.catalog : [],
      byWalk:
        parsed.byWalk && typeof parsed.byWalk === "object"
          ? parsed.byWalk
          : {},
    };
  } catch {
    return { ...EMPTY };
  }
}

async function writeStore(store: TagStore): Promise<void> {
  await AsyncStorage.setItem(WALK_TAGS_KEY, JSON.stringify(store));
}

/** Hämta hela tagg-katalogen, sorterad alfabetiskt efter namn. */
export async function getAllTags(): Promise<Tag[]> {
  const { catalog } = await readStore();
  return [...catalog].sort((a, b) =>
    a.name.localeCompare(b.name, "sv", { sensitivity: "base" })
  );
}

/** Hämta mappningen walkId → tagId[]. Promenader utan taggar saknas i map:en. */
export async function getTagsByWalk(): Promise<Record<string, string[]>> {
  const { byWalk } = await readStore();
  return byWalk;
}

/**
 * Skapa en ny tagg. Om en tagg med samma (case-insensitive trimmade)
 * namn redan finns returneras den befintliga — duplicat hindras eftersom
 * det bara skulle skapa förvirring i filterraden.
 */
export async function createTag(rawName: string): Promise<Tag> {
  const name = rawName.trim();
  if (!name) throw new Error("Tagg-namn kan inte vara tomt");
  if (name.length > 30) throw new Error("Tagg-namnet är för långt");

  const store = await readStore();
  const existing = store.catalog.find(
    (t) => t.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) return existing;

  const tag: Tag = { id: generateId(), name, createdAt: Date.now() };
  store.catalog.push(tag);
  await writeStore(store);
  return tag;
}

/** Byt namn på en befintlig tagg. No-op om tagg-id:t inte finns. */
export async function renameTag(tagId: string, rawName: string): Promise<void> {
  const name = rawName.trim();
  if (!name) throw new Error("Tagg-namn kan inte vara tomt");
  if (name.length > 30) throw new Error("Tagg-namnet är för långt");

  const store = await readStore();
  const tag = store.catalog.find((t) => t.id === tagId);
  if (!tag) return;
  tag.name = name;
  await writeStore(store);
}

/** Radera en tagg globalt — också från alla walks som använder den. */
export async function deleteTag(tagId: string): Promise<void> {
  const store = await readStore();
  store.catalog = store.catalog.filter((t) => t.id !== tagId);
  for (const walkId of Object.keys(store.byWalk)) {
    store.byWalk[walkId] = store.byWalk[walkId].filter((id) => id !== tagId);
    if (store.byWalk[walkId].length === 0) delete store.byWalk[walkId];
  }
  await writeStore(store);
}

/**
 * Sätt taggar för en walk (ersätter tidigare uppsättning). Tomma arrayer
 * rensas bort från `byWalk` för att hålla storleken minimal. Invalida
 * tagg-id:n (t.ex. refererar till raderade taggar) filtreras bort tyst.
 */
export async function setTagsForWalk(
  walkId: string,
  tagIds: string[]
): Promise<void> {
  const store = await readStore();
  const valid = new Set(store.catalog.map((t) => t.id));
  const cleaned = Array.from(new Set(tagIds)).filter((id) => valid.has(id));
  if (cleaned.length === 0) {
    delete store.byWalk[walkId];
  } else {
    store.byWalk[walkId] = cleaned;
  }
  await writeStore(store);
}

/** Ta bort alla taggar från en walk (används vid borttagning av promenad). */
export async function removeWalkFromTags(walkId: string): Promise<void> {
  const store = await readStore();
  if (!(walkId in store.byWalk)) return;
  delete store.byWalk[walkId];
  await writeStore(store);
}
