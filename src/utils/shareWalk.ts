/**
 * @file shareWalk.ts
 * @description Delar en promenad via telefonens native share-sheet
 *   (SMS, WhatsApp, e-post, Messenger, m.fl.).
 *
 *   Meddelandet innehåller en deep link (`tipspromenaden://walk/<id>`) som
 *   öppnar promenaden direkt för mottagare med appen installerad, plus en
 *   Play Store-länk som fallback för mottagare som inte har appen än.
 *
 *   Funkar oavsett om tipspromenaden.app är registrerad som universal link
 *   eller inte — deep link-schemat är alltid giltigt.
 */

import { Share } from "react-native";
import { buildWalkLink } from "../constants/deepLinks";
import { Walk } from "../types";

/** Play Store-URL för appen. Bak-stopp när mottagaren inte har appen än. */
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.tipspromenaden.app";

type TFn = (key: string, opts?: Record<string, any>) => string;

/**
 * Öppnar native share-sheet med en färdig text som innehåller:
 *   - promenadens titel
 *   - en deep link (tipspromenaden://walk/<id>)
 *   - Play Store-länk som fallback
 *
 * @param walk - Promenaden att dela.
 * @param t - i18n-översättningsfunktion från `useTranslation()`.
 */
export async function shareWalk(walk: Walk, t: TFn): Promise<void> {
  const message = t("share.walkMessage", {
    title: walk.title,
    link: buildWalkLink(walk.id),
    walkId: walk.id,
    playStore: PLAY_STORE_URL,
  });
  try {
    await Share.share({ message, title: walk.title });
  } catch {
    // Avbruten av användaren eller ej stött — tyst.
  }
}
