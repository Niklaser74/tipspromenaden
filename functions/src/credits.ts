/**
 * @file credits.ts
 * @description Kreditsaldo och huvudbok i Firestore. Endast Admin SDK
 * skriver här — `firestore.rules` nekar alla klientskrivningar.
 *
 *   billing/{uid}                 { credits, subscriptionCredits?, pro?,
 *                                   recentGenerations[], updatedAt }
 *   billing/{uid}/ledger/{id}     en rad per generering (id = requestId),
 *                                 köp (id = Stripe Checkout Session-id)
 *                                 eller faktura (id = Stripe Invoice-id)
 *
 * Flödet för en generering:
 *   reserveCredits  → drar krediten i förväg, ledger.status = "reserved"
 *   consumeCredits  → ledger.status = "consumed" + resultatet sparas
 *   refundCredits   → ledger.status = "refunded" + krediten tillbaka
 *
 * Samma requestId två gånger ger aldrig dubbeldrag: är raden redan
 * "consumed" returneras det sparade resultatet.
 */
import { FieldValue, Timestamp, getFirestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from "./config";
import type { UsageSummary } from "./ai";
import type { GenerationResult } from "./prompt";
import { isActiveStatus, isEndedStatus } from "./proPlan";
import type { Mode } from "./request";

export type LedgerStatus =
  | "reserved"
  | "consumed"
  | "refunded"
  | "granted"
  | "reversed"
  | "open"
  | "void"
  | "uncollectible"
  | "stale";

interface BillingDoc {
  /** Köpta krediter — försvinner aldrig. */
  credits?: number;
  /** Pro-krediter för innevarande period — fylls på, sparas inte. */
  subscriptionCredits?: number;
  /** Start (sekunder) på perioden som subscriptionCredits hör till. */
  subscriptionPeriodStart?: number;
  pro?: ProState;
  recentGenerations?: Timestamp[];
}

/** Speglar Stripe-prenumerationen; skrivs bara av webhooken. */
export interface ProState {
  status: string;
  subscriptionId: string;
  planId: string | null;
  /** Periodens slut, sekunder sedan epoch. */
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

/** Saldot som användaren ser: köpta + Pro-krediter. */
export function totalCredits(billing: BillingDoc): number {
  return (billing.credits ?? 0) + (billing.subscriptionCredits ?? 0);
}

interface LedgerDoc {
  type: "generation" | "purchase" | "refund" | "invoice" | "subscription";
  status: LedgerStatus;
  delta: number;
  /** Del av en generering som togs från Pro-krediterna. */
  fromSubscription?: number;
  result?: GenerationResult;
}

function billingRef(uid: string) {
  return getFirestore().collection("billing").doc(uid);
}

function ledgerRef(uid: string, id: string) {
  return billingRef(uid).collection("ledger").doc(id);
}

export type ReserveOutcome =
  | { kind: "reserved"; creditsLeft: number }
  | { kind: "cached"; result: GenerationResult; creditsLeft: number };

export async function reserveCredits(
  uid: string,
  requestId: string,
  cost: number,
  mode: Mode
): Promise<ReserveOutcome> {
  return getFirestore().runTransaction(async (tx: Transaction) => {
    const [billingSnap, ledgerSnap] = await Promise.all([
      tx.get(billingRef(uid)),
      tx.get(ledgerRef(uid, requestId)),
    ]);
    const billing = (billingSnap.data() ?? {}) as BillingDoc;
    const credits = totalCredits(billing);

    if (ledgerSnap.exists) {
      const ledger = ledgerSnap.data() as LedgerDoc;
      if (ledger.status === "consumed" && ledger.result) {
        return { kind: "cached", result: ledger.result, creditsLeft: credits };
      }
      if (ledger.status === "reserved") {
        throw new HttpsError("aborted", "Genereringen pågår redan.", { reason: "in-progress" });
      }
      // "refunded": ett tidigare försök misslyckades — nytt försök med samma id går bra.
    }

    const now = Date.now();
    const recent = (billing.recentGenerations ?? []).filter(
      (t) => now - t.toMillis() < RATE_LIMIT_WINDOW_MS
    );
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new HttpsError("resource-exhausted", "För många genereringar på kort tid. Vänta en stund.", {
        reason: "rate-limited",
      });
    }
    if (credits < cost) {
      throw new HttpsError("failed-precondition", "Du har inte tillräckligt med AI-krediter.", {
        reason: "no-credits",
        credits,
        cost,
      });
    }

    // Pro-krediterna först: de försvinner vid periodens slut, köpta gör inte det.
    const subscription = billing.subscriptionCredits ?? 0;
    const fromSubscription = Math.min(subscription, cost);
    tx.set(
      billingRef(uid),
      {
        credits: (billing.credits ?? 0) - (cost - fromSubscription),
        subscriptionCredits: subscription - fromSubscription,
        recentGenerations: [...recent, Timestamp.fromMillis(now)],
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(ledgerRef(uid, requestId), {
      type: "generation",
      status: "reserved",
      delta: -cost,
      fromSubscription,
      mode,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { kind: "reserved", creditsLeft: credits - cost };
  });
}

export async function consumeCredits(
  uid: string,
  requestId: string,
  result: GenerationResult,
  usage: UsageSummary
): Promise<void> {
  await ledgerRef(uid, requestId).update({
    status: "consumed",
    result,
    usage,
    completedAt: FieldValue.serverTimestamp(),
  });
}

/** Lägger tillbaka krediten om raden fortfarande är reserverad. Idempotent. */
export async function refundCredits(
  uid: string,
  requestId: string,
  reason: string,
  usage?: UsageSummary
): Promise<void> {
  await getFirestore().runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ledgerRef(uid, requestId));
    if (!snap.exists) return;
    const ledger = snap.data() as LedgerDoc;
    if (ledger.status !== "reserved") return;
    const fromSubscription = ledger.fromSubscription ?? 0;
    tx.set(
      billingRef(uid),
      {
        credits: FieldValue.increment(-ledger.delta - fromSubscription),
        subscriptionCredits: FieldValue.increment(fromSubscription),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    tx.update(ledgerRef(uid, requestId), {
      status: "refunded",
      error: reason.slice(0, 500),
      ...(usage ? { usage } : {}),
      completedAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Lägger till köpta krediter. Idempotent per Stripe Checkout Session —
 * Stripe kan leverera samma webhook flera gånger.
 * @returns false om köpet redan var registrerat.
 */
export async function grantPurchasedCredits(
  uid: string,
  checkoutSessionId: string,
  credits: number,
  details: {
    packId: string;
    amountTotal: number | null;
    currency: string | null;
    invoiceId?: string | null;
  }
): Promise<boolean> {
  return getFirestore().runTransaction(async (tx: Transaction) => {
    const ref = ledgerRef(uid, checkoutSessionId);
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(
      billingRef(uid),
      { credits: FieldValue.increment(credits), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    tx.set(ref, {
      type: "purchase",
      status: "granted",
      delta: credits,
      ...details,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

/**
 * Drar tillbaka krediter när ett kortköp återbetalas i Stripe.
 *
 * Delåterbetalningar ger proportionellt avdrag (avrundat). Raden
 * `ledger/refund_<chargeId>` håller hur mycket som redan dragits, så att
 * upprepade webhooks och flera delåterbetalningar av samma charge bara
 * drar mellanskillnaden. Saldot blir aldrig negativt — har användaren
 * redan förbrukat krediterna dras det som finns kvar, och resten loggas
 * på raden (`uncollected`) för manuell uppföljning.
 * @returns antal krediter som faktiskt drogs nu.
 */
export async function reverseRefundedCredits(
  uid: string,
  chargeId: string,
  refund: { credits: number; amount: number; amountRefunded: number }
): Promise<number> {
  return getFirestore().runTransaction(async (tx: Transaction) => {
    const ref = ledgerRef(uid, `refund_${chargeId}`);
    const [billingSnap, ledgerSnap] = await Promise.all([tx.get(billingRef(uid)), tx.get(ref)]);
    const already = (ledgerSnap.data()?.creditsReversed as number | undefined) ?? 0;
    const target =
      refund.amount > 0
        ? Math.min(refund.credits, Math.round((refund.credits * refund.amountRefunded) / refund.amount))
        : 0;
    const toReverse = target - already;
    if (toReverse <= 0) return 0;

    const balance = ((billingSnap.data() ?? {}) as BillingDoc).credits ?? 0;
    const removed = Math.min(toReverse, Math.max(0, balance));
    const prev = ledgerSnap.data() ?? {};
    const removedTotal = ((prev.removedTotal as number | undefined) ?? 0) + removed;
    tx.set(
      billingRef(uid),
      { credits: balance - removed, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    tx.set(
      ref,
      {
        type: "refund",
        status: "reversed",
        delta: -removedTotal,
        chargeId,
        creditsReversed: target,
        removedTotal,
        uncollected: ((prev.uncollected as number | undefined) ?? 0) + (toReverse - removed),
        amountRefunded: refund.amountRefunded,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return removed;
  });
}

// -------------------- Faktura (skolor/föreningar) --------------------

export interface IssuedInvoice {
  requestId: string;
  packId: string;
  credits: number;
  amountDue: number;
  currency: string;
  number: string | null;
  hostedInvoiceUrl: string | null;
}

/**
 * Registrerar en skickad faktura (`ledger/{invoiceId}`, status "open",
 * delta 0). Krediterna läggs till först när fakturan betalas.
 * @returns false om fakturan redan var registrerad.
 */
export async function recordIssuedInvoice(uid: string, invoiceId: string, invoice: IssuedInvoice): Promise<boolean> {
  try {
    await ledgerRef(uid, invoiceId).create({
      type: "invoice",
      status: "open",
      delta: 0,
      ...invoice,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (e) {
    // ALREADY_EXISTS (gRPC 6) — ett nytt försök med samma requestId.
    if ((e as { code?: number }).code === 6) return false;
    throw e;
  }
}

/** Fakturan som redan skickats för ett requestId, eller null. */
export async function findIssuedInvoice(uid: string, requestId: string): Promise<string | null> {
  const snap = await billingRef(uid)
    .collection("ledger")
    .where("requestId", "==", requestId)
    .where("type", "==", "invoice")
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

export async function countOpenInvoices(uid: string): Promise<number> {
  const snap = await billingRef(uid)
    .collection("ledger")
    .where("type", "==", "invoice")
    .where("status", "==", "open")
    .count()
    .get();
  return snap.data().count;
}

/**
 * Lägger till krediterna när en faktura är betald. Idempotent per faktura.
 * Fungerar även om raden saknas (faktura skapad direkt i Dashboard med
 * rätt metadata) och för en faktura som först markerats som osäker
 * fordran men sedan betalats ändå.
 * @returns false om krediterna redan var tillagda.
 */
export async function grantInvoicedCredits(
  uid: string,
  invoiceId: string,
  credits: number,
  details: { packId: string; amountPaid: number; currency: string }
): Promise<boolean> {
  return getFirestore().runTransaction(async (tx: Transaction) => {
    const ref = ledgerRef(uid, invoiceId);
    const snap = await tx.get(ref);
    if (snap.data()?.status === "granted") return false;
    tx.set(
      billingRef(uid),
      { credits: FieldValue.increment(credits), updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    tx.set(
      ref,
      {
        type: "invoice",
        status: "granted",
        delta: credits,
        credits,
        ...details,
        paidAt: FieldValue.serverTimestamp(),
        ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );
    return true;
  });
}

/** Makulerad eller osäker fordran — raden slutar räknas som öppen. */
export async function closeInvoice(uid: string, invoiceId: string, status: "void" | "uncollectible"): Promise<void> {
  await getFirestore().runTransaction(async (tx: Transaction) => {
    const ref = ledgerRef(uid, invoiceId);
    const snap = await tx.get(ref);
    if (snap.data()?.status !== "open") return;
    tx.update(ref, { status, closedAt: FieldValue.serverTimestamp() });
  });
}

// -------------------- Pro-prenumeration --------------------

/**
 * Speglar prenumerationens status i `billing/{uid}.pro`.
 *
 * Har användaren en annan aktiv prenumeration (t.ex. två Checkout i
 * parallella flikar) skrivs den inte över av en avslutad. När
 * prenumerationen tar slut nollas Pro-krediterna.
 * @returns false om uppdateringen hoppades över.
 */
export async function setProState(uid: string, state: ProState): Promise<boolean> {
  return getFirestore().runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(billingRef(uid));
    const current = ((snap.data() ?? {}) as BillingDoc).pro;
    if (
      current &&
      current.subscriptionId !== state.subscriptionId &&
      isActiveStatus(current.status) &&
      !isActiveStatus(state.status)
    ) {
      return false;
    }
    tx.set(
      billingRef(uid),
      {
        pro: { ...state, updatedAt: FieldValue.serverTimestamp() },
        ...(isEndedStatus(state.status) ? { subscriptionCredits: 0 } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  });
}

/**
 * Fyller på Pro-krediterna för en betald period. Saldot SÄTTS till
 * periodens krediter — oanvända från förra perioden försvinner (loggas som
 * `expired`). Idempotent per faktura; en äldre faktura som kommer efter en
 * nyare (webhooks kan komma i fel ordning) registreras men nollställer
 * inget.
 * @returns false om fakturan redan var registrerad eller var äldre.
 */
export async function refillSubscriptionCredits(
  uid: string,
  invoiceId: string,
  refill: { planId: string; credits: number; periodStart: number; periodEnd: number; subscriptionId: string }
): Promise<boolean> {
  return getFirestore().runTransaction(async (tx: Transaction) => {
    const ref = ledgerRef(uid, invoiceId);
    const [billingSnap, ledgerSnap] = await Promise.all([tx.get(billingRef(uid)), tx.get(ref)]);
    if (ledgerSnap.exists) return false;
    const billing = (billingSnap.data() ?? {}) as BillingDoc;
    const stale = (billing.subscriptionPeriodStart ?? 0) > refill.periodStart;
    const previous = billing.subscriptionCredits ?? 0;
    if (!stale) {
      tx.set(
        billingRef(uid),
        {
          subscriptionCredits: refill.credits,
          subscriptionPeriodStart: refill.periodStart,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    tx.set(ref, {
      type: "subscription",
      status: stale ? "stale" : "granted",
      delta: stale ? 0 : refill.credits - previous,
      expired: stale ? 0 : previous,
      ...refill,
      createdAt: FieldValue.serverTimestamp(),
    });
    return !stale;
  });
}
