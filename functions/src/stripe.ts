/**
 * @file stripe.ts
 * @description Delade Stripe-hjälpare för köp, faktura och prenumeration.
 *
 * - `stripeClient()` — klient mot STRIPE_SECRET_KEY (anropas inne i en
 *   funktion, aldrig vid import: secrets finns bara under körning).
 * - `requireAccount()` — samma inloggningskrav för alla betalningar:
 *   inloggad och inte anonym.
 * - Moms: antingen Stripe Tax (`STRIPE_AUTOMATIC_TAX=true`) eller en fast
 *   skattesats (`STRIPE_TAX_RATE_ID`, t.ex. 25 % inkluderad). Stripe
 *   tillåter inte båda samtidigt, så `automaticTax()` och `taxRates()`
 *   utesluter varandra.
 * - `METADATA_KIND` — varje Stripe-objekt vi skapar märks med `kind`, så
 *   att webhooken aldrig blandar ihop t.ex. Checkouts kvittofaktura med
 *   en riktig faktura (båda ger `invoice.paid`).
 */
import type { CallableRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { STRIPE_AUTOMATIC_TAX, STRIPE_SECRET_KEY, STRIPE_TAX_RATE_ID, WEB_BASE_URL } from "./config";

export const METADATA_KIND = {
  /** Kreditpaket köpt via Checkout (kort/Swish). */
  checkout: "credit_pack",
  /** Kreditpaket på faktura till skola/förening. */
  invoice: "credit_invoice",
  /** Pro-prenumeration. */
  pro: "pro_subscription",
} as const;

export function stripeClient(): Stripe {
  return new Stripe(STRIPE_SECRET_KEY.value());
}

export function webBase(): string {
  return WEB_BASE_URL.value().replace(/\/$/, "");
}

/** Kastar om anroparen inte är inloggad med ett riktigt konto. */
export function requireAccount(request: CallableRequest): { uid: string; email?: string } {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Logga in för att fortsätta.");
  if (auth.token.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("permission-denied", "Logga in med ett konto för att betala.", {
      reason: "anonymous",
    });
  }
  return { uid: auth.uid, email: typeof auth.token.email === "string" ? auth.token.email : undefined };
}

export function automaticTaxEnabled(): boolean {
  return STRIPE_AUTOMATIC_TAX.value() === "true";
}

export function automaticTax(): { enabled: boolean } {
  return { enabled: automaticTaxEnabled() };
}

/**
 * Fast skattesats per rad när Stripe Tax inte används. Tom lista betyder
 * ingen moms på raden — rätt bara om säljaren inte är momsregistrerad.
 */
export function taxRates(): string[] {
  if (automaticTaxEnabled()) return [];
  const id = STRIPE_TAX_RATE_ID.value().trim();
  return id ? [id] : [];
}

/** Stripes fel på indata (t.ex. ogiltigt momsnummer) → invalid-argument. */
export function toHttpsError(e: unknown, fallback: string): HttpsError {
  if (e instanceof HttpsError) return e;
  if (e instanceof Stripe.errors.StripeInvalidRequestError) {
    return new HttpsError("invalid-argument", e.message, { reason: "stripe-invalid", param: e.param });
  }
  return new HttpsError("internal", fallback);
}
