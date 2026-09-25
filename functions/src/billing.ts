/**
 * @file billing.ts
 * @description Kreditköp via Stripe Checkout.
 *
 * - `createCheckoutSession` (callable): skapar en Checkout Session för ett
 *   kreditpaket och returnerar URL:en som klienten skickar användaren till.
 * - `stripeWebhook` (HTTP): tar emot `checkout.session.completed` och
 *   lägger till krediterna. Signaturen verifieras mot
 *   STRIPE_WEBHOOK_SECRET; utan giltig signatur händer ingenting.
 *
 * Antalet krediter läses från metadata som vi själva satte när sessionen
 * skapades — klienten kan inte påverka det.
 *
 * Varje användare köper som samma Stripe Customer (`stripeCustomer.ts`).
 * Checkout skapar en kvittofaktura med moms (`invoice_creation`) och
 * samlar in adress + ev. org-/momsnummer så att föreningar och företag
 * kan bokföra köpet. Återbetalningar (`charge.refunded`) drar tillbaka
 * motsvarande krediter.
 */
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";
import {
  CREDIT_PACKS,
  ENFORCE_APP_CHECK,
  STRIPE_AUTOMATIC_TAX,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  WEB_BASE_URL,
} from "./config";
import { grantPurchasedCredits, reverseRefundedCredits } from "./credits";
import { getOrCreateCustomer } from "./stripeCustomer";

function stripeClient(): Stripe {
  return new Stripe(STRIPE_SECRET_KEY.value());
}

export const createCheckoutSession = onCall(
  { secrets: [STRIPE_SECRET_KEY], enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const auth = request.auth;
    if (!auth) throw new HttpsError("unauthenticated", "Logga in för att köpa krediter.");
    if (auth.token.firebase?.sign_in_provider === "anonymous") {
      throw new HttpsError("permission-denied", "Logga in med ett konto för att köpa krediter.", {
        reason: "anonymous",
      });
    }

    const packId = (request.data as { packId?: unknown } | null)?.packId;
    const pack = typeof packId === "string" ? CREDIT_PACKS[packId] : undefined;
    if (!pack) throw new HttpsError("invalid-argument", "Okänt kreditpaket.");

    const base = WEB_BASE_URL.value().replace(/\/$/, "");
    const stripe = stripeClient();
    const customer = await getOrCreateCustomer(
      stripe,
      auth.uid,
      typeof auth.token.email === "string" ? auth.token.email : undefined
    );
    const metadata = { uid: auth.uid, packId: pack.id, credits: String(pack.credits) };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: pack.price(), quantity: 1 }],
      client_reference_id: auth.uid,
      customer,
      // Adress + namn sparas på kunden så att kvittot/momsen blir rätt
      // och nästa köp slipper fylla i igen.
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
      invoice_creation: {
        enabled: true,
        invoice_data: { description: `Tipspromenaden – ${pack.credits} AI-krediter`, metadata },
      },
      metadata,
      // PaymentIntent-metadata behövs för att knyta en återbetalning
      // (charge.refunded) till rätt användare och paket.
      payment_intent_data: { metadata },
      automatic_tax: { enabled: STRIPE_AUTOMATIC_TAX.value() === "true" },
      locale: "auto",
      success_url: `${base}/skapa?kop=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/skapa?kop=avbrutet`,
    });
    if (!session.url) throw new HttpsError("internal", "Stripe returnerade ingen betal-URL.");
    return { url: session.url };
  }
);

async function handleCompletedSession(session: Stripe.Checkout.Session): Promise<void> {
  // Asynkrona betalsätt kan bli "completed" innan pengarna finns — då
  // kommer `checkout.session.async_payment_succeeded` senare.
  if (session.payment_status !== "paid") {
    logger.info("Checkout klar men ännu inte betald", { id: session.id, status: session.payment_status });
    return;
  }
  const uid = session.metadata?.uid ?? session.client_reference_id;
  const credits = Number(session.metadata?.credits);
  if (!uid || !Number.isInteger(credits) || credits <= 0) {
    logger.error("Checkout Session saknar uid/credits i metadata", { id: session.id });
    return;
  }
  const granted = await grantPurchasedCredits(uid, session.id, credits, {
    packId: session.metadata?.packId ?? "",
    amountTotal: session.amount_total,
    currency: session.currency,
  });
  logger.info(granted ? "Krediter tillagda" : "Köpet redan registrerat", { uid, credits, id: session.id });
}

async function handleRefundedCharge(charge: Stripe.Charge): Promise<void> {
  // Metadata ligger på PaymentIntent, inte på Charge.
  const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!piId) return;
  const pi = await stripeClient().paymentIntents.retrieve(piId);
  const uid = pi.metadata?.uid;
  const credits = Number(pi.metadata?.credits ?? CREDIT_PACKS[pi.metadata?.packId ?? ""]?.credits);
  if (!uid || !Number.isInteger(credits) || credits <= 0) {
    // Inte ett kreditköp (t.ex. en framtida prenumeration) — inget att dra.
    logger.info("charge.refunded utan kredit-metadata", { charge: charge.id });
    return;
  }
  const removed = await reverseRefundedCredits(uid, charge.id, {
    credits,
    amount: charge.amount,
    amountRefunded: charge.amount_refunded,
  });
  logger.info("Återbetalning — krediter dragna", { uid, charge: charge.id, removed });
}

export const stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") {
      res.status(400).send("Missing signature");
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripeClient().webhooks.constructEvent(req.rawBody, signature, STRIPE_WEBHOOK_SECRET.value());
    } catch (e) {
      logger.warn("Ogiltig Stripe-signatur", { error: (e as Error).message });
      res.status(400).send("Invalid signature");
      return;
    }

    try {
      if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
      ) {
        await handleCompletedSession(event.data.object);
      } else if (event.type === "charge.refunded") {
        await handleRefundedCharge(event.data.object);
      }
      res.status(200).json({ received: true });
    } catch (e) {
      // 500 → Stripe försöker igen; grantPurchasedCredits är idempotent.
      logger.error("Stripe-webhook misslyckades", { type: event.type, error: (e as Error).message });
      res.status(500).send("Webhook handler failed");
    }
  }
);
