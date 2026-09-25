import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isActiveStatus, isEndedStatus, refillForInvoice, type InvoiceLineLike } from "./proPlan";

const plans = {
  price_month: { id: "pro_month", months: 1 },
  price_year: { id: "pro_year", months: 12 },
};

function line(price: string, start: number, end: number, proration = false, amount = 7900): InvoiceLineLike {
  return {
    amount,
    period: { start, end },
    pricing: { price_details: { price } },
    parent: { subscription_item_details: { proration } },
  };
}

test("månadsfaktura ger en månads krediter", () => {
  assert.deepEqual(refillForInvoice([line("price_month", 100, 200)], plans, 20), {
    planId: "pro_month",
    credits: 20,
    periodStart: 100,
    periodEnd: 200,
  });
});

test("byte till år: prorateringar ignoreras, årsperioden gäller", () => {
  const refill = refillForInvoice(
    [line("price_month", 150, 200, true, -4000), line("price_year", 150, 10_000)],
    plans,
    20
  );
  assert.equal(refill?.planId, "pro_year");
  assert.equal(refill?.credits, 240);
  assert.equal(refill?.periodEnd, 10_000);
});

test("okänt pris, fakturapost eller bara prorateringar ger ingen påfyllning", () => {
  assert.equal(refillForInvoice([line("price_other", 1, 2)], plans, 20), null);
  assert.equal(refillForInvoice([line("price_month", 1, 2, true)], plans, 20), null);
  assert.equal(refillForInvoice([{ ...line("price_month", 1, 2), parent: null }], plans, 20), null);
});

test("statusar", () => {
  assert.ok(isActiveStatus("active"));
  assert.ok(isActiveStatus("past_due"));
  assert.ok(!isActiveStatus("canceled"));
  assert.ok(isEndedStatus("canceled"));
  assert.ok(!isEndedStatus("past_due"));
});
