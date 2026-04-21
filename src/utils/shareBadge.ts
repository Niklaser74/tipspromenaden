/**
 * @file shareBadge.ts
 * @description Fångar en ref:ad <View> som PNG via react-native-view-shot
 *   och öppnar systemets dela-vy. Wrappar native/web-skillnader: på web har
 *   expo-sharing ingen dela-vy, så där faller vi tillbaka på Web Share API
 *   eller en enkel nedladdning.
 */

import { Platform } from "react-native";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

export interface ShareBadgeOptions {
  /** Ref till den View som ska rasteriseras. */
  viewRef: React.RefObject<any>;
  /** Filnamn utan ändelse – används i dela-dialogens titel på vissa plattformar. */
  fileName?: string;
  /** Dialogtitel som visas ovanför systemets share-sheet. */
  dialogTitle?: string;
}

/**
 * Rasteriserar view:n och skickar till dela-vyn. Returnerar true om delning
 * startades, false om användaren (eller plattformen) avbröt/inte stödjer det.
 *
 * Kastar inte – vid fel logg:as det och false returneras. Anroparen bör
 * visa ett neutralt felmeddelande om så önskas.
 */
export async function shareBadge({
  viewRef,
  fileName = "tipspromenaden-resultat",
  dialogTitle,
}: ShareBadgeOptions): Promise<boolean> {
  try {
    // quality=1 + format=png ger skarp bild utan komprimeringsartefakter i
    // text. result=tmpfile ger en file:// URI som Sharing kan öppna direkt.
    const uri = await captureRef(viewRef, {
      format: "png",
      quality: 1,
      result: Platform.OS === "web" ? "data-uri" : "tmpfile",
    });

    if (Platform.OS === "web") {
      return await shareOnWeb(uri, fileName);
    }

    if (!(await Sharing.isAvailableAsync())) {
      return false;
    }

    await Sharing.shareAsync(uri, {
      mimeType: "image/png",
      dialogTitle,
      UTI: "public.png",
    });
    return true;
  } catch (err) {
    console.warn("[shareBadge] misslyckades", err);
    return false;
  }
}

/**
 * Web-fallback: Web Share API med image-file om det finns, annars
 * trigga en nedladdning av data-URI:n.
 */
async function shareOnWeb(dataUri: string, fileName: string): Promise<boolean> {
  try {
    const res = await fetch(dataUri);
    const blob = await res.blob();
    const file = new File([blob], `${fileName}.png`, { type: "image/png" });

    const nav = navigator as Navigator & {
      canShare?: (data: { files: File[] }) => boolean;
      share?: (data: { files: File[]; title?: string }) => Promise<void>;
    };

    if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: fileName });
      return true;
    }

    // Fallback: ladda ner filen så användaren själv kan posta den
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.warn("[shareBadge:web] misslyckades", err);
    return false;
  }
}
