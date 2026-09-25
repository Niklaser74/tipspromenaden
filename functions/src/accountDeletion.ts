/**
 * @file accountDeletion.ts
 * @description Städar betaldata när ett Firebase-konto raderas.
 *
 * `cleanupDeletedUserBilling` är en Auth-trigger (onDelete). Den körs för
 * varje radering: appens "Radera konto", webbens /radera-konto och
 * radering i Firebase Console. Klienten behöver inte göra något, och
 * klienten kan inte heller göra det — `billing/` är skrivskyddat för klienter.
 *
 * 1. Alla Pro-prenumerationer på användarens Stripe-kund sägs upp direkt,
 *    utan återbetalning för påbörjad period (villkoren §10).
 * 2. Obetalda kreditfakturor makuleras — ingen ska betala för krediter
 *    till ett konto som inte finns.
 * 3. Stripe-kunderna märks med `firebaseDeletedAt` men raderas inte:
 *    kvitton och fakturor är bokföringsunderlag och ska sparas i sju år
 *    (bokföringslagen). De ligger hos Stripe, inte hos oss.
 * 4. `billing/{uid}` raderas med hela `ledger/`.
 *
 * Stegen är idempotenta och körs i den ordningen, så att prenumerations-
 * id:t finns kvar om Stripe-anropen misslyckas. `failurePolicy` gör att
 * Firebase försöker igen vid fel.
 *
 * Webhooks som kommer efter raderingen (t.ex. `customer.subscription.deleted`
 * från vår egen uppsägning) får inte återskapa `billing/{uid}`. Därför
 * kontrollerar webhook-hanterarna `accountExists()` innan de skriver.
 */
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import * as functionsV1 from "firebase-functions/v1";
import type Stripe from "stripe";
import { REGION, STRIPE_SECRET_KEY } from "./config";
import { METADATA_KIND, stripeClient } from "./stripe";

/** false om Firebase-kontot inte finns (raderat). */
export async function accountExists(uid: string): Promise<boolean> {
  try {
    await getAuth().getUser(uid);
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === "auth/user-not-found") return false;
    throw e;
  }
}

export interface CleanupResult {
  cancelledSubscriptions: string[];
  voidedInvoices: string[];
  billingDeleted: boolean;
}

/** Säger upp, makulerar och raderar — se filhuvudet. Idempotent. */
export async function cleanupBilling(uid: string, stripe: Stripe): Promise<CleanupResult> {
  const ref = getFirestore().collection("billing").doc(uid);
  const snap = await ref.get();
  const result: CleanupResult = { cancelledSubscriptions: [], voidedInvoices: [], billingDeleted: false };
  if (!snap.exists) return result;
  const data = snap.data() ?? {};

  const customerId = typeof data.stripeCustomerId === "string" ? data.stripeCustomerId : null;
  const orgCustomerId = typeof data.stripeOrgCustomerId === "string" ? data.stripeOrgCustomerId : null;

  // 1. Prenumerationer. Listan på kunden fångar även en dubbel
  //    prenumeration som aldrig hann speglas i billing/{uid}.pro.
  if (customerId) {
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    for (const sub of subs.data) {
      // "unpaid" räknas som slut för Pro men finns kvar i Stripe — säg upp den också.
      if (sub.status === "canceled" || sub.status === "incomplete_expired") continue;
      await stripe.subscriptions.cancel(sub.id);
      result.cancelledSubscriptions.push(sub.id);
    }
  }

  // 2. Obetalda kreditfakturor, på båda kunderna.
  for (const customer of [customerId, orgCustomerId]) {
    if (!customer) continue;
    const invoices = await stripe.invoices.list({ customer, status: "open", limit: 100 });
    for (const invoice of invoices.data) {
      if (invoice.metadata?.kind !== METADATA_KIND.invoice) continue;
      await stripe.invoices.voidInvoice(invoice.id);
      result.voidedInvoices.push(invoice.id);
    }
  }

  // 3. Märk kunderna; de finns kvar hos Stripe för bokföringen.
  const deletedAt = new Date().toISOString();
  for (const customer of [customerId, orgCustomerId]) {
    if (customer) await stripe.customers.update(customer, { metadata: { firebaseDeletedAt: deletedAt } });
  }

  // 4. Vår egen kopia.
  await getFirestore().recursiveDelete(ref);
  result.billingDeleted = true;
  return result;
}

// Auth onDelete finns bara som 1st gen-trigger. Den får därför inte
// setGlobalOptions från config.ts — region och tak sätts här.
export const cleanupDeletedUserBilling = functionsV1
  .region(REGION)
  .runWith({ secrets: [STRIPE_SECRET_KEY], failurePolicy: true, maxInstances: 10 })
  .auth.user()
  .onDelete(async (user) => {
    const result = await cleanupBilling(user.uid, stripeClient());
    if (result.billingDeleted) logger.info("Betaldata städad efter kontoradering", { uid: user.uid, ...result });
  });
