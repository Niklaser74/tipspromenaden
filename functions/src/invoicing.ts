/**
 * @file invoicing.ts
 * @description Kreditpaket på faktura till skolor och föreningar
 * (Stripe Invoicing).
 *
 * - `createInvoice` (callable): skapar, slutför och mejlar en faktura
 *   (30 dagar netto) till organisationens e-post. Fakturan bär
 *   organisationsnummer och "Er referens" som egna fält, och momsnummer
 *   som kundens tax id.
 * - Krediterna läggs till först när fakturan är betald (`invoice.paid`,
 *   se `handleInvoicePaid`). Det gäller även betalning utanför Stripe
 *   (bankgiro), som markeras "Paid out of band" i Dashboard.
 * - `invoice.voided` / `invoice.marked_uncollectible` stänger raden i
 *   huvudboken så att den inte räknas mot taket på öppna fakturor.
 *
 * Samma requestId två gånger ger samma faktura (idempotensnyckel mot
 * Stripe + raden `ledger/{invoiceId}`), så ett nätverksfel i klienten
 * skickar inte två fakturor.
 */
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type Stripe from "stripe";
import { accountExists } from "./accountDeletion";
import { CREDIT_PACKS, ENFORCE_APP_CHECK, INVOICE_DAYS_UNTIL_DUE, MAX_OPEN_INVOICES, STRIPE_SECRET_KEY } from "./config";
import {
  closeInvoice,
  countOpenInvoices,
  findIssuedInvoice,
  grantInvoicedCredits,
  recordIssuedInvoice,
} from "./credits";
import { parseInvoiceRequest } from "./invoiceRequest";
import { RequestError } from "./request";
import { METADATA_KIND, automaticTax, requireAccount, stripeClient, taxRates, toHttpsError } from "./stripe";
import { upsertOrgCustomer } from "./stripeCustomer";

export interface CreateInvoiceResponse {
  invoiceId: string;
  number: string | null;
  hostedInvoiceUrl: string | null;
  amountDue: number;
  currency: string;
  /** Förfallodag, sekunder sedan epoch. */
  dueDate: number | null;
}

function toResponse(invoice: Stripe.Invoice): CreateInvoiceResponse {
  return {
    invoiceId: invoice.id,
    number: invoice.number,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    amountDue: invoice.amount_due,
    currency: invoice.currency,
    dueDate: invoice.due_date,
  };
}

