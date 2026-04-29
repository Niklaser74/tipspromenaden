/**
 * @file questionImage.ts
 * @description Hantering av bilder kopplade till enskilda frågor.
 *
 * Skaparen kan via `pickAndUploadQuestionImage` välja en bild från enhetens
 * bildbibliotek, komprimera den (~1600px bred, JPEG 70%) och ladda upp den
 * till Firebase Storage på pathen `walks/{walkId}/questions/{questionId}.jpg`.
 * Funktionen returnerar en publik nedladdnings-URL som sedan sparas i
 * `Question.imageUrl` och syns för alla deltagare under promenaden.
 *
 * Komprimeringen görs för att hålla storleken under Storage-reglernas
 * 2 MB-gräns och för att spara bandbredd under cykelturer och vandring
 * där mobilnätet ofta är svagt.
 */

import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { storage, auth } from "../config/firebase";

/** Max bredd i pixlar efter komprimering. Höjd skalas proportionellt. */
const MAX_WIDTH = 1600;
/** JPEG-kvalitet (0-1) efter komprimering. */
const COMPRESS_QUALITY = 0.7;

/**
 * Öppnar bildväljaren, komprimerar vald bild och laddar upp den till
 * Firebase Storage.
 *
 * @param walkId - ID för promenaden bilden tillhör (används i storage-pathen).
 * @param questionId - ID för frågan.
 * @returns URL till den uppladdade bilden, eller `null` om användaren avbröt.
 * @throws Error om uppladdningen eller komprimeringen misslyckas.
 */
export async function pickAndUploadQuestionImage(
  walkId: string,
  questionId: string
): Promise<string | null> {
  // 1. Be om permission (Android + iOS). Redan beviljad → ingen prompt.
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error(
      "Appen behöver tillgång till ditt bildbibliotek för att kunna lägga till en bild."
    );
  }

  // 2. Visa väljaren — bara bilder, ingen redigering (komprimerar vi själva).
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 1,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const pickedUri = result.assets[0].uri;

  // 3. Komprimera — skala ner till max MAX_WIDTH bred, spara som JPEG.
  const manipulated = await ImageManipulator.manipulateAsync(
    pickedUri,
    [{ resize: { width: MAX_WIDTH } }],
    { compress: COMPRESS_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );

  const path = `walks/${walkId}/questions/${questionId}.jpg`;
  const storageRef = ref(storage, path);

  // 4. Ladda upp. Två kodvägar:
  //    Native: `FileSystem.uploadAsync` PUT:ar filen direkt mot Firebase
  //    Storage REST via OS:ets HTTP-stack. Vi går runt Firebase JS SDK:s
  //    `uploadBytes` på native eftersom den internt försöker bygga en Blob
  //    från Uint8Array och sedan POSTa den via XHR — på RN 0.83 misslyckas
  //    den kombinationen tyst med "Network request failed".
  //    Web: vanlig `uploadBytes` med Blob — fungerar bra i webbläsare.
  if (Platform.OS === "web") {
    const blob = await (await fetch(manipulated.uri)).blob();
    await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  } else {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      throw new Error("Du måste vara inloggad för att ladda upp bilder.");
    }
    const bucket = storage.app.options.storageBucket;
    if (!bucket) {
      throw new Error("Storage-bucket saknas i Firebase-konfigurationen.");
    }
    const uploadUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucket}/o` +
      `?uploadType=media&name=${encodeURIComponent(path)}`;

    const uploadResult = await FileSystem.uploadAsync(
      uploadUrl,
      manipulated.uri,
      {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Firebase ${idToken}`,
          "Content-Type": "image/jpeg",
        },
      }
    );

    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      throw new Error(
        `Storage-uppladdning misslyckades (HTTP ${uploadResult.status}): ${uploadResult.body}`
      );
    }
  }

  // 5. Hämta publik URL (signerad med Firebase-token — funkar även när
  // bucket:en inte är publikt listbar). Detta är bara en GET-request, så
  // Firebase JS SDK:n hanterar det utan trubbel även på RN.
  const url = await getDownloadURL(storageRef);
  return url;
}

/**
 * Raderar en uppladdad bild från Storage. Används när skaparen byter eller
 * tar bort en bild i editorn, eller när hela frågan tas bort.
 *
 * Best-effort: fel loggas men kastas inte vidare, eftersom det inte är
 * kritiskt om en gammal bild råkar ligga kvar.
 */
export async function deleteQuestionImage(
  walkId: string,
  questionId: string
): Promise<void> {
  try {
    const path = `walks/${walkId}/questions/${questionId}.jpg`;
    await deleteObject(ref(storage, path));
  } catch (e) {
    // Filen fanns kanske inte — ingen panik.
    console.log("Kunde inte radera frågebild:", e);
  }
}
