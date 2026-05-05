/**
 * @file shareContent.ts
 * @description Enad fasad för all delning i appen.
 *
 * Tidigare hade vi tre parallella vägar (`shareWalk` text-only, `shareBadge`
 * view-rasterisering, samt direkta `Share.share`/`Sharing.shareAsync`-anrop
 * spridda i screens). Det fungerade men gjorde det svårt att lägga till nya
 * format (t.ex. mp4 av animerad reveal) eller justera beteende (ex. Web Share
 * API-fallback) på ett ställe.
 *
 * Den här utilen exponerar en discriminated union så callsidan beskriver
 * VAD som ska delas, inte HUR. Internt delegerar vi till de befintliga
 * implementationerna — befintliga utils (`shareWalk`, `shareBadge`) är kvar
 * eftersom de fortfarande används av deras gamla callsites under migration.
 */

import React from "react";
import { Platform, Share } from "react-native";
import * as Sharing from "expo-sharing";
import { Walk } from "../types";
import { buildWalkLink } from "../constants/deepLinks";
import { shareBadge } from "./shareBadge";

type TFn = (key: string, opts?: Record<string, any>) => string;

export type ShareableContent =
  /** Dela en walk via dess publika https-länk + standardtext. */
  | { kind: "walk"; walk: Walk }
  /** Dela godtyckligt textmeddelande (ev. med separat URL för iOS-fältet). */
  | { kind: "text"; message: string; url?: string; title?: string }
  /** Rasterisera en React-view till PNG och dela bilden. */
  | {
      kind: "viewAsImage";
      viewRef: React.RefObject<any>;
      fileName?: string;
      dialogTitle?: string;
    }
  /** Dela en redan-existerande fil (lokal file:// URI). */
  | { kind: "fileUri"; uri: string; mimeType: string; dialogTitle?: string };

/**
 * Delar innehåll via systemets share-sheet. Returnerar `true` om delning
 * startades, `false` om plattformen saknar stöd eller användaren avbröt.
 *
 * Kastar inte — fel loggas och `false` returneras. Anroparen kan visa
 * ett neutralt felmeddelande om så önskas.
 *
 * @param content  Vad som ska delas (discriminated union).
 * @param t        i18n-funktionen, krävs bara för `kind: "walk"`.
 */
export async function shareContent(
  content: ShareableContent,
  t?: TFn
): Promise<boolean> {
  try {
    switch (content.kind) {
      case "walk": {
        if (!t) {
          console.warn("[shareContent] kind=walk kräver t");
          return false;
        }
        const message = t("share.walkMessage", {
          title: content.walk.title,
          link: buildWalkLink(content.walk.id),
        });
        await Share.share({ message, title: content.walk.title });
        return true;
      }

      case "text": {
        await Share.share(
          {
            message: content.message,
            url: content.url,
            title: content.title,
          },
          { dialogTitle: content.title }
        );
        return true;
      }

      case "viewAsImage": {
        return await shareBadge({
          viewRef: content.viewRef,
          fileName: content.fileName,
          dialogTitle: content.dialogTitle,
        });
      }

      case "fileUri": {
        if (Platform.OS === "web") {
          // Web: ingen direkt fil-share — anroparen får hantera nedladdning.
          return false;
        }
        if (!(await Sharing.isAvailableAsync())) {
          return false;
        }
        await Sharing.shareAsync(content.uri, {
          mimeType: content.mimeType,
          dialogTitle: content.dialogTitle,
        });
        return true;
      }
    }
  } catch (err) {
    // Användaren kan avbryta — det är inget verkligt fel. Logg:as ändå
    // för att kunna spåra äkta plattforms-issues.
    console.warn("[shareContent] avbruten/misslyckades", err);
    return false;
  }
}
