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

import * as Crypto from "expo-crypto";
import { Walk } from "../types";
import { APP_SCHEME, WALK_PATH, WEB_HOST } from "../constants/deepLinks";

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
 * Accepterar fyra format så att samma kodväg fungerar för QR-skanning,
 * delade länkar och manuell inklistring:
 *   1. JSON från en QR-kod: `{"type":"tipspromenaden","walkId":"…"}`
 *   2. Universal/App Link: `https://tipspromenaden.app/walk/<walkId>`
 *      (primärformatet sedan v1.3.0 — vad buildWalkLink genererar)
 *   3. Custom-scheme deep link: `tipspromenaden://walk/<walkId>`
 *      (legacy — bevaras för redan delade länkar)
 *   4. Rått walkId — t.ex. när någon skickat över bara id-strängen i text
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
    /* faller igenom till nästa format */
  }

  // 2. Universal/App Link (https). Accepterar både `tipspromenaden.app`
  //    och `www.tipspromenaden.app` så fummel med www-prefix inte bryter
  //    inklistring. decodeURIComponent kan kasta URIError på trasig
  //    procent-kodning — fånga och fall vidare till nästa format.
  const httpsPrefixes = [
    `https://${WEB_HOST}/${WALK_PATH}/`,
    `https://www.${WEB_HOST}/${WALK_PATH}/`,
  ];
  const lower = trimmed.toLowerCase();
  for (const prefix of httpsPrefixes) {
    if (lower.startsWith(prefix)) {
      try {
        // Trimma bort eventuell query string eller hash
        const tail = trimmed.slice(prefix.length).split(/[?#]/)[0];
        const walkId = decodeURIComponent(tail).trim();
        if (walkId) return { type: "tipspromenaden", walkId, title: "" };
      } catch {
        /* trasig URI — fall vidare */
      }
      break;
    }
  }

  // 3. Custom-scheme deep link (legacy).
  const schemeLinkPrefix = `${APP_SCHEME}://${WALK_PATH}/`;
  if (lower.startsWith(schemeLinkPrefix)) {
    try {
      const walkId = decodeURIComponent(trimmed.slice(schemeLinkPrefix.length)).trim();
      if (walkId) return { type: "tipspromenaden", walkId, title: "" };
    } catch {
      /* trasig URI — fall vidare */
    }
  }

  // 4. Rått walkId. generateId() ger base-36 (~16 tecken); regexen är
  //    bred för att också ta in manuellt skapade id:n. Träffar mer än
  //    den borde, men processQRData faller på getWalk() om id:t inte
  //    finns och visar "not found"-alert.
  if (/^[a-zA-Z0-9_-]{6,64}$/.test(trimmed)) {
    return { type: "tipspromenaden", walkId: trimmed, title: "" };
  }

  return null;
}

/**
 * Genererar ett unikt ID. Använder kryptografiskt slumpmässiga bytes
 * från expo-crypto (`getRandomBytes` mappar till `crypto.getRandomValues`
 * på alla plattformar) för att undvika gissningsbara walkId:n. WalkId:n
 * fungerar som capability — den som kan gissa ett walkId ser hela facit.
 *
 * Tidsstämpeln behålls som prefix för att hålla id:n grovt sorterbara
 * och för bakåtkompatibel längd.
 *
 * @returns Ett unikt ID-sträng, ~22 tecken base-36.
 *
 * @example
 * const newWalk: Walk = { id: generateId(), ... };
 */
export function generateId(): string {
  const bytes = Crypto.getRandomBytes(12);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return Date.now().toString(36) + hex;
}
