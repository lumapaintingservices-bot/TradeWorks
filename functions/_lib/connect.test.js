// Tests for card payments on invoice links (Stripe Connect): event handling, the public checkout and the owner endpoints, with fakes.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accountFields, applyConnectEvent, cardPayOn, dayIn, invoiceCheckoutParams, sessionOutcome } from "./connect.js";
import { _resetKeyCache, _resetTokenCache } from "./jwt.js";
import { hmacSha256Hex } from "./stripeSig.js";
import { idTokenClaims, makeKeyPair, signIdToken } from "./testkeys.js";
import { start } from "../api/connect/start.js";
import { status as connectStatus } from "../api/connect/status.js";
import { payCheckout } from "../api/pay/checkout.js";
import { payWebhook } from "../api/pay/webhook.js";

const PID = "tradeworks-test";
const NOW = Date.UTC(2026, 8, 30, 15, 0, 0);

function fakeDb(docs) {
  const patches = [];
  return {
    projectId: PID, docs, patches,
    async get(path) { return docs[path] ? { id: path.split("/").pop(), data: structuredClone(docs[path]) } : null; },
    async patch(path, data) { if (!docs[path]) throw new Error("missing " + path); patches.push({ path, data }); docs[path] = { ...docs[path], ...data }; },
    async findOne(col, field, value) {
      const e = Object.entries(docs).find(([p, d]) => p.split("/").length === 2 && p.startsWith(col + "/") && d[field] === value);
      return e ? { id: e[0].split("/")[1], data: structuredClone(e[1]) } : null;
    },
    async where(path, field, value) {
      const n = path.split("/").length + 1;
      return Object.entries(docs).filter(([p, d]) => p.startsWith(path + "/") && p.split("/").length === n && d[field] === value)
        .map(([p, d]) => ({ id: p.split("/").pop(), data: structuredClone(d) }));
    },
  };
}
function fakeStripe() {
  const calls = [];
  return {
    calls,
    async createAccount(p, idem) { calls.push(["account", p, idem]); return { id: "acct_new" }; },
    async getAccount(id) { calls.push(["getAccount", id]); return { id, charges_enabled: true, details_submitted: true }; },
    async createAccountLink(p) { calls.push(["link", p]); return { url: "https://connect.stripe.test/setup/x" }; },
    async createAccountCheckoutSession(acct, p) { calls.push(["checkout", acct, p]); return { url: "https://checkout.stripe.test/c1" }; },
  };
}

const TOKEN = "Tok3nTok3nTok3nTok3nAbCd";
const world = (over = {}) => ({
  "companies/c1": { name: "Luma Painting", email: "luma@example.com", stripeAccountId: "acct_1", stripeReady: true, ...over.company },
  "companies/c1/members/owner1": { role: "owner" },
  "companies/c1/members/admin1": { role: "admin" },
  "companies/c1/settings/main": { ...over.settings },
  "companies/c1/estimates/e1": { status: "Accepted", changeOrders: [] },
  "companies/c1/invoices/d1": { estId: "e1", kind: "deposit", number: "INV-1", amount: 500, status: "Unpaid", email: "ana@x.com", pay: { token: TOKEN }, ...over.inv },
  "companies/c1/invoices/b1": { estId: "e1", kind: "balance", number: "INV-2", amount: 500, status: "Unpaid", ...over.bal },
  [`paylink/${TOKEN}`]: { owner: "c1", invId: "d1", data: JSON.stringify({ business: { name: "Luma Painting" }, inv: { titleEn: "Deposit", titleEs: "Depósito" } }), client: {} },
});
const session = (over = {}) => ({ id: "cs_1", mode: "payment", payment_status: "paid", amount_total: 50000, metadata: { kind: "invoice", companyId: "c1", invId: "d1", token: TOKEN }, ...over });
const ev = (type, object, account = "acct_1") => ({ id: "evt_" + type, type, account, created: 1700000000, data: { object } });

