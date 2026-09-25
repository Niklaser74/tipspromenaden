/**
 * @file invoiceRequest.ts
 * @description Validering av indata till `createInvoice` (faktura till
 * skola/förening). Rena funktioner utan Firebase-/Stripe-beroenden så att
 * de kan testas direkt.
 *
 * Organisationsnummer kontrolleras med Luhn (samma kontrollsiffra som
 * personnummer). Momsnummer är valfritt — många föreningar är inte
 * momsregistrerade — men om det anges för en svensk organisation måste
 * det vara `SE` + orgnr + `01`.
 */
import { RequestError } from "./request";

/** EU-länder (Stripe `eu_vat`). Grekland heter EL i momsnummer men GR som land. */
export const EU_COUNTRIES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE",
  "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
] as const;

export interface InvoiceAddress {
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  country: string;
}

export interface InvoiceOrganization {
  name: string;
  /** Normaliserat NNNNNN-NNNN, eller "" om det inte angavs. */
  orgNumber: string;
  /** Normaliserat utan mellanslag, t.ex. SE556677889901, eller "". */
  vatNumber: string;
  /** Dit fakturan mejlas (ofta ekonomiavdelningen). */
  email: string;
  /** "Er referens" — ofta kräver kommuner ett referens- eller kostnadsställe. */
  reference: string;
  address: InvoiceAddress;
}

export interface InvoiceRequest {
  packId: string;
  requestId: string;
  organization: InvoiceOrganization;
}

/** Luhn-kontroll över en sträng med siffror. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/**
 * Svenskt organisationsnummer → "NNNNNN-NNNN", eller null om ogiltigt.
 * Tar också 12 siffror (sekelsiffror för enskild firma, eller "16"-prefix
 * för juridiska personer).
 */
export function normalizeOrgNumber(value: string): string | null {
  let digits = value.replace(/[\s-]/g, "");
  if (/^(16|18|19|20)\d{10}$/.test(digits)) digits = digits.slice(2);
  if (!/^\d{10}$/.test(digits) || !luhnValid(digits)) return null;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

/** Momsnummer → normaliserat, eller null om formatet är fel. */
export function normalizeVatNumber(value: string, country: string): string | null {
  const vat = value.toUpperCase().replace(/[\s.-]/g, "");
  if (country === "SE") {
    const m = /^SE(\d{10})01$/.exec(vat);
    return m && luhnValid(m[1]) ? vat : null;
  }
  const prefix = country === "GR" ? "EL" : country;
  return new RegExp(`^${prefix}[0-9A-Z]{2,13}$`).test(vat) ? vat : null;
}

function str(value: unknown, field: string, min: number, max: number): string {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new RequestError(`${field} måste vara text.`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw new RequestError(`${field} saknas.`);
  if (trimmed.length > max) throw new RequestError(`${field} är för lång (max ${max} tecken).`);
  return trimmed;
}

export function parseInvoiceRequest(data: unknown): InvoiceRequest {
  if (!data || typeof data !== "object") throw new RequestError("Tom förfrågan.");
  const d = data as Record<string, unknown>;

  if (typeof d.packId !== "string") throw new RequestError("Okänt kreditpaket.");
  if (typeof d.requestId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(d.requestId)) {
    throw new RequestError("Ogiltigt requestId.");
  }
  const o = (d.organization ?? {}) as Record<string, unknown>;
  const a = (o.address ?? {}) as Record<string, unknown>;

  const country = str(a.country ?? "SE", "Land", 2, 2).toUpperCase();
  if (!(EU_COUNTRIES as readonly string[]).includes(country)) {
    throw new RequestError("Faktura går bara att skicka inom EU.");
  }

  const email = str(o.email, "E-post för fakturan", 3, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestError("Ogiltig e-postadress.");

  const orgRaw = str(o.orgNumber, "Organisationsnummer", 0, 20);
  let orgNumber = "";
  if (orgRaw) {
    if (country !== "SE") {
      orgNumber = orgRaw;
    } else {
      const normalized = normalizeOrgNumber(orgRaw);
      if (!normalized) throw new RequestError("Ogiltigt organisationsnummer.");
      orgNumber = normalized;
    }
  }

  const vatRaw = str(o.vatNumber, "Momsnummer", 0, 20);
  let vatNumber = "";
  if (vatRaw) {
    const normalized = normalizeVatNumber(vatRaw, country);
    if (!normalized) throw new RequestError("Ogiltigt momsregistreringsnummer.");
    vatNumber = normalized;
  }

  return {
    packId: d.packId,
    requestId: d.requestId,
    organization: {
      name: str(o.name, "Organisationens namn", 2, 120),
      orgNumber,
      vatNumber,
      email,
      reference: str(o.reference, "Er referens", 0, 100),
      address: {
        line1: str(a.line1, "Adress", 2, 200),
        line2: str(a.line2, "Adressrad 2", 0, 200),
        postalCode: str(a.postalCode, "Postnummer", 2, 20),
        city: str(a.city, "Ort", 1, 100),
        country,
      },
    },
  };
}
