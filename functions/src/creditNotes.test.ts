import { strict as assert } from "node:assert";
import { test } from "node:test";
import { creditedOutsideRefunds } from "./creditNotes";

test("bara återbetalning → inget att dra här (charge.refunded tar det)", () => {
  assert.equal(creditedOutsideRefunds({ post_payment_amount: 34900, refunds: [{ amount_refunded: 34900 }] }), 0);
});

test("kredit utanför Stripe (bankgiro) dras här", () => {
  assert.equal(creditedOutsideRefunds({ post_payment_amount: 34900, refunds: [] }), 34900);
});

test("blandat: halva återbetald, halva krediterad utanför Stripe", () => {
  assert.equal(creditedOutsideRefunds({ post_payment_amount: 34900, refunds: [{ amount_refunded: 17450 }] }), 17450);
});

test("kreditnota före betalning ger inget avdrag", () => {
  assert.equal(creditedOutsideRefunds({ post_payment_amount: 0, refunds: [] }), 0);
});