describe("helpers", () => {
  it("account fields, switch and outcomes", () => {
    expect(accountFields({ charges_enabled: true, details_submitted: false }, NOW)).toEqual({ stripeReady: true, stripeDetails: false, stripeCheckedAt: new Date(NOW).toISOString() });
    expect(cardPayOn({ stripeAccountId: "acct_1", stripeReady: true }, {})).toBe(true);
    expect(cardPayOn({ stripeAccountId: "acct_1", stripeReady: true }, { cardPay: { on: false } })).toBe(false);
    expect(cardPayOn({ stripeAccountId: "acct_1", stripeReady: false }, {})).toBe(false);
    expect(cardPayOn({ stripeReady: true }, {})).toBe(false);
    expect(sessionOutcome("checkout.session.completed", { payment_status: "unpaid" })).toBe("processing");
    expect(sessionOutcome("checkout.session.completed", { payment_status: "no_payment_required" })).toBeNull();
    expect(sessionOutcome("checkout.session.async_payment_failed", {})).toBe("failed");
    expect(dayIn(Date.UTC(2026, 8, 30, 2, 0, 0))).toBe("2026-09-29"); // 10 pm the day before in New York
  });
  it("checkout params: the invoice amount in cents, client language, ties back to the invoice", () => {
    const p = invoiceCheckoutParams({ token: TOKEN, companyId: "c1", inv: { id: "d1", number: "INV-1", amount: 123.456, email: "ana@x.com" },
      model: { business: { name: "Luma" }, inv: { titleEn: "Deposit", titleEs: "Depósito" } }, origin: "https://app.test", lang: "es" });
    expect(p).toMatchObject({
      mode: "payment", locale: "es", customer_email: "ana@x.com",
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 12346, product_data: { name: "Factura INV-1 — Depósito", description: "Luma" } } }],
      success_url: `https://app.test/pay/${TOKEN}?paid=1`, cancel_url: `https://app.test/pay/${TOKEN}`,
      metadata: { kind: "invoice", companyId: "c1", invId: "d1", token: TOKEN },
    });
    expect(p.payment_intent_data.application_fee_amount).toBeUndefined();
    expect(invoiceCheckoutParams({ token: TOKEN, companyId: "c1", inv: { id: "d1", amount: 100, email: "nope" }, model: null, origin: "o", lang: "en", feePct: 1 }))
      .toMatchObject({ locale: "en", payment_intent_data: { application_fee_amount: 100 } });
  });
});

