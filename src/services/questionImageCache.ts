/**
 * @file questionImageCache.ts
 * @description Pre-cachar frågebilder lokalt så de fungerar offline.
 *
 * Vid `saveWalkLocally()` triggas en best-effort nedladdning av varje
 * `Question.imageUrl` till `FileSystem.documentDirectory + cache/q-images/`.
 * `getCachedImageUri(walkId, questionId)` returnerar antingen den lokala
 * sökvägen (om filen finns) eller original-URL:n (fallback online).
 *
 * Best-effort på allting — nedladdning sker i bakgrunden och spelar
 * ingen roll om den misslyckas. Frågans `imageUrl` står som sanning;
 * cachen är bara en hastighets- och offline-optimering.
 */
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { Walk } from "../types";

const CACHE_DIR =
  Platform.OS === "web"
    ? null
    : `${FileSystem.documentDirectory}cache/q-images/`;

async function ensureDir(): Promise<boolean> {
  if (!CACHE_DIR) return false;
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
    return true;
  } catch {
    return false;
  }
}

function localPath(walkId: string, questionId: string): string | null {
  if (!CACHE_DIR) return null;
  // Filnamn: walkId__qid.jpg. Endast a-zA-Z0-9_- i id:n redan
  // (UUID-genererade) så ingen sanitering behövs.
  return `${CACHE_DIR}${walkId}__${questionId}.jpg`;
}

/**
 * Returnera lokal sökväg om filen finns cachad, annars null.
 * Komponenten kan välja `cached ?? original` som källa.
 */
export async function getCachedImageUri(
  walkId: string,
  questionId: string
): Promise<string | null> {
  const path = localPath(walkId, questionId);
  if (!path) return null;
  try {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists ? path : null;
  } catch {
    return null;
  }
}

/**
 * Ladda ned alla frågebilder för en walk i bakgrunden. Säker att kalla
 * även om alla redan är cachade — den hoppar över befintliga filer.
 * Best-effort: enskilda nedladdningsfel rapporteras inte.
 */
export async function cacheWalkImages(walk: Walk): Promise<void> {
  if (!CACHE_DIR) return;
  if (!(await ensureDir())) return;

  await Promise.all(
    walk.questions.map(async (q) => {
      if (!q.imageUrl) return;
      const path = localPath(walk.id, q.id);
      if (!path) return;
      try {
        const info = await FileSystem.getInfoAsync(path);
        if (info.exists) return;
        await FileSystem.downloadAsync(q.imageUrl, path);
      } catch {
        // Tyst fail — vi försöker igen vid nästa save / fungerar online ändå
      }
    })
  );
}

/**
 * Rensa cachade bilder för en specifik walk (vid `removeSavedWalk`).
 */
export async function clearWalkImages(walkId: string): Promise<void> {
  if (!CACHE_DIR) return;
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!info.exists) return;
    const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
    await Promise.all(
      files
        .filter((f) => f.startsWith(`${walkId}__`))
        .map((f) =>
          FileSystem.deleteAsync(`${CACHE_DIR}${f}`, { idempotent: true })
        )
    );
  } catch {
    // Tyst fail
  }
}
