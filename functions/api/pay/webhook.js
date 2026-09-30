// POST /api/pay/webhook  <- called by Stripe for events on CONNECTED accounts (a client paid an invoice by card or bank,
// a contractor finished connecting). Verifies the signature, then marks the invoice paid (see _lib/connect.js).
import { applyConnectEvent } from "../../_lib/connect.js";
import { firestore } from "../../_lib/firestore.js";
import { verifyStripeSignature } from "../../_lib/stripeSig.js";
import { json } from "../../_lib/util.js";

export async function payWebhook({ request, env }, deps = {}) {
  if (!env.STRIPE_CONNECT_WEBHOOK_SECRET || !env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("Stripe Connect webhook called but STRIPE_CONNECT_WEBHOOK_SECRET / FIREBASE_SERVICE_ACCOUNT are missing");
    return json({ error: "Card payments aren't set up yet." }, 503);
  }
  const raw = await request.text(); // the signature covers the exact raw text
  const sig = await verifyStripeSignature(raw, request.headers.get("Stripe-Signature"), env.STRIPE_CONNECT_WEBHOOK_SECRET, { now: deps.now });
  if (!sig.ok) return json({ error: "Invalid signature" }, 400);

  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }

  try {
    const result = await applyConnectEvent(event, { db: deps.db || firestore(env), now: deps.now });
    return json({ received: true, handled: result.handled, reason: result.reason });
  } catch (e) {
    console.error("stripe connect webhook failed:", event && event.id, e && e.stack ? e.stack : e);
    return json({ error: "Processing failed" }, 500); // Stripe retries automatically
  }
}

export const onRequestPost = (ctx) => payWebhook(ctx);
export const onRequest = () => json({ error: "Method not allowed" }, 405, { Allow: "POST" });
