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
import { consumeCredits, grantPurchasedCredits, refundCredits, reserveCredits, reverseRefundedCredits } from "./credits";
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
