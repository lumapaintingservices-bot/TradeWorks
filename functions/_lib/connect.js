// Card / bank payments on invoice payment links, with Stripe Connect (Standard accounts, direct charges):
// each company connects ITS OWN Stripe account; the client pays on a Stripe Checkout page created ON that account,
// so the money goes straight to the contractor and Stripe's fee is charged to them. TradeWorks never holds the money.
// Pure logic over injected `db` / `stripe` objects (unit-tested with fakes in connect.test.js).
// shared with the app (bundled by Cloudflare Pages like the rest of /functions)
import { statusAfterPayment } from "../../src/lib/invoices.ts";
import { isSafeId } from "./util.js";

/** Company fields written from a Stripe account object (only the webhook / functions write them; see firestore.rules). */
export const accountFields = (acct, now = Date.now()) => ({
  stripeReady: !!(acct && acct.charges_enabled),
  stripeDetails: !!(acct && acct.details_submitted),
  stripeCheckedAt: new Date(now).toISOString(),
});

// the same switch the app uses to show the "Pay by card" button
export { cardPayOn } from "../../src/lib/paylink.ts";

/** Stripe says the account does not exist (or is not ours) with this key, e.g. a test-mode account after switching to live keys. */
export const isGone = (e) => /: (403|404) |No such account|does not have access/i.test(String(e && e.message));

export const toCents = (amount) => Math.round((Number(amount) || 0) * 100);
export const MIN_CENTS = 50; // Stripe's minimum charge in USD

/** Date (YYYY-MM-DD) in the business's time zone, for paidDate. */
export function dayIn(now, timeZone = "America/New_York") {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now)); }
  catch { return new Date(now).toISOString().slice(0, 10); }
}

/** Parses the public copy (paylink.data) without ever throwing. */
export function payModelOf(paylink) {
  try { const m = JSON.parse(paylink && paylink.data); return m && typeof m === "object" ? m : null; } catch { return null; }
}

/**
 * Stripe Checkout parameters for one invoice. The amount is the invoice's own amount (never one sent by the browser).
 * metadata ties the payment back to the invoice: the webhook checks it against the account that got the money.
 */
export function invoiceCheckoutParams({ token, companyId, inv, model, origin, lang, feePct = 0 }) {
  const es = lang === "es";
  const cents = toCents(inv.amount);
  const business = String(model?.business?.name || "").slice(0, 80);
  const title = String((es ? model?.inv?.titleEs : model?.inv?.titleEn) || "").slice(0, 120);
  const name = `${es ? "Factura" : "Invoice"} ${inv.number || ""}${title ? " — " + title : ""}`.slice(0, 250);
  const meta = { kind: "invoice", companyId, invId: inv.id, token, number: String(inv.number || "").slice(0, 40) };
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(inv.email || "")) ? String(inv.email) : undefined;
  const fee = feePct > 0 ? Math.floor((cents * Math.min(feePct, 10)) / 100) : 0;
  return {
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: cents, product_data: { name, ...(business ? { description: business } : {}) } } }],
    ...(email ? { customer_email: email } : {}),
    locale: es ? "es" : "en",
    client_reference_id: inv.id,
    success_url: `${origin}/pay/${token}?paid=1`,
    cancel_url: `${origin}/pay/${token}`,
    metadata: meta,
    payment_intent_data: { description: name, metadata: meta, ...(fee > 0 ? { application_fee_amount: fee } : {}) },
  };
}

export const CONNECT_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "account.updated",
  "account.application.deauthorized",
];

/** What a Checkout event means for the invoice: "paid", "processing" (bank transfer on its way) or "failed". null = ignore. */
export function sessionOutcome(type, s) {
  if (type === "checkout.session.async_payment_succeeded") return "paid";
  if (type === "checkout.session.async_payment_failed") return "failed";
  if (type === "checkout.session.completed") return s.payment_status === "paid" ? "paid" : s.payment_status === "unpaid" ? "processing" : null;
  return null;
}
// a later state never goes back to an earlier one when Stripe delivers events out of order
const RANK = { failed: 1, processing: 1, paid: 2 };

/**
 * Applies one Stripe Connect webhook event.
 * @returns {Promise<{handled: boolean, reason?: string, companyId?: string, invId?: string, outcome?: string}>}
 * Throws only for real failures (Firestore errors) so the webhook answers 5xx and Stripe retries.
 */
