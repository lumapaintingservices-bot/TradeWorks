// POST /api/billing/portal  { companyId }  ->  { url }  (Stripe Billing Portal: card, invoices, cancel)
import { appOrigin, requireEnv, requireOwner } from "../../_lib/auth.js";
import { stripeClient } from "../../_lib/stripe.js";
import { HttpError, handle, json, methodNotAllowed, onOptions } from "../../_lib/util.js";

export async function portal({ request, env }, deps = {}) {
  requireEnv(env, ["STRIPE_SECRET_KEY"]);
  const { company } = await requireOwner(request, env, deps);
  if (!company.stripeCustomerId) throw new HttpError(400, "There is no subscription to manage yet. Tap Subscribe first.");
  const stripe = deps.stripe || stripeClient(env.STRIPE_SECRET_KEY, deps.stripeFetch);
  const session = await stripe.createPortalSession({
    customer: company.stripeCustomerId,
    return_url: `${appOrigin(request, env)}/settings?section=billing`,
  });
  return json({ url: session.url });
}

export const onRequestPost = handle((ctx) => portal(ctx));
export const onRequestOptions = onOptions;
export const onRequest = () => methodNotAllowed();
