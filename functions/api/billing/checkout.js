// POST /api/billing/checkout  { companyId }  ->  { url }  (Stripe Checkout page for the TradeWorks subscription)
// Auth: Authorization: Bearer <Firebase ID token>. Only the company's owner may call it.
import { appOrigin, requireEnv, requireOwner } from "../../_lib/auth.js";
import { stripeClient } from "../../_lib/stripe.js";
import { handle, json, methodNotAllowed, onOptions, toMs } from "../../_lib/util.js";

const DAY = 86400000;

export async function checkout({ request, env }, deps = {}) {
  requireEnv(env, ["STRIPE_SECRET_KEY", "STRIPE_PRICE_ID"]);
  const { uid, email, companyId, company, db } = await requireOwner(request, env, deps);
  const stripe = deps.stripe || stripeClient(env.STRIPE_SECRET_KEY, deps.stripeFetch);

  // Reuse the Stripe customer if this company already has one.
  let customerId = company.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.createCustomer({
      name: company.name || undefined,
      email: email || company.email || undefined,
      metadata: { companyId, ownerUid: uid },
    }, "tw-customer-" + companyId);
    customerId = customer.id;
    await db.patch(`companies/${companyId}`, { stripeCustomerId: customerId });
  }

  // If the free trial is still running (and Stripe accepts the date: 48h+ ahead), do not charge until it ends.
  const trialEnd = toMs(company.trialEndsAt);
  const trialParams = trialEnd && trialEnd > Date.now() + 2 * DAY + 3600000 && company.subscriptionStatus !== "canceled"
    ? { trial_end: Math.floor(trialEnd / 1000) } : {};

  const origin = appOrigin(request, env);
  const session = await stripe.createCheckoutSession({
    mode: "subscription",
    customer: customerId,
    client_reference_id: companyId,
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    allow_promotion_codes: "true",
    success_url: `${origin}/settings?section=billing&checkout=success`,
    cancel_url: `${origin}/settings?section=billing&checkout=cancel`,
    subscription_data: { metadata: { companyId }, ...trialParams },
    metadata: { companyId },
  });
  return json({ url: session.url });
}

export const onRequestPost = handle((ctx) => checkout(ctx));
export const onRequestOptions = onOptions;
export const onRequest = () => methodNotAllowed();
