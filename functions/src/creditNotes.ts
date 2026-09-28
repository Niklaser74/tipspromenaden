/**
 * @file creditNotes.ts
 * @description Ren beräkning för kreditnotor på betalda kreditfakturor.
 *
 * En kreditnota efter betalning (`post_payment_amount`) kan fördelas på
 * tre sätt: återbetalning till betalsättet, kredit på kundens saldo i
 * Stripe och "kreditera utanför Stripe" (t.ex. bankgiro tillbaka).
 * Återbetalningsdelen ger också `charge.refunded` och dras redan där —
 * här räknas bara resten, så att samma belopp aldrig dras två gånger.
 */

export interface CreditNoteAmounts {
  post_payment_amount: number;
  refunds: Array<{ amount_refunded: number }>;
}

/** Belopp (öre) som krediterats på annat sätt än via återbetalning. */
export function creditedOutsideRefunds(note: CreditNoteAmounts): number {
  const refunded = note.refunds.reduce((sum, r) => sum + (r.amount_refunded ?? 0), 0);
  return Math.max(0, note.post_payment_amount - refunded);
}