export async function applyConnectEvent(event, { db, now = Date.now() }) {
  if (!CONNECT_EVENTS.includes(event.type)) return { handled: false, reason: "ignored_type" };
  const obj = event.data && event.data.object;
  if (!obj) return { handled: false, reason: "no_object" };
  const account = event.account || (event.type.startsWith("account.") && event.type !== "account.application.deauthorized" ? obj.id : null);
  if (!account) return { handled: false, reason: "no_account" };

  // ---- the contractor's Stripe account changed (finished onboarding, or charges were paused / disconnected) ----
  if (event.type === "account.updated" || event.type === "account.application.deauthorized") {
    const co = await db.findOne("companies", "stripeAccountId", account);
    if (!co) return { handled: false, reason: "company_not_found" };
    const fields = event.type === "account.updated" ? accountFields(obj, now) : { stripeReady: false, stripeCheckedAt: new Date(now).toISOString() };
    await db.patch(`companies/${co.id}`, fields);
    return { handled: true, companyId: co.id };
  }

  // ---- a client paid (or started paying) an invoice ----
  const s = obj;
  const md = s.metadata || {};
  if (s.mode !== "payment" || md.kind !== "invoice") return { handled: false, reason: "not_invoice" };
  const outcome = sessionOutcome(event.type, s);
  if (!outcome) return { handled: false, reason: "no_outcome" };
  const { companyId, invId, token } = md;
  if (!isSafeId(companyId) || !isSafeId(invId)) return { handled: false, reason: "bad_metadata" };

  const co = await db.get(`companies/${companyId}`);
  if (!co) return { handled: false, reason: "company_not_found" };
  // the money must have gone to THIS company's own Stripe account (metadata alone could be copied by anyone with a Stripe account)
  if (co.data.stripeAccountId !== account) return { handled: false, reason: "account_mismatch", companyId };
  const invPath = `companies/${companyId}/invoices/${invId}`;
  const invDoc = await db.get(invPath);
  if (!invDoc) return { handled: false, reason: "invoice_not_found", companyId };
  const inv = invDoc.data;

  const prev = inv.online || null;
  if (prev && prev.session === s.id && (prev.status === outcome || RANK[prev.status] > RANK[outcome])) return { handled: false, reason: "duplicate", companyId, invId };

  const nowIso = new Date(now).toISOString();
  const cents = Number(s.amount_total) || 0;
  const amount = cents / 100;
  const bank = event.type !== "checkout.session.completed" || outcome === "processing";
  const method = bank ? "Bank (Stripe)" : "Card (Stripe)";
  const online = { status: outcome, amount, at: nowIso, session: String(s.id || "").slice(0, 200), method };
  const update = { online, updatedAt: new Date(now) };
  const alreadyPaid = inv.status === "Paid";
  let markedPaid = false;

  if (outcome === "paid" && !alreadyPaid) {
    if (cents === toCents(inv.amount)) {
      const settings = await db.get(`companies/${companyId}/settings/main`);
      Object.assign(update, { status: "Paid", paidDate: dayIn(now, settings?.data?.timeZone || undefined), paidMethod: method, payClaim: null });
      markedPaid = true;
    } else {
      // the invoice changed after the client opened the payment page: the owner decides (same bar as "the client says they paid")
      update.payClaim = { method, at: nowIso, note: `Paid $${amount.toFixed(2)} online; the invoice is $${(Number(inv.amount) || 0).toFixed(2)}.` };
    }
  } else if (outcome === "paid" && alreadyPaid) {
    online.dup = true; // paid twice (e.g. by Zelle, then by card): the owner may refund it in Stripe
  }
  await db.patch(invPath, update);

  // the public page shows the result at once (the owner's app also republishes it)
  if (isSafeId(token) && inv.pay && inv.pay.token === token) {
    await db.patch(`paylink/${token}`, { online: { status: outcome, at: nowIso, amount, method } }).catch(() => {});
  }

  // the job's stage follows its invoices (same rule as marking it paid in the app)
  if (markedPaid && isSafeId(inv.estId)) {
    const est = await db.get(`companies/${companyId}/estimates/${inv.estId}`);
    if (est) {
      const list = (await db.where(`companies/${companyId}/invoices`, "estId", inv.estId)).map((d) => (d.id === invId ? { ...d.data, id: d.id, ...update } : { ...d.data, id: d.id }));
      if (!list.some((v) => v.id === invId)) list.push({ ...inv, id: invId, ...update });
      const st = statusAfterPayment({ id: inv.estId, status: est.data.status, changeOrders: est.data.changeOrders || [] }, list);
      if (st && st !== est.data.status) {
        await db.patch(`companies/${companyId}/estimates/${inv.estId}`, { status: st, ...(est.data.payClaim ? { payClaim: null } : {}), updatedAt: new Date(now) });
      }
    }
  }
  return { handled: true, companyId, invId, outcome };
}
