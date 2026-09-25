/**
 * @file config.ts
 * @description Delade konstanter, parametrar och hemligheter för Functions.
 *
 * Hemligheter (Secret Manager) sätts med:
 *   firebase functions:secrets:set ANTHROPIC_API_KEY
 *   firebase functions:secrets:set STRIPE_SECRET_KEY
 *   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
 *
 * Parametrarna (`defineString`) frågas efter vid första deploy och sparas i
 * `functions/.env.tipspromenaden-491207`. Se docs/ai-questions-backend.md.
 */
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret, defineString } from "firebase-functions/params";

export const REGION = "europe-north1";

// Sätts här (inte i index.ts) eftersom varje funktion läser de globala
// inställningarna när den definieras, och config importeras först av alla.
// maxInstances är ett kostnadstak — en loop i en klient ska inte kunna
// skala upp hundratals instanser.
setGlobalOptions({ region: REGION, maxInstances: 10 });

export const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
export const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
export const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

/** Stripe price-id:n för kreditpaketen (skapas i Stripe Dashboard). */
export const STRIPE_PRICE_PACK_10 = defineString("STRIPE_PRICE_PACK_10");
export const STRIPE_PRICE_PACK_30 = defineString("STRIPE_PRICE_PACK_30");
/** Större paket för skolor/föreningar — köps på faktura eller via Checkout. */
export const STRIPE_PRICE_PACK_100 = defineString("STRIPE_PRICE_PACK_100");
export const STRIPE_PRICE_PACK_300 = defineString("STRIPE_PRICE_PACK_300");
/** "true" när Stripe Tax är aktiverat i kontot — annars vägrar Checkout. */
export const STRIPE_AUTOMATIC_TAX = defineString("STRIPE_AUTOMATIC_TAX", {
  default: "false",
});
/**
 * Fast momssats (`txr_…`) när Stripe Tax inte används, t.ex. "Moms 25 %,
 * inkluderad". Tom = ingen moms på raderna. Ignoreras när
 * STRIPE_AUTOMATIC_TAX=true.
 */
export const STRIPE_TAX_RATE_ID = defineString("STRIPE_TAX_RATE_ID", { default: "" });
/** Bas-URL för retur från Checkout. */
export const WEB_BASE_URL = defineString("WEB_BASE_URL", {
  default: "https://tipspromenaden.app",
});

/**
 * App Check stängs av i emulatorn — där finns inga riktiga tokens. I
 * produktion avvisas anrop utan giltig token innan vår kod ens körs.
 */
export const ENFORCE_APP_CHECK = process.env.FUNCTIONS_EMULATOR !== "true";

// -------------------- AI --------------------

export const AI_MODEL = "claude-opus-5-5";
/**
 * Styr hur mycket modellen tänker (thinking går inte att stänga av på
 * Opus 5.5). `low` ska provas mot eval-setet innan det blir default.
 */
export const AI_EFFORT = "medium" as const;
/** Opus 5.5-priser i USD per token — används bara för kostnadsloggning. */
export const PRICE_INPUT_PER_TOKEN = 4 / 1_000_000;
export const PRICE_OUTPUT_PER_TOKEN = 20 / 1_000_000;
export const PRICE_PER_WEB_SEARCH = 10 / 1000;

// -------------------- Krediter --------------------

export interface CreditPack {
  id: string;
  credits: number;
  price: () => string;
  /** Får köpas på faktura (bara större paket — fakturor kostar administration). */
  invoice: boolean;
}

export const CREDIT_PACKS: Record<string, CreditPack> = {
  pack10: { id: "pack10", credits: 10, price: () => STRIPE_PRICE_PACK_10.value(), invoice: false },
  pack30: { id: "pack30", credits: 30, price: () => STRIPE_PRICE_PACK_30.value(), invoice: false },
  pack100: { id: "pack100", credits: 100, price: () => STRIPE_PRICE_PACK_100.value(), invoice: true },
  pack300: { id: "pack300", credits: 300, price: () => STRIPE_PRICE_PACK_300.value(), invoice: true },
};

/** Betalningsvillkor på fakturor (dagar netto). */
export const INVOICE_DAYS_UNTIL_DUE = 30;
/**
 * Max antal obetalda fakturor per användare. Krediterna kommer först när
 * fakturan är betald, men ett tak hindrar att någon skickar mängder av
 * fakturor till påhittade adresser i vårt namn.
 */
export const MAX_OPEN_INVOICES = 3;

/** Max antal genereringar per användare inom RATE_LIMIT_WINDOW_MS. */
export const RATE_LIMIT_MAX = 10;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
