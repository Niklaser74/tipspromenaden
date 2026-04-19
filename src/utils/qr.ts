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
 * Tolkar en rå QR-kodssträng och returnerar strukturerad QR-data.
 * Validerar att strängen är giltig JSON med rätt format för Tipspromenaden.
 * Returnerar `null` om strängen inte är en giltig Tipspromenaden-QR-kod,
 * t.ex. om användaren skannar en QR-kod från en annan app.
 *
 * @param raw - Den råa strängen från QR-kodsläsaren.
 * @returns Tolkad `QRData` om strängen är giltig, annars `null`.
 *
 * @example
 * // I ScanQRScreen efter en lyckad skanning:
 * const qrData = parseQRData(scannedString);
 * if (qrData) {
 *   navigation.navigate('JoinWalk', { walkId: qrData.walkId });
 * } else {
 *   Alert.alert('Ogiltig QR-kod', 'Det här är inte en Tipspromenaden-kod.');
 * }
 */
export function parseQRData(raw: string): QRData | null {
  try {
    const data = JSON.parse(raw);
    if (data.type === "tipspromenaden" && data.walkId) {
      return data as QRData;
    }
    return null;
  } catch {
    return null;
  }
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
