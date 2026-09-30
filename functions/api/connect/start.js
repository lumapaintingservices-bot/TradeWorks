// POST /api/connect/start  { companyId }  ->  { url }  (Stripe's page to connect / finish setting up the company's Stripe account)
// Auth: Authorization: Bearer <Firebase ID token>. Only the company's owner may call it.
import { appOrigin, requireEnv, requireOwner } from "../../_lib/auth.js";
import { isGone } from "../../_lib/connect.js";
import { stripeClient } from "../../_lib/stripe.js";
import { handle, json, methodNotAllowed, onOptions } from "../../_lib/util.js";

export async function start({ request, env }, deps = {}) {
  requireEnv(env, ["STRIPE_SECRET_KEY"]);
  const { uid, email, companyId, company, db } = await requireOwner(request, env, deps);
  const stripe = deps.stripe || stripeClient(env.STRIPE_SECRET_KEY, deps.stripeFetch);

  // One Stripe account per company, created once (the idempotency key stops a double tap from making two).
  // A saved account Stripe no longer knows (a test-mode account after switching to live keys) is replaced.
  let account = company.stripeAccountId;
  if (account && !(await stripe.getAccount(account).catch((e) => (isGone(e) ? null : Promise.reject(e))))) account = "";
  if (!account) {
    const acct = await stripe.createAccount({
      type: "standard",
      email: email || company.email || undefined,
      business_profile: { name: company.name || undefined },
      metadata: { companyId, ownerUid: uid },
    }, "tw-acct-" + companyId + (company.stripeAccountId ? "-" + company.stripeAccountId : ""));
    account = acct.id;
    await db.patch(`companies/${companyId}`, { stripeAccountId: account, stripeReady: false, stripeDetails: false });
  }

  const origin = appOrigin(request, env);
  const link = await stripe.createAccountLink({
    account,
    type: "account_onboarding",
    refresh_url: `${origin}/settings?section=client&stripe=refresh`,
    return_url: `${origin}/settings?section=client&stripe=return`,
  });
  return json({ url: link.url });
}

export const onRequestPost = handle((ctx) => start(ctx));
export const onRequestOptions = onOptions;
export const onRequest = () => methodNotAllowed();
