// Turns Stripe webhook events into updates on companies/{companyId}. Pure logic over injected `db` and `stripe`
// objects, so it is unit-tested with fakes. Only ever touches the billing fields of the company document.
import { periodEndIso } from "./stripe.js";
import { isSafeId } from "./util.js";

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
];

// Subscription states we never write (an abandoned first payment must not lock a company that is still in its trial).
const IGNORED_STATUSES = ["incomplete", "incomplete_expired"];

async function findCompany(db, { companyId, customerId }) {
  if (isSafeId(companyId)) {
    const c = await db.get(`companies/${companyId}`);
    if (c) return { id: companyId, data: c.data };
  }
  if (customerId) {
    const c = await db.findOne("companies", "stripeCustomerId", customerId);
    if (c) return { id: c.id, data: c.data };
  }
  return null;
}

/**
 * @returns {Promise<{handled: boolean, reason?: string, companyId?: string, update?: object}>}
 * Throws only for real failures (Stripe/Firestore errors) so the webhook answers 5xx and Stripe retries.
 */
export async function applyStripeEvent(event, { db, stripe, now = Date.now() }) {
  if (!HANDLED_EVENTS.includes(event.type)) return { handled: false, reason: "ignored_type" };
  const obj = event.data && event.data.object;
  if (!obj) return { handled: false, reason: "no_object" };
  const nowIso = new Date(now).toISOString();

  let status; let subId = null; let periodEnd = null; let customerId = obj.customer || null; let metaCompany = null;
  const type = event.type;

  if (type === "checkout.session.completed") {
    if (obj.mode !== "subscription") return { handled: false, reason: "not_subscription" };
    metaCompany = obj.client_reference_id || (obj.metadata && obj.metadata.companyId);
    subId = obj.subscription || null;
    const sub = subId ? await stripe.getSubscription(subId) : null;
    status = sub ? sub.status : "active";
    periodEnd = sub ? periodEndIso(sub) : null;
  } else if (type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
    metaCompany = obj.metadata && obj.metadata.companyId;
    subId = obj.id;
    status = type === "customer.subscription.deleted" ? "canceled" : obj.status;
    periodEnd = periodEndIso(obj);
  } else { // invoice.payment_failed
    status = "past_due";
  }
  if (IGNORED_STATUSES.includes(status)) return { handled: false, reason: "incomplete_subscription" };

  const found = await findCompany(db, { companyId: metaCompany, customerId });
  if (!found) return { handled: false, reason: "company_not_found" };
  const { id: companyId, data: co } = found;

  // The company must belong to this Stripe customer (guards against mixed-up metadata).
  if (co.stripeCustomerId && customerId && co.stripeCustomerId !== customerId) return { handled: false, reason: "customer_mismatch", companyId };
  // Out-of-order delivery: skip events older than the last one applied.
  if (typeof co.stripeEventAt === "number" && typeof event.created === "number" && event.created < co.stripeEventAt) return { handled: false, reason: "stale_event", companyId };
  if (type === "invoice.payment_failed") {
    // only for companies that really have a subscription
    if (!co.stripeSubscriptionId) return { handled: false, reason: "no_subscription", companyId };
  } else if (type !== "checkout.session.completed" && co.stripeSubscriptionId && co.stripeSubscriptionId !== subId) {
    // an old subscription changing after the company already moved to a new one
    return { handled: false, reason: "other_subscription", companyId };
  }

  const update = { subscriptionStatus: status, updatedAt: new Date(now) };
  if (type !== "invoice.payment_failed") { update.plan = "pro"; update.stripeSubscriptionId = subId; }
  if (customerId) update.stripeCustomerId = customerId;
  if (periodEnd) update.currentPeriodEnd = periodEnd;
  if (status === "past_due") update.pastDueSince = co.pastDueSince || nowIso;
  else if (status === "active" || status === "trialing") update.pastDueSince = null;
  if (typeof event.created === "number") update.stripeEventAt = event.created;

  await db.patch(`companies/${companyId}`, update);
  return { handled: true, companyId, update };
}