describe("applyConnectEvent", () => {
  it("a card payment marks the invoice paid, updates the public page and the job stage", async () => {
    const db = fakeDb(world());
    const r = await applyConnectEvent(ev("checkout.session.completed", session()), { db, now: NOW });
    expect(r).toMatchObject({ handled: true, outcome: "paid", invId: "d1" });
    expect(db.docs["companies/c1/invoices/d1"]).toMatchObject({ status: "Paid", paidDate: "2026-09-30", paidMethod: "Card (Stripe)", online: { status: "paid", amount: 500, session: "cs_1" } });
    expect(db.docs[`paylink/${TOKEN}`].online).toMatchObject({ status: "paid", amount: 500 });
    expect(db.docs["companies/c1/estimates/e1"].status).toBe("Deposit Paid");
    // the same event again writes nothing
    const n = db.patches.length;
    expect(await applyConnectEvent(ev("checkout.session.completed", session()), { db, now: NOW })).toMatchObject({ handled: false, reason: "duplicate" });
    expect(db.patches).toHaveLength(n);
  });
  it("paying the last invoice makes the job Paid in Full", async () => {
    const db = fakeDb(world({ bal: { status: "Paid" } }));
    await applyConnectEvent(ev("checkout.session.completed", session()), { db, now: NOW });
    expect(db.docs["companies/c1/estimates/e1"].status).toBe("Paid in Full");
  });
  it("bank transfer: processing first, then paid (and a late 'processing' never undoes it)", async () => {
    const db = fakeDb(world());
    await applyConnectEvent(ev("checkout.session.completed", session({ payment_status: "unpaid" })), { db, now: NOW });
    expect(db.docs["companies/c1/invoices/d1"]).toMatchObject({ status: "Unpaid", online: { status: "processing", method: "Bank (Stripe)" } });
    await applyConnectEvent(ev("checkout.session.async_payment_succeeded", session()), { db, now: NOW });
    expect(db.docs["companies/c1/invoices/d1"]).toMatchObject({ status: "Paid", paidMethod: "Bank (Stripe)", online: { status: "paid" } });
    expect(await applyConnectEvent(ev("checkout.session.completed", session({ payment_status: "unpaid" })), { db, now: NOW })).toMatchObject({ reason: "duplicate" });
  });
  it("a failed bank payment is recorded but the invoice stays unpaid", async () => {
    const db = fakeDb(world());
    await applyConnectEvent(ev("checkout.session.async_payment_failed", session({ payment_status: "unpaid" })), { db, now: NOW });
    expect(db.docs["companies/c1/invoices/d1"]).toMatchObject({ status: "Unpaid", online: { status: "failed" } });
    expect(db.docs["companies/c1/estimates/e1"].status).toBe("Accepted");
  });
  it("a different amount becomes a claim for the owner to confirm; paying an already-paid invoice is flagged", async () => {
    const db = fakeDb(world({ inv: { amount: 600 } }));
    await applyConnectEvent(ev("checkout.session.completed", session()), { db, now: NOW });
    expect(db.docs["companies/c1/invoices/d1"]).toMatchObject({ status: "Unpaid", payClaim: { method: "Card (Stripe)" } });
    expect(db.docs["companies/c1/invoices/d1"].payClaim.note).toContain("$500.00");
    const db2 = fakeDb(world({ inv: { status: "Paid", paidDate: "2026-09-01", paidMethod: "Zelle" } }));
    await applyConnectEvent(ev("checkout.session.completed", session()), { db: db2, now: NOW });
    expect(db2.docs["companies/c1/invoices/d1"]).toMatchObject({ status: "Paid", paidDate: "2026-09-01", paidMethod: "Zelle", online: { dup: true } });
  });
  it("money that went to another Stripe account, bad metadata and other checkouts change nothing", async () => {
    const db = fakeDb(world());
    expect(await applyConnectEvent(ev("checkout.session.completed", session(), "acct_evil"), { db, now: NOW })).toMatchObject({ reason: "account_mismatch" });
    expect(await applyConnectEvent(ev("checkout.session.completed", session({ metadata: { kind: "invoice", companyId: "../x", invId: "d1" } })), { db })).toMatchObject({ reason: "bad_metadata" });
    expect(await applyConnectEvent(ev("checkout.session.completed", session({ metadata: {} })), { db })).toMatchObject({ reason: "not_invoice" });
    expect(await applyConnectEvent(ev("checkout.session.completed", session({ mode: "subscription" })), { db })).toMatchObject({ reason: "not_invoice" });
    expect(await applyConnectEvent(ev("checkout.session.completed", session({ metadata: { kind: "invoice", companyId: "c1", invId: "zz" } })), { db })).toMatchObject({ reason: "invoice_not_found" });
    expect(await applyConnectEvent(ev("charge.succeeded", {}), { db })).toMatchObject({ reason: "ignored_type" });
    expect(db.patches).toHaveLength(0);
  });
  it("account updates keep the company's ready flag in step", async () => {
    const db = fakeDb(world({ company: { stripeReady: false } }));
    await applyConnectEvent(ev("account.updated", { id: "acct_1", charges_enabled: true, details_submitted: true }), { db, now: NOW });
    expect(db.docs["companies/c1"]).toMatchObject({ stripeReady: true, stripeDetails: true });
    await applyConnectEvent(ev("account.application.deauthorized", { id: "ca_x" }), { db, now: NOW });
    expect(db.docs["companies/c1"].stripeReady).toBe(false);
    expect(await applyConnectEvent(ev("account.updated", { id: "acct_zz" }, "acct_zz"), { db })).toMatchObject({ reason: "company_not_found" });
  });
});