export const createInvoice = onCall(
  { secrets: [STRIPE_SECRET_KEY], enforceAppCheck: ENFORCE_APP_CHECK },
  async (request): Promise<CreateInvoiceResponse> => {
    const { uid } = requireAccount(request);

    let req;
    try {
      req = parseInvoiceRequest(request.data);
    } catch (e) {
      if (e instanceof RequestError) throw new HttpsError("invalid-argument", e.message);
      throw e;
    }
    const pack = CREDIT_PACKS[req.packId];
    if (!pack?.invoice) {
      throw new HttpsError("invalid-argument", "Det paketet går inte att köpa på faktura.");
    }

    const stripe = stripeClient();
    const key = `invoice-${uid}-${req.requestId}`;
    try {
      // Samma requestId som en redan skickad faktura (retry) → returnera
      // den i stället för att mejla en till.
      const previous = await findIssuedInvoice(uid, req.requestId);
      if (previous) return toResponse(await stripe.invoices.retrieve(previous));
      if ((await countOpenInvoices(uid)) >= MAX_OPEN_INVOICES) {
        throw new HttpsError(
          "failed-precondition",
          `Du har redan ${MAX_OPEN_INVOICES} obetalda fakturor. Betala dem eller hör av dig innan du beställer fler.`,
          { reason: "too-many-open-invoices" }
        );
      }

      const customer = await upsertOrgCustomer(stripe, uid, req.organization);
      const org = req.organization;
      const customFields = [
        ...(org.orgNumber ? [{ name: "Org.nr", value: org.orgNumber }] : []),
        ...(org.reference ? [{ name: "Er referens", value: org.reference }] : []),
      ];
      const metadata = {
        kind: METADATA_KIND.invoice,
        uid,
        packId: pack.id,
        credits: String(pack.credits),
        requestId: req.requestId,
      };

      // Idempotensnyckeln ger samma utkast vid retry. Svaret är cachat,
      // så status hämtas på nytt nedan.
      const created = await stripe.invoices.create(
        {
          customer,
          collection_method: "send_invoice",
          days_until_due: INVOICE_DAYS_UNTIL_DUE,
          currency: "sek",
          auto_advance: false,
          pending_invoice_items_behavior: "exclude",
          automatic_tax: automaticTax(),
          description: `Tipspromenaden – ${pack.credits} AI-krediter. Krediterna aktiveras när fakturan är betald.`,
          ...(customFields.length ? { custom_fields: customFields } : {}),
          metadata,
        },
        { idempotencyKey: key }
      );

      let invoice = await stripe.invoices.retrieve(created.id);
      if (invoice.status === "draft") {
        const rates = taxRates();
        await stripe.invoiceItems.create(
          {
            customer,
            invoice: invoice.id,
            pricing: { price: pack.price() },
            quantity: 1,
            ...(rates.length ? { tax_rates: rates } : {}),
          },
          { idempotencyKey: `${key}-item` }
        );
        invoice = await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: true });
      }
      if (invoice.status === "open") {
        invoice = await stripe.invoices.sendInvoice(invoice.id);
      }

      await recordIssuedInvoice(uid, invoice.id, {
        requestId: req.requestId,
        packId: pack.id,
        credits: pack.credits,
        amountDue: invoice.amount_due,
        currency: invoice.currency,
        number: invoice.number,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      });
      logger.info("Faktura skickad", { uid, invoice: invoice.id, packId: pack.id, number: invoice.number });
      return toResponse(invoice);
    } catch (e) {
      logger.error("createInvoice misslyckades", { uid, error: (e as Error).message });
      throw toHttpsError(e, "Kunde inte skapa fakturan. Försök igen.");
    }
  }
);

/** `invoice.paid` för en kreditfaktura → krediterna läggs till. */
export async function handleCreditInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const uid = invoice.metadata?.uid;
  const credits = Number(invoice.metadata?.credits);
  if (!uid || !Number.isInteger(credits) || credits <= 0) {
    logger.error("Kreditfaktura saknar uid/credits i metadata", { invoice: invoice.id });
    return;
  }
  if (!(await accountExists(uid))) {
    logger.error("Betald kreditfaktura för raderat konto — återbetala i Dashboard", { uid, invoice: invoice.id });
    return;
  }
  const granted = await grantInvoicedCredits(uid, invoice.id, credits, {
    packId: invoice.metadata?.packId ?? "",
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
  });
  logger.info(granted ? "Faktura betald — krediter tillagda" : "Fakturan redan registrerad som betald", {
    uid,
    credits,
    invoice: invoice.id,
  });
}

export async function handleCreditInvoiceClosed(
  invoice: Stripe.Invoice,
  status: "void" | "uncollectible"
): Promise<void> {
  const uid = invoice.metadata?.uid;
  if (!uid || !(await accountExists(uid))) return;
  await closeInvoice(uid, invoice.id, status);
  logger.info("Faktura stängd", { uid, invoice: invoice.id, status });
}

/**
 * Fakturan som en betalning hör till, eller null. Behövs vid
 * återbetalning: en fakturabetalnings PaymentIntent saknar vår metadata,
 * den ligger på fakturan.
 */
export async function invoiceForPaymentIntent(stripe: Stripe, paymentIntentId: string): Promise<Stripe.Invoice | null> {
  const payments = await stripe.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: paymentIntentId },
    expand: ["data.invoice"],
    limit: 1,
  });
  const invoice = payments.data[0]?.invoice;
  if (!invoice || typeof invoice === "string" || invoice.deleted) return null;
  return invoice;
}
