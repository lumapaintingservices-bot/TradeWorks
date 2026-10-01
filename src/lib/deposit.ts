/**
 * Deposit when the client signs (optional). Off by default: after signing the client sees the payment schedule and is billed
 * with invoices later. On (company setting settings.depositAtSign, or per estimate estimate.depositAtSign): once the client
 * signs, the owner's app creates the job's invoices and a payment link for the first one, and the client link shows
 * "Pay the deposit" (the same payment page as any invoice). Pure functions, no I/O.
 */
import { calcEstimate, payPlanOn } from "./estimate";
import { isPaid, mainInvoicesFor, planAmounts, type InvoiceRec } from "./invoices";
import type { Estimate, Settings } from "./types";

/** Does this job ask for a deposit at signing? The estimate's own choice wins over the company default. */
export const depositAtSignOf = (e: Pick<Estimate, "depositAtSign">, s: Pick<Settings, "depositAtSign">): boolean =>
  typeof e.depositAtSign === "boolean" ? e.depositAtSign : !!s.depositAtSign;

/** What the client link shows about the deposit: its amount, the payment-link token (once made) and whether it is paid. */
export type DepositPay = { amount: number; token: string; paid: boolean };

/** The first payment of the job: the first invoice if there is one, else what it will be (first stage, or the deposit). */
export function depositPayFor(e: Estimate, s: Settings, invoices: InvoiceRec[]): DepositPay | null {
  if (!depositAtSignOf(e, s)) return null;
  const first = mainInvoicesFor(invoices, e.id)[0];
  if (first) return { amount: first.amount, token: first.pay?.token || "", paid: isPaid(first) };
  const t = calcEstimate(e, s);
  const amount = payPlanOn(e) ? planAmounts(e, t.total)[0] || 0 : t.deposit > 0 && t.balance > 0 ? t.deposit : t.total;
  return { amount, token: "", paid: false };
}

/** Signed, asks for a deposit, and its first invoice still needs a payment link (or the invoices do not exist yet). */
export function needsDepositLink(e: Estimate, s: Settings, invoices: InvoiceRec[]): boolean {
  if (!e.signature || !depositAtSignOf(e, s)) return false;
  // the company default only covers jobs signed after it was switched on (old signed jobs are not billed by surprise);
  // ticking it on the estimate itself always counts
  if (e.depositAtSign !== true && s.depositAtSignSince) {
    const signedAt = e.signature.at && !isNaN(Date.parse(e.signature.at)) ? e.signature.at : (e.signature.date || "") + "T23:59:59Z";
    if (Date.parse(signedAt) < Date.parse(s.depositAtSignSince)) return false;
  }
  const first = mainInvoicesFor(invoices, e.id)[0];
  return !first || (!isPaid(first) && !first.pay?.token);
}
