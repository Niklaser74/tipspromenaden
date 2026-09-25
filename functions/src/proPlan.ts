/**
 * @file proPlan.ts
 * @description Rena hjälpare för Pro-prenumerationen, utan Firebase- och
 * Stripe-anrop så att de kan testas direkt.
 *
 * - `refillForInvoice()` räknar ut hur många krediter en betald
 *   prenumerationsfaktura ger, och för vilken period.
 * - `isActiveStatus()` avgör vilka Stripe-statusar som räknas som "har Pro".
 */

/** Statusar där användaren har Pro (past_due: betalningen görs om). */
export const ACTIVE_STATUSES = ["active", "trialing", "past_due"] as const;
/** Statusar där prenumerationen är slut för gott. */
export const ENDED_STATUSES = ["canceled", "incomplete_expired", "unpaid"] as const;

export function isActiveStatus(status: string | undefined): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status ?? "");
}

export function isEndedStatus(status: string | undefined): boolean {
  return (ENDED_STATUSES as readonly string[]).includes(status ?? "");
}

/** Det lilla av en Stripe-fakturarad som behövs här. */
export interface InvoiceLineLike {
  amount: number;
  period: { start: number; end: number };
  pricing: { price_details?: { price: string | { id: string } } } | null;
  parent: { subscription_item_details: { proration: boolean } | null } | null;
}

export interface Refill {
  planId: string;
  credits: number;
  /** Periodens start/slut, sekunder sedan epoch. */
  periodStart: number;
  periodEnd: number;
}

/**
 * Påfyllningen för en betald prenumerationsfaktura, eller null om fakturan
 * inte innehåller någon hel Pro-period (t.ex. bara prorateringar).
 *
 * Vid byte månad → år innehåller fakturan både en kreditering för
 * oanvänd tid och den nya perioden; den senast slutande, icke-proraterade
 * raden med ett känt pris är den som gäller.
 */
export function refillForInvoice(
  lines: InvoiceLineLike[],
  planByPrice: Record<string, { id: string; months: number }>,
  creditsPerMonth: number
): Refill | null {
  let best: Refill | null = null;
  for (const line of lines) {
    const details = line.parent?.subscription_item_details;
    if (!details || details.proration) continue;
    const price = line.pricing?.price_details?.price;
    const priceId = typeof price === "string" ? price : price?.id;
    const plan = priceId ? planByPrice[priceId] : undefined;
    if (!plan) continue;
    if (!best || line.period.end > best.periodEnd) {
      best = {
        planId: plan.id,
        credits: plan.months * creditsPerMonth,
        periodStart: line.period.start,
        periodEnd: line.period.end,
      };
    }
  }
  return best;
}
