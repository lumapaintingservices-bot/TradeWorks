// POST /api/connect/status  { companyId }  ->  { connected, ready, details }  (asks Stripe and saves the answer on the company)
// Auth: Authorization: Bearer <Firebase ID token>. Only the company's owner may call it.
import { requireEnv, requireOwner } from "../../_lib/auth.js";
import { accountFields, isGone } from "../../_lib/connect.js";
import { stripeClient } from "../../_lib/stripe.js";
import { handle, json, methodNotAllowed, onOptions } from "../../_lib/util.js";

export async function status({ request, env }, deps = {}) {
  requireEnv(env, ["STRIPE_SECRET_KEY"]);
  const { companyId, company, db } = await requireOwner(request, env, deps);
  if (!company.stripeAccountId) return json({ connected: false, ready: false, details: false });
  const stripe = deps.stripe || stripeClient(env.STRIPE_SECRET_KEY, deps.stripeFetch);
  // an account Stripe no longer knows (test account, live keys) counts as "not finished": "Finish on Stripe" replaces it
  const acct = await stripe.getAccount(company.stripeAccountId).catch((e) => (isGone(e) ? {} : Promise.reject(e)));
  const fields = accountFields(acct, deps.now);
  await db.patch(`companies/${companyId}`, fields);
  return json({ connected: true, ready: fields.stripeReady, details: fields.stripeDetails });
}

export const onRequestPost = handle((ctx) => status(ctx));
export const onRequestOptions = onOptions;
export const onRequest = () => methodNotAllowed();
