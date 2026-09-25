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
import type { InvoiceOrganization } from "./invoiceRequest";

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

/**
 * Kunden som fakturor till skola/förening skickas till. Hålls isär från
 * användarens privata kund, så att fakturan går till organisationens
 * e-post och bär dess namn, adress och momsnummer — utan att privata
 * kvitton börjar gå till skolans ekonomiavdelning.
 *
 * Uppgifterna skrivs över vid varje ny faktura. Redan skickade fakturor
 * påverkas inte: Stripe fryser kunduppgifterna på fakturan när den
 * slutförs.
 */
export async function upsertOrgCustomer(
  stripe: Stripe,
  uid: string,
  org: InvoiceOrganization
): Promise<string> {
  const ref = getFirestore().collection("billing").doc(uid);
  const params = {
    name: org.name,
    email: org.email,
    address: {
      line1: org.address.line1,
      line2: org.address.line2 || undefined,
      postal_code: org.address.postalCode,
      city: org.address.city,
      country: org.address.country,
    },
    preferred_locales: ["sv"],
    metadata: { uid, kind: "organization", orgNumber: org.orgNumber },
  };

  let customerId = (await ref.get()).data()?.stripeOrgCustomerId as string | undefined;
  if (customerId) {
    await stripe.customers.update(customerId, params);
  } else {
    const customer = await stripe.customers.create(params, { idempotencyKey: `org-customer-${uid}` });
    customerId = customer.id;
    await ref.set(
      { stripeOrgCustomerId: customerId, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }

  // Exakt ett momsnummer på kunden — annars trycks gamla nummer också på
  // fakturan.
  const existing = await stripe.customers.listTaxIds(customerId, { limit: 10 });
  for (const t of existing.data) {
    if (t.value !== org.vatNumber) await stripe.customers.deleteTaxId(customerId, t.id);
  }
  if (org.vatNumber && !existing.data.some((t) => t.value === org.vatNumber)) {
    await stripe.customers.createTaxId(customerId, { type: "eu_vat", value: org.vatNumber });
  }
  return customerId;
}
