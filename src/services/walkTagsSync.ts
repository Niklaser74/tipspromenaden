/**
 * @file walkTagsSync.ts
 * @description Synk av taggar mellan lokal AsyncStorage och Firestore.
 *
 * Lagring i molnet:
 *   users/{uid}/meta/walkTags = { catalog, byWalk, updatedAt }
 *
 * Synkstrategi: last-write-wins på doc-nivå via `updatedAt`.
 *   - Pull: om cloud `updatedAt >= local`, ersätt local med cloud.
 *           Annars push local (cloud är äldre).
 *   - Push: skriv hela storen till `users/{uid}/meta/walkTags`.
 *
 * Det här hanterar huvudfallet — avinstall + återinstall, eller byte
 * av telefon, där local startar tomt (`updatedAt = 0`) så cloud vinner
 * och taggarna återställs. Multi-device-redigering medan offline är
 * "grov": senaste skrivning till molnet skriver över allt, men eftersom
 * taggar är privata och långsamt ändrade är det acceptabelt i v1.
 *
 * Init: `installWalkTagsSync()` sätter en push-hook i `walkTags.ts` som
 * fyr:ar efter varje lokal mutation. Hook:en är debounced så en burst
 * av ändringar (t.ex. snabba klick i tagg-modal) bara ger en upload.
 */

import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import {
  getRawStore,
  overwriteStore,
  setTagsPushHook,
  TagStore,
} from "./walkTags";

const META_SUBCOLLECTION = "meta";
const TAGS_DOC = "walkTags";
const PUSH_DEBOUNCE_MS = 1500;

function tagsDocRef(uid: string) {
  return doc(db, "users", uid, META_SUBCOLLECTION, TAGS_DOC);
}

function currentUid(): string | null {
  const u = auth.currentUser;
  if (!u || u.isAnonymous) return null;
  return u.uid;
}

/**
 * Hämta taggarna från molnet och merga in i lokal store enligt
 * last-write-wins på `updatedAt`. Returnerar true om local ändrades.
 *
 * Tolererar att cloud-doc saknas (nyinstallation som aldrig synkat)
 * och pushar då upp den lokala storen så molnet alltid speglar
 * senaste kända state.
 */
export async function pullWalkTagsFromCloud(uid: string): Promise<boolean> {
  const snap = await getDoc(tagsDocRef(uid));
  const local = await getRawStore();

  if (!snap.exists()) {
    // Inget i molnet än — lyft upp det lokala (om det innehåller något).
    if (local.catalog.length > 0 || Object.keys(local.byWalk).length > 0) {
      await pushWalkTagsToCloud(uid);
    }
    return false;
  }

  const cloud = snap.data() as Partial<TagStore>;
  const cloudStore: TagStore = {
    catalog: Array.isArray(cloud.catalog) ? cloud.catalog : [],
    byWalk:
      cloud.byWalk && typeof cloud.byWalk === "object" ? cloud.byWalk : {},
    updatedAt: typeof cloud.updatedAt === "number" ? cloud.updatedAt : 0,
  };

  if (cloudStore.updatedAt >= local.updatedAt) {
    // Adoptera molnet — rör bara lokal store om det faktiskt skiljer.
    if (cloudStore.updatedAt > local.updatedAt) {
      await overwriteStore(cloudStore);
      return true;
    }
    return false;
  }

  // Lokalt är nyare — skicka upp.
  await pushWalkTagsToCloud(uid);
  return false;
}

/** Skriv hela lokala storen till molnet under nuvarande uid. */
export async function pushWalkTagsToCloud(uid: string): Promise<void> {
  const local = await getRawStore();
  await setDoc(tagsDocRef(uid), local);
}

/**
 * Sätter upp auto-push: varje gång walkTags-storen skrivs lokalt
 * triggas en debounced upload. Kallas en gång vid app-start.
 */
export function installWalkTagsSync(): void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  setTagsPushHook(() => {
    const uid = currentUid();
    if (!uid) return; // Ingen inloggad / anonym — skippa cloud-sync.

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      pushWalkTagsToCloud(uid).catch((err) => {
        console.warn("[walkTagsSync] push failed:", err);
      });
    }, PUSH_DEBOUNCE_MS);
  });
}