describe("HTTP handlers", () => {
  let pair, saJson;
  beforeAll(async () => { pair = await makeKeyPair(); saJson = JSON.stringify({ client_email: "s@x", private_key: pair.pem, project_id: PID }); });
  beforeEach(() => { _resetKeyCache(); _resetTokenCache(); });
  const env = () => ({ FIREBASE_SERVICE_ACCOUNT: saJson, STRIPE_SECRET_KEY: "sk_test_1", STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_c", APP_URL: "https://app.example.com" });
  const ownerReq = async (uid, body) => new Request("https://app.example.com/api/connect/start", {
    method: "POST", headers: { Authorization: "Bearer " + await signIdToken(pair, idTokenClaims(PID, uid, Date.now())), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const pubReq = (body) => new Request("https://app.example.com/api/pay/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const code = (p) => p.then((r) => r.status, (e) => e.status);

  it("start: creates the Stripe account once, saves it, returns the setup page; only the owner", async () => {
    const d = world(); delete d["companies/c1"].stripeAccountId;
    const db = fakeDb(d), stripe = fakeStripe();
    const res = await start({ request: await ownerReq("owner1", { companyId: "c1" }), env: env() }, { db, stripe, keys: [pair.jwk] });
    expect(await res.json()).toEqual({ url: "https://connect.stripe.test/setup/x" });
    expect(stripe.calls[0]).toEqual(["account", { type: "standard", email: "owner1@example.com", business_profile: { name: "Luma Painting" }, metadata: { companyId: "c1", ownerUid: "owner1" } }, "tw-acct-c1"]);
    expect(db.docs["companies/c1"]).toMatchObject({ stripeAccountId: "acct_new", stripeReady: false });
    expect(stripe.calls[1][1]).toEqual({ account: "acct_new", type: "account_onboarding", refresh_url: "https://app.example.com/settings?section=client&stripe=refresh", return_url: "https://app.example.com/settings?section=client&stripe=return" });
    const stripe2 = fakeStripe();
    await start({ request: await ownerReq("owner1", { companyId: "c1" }), env: env() }, { db, stripe: stripe2, keys: [pair.jwk] });
    expect(stripe2.calls.map((c) => c[0])).toEqual(["getAccount", "link"]);
    // a saved account Stripe no longer knows (test account, live keys) is replaced by a new one
    const stripe3 = fakeStripe();
    stripe3.getAccount = async () => { throw new Error("Stripe GET /v1/accounts/acct_new: 404 No such account: acct_new"); };
    await start({ request: await ownerReq("owner1", { companyId: "c1" }), env: env() }, { db, stripe: stripe3, keys: [pair.jwk] });
    expect(stripe3.calls.map((c) => c[0])).toEqual(["account", "link"]);
    expect(stripe3.calls[0][2]).toBe("tw-acct-c1-acct_new");
    // any other Stripe error is a real failure (no new account)
    const stripe4 = fakeStripe();
    stripe4.getAccount = async () => { throw new Error("Stripe GET /v1/accounts/acct_new: 500 "); };
    await expect(start({ request: await ownerReq("owner1", { companyId: "c1" }), env: env() }, { db, stripe: stripe4, keys: [pair.jwk] })).rejects.toThrow("500");
    expect(stripe4.calls).toHaveLength(0);
    expect(await code(start({ request: await ownerReq("admin1", { companyId: "c1" }), env: env() }, { db, stripe: fakeStripe(), keys: [pair.jwk] }))).toBe(403);
  });
  it("status: asks Stripe and saves the answer", async () => {
    const db = fakeDb(world({ company: { stripeReady: false } }));
    const res = await connectStatus({ request: await ownerReq("owner1", { companyId: "c1" }), env: env() }, { db, stripe: fakeStripe(), keys: [pair.jwk] });
    expect(await res.json()).toEqual({ connected: true, ready: true, details: true });
    expect(db.docs["companies/c1"].stripeReady).toBe(true);
  });

  it("pay checkout: builds the session on the contractor's account from the server's own invoice", async () => {
    const db = fakeDb(world()), stripe = fakeStripe();
    const res = await payCheckout({ request: pubReq({ token: TOKEN, lang: "es", amount: 1 }), env: env() }, { db, stripe });
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/c1" });
    const [, acct, p] = stripe.calls[0];
    expect(acct).toBe("acct_1");
    expect(p.line_items[0].price_data.unit_amount).toBe(50000); // the invoice amount, not the one the browser sent
    expect(p.locale).toBe("es");
  });
  it("pay checkout: refused when off, not connected, paid, on its way, or the link is wrong", async () => {
    const tries = [
      [world({ settings: { cardPay: { on: false } } }), 409],
      [world({ company: { stripeReady: false } }), 409],
      [world({ inv: { status: "Paid" } }), 409],
      [world({ inv: { online: { status: "processing" } } }), 409],
      [world({ inv: { pay: { token: "other" } } }), 404],
      [world({ inv: { amount: 0.2 } }), 400],
    ];
    for (const [d, want] of tries) {
      const stripe = fakeStripe();
      expect(await code(payCheckout({ request: pubReq({ token: TOKEN }), env: env() }, { db: fakeDb(d), stripe }))).toBe(want);
      expect(stripe.calls).toHaveLength(0);
    }
    expect(await code(payCheckout({ request: pubReq({ token: "nope/../x" }), env: env() }, { db: fakeDb(world()), stripe: fakeStripe() }))).toBe(400);
    expect(await code(payCheckout({ request: pubReq({ token: "AAAAAAAAAAAAAAAAAAAAAAAA" }), env: env() }, { db: fakeDb(world()), stripe: fakeStripe() }))).toBe(404);
    // an account Stripe no longer knows: 409 and the button goes away
    const dbGone = fakeDb(world()), stripeGone = fakeStripe();
    stripeGone.createAccountCheckoutSession = async () => { throw new Error("Stripe POST /v1/checkout/sessions: 403 The provided key does not have access to account"); };
    expect(await code(payCheckout({ request: pubReq({ token: TOKEN }), env: env() }, { db: dbGone, stripe: stripeGone }))).toBe(409);
    expect(dbGone.docs["companies/c1"].stripeReady).toBe(false);
    const e = env(); delete e.STRIPE_SECRET_KEY;
    expect(await code(payCheckout({ request: pubReq({ token: TOKEN }), env: e }, { db: fakeDb(world()), stripe: fakeStripe() }))).toBe(503);
  });

  async function signed(event, secret = "whsec_c") {
    const raw = JSON.stringify(event), t = Math.floor(Date.now() / 1000);
    return new Request("https://app.example.com/api/pay/webhook", { method: "POST", headers: { "Stripe-Signature": `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${raw}`)}` }, body: raw });
  }
  it("pay webhook: signed events mark the invoice paid; bad signatures change nothing; missing setup -> 503", async () => {
    const db = fakeDb(world());
    const res = await payWebhook({ request: await signed(ev("checkout.session.completed", session())), env: env() }, { db });
    expect(res.status).toBe(200);
    expect(db.docs["companies/c1/invoices/d1"].status).toBe("Paid");
    const db2 = fakeDb(world());
    expect((await payWebhook({ request: await signed(ev("checkout.session.completed", session()), "whsec_wrong"), env: env() }, { db: db2 })).status).toBe(400);
    expect(db2.patches).toHaveLength(0);
    const e = env(); delete e.STRIPE_CONNECT_WEBHOOK_SECRET;
    expect((await payWebhook({ request: await signed(ev("checkout.session.completed", session())), env: e }, { db: db2 })).status).toBe(503);
  });
});
