/**
 * Integrationstest för kreditlogiken mot Firestore-emulatorn.
 * Körs med `npm run test:emulator` (startar emulatorn själv).
 * Inte en del av `npm test` — kräver Java + firebase-tools.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { RATE_LIMIT_MAX } from "./config";
import {
  closeInvoice,
  consumeCredits,
  countOpenInvoices,
  findIssuedInvoice,
  grantInvoicedCredits,
  grantPurchasedCredits,
  recordIssuedInvoice,
  refundCredits,
  reserveCredits,
  reverseRefundedCredits,
} from "./credits";
import type { GenerationResult } from "./prompt";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST måste vara satt");
initializeApp({ projectId: "demo-tipspromenaden" });
const db = getFirestore();

async function credits(uid: string): Promise<number> {
  return ((await db.doc(`billing/${uid}`).get()).data()?.credits as number) ?? 0;
}

const result: GenerationResult = {
  battery: {
    format: "tipspack",
    version: "1.0",
    name: "Test",
    questions: [{ text: "F", options: ["A", "B"], correctOptionIndex: 0 }],
  },
  notes: [{ explanation: "", sourceUrl: "" }],
};
const usage = { inputTokens: 1, outputTokens: 1, webSearches: 0, costUsd: 0 };

function reason(e: unknown): string | undefined {
  return e instanceof HttpsError ? (e.details as { reason?: string })?.reason : undefined;
}

test("köp är idempotent per Checkout Session", async () => {
  const uid = "buyer";
  assert.equal(await grantPurchasedCredits(uid, "cs_1", 10, { packId: "pack10", amountTotal: 4900, currency: "sek" }), true);
  assert.equal(await grantPurchasedCredits(uid, "cs_1", 10, { packId: "pack10", amountTotal: 4900, currency: "sek" }), false);
  assert.equal(await credits(uid), 10);
});

test("utan krediter nekas genereringen", async () => {
  await assert.rejects(reserveCredits("broke", "req_a", 1, "topic"), (e) => reason(e) === "no-credits");
});

test("reservera → förbruka → samma requestId ger cachat svar utan nytt drag", async () => {
  const uid = "gen";
  await grantPurchasedCredits(uid, "cs_2", 5, { packId: "pack10", amountTotal: null, currency: null });
  const r = await reserveCredits(uid, "req_ok", 2, "place");
  assert.equal(r.kind, "reserved");
  assert.equal(await credits(uid), 3);

  // Parallellt dubbelanrop medan den första pågår
  await assert.rejects(reserveCredits(uid, "req_ok", 2, "place"), (e) => reason(e) === "in-progress");

  await consumeCredits(uid, "req_ok", result, usage);
  const again = await reserveCredits(uid, "req_ok", 2, "place");
  assert.equal(again.kind, "cached");
  assert.equal(await credits(uid), 3);
});

test("återbetalning är idempotent och tillåter nytt försök", async () => {
  const uid = "refund";
  await grantPurchasedCredits(uid, "cs_3", 3, { packId: "pack10", amountTotal: null, currency: null });
  await reserveCredits(uid, "req_fail", 1, "topic");
  assert.equal(await credits(uid), 2);
  await refundCredits(uid, "req_fail", "test");
  await refundCredits(uid, "req_fail", "test");
  assert.equal(await credits(uid), 3);
  const retry = await reserveCredits(uid, "req_fail", 1, "topic");
  assert.equal(retry.kind, "reserved");
  assert.equal(await credits(uid), 2);
});

test("rate limit", async () => {
  const uid = "spammer";
  await grantPurchasedCredits(uid, "cs_4", 100, { packId: "pack30", amountTotal: null, currency: null });
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    await reserveCredits(uid, `req_rate_${i}`, 1, "topic");
  }
  await assert.rejects(reserveCredits(uid, "req_rate_x", 1, "topic"), (e) => reason(e) === "rate-limited");
  assert.equal(await credits(uid), 100 - RATE_LIMIT_MAX);
});

test("återbetalning drar krediter proportionellt, idempotent och aldrig under noll", async () => {
  const uid = "refunded";
  await grantPurchasedCredits(uid, "cs_r", 10, { packId: "pack10", amountTotal: 4900, currency: "sek" });
  // Halv återbetalning → 5 krediter
  assert.equal(await reverseRefundedCredits(uid, "ch_1", { credits: 10, amount: 4900, amountRefunded: 2450 }), 5);
  // Samma webhook igen → inget mer
  assert.equal(await reverseRefundedCredits(uid, "ch_1", { credits: 10, amount: 4900, amountRefunded: 2450 }), 0);
  assert.equal(await credits(uid), 5);
  // Användaren förbrukar 4 → 1 kvar; full återbetalning ska dra 5 men bara 1 finns
  for (let i = 0; i < 4; i++) {
    await reserveCredits(uid, `req_ref_${i}`, 1, "topic");
  }
  assert.equal(await credits(uid), 1);
  assert.equal(await reverseRefundedCredits(uid, "ch_1", { credits: 10, amount: 4900, amountRefunded: 4900 }), 1);
  assert.equal(await credits(uid), 0);
  const row = (await db.doc(`billing/${uid}/ledger/refund_ch_1`).get()).data()!;
  assert.equal(row.creditsReversed, 10);
  assert.equal(row.removedTotal, 6);
  assert.equal(row.uncollected, 4);
});

test("faktura: krediter först vid betalning, idempotent, öppna räknas", async () => {
  const uid = "school";
  const issued = {
    requestId: "inv_req_1",
    packId: "pack100",
    credits: 100,
    amountDue: 39900,
    currency: "sek",
    number: "TP-0001",
    hostedInvoiceUrl: null,
  };
  assert.equal(await recordIssuedInvoice(uid, "in_1", issued), true);
  assert.equal(await recordIssuedInvoice(uid, "in_1", issued), false);
  assert.equal(await findIssuedInvoice(uid, "inv_req_1"), "in_1");
  assert.equal(await findIssuedInvoice(uid, "inv_req_x"), null);
  await recordIssuedInvoice(uid, "in_2", { ...issued, requestId: "inv_req_2" });
  assert.equal(await countOpenInvoices(uid), 2);
  assert.equal(await credits(uid), 0);

  const paid = { packId: "pack100", amountPaid: 39900, currency: "sek" };
  assert.equal(await grantInvoicedCredits(uid, "in_1", 100, paid), true);
  assert.equal(await grantInvoicedCredits(uid, "in_1", 100, paid), false);
  assert.equal(await credits(uid), 100);
  assert.equal(await countOpenInvoices(uid), 1);

  // Makulerad faktura slutar räknas; en betald går inte att makulera i huvudboken.
  await closeInvoice(uid, "in_2", "void");
  await closeInvoice(uid, "in_1", "void");
  assert.equal(await countOpenInvoices(uid), 0);
  assert.equal((await db.doc(`billing/${uid}/ledger/in_1`).get()).data()?.status, "granted");
});

test("faktura: osäker fordran som betalas ändå ger krediter", async () => {
  const uid = "late_payer";
  await recordIssuedInvoice(uid, "in_3", {
    requestId: "inv_req_3",
    packId: "pack300",
    credits: 300,
    amountDue: 99900,
    currency: "sek",
    number: null,
    hostedInvoiceUrl: null,
  });
  await closeInvoice(uid, "in_3", "uncollectible");
  assert.equal(await grantInvoicedCredits(uid, "in_3", 300, { packId: "pack300", amountPaid: 99900, currency: "sek" }), true);
  assert.equal(await credits(uid), 300);
});
