/**
 * @file shareWalk.ts
 * @description Delar en promenad via telefonens native share-sheet
 *   (SMS, WhatsApp, e-post, Messenger, m.fl.).
 *
 *   Sedan v1.3.0 delas en https-länk (`https://tipspromenaden.app/walk/<id>`):
 *     - Mottagare med appen installerad: Android App Links öppnar appen
 *       direkt utan att webbsidan ens laddas (verifierat via assetlinks.json).
 *     - Mottagare utan appen, eller på iOS/desktop: tipspromenaden.app/walk/<id>
 *       returnerar HTTP 200 med OG-metadata + smart fallback-JS som föreslår
 *       Play Store-installation. Messenger/iMessage/Slack visar då
 *       länkförhandsvisning istället för "no preview".
 *
 *   Tidigare delades både custom-scheme deep-link (`tipspromenaden://...`),
 *   bart walk-id och Play Store-URL i samma meddelande för att kompensera
 *   för att custom-scheme-länkar inte är klickbara i Messenger. Med App
 *   Links + 200-status på sajten behövs ingen av de fallbacks i texten —
 *   en enda klickbar https-länk räcker.
 */

import { Share } from "react-native";
import { buildWalkLink } from "../constants/deepLinks";
import { Walk } from "../types";

type TFn = (key: string, opts?: Record<string, any>) => string;

/**
 * Öppnar native share-sheet med en färdig text:
 *   "Kolla in min tipspromenad: <titel> 🌳
 *
 *    https://tipspromenaden.app/walk/<id>"
 *
 * @param walk - Promenaden att dela.
 * @param t - i18n-översättningsfunktion från `useTranslation()`.
 */
export async function shareWalk(walk: Walk, t: TFn): Promise<void> {
  const message = t("share.walkMessage", {
    title: walk.title,
    link: buildWalkLink(walk.id),
  });
  try {
    await Share.share({ message, title: walk.title });
  } catch {
    // Avbruten av användaren eller ej stött — tyst.
  }
}
