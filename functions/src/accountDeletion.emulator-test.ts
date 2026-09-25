/**
 * Integrationstest för städningen vid kontoradering, mot Firestore-
 * emulatorn och en fejkad Stripe-klient. Körs av `npm run test:emulator`.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { cleanupBilling } from "./accountDeletion";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST måste vara satt");
if (!getApps().length) initializeApp({ projectId: "demo-tipspromenaden" });
const db = getFirestore();

function fakeStripe() {
  const calls: string[] = [];
  const stripe = {
    subscriptions: {
      list: async ({ customer }: { customer: string }) => ({
        data:
          customer === "cus_user"
            ? [
                { id: "sub_active", status: "active" },
                { id: "sub_unpaid", status: "unpaid" },
                { id: "sub_old", status: "canceled" },
              ]
            : [],
      }),
      cancel: async (id: string) => {
        calls.push(`cancel:${id}`);
        return {};
      },
    },
    invoices: {
      list: async ({ customer }: { customer: string }) => ({
        data:
          customer === "cus_org"
            ? [
                { id: "in_credit", metadata: { kind: "credit_invoice" } },
                { id: "in_other", metadata: {} },
              ]
            : [],
      }),
      voidInvoice: async (id: string) => {
        calls.push(`void:${id}`);
        return {};
      },
    },
    customers: {
      update: async (id: string) => {
        calls.push(`mark:${id}`);
        return {};
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, calls };
}

test("kontoradering: säger upp Pro, makulerar kreditfakturor, raderar billing med ledger", async () => {
  const uid = "deleted_user";
  await db.doc(`billing/${uid}`).set({
    credits: 5,
    stripeCustomerId: "cus_user",
    stripeOrgCustomerId: "cus_org",
    pro: { status: "active", subscriptionId: "sub_active" },
  });
  await db.doc(`billing/${uid}/ledger/cs_1`).set({ type: "purchase", delta: 10 });
  await db.doc(`billing/${uid}/ledger/in_credit`).set({ type: "invoice", status: "open" });

  const { stripe, calls } = fakeStripe();
  const result = await cleanupBilling(uid, stripe);

  assert.deepEqual(result.cancelledSubscriptions, ["sub_active", "sub_unpaid"]);
  assert.deepEqual(result.voidedInvoices, ["in_credit"]);
  assert.equal(result.billingDeleted, true);
  // Stripe först, Firestore sist — misslyckas Stripe finns id:na kvar till nästa försök.
  assert.deepEqual(calls, ["cancel:sub_active", "cancel:sub_unpaid", "void:in_credit", "mark:cus_user", "mark:cus_org"]);
  assert.equal((await db.doc(`billing/${uid}`).get()).exists, false);
  assert.equal((await db.collection(`billing/${uid}/ledger`).get()).size, 0);

  // Ett nytt försök (failurePolicy) gör ingenting.
  const again = fakeStripe();
  const second = await cleanupBilling(uid, again.stripe);
  assert.equal(second.billingDeleted, false);
  assert.deepEqual(again.calls, []);
});

test("kontoradering utan betaldata rör inte Stripe", async () => {
  const { stripe, calls } = fakeStripe();
  const result = await cleanupBilling("never_paid", stripe);
  assert.equal(result.billingDeleted, false);
  assert.deepEqual(calls, []);
});
