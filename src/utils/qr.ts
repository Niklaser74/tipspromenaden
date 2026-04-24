/**
 * @file qr.ts
 * @description QR-kodshjälpfunktioner för Tipspromenaden-appen.
 *
 * Hanterar kodning och avkodning av promenadsreferenser i QR-koder.
 * QR-koden innehåller INTE hela promenaden (för stor) utan bara en
 * referens med `walkId` och titeln. Deltagaren hämtar den fullständiga
 * promenaden från Firebase eller lokal cache när koden skannas.
 *
 * Innehåller även en generell ID-genereringsfunktion som används
 * för att skapa unika ID:n för promenader, sessioner och frågor.
 */

import { Walk } from "../types";

/**
 * Datastrukturen som kodas i QR-koden.
 * Hålls liten för att QR-koden ska vara läsbar och inte för komplex.
 */
export interface QRData {
  /**
   * Typ-diskriminant som identifierar att QR-koden tillhör Tipspromenaden-appen.
   * Alltid `"tipspromenaden"`.
   */
  type: "tipspromenaden";
  /** ID för den promenad som QR-koden refererar till. */
  walkId: string;
  /** Titeln på promenaden – visas för deltagaren när koden skannas. */
  title: string;
}

/**
 * Skapar QR-kodsdata för en promenad som en JSON-sträng.
 * Strängen är det som kodas in i QR-koden och innehåller bara
 * de uppgifter som krävs för att hämta rätt promenad.
 *
 * @param walk - Promenaden att generera QR-data för.
 * @returns En JSON-sträng redo att kodas i en QR-kod.
 *
 * @example
 * const qrString = createQRData(myWalk);
 * // qrString: '{"type":"tipspromenaden","walkId":"abc123","title":"Skogspromenaden"}'
 * // Skicka qrString till <QRCode value={qrString} />
 */
export function createQRData(walk: Walk): string {
  const data: QRData = {
    type: "tipspromenaden",
    walkId: walk.id,
    title: walk.title,
  };
  return JSON.stringify(data);
}

/**
 * Tolkar en rå sträng och returnerar strukturerad QR-data.
 *
 * Accepterar tre format så att samma kodväg fungerar för QR-skanning,
 * delade länkar och manuell inklistring:
 *   1. JSON från en QR-kod: `{"type":"tipspromenaden","walkId":"…"}`
 *   2. Deep link: `tipspromenaden://walk/<walkId>` (med eller utan
 *      url-encoding av id:t)
 *   3. Rått walkId — t.ex. när någon skickat över bara id-strängen i text
 *
 * Returnerar `null` om inget av dessa matchar (t.ex. en QR-kod från en
 * annan app, eller en länk till någon annan tjänst).
 *
 * @param raw - Den råa strängen från QR-kodsläsaren eller textinput.
 * @returns Tolkad `QRData` om strängen är giltig, annars `null`.
 */
export function parseQRData(raw: string): QRData | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. JSON-format (vad våra egna QR-koder innehåller)
  try {
    const data = JSON.parse(trimmed);
    if (data?.type === "tipspromenaden" && data?.walkId) {
      return data as QRData;
    }
  } catch {
    // inte JSON — fortsätt försöka andra format
  }

  // 2. Deep link `tipspromenaden://walk/<id>`
  const deepLinkMatch = trimmed.match(/^tipspromenaden:\/\/walk\/(.+)$/i);
  if (deepLinkMatch) {
    const walkId = decodeURIComponent(deepLinkMatch[1]).trim();
    if (walkId) return { type: "tipspromenaden", walkId, title: "" };
  }

  // 3. Rått walkId. generateId() ger base-36 (a-z, 0-9) ~16 tecken; vi är
  //    lite snälla i regexen för att även äldre/manuellt skapade id:n går
  //    igenom. Krävs att det inte ser ut som en URL eller innehåller
  //    whitespace.
  if (/^[a-zA-Z0-9_-]{6,64}$/.test(trimmed)) {
    return { type: "tipspromenaden", walkId: trimmed, title: "" };
  }

  return null;
}

/**
 * Genererar ett unikt ID baserat på aktuell tid och slumpmässiga tecken.
 * Kombinerar en base-36-kodad tidsstämpel med åtta slumpmässiga tecken
 * för att skapa ett ID som är praktiskt taget unikt.
 *
 * Används för att generera ID:n för promenader, sessioner och frågor
 * utan att kräva en serverrundresa.
 *
 * @returns Ett unikt ID-sträng, t.ex. `"lq3k2f8ab7c9d1e2"`.
 *
 * @example
 * const newWalk: Walk = {
 *   id: generateId(),
 *   title: 'Min promenad',
 *   // ...
 * };
 *
 * const newQuestion: Question = {
 *   id: generateId(),
 *   // ...
 * };
 */
export function generateId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).substring(2, 10)
  );
}
