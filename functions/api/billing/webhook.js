// POST /api/billing/webhook  <- called by Stripe (not by the browser). Verifies the signature, then updates the company.
import { applyStripeEvent } from "../../_lib/billingEvents.js";
import { firestore } from "../../_lib/firestore.js";
import { stripeClient } from "../../_lib/stripe.js";
import { verifyStripeSignature } from "../../_lib/stripeSig.js";
import { json } from "../../_lib/util.js";

export async function webhook({ request, env }, deps = {}) {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY || !env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("Stripe webhook called but billing env vars are missing");
    return json({ error: "Billing isn't set up yet." }, 503);
  }
  const raw = await request.text(); // the signature covers the exact raw text
  const sig = await verifyStripeSignature(raw, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET, { now: deps.now });
  if (!sig.ok) return json({ error: "Invalid signature" }, 400);

  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }

  try {
    const result = await applyStripeEvent(event, {
      db: deps.db || firestore(env),
      stripe: deps.stripe || stripeClient(env.STRIPE_SECRET_KEY, deps.stripeFetch),
      now: deps.now,
    });
    return json({ received: true, handled: result.handled, reason: result.reason });
  } catch (e) {
    console.error("stripe webhook processing failed:", event && event.id, e && e.stack ? e.stack : e);
    return json({ error: "Processing failed" }, 500); // Stripe retries automatically
  }
}

export const onRequestPost = (ctx) => webhook(ctx);
export const onRequest = () => json({ error: "Method not allowed" }, 405, { Allow: "POST" });
