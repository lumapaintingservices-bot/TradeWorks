// POST /api/pay/checkout  { token, lang }  ->  { url }  (Stripe Checkout page to pay one invoice by card or bank)
// Public: called from the invoice payment link (/pay/:token) by the client, who is not signed in. Everything that matters
// (who gets the money, how much) is read here with the service account; the browser only sends the link's secret token.
import { appOrigin, requireEnv } from "../../_lib/auth.js";
import { cardPayOn, invoiceCheckoutParams, isGone, MIN_CENTS, payModelOf, toCents } from "../../_lib/connect.js";
import { firestore } from "../../_lib/firestore.js";
import { stripeClient } from "../../_lib/stripe.js";
import { HttpError, handle, isSafeId, json, methodNotAllowed, onOptions } from "../../_lib/util.js";

export async function payCheckout({ request, env }, deps = {}) {
  requireEnv(env, ["STRIPE_SECRET_KEY", "FIREBASE_SERVICE_ACCOUNT"]);
  let body;
  try { body = await request.json(); } catch { throw new HttpError(400, "Invalid request"); }
  const token = body && body.token;
  if (!isSafeId(token)) throw new HttpError(400, "Invalid link");
  const db = deps.db || firestore(env);

  const pl = await db.get(`paylink/${token}`);
  const cid = pl && pl.data.owner, invId = pl && pl.data.invId;
  if (!pl || !isSafeId(cid) || !isSafeId(invId)) throw new HttpError(404, "This link isn't active.");
  const [co, inv, st] = await Promise.all([db.get(`companies/${cid}`), db.get(`companies/${cid}/invoices/${invId}`), db.get(`companies/${cid}/settings/main`)]);
  if (!co || !cardPayOn(co.data, st && st.data)) throw new HttpError(409, "Card payment isn't available for this invoice.");
  if (!inv || !inv.data.pay || inv.data.pay.token !== token) throw new HttpError(404, "This link isn't active.");
  if (inv.data.status === "Paid") throw new HttpError(409, "This invoice is already paid.");
  if (inv.data.online && inv.data.online.status === "processing") throw new HttpError(409, "A bank payment for this invoice is already on its way.");
  if (toCents(inv.data.amount) < MIN_CENTS) throw new HttpError(400, "This invoice can't be paid online.");

  const stripe = deps.stripe || stripeClient(env.STRIPE_SECRET_KEY, deps.stripeFetch);
  const params = invoiceCheckoutParams({
    token, companyId: cid, inv: { ...inv.data, id: invId }, model: payModelOf(pl.data),
    origin: appOrigin(request, env), lang: body.lang === "es" ? "es" : "en", feePct: Number(env.STRIPE_APP_FEE_PCT) || 0,
  });
  const session = await stripe.createAccountCheckoutSession(co.data.stripeAccountId, params).catch(async (e) => {
    if (!isGone(e)) throw e;
    // the saved account no longer works with these keys: hide the button until the owner connects again
    await db.patch(`companies/${cid}`, { stripeReady: false });
    throw new HttpError(409, "Card payment isn't available for this invoice.");
  });
  return json({ url: session.url });
}

export const onRequestPost = handle((ctx) => payCheckout(ctx));
export const onRequestOptions = onOptions;
export const onRequest = () => methodNotAllowed();
