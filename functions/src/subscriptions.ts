/**
 * @file subscriptions.ts
 * @description Pro-prenumerationen (Stripe Billing) och kundportalen.
 *
 * - `createProCheckout` (callable): Checkout i mode "subscription" för
 *   månads- eller årsplanen. Samma Stripe Customer som kreditköpen.
 * - `createPortalSession` (callable): Stripes kundportal — byta kort,
 *   byta plan, säga upp, ladda ner kvitton och fakturor.
 * - Webhooken (billing.ts) skickar hit:
 *   - `customer.subscription.created/updated/deleted` → `billing/{uid}.pro`
 *     speglar status, plan och periodens slut.
 *   - `invoice.paid` för en prenumerationsfaktura → Pro-krediterna fylls
 *     på för perioden (`refillSubscriptionCredits`).
 *
 * Prenumerationen hämtas alltid på nytt från Stripe i stället för att
 * lita på händelsens innehåll — händelser kan komma i fel ordning, men
 * det senaste tillståndet i Stripe är alltid rätt.
 */
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type Stripe from "stripe";
import { accountExists } from "./accountDeletion";
import { ENFORCE_APP_CHECK, PRO_CREDITS_PER_MONTH, PRO_PLANS, STRIPE_SECRET_KEY, type ProPlan } from "./config";
import { refillSubscriptionCredits, setProState } from "./credits";
import { isActiveStatus, refillForInvoice } from "./proPlan";
import { METADATA_KIND, automaticTax, requireAccount, stripeClient, taxRates, webBase } from "./stripe";
import { getOrCreateCustomer } from "./stripeCustomer";

/** price-id → plan, för planer som har ett pris konfigurerat. */
function planByPrice(): Record<string, ProPlan> {
  const map: Record<string, ProPlan> = {};
  for (const plan of Object.values(PRO_PLANS)) {
    const price = plan.price();
    if (price) map[price] = plan;
  }
  return map;
}

export const createProCheckout = onCall(
  { secrets: [STRIPE_SECRET_KEY], enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const { uid, email } = requireAccount(request);
    const planId = (request.data as { plan?: unknown } | null)?.plan ?? "pro_month";
    const plan = typeof planId === "string" ? PRO_PLANS[planId as ProPlan["id"]] : undefined;
    if (!plan || !plan.price()) throw new HttpsError("invalid-argument", "Okänd plan.");

    const billing = (await getFirestore().collection("billing").doc(uid).get()).data();
    if (isActiveStatus(billing?.pro?.status)) {
      throw new HttpsError("failed-precondition", "Du har redan Pro. Hantera den i kundportalen.", {
        reason: "already-subscribed",
      });
    }

    const stripe = stripeClient();
    const customer = await getOrCreateCustomer(stripe, uid, email);
    const metadata = { kind: METADATA_KIND.pro, uid, plan: plan.id };
    const rates = taxRates();
    const base = webBase();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: plan.price(), quantity: 1, ...(rates.length ? { tax_rates: rates } : {}) }],
      client_reference_id: uid,
      customer,
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
      // Metadata på prenumerationen följer med till varje faktura
      // (invoice.parent.subscription_details.metadata).
      subscription_data: { metadata },
      metadata,
      automatic_tax: automaticTax(),
      locale: "auto",
      success_url: `${base}/skapa?pro=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/skapa?pro=avbrutet`,
    });
    if (!session.url) throw new HttpsError("internal", "Stripe returnerade ingen betal-URL.");
    return { url: session.url };
  }
);

export const createPortalSession = onCall(
  { secrets: [STRIPE_SECRET_KEY], enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const { uid } = requireAccount(request);
    const customer = (await getFirestore().collection("billing").doc(uid).get()).data()?.stripeCustomerId;
    if (typeof customer !== "string" || !customer) {
      throw new HttpsError("failed-precondition", "Du har inga köp att hantera än.", { reason: "no-customer" });
    }
    const session = await stripeClient().billingPortal.sessions.create({
      customer,
      return_url: `${webBase()}/skapa`,
      locale: "auto",
    });
    return { url: session.url };
  }
);

async function uidForSubscription(stripe: Stripe, sub: Stripe.Subscription): Promise<string | null> {
  if (sub.metadata?.uid) return sub.metadata.uid;
  // Prenumeration skapad i Dashboard: kunden bär uid (stripeCustomer.ts).
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const customer = await stripe.customers.retrieve(customerId);
  return customer.deleted ? null : (customer.metadata?.uid ?? null);
}

/** customer.subscription.* → `billing/{uid}.pro`. */
export async function handleSubscriptionChanged(subscriptionId: string): Promise<void> {
  const stripe = stripeClient();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const uid = await uidForSubscription(stripe, sub);
  if (!uid) {
    logger.error("Prenumeration utan uid", { subscription: sub.id });
    return;
  }
  // Vår egen uppsägning vid kontoradering ger också den här händelsen.
  if (!(await accountExists(uid))) return;
  const item = sub.items.data[0];
  const priceId = item?.price?.id;
  const written = await setProState(uid, {
    status: sub.status,
    subscriptionId: sub.id,
    planId: (priceId && planByPrice()[priceId]?.id) || sub.metadata?.plan || null,
    currentPeriodEnd: item?.current_period_end ?? null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  });
  logger.info(written ? "Pro-status uppdaterad" : "Pro-status överhoppad (annan aktiv prenumeration)", {
    uid,
    subscription: sub.id,
    status: sub.status,
  });
}

/** Prenumerationen bakom en faktura, eller null om det inte är en prenumerationsfaktura. */
export function subscriptionOfInvoice(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

/** invoice.paid för en prenumerationsfaktura → fyll på Pro-krediterna. */
export async function handleSubscriptionInvoicePaid(invoice: Stripe.Invoice, subscriptionId: string): Promise<void> {
  const stripe = stripeClient();
  // Fakturan i händelsen kan ha avkortad radlista — hämta alla rader.
  const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 100 });
  const refill = refillForInvoice(lines.data, planByPrice(), PRO_CREDITS_PER_MONTH);
  if (!refill) {
    logger.info("Prenumerationsfaktura utan hel Pro-period", { invoice: invoice.id });
    return;
  }
  const metadataUid = invoice.parent?.subscription_details?.metadata?.uid;
  const uid = metadataUid ?? (await uidForSubscription(stripe, await stripe.subscriptions.retrieve(subscriptionId)));
  if (!uid) {
    logger.error("Prenumerationsfaktura utan uid", { invoice: invoice.id });
    return;
  }
  if (!(await accountExists(uid))) {
    logger.error("Betald Pro-faktura för raderat konto — återbetala i Dashboard", { uid, invoice: invoice.id });
    return;
  }
  const refilled = await refillSubscriptionCredits(uid, invoice.id, { ...refill, subscriptionId });
  logger.info(refilled ? "Pro-krediter påfyllda" : "Pro-faktura redan registrerad eller äldre", {
    uid,
    invoice: invoice.id,
    credits: refill.credits,
  });
}
