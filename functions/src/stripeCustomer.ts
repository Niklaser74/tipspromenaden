/**
 * @file stripeCustomer.ts
 * @description En Stripe Customer per Firebase-användare.
 *
 * Id:t sparas i `billing/{uid}.stripeCustomerId` (bara servern skriver
 * där). Att alltid köpa som samma kund ger kvitton samlade på ett ställe,
 * sparade adress-/momsuppgifter mellan köp och är en förutsättning för
 * kundportal och prenumerationer.
 */
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type Stripe from "stripe";

export async function getOrCreateCustomer(
  stripe: Stripe,
  uid: string,
  email: string | undefined
): Promise<string> {
  const ref = getFirestore().collection("billing").doc(uid);
  const existing = (await ref.get()).data()?.stripeCustomerId;
  if (typeof existing === "string" && existing) return existing;

  // Idempotensnyckeln gör att två samtidiga första köp inte skapar två
  // kunder — Stripe returnerar samma kund för samma nyckel i 24 h.
  const customer = await stripe.customers.create(
    { email, metadata: { uid } },
    { idempotencyKey: `customer-${uid}` }
  );
  await ref.set(
    { stripeCustomerId: customer.id, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return customer.id;
}
