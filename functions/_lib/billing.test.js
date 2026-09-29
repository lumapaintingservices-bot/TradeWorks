// Tests for the Firestore REST helper, the Stripe event handler and the three HTTP handlers, all with fakes (no network).
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyStripeEvent } from "./billingEvents.js";
import { firestore, fromFsFields, toFsFields, toFsValue } from "./firestore.js";
import { _resetKeyCache, _resetTokenCache } from "./jwt.js";
import { formEncode, periodEndIso } from "./stripe.js";
import { hmacSha256Hex } from "./stripeSig.js";
import { idTokenClaims, makeKeyPair, signIdToken } from "./testkeys.js";
import { checkout } from "../api/billing/checkout.js";
import { portal } from "../api/billing/portal.js";
import { webhook } from "../api/billing/webhook.js";

const PID = "tradeworks-test";
const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);
const iso = (s) => new Date(s * 1000).toISOString();

/** In-memory stand-in for the firestore() client. */
function fakeDb(docs) {
  const patches = [];
  return {
    projectId: PID, docs, patches,
    async get(path) { return docs[path] ? { id: path.split("/").pop(), data: structuredClone(docs[path]) } : null; },
    async patch(path, data) { patches.push({ path, data }); docs[path] = { ...docs[path], ...data }; },
    async findOne(col, field, value) {
      const e = Object.entries(docs).find(([p, d]) => p.split("/").length === 2 && p.startsWith(col + "/") && d[field] === value);
      return e ? { id: e[0].split("/")[1], data: structuredClone(e[1]) } : null;
    },
  };
}
function fakeStripe(over = {}) {
  const calls = [];
  return {
    calls,
    async createCustomer(p, idem) { calls.push(["customer", p, idem]); return { id: "cus_new" }; },
    async createCheckoutSession(p) { calls.push(["checkout", p]); return { url: "https://checkout.stripe.test/s1" }; },
    async createPortalSession(p) { calls.push(["portal", p]); return { url: "https://billing.stripe.test/p1" }; },
    async getSubscription(id) { calls.push(["getSub", id]); return { id, status: "active", current_period_end: 1800000000 }; },
    ...over,
  };
}

describe("firestore value conversion", () => {
  it("round-trips every supported type", () => {
    const obj = { s: "x", i: 5, d: 1.5, b: true, n: null, a: [1, "two"], m: { k: "v" } };
    expect(fromFsFields(toFsFields(obj))).toEqual(obj);
    expect(toFsValue(new Date("2026-01-02T03:04:05.000Z"))).toEqual({ timestampValue: "2026-01-02T03:04:05.000Z" });
    expect(toFsValue(7)).toEqual({ integerValue: "7" });
    expect(toFsValue(undefined)).toEqual({ nullValue: null });
  });
});

describe("firestore REST client", () => {
  const sa = async () => JSON.stringify({ client_email: "s@x", private_key: (await makeKeyPair()).pem, project_id: PID });
  beforeEach(() => _resetTokenCache());

  it("uses the service account token, updateMask + must-exist on patch, and structured query for findOne", async () => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("oauth2")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
      if (String(url).endsWith(":runQuery")) return new Response(JSON.stringify([{ document: { name: `projects/${PID}/databases/(default)/documents/companies/c9`, fields: { plan: { stringValue: "pro" } } } }]));
      if (init.method === "PATCH") return new Response("{}");
      return new Response(JSON.stringify({ name: "projects/p/databases/(default)/documents/companies/c1", fields: { name: { stringValue: "Luma" } } }));
    };
    const db = firestore({ FIREBASE_SERVICE_ACCOUNT: await sa() }, { fetchImpl, now: () => NOW });
    expect(db.projectId).toBe(PID);
    expect(await db.get("companies/c1")).toEqual({ id: "c1", data: { name: "Luma" } });
    await db.patch("companies/c1", { plan: "pro", pastDueSince: null });
    const patch = calls.find((c) => c.init.method === "PATCH");
    expect(patch.url).toContain("/documents/companies/c1?updateMask.fieldPaths=plan&updateMask.fieldPaths=pastDueSince&currentDocument.exists=true");
    expect(patch.init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(patch.init.body)).toEqual({ fields: { plan: { stringValue: "pro" }, pastDueSince: { nullValue: null } } });
    expect(await db.findOne("companies", "stripeCustomerId", "cus_1")).toEqual({ id: "c9", data: { plan: "pro" } });
    const q = JSON.parse(calls.find((c) => c.url.endsWith(":runQuery")).init.body);
    expect(q.structuredQuery.where.fieldFilter).toEqual({ field: { fieldPath: "stripeCustomerId" }, op: "EQUAL", value: { stringValue: "cus_1" } });
  });

  it("get returns null on 404 and throws on other errors", async () => {
    const pem = (await makeKeyPair()).pem;
    const mk2 = (status) => firestore({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: "s@x", private_key: pem, project_id: PID }) }, {
      fetchImpl: async (url) => (String(url).includes("oauth2") ? new Response(JSON.stringify({ access_token: "t" })) : new Response("nope", { status })), now: () => NOW,
    });
    expect(await mk2(404).get("companies/zz")).toBeNull();
    await expect(mk2(403).get("companies/zz")).rejects.toThrow(/403/);
  });
});

describe("stripe helpers", () => {
  it("formEncode handles nesting and arrays like Stripe expects", () => {
    expect(formEncode({ mode: "subscription", line_items: [{ price: "price_1", quantity: 1 }], subscription_data: { metadata: { companyId: "c 1" } }, skip: undefined })
      .map(decodeURIComponent).sort()).toEqual(["line_items[0][price]=price_1", "line_items[0][quantity]=1", "mode=subscription", "subscription_data[metadata][companyId]=c 1"].sort());
  });
  it("periodEndIso supports old and new API shapes", () => {
    expect(periodEndIso({ current_period_end: 1800000000 })).toBe(iso(1800000000));
    expect(periodEndIso({ items: { data: [{ current_period_end: 1800000000 }] } })).toBe(iso(1800000000));
    expect(periodEndIso({})).toBeNull();
  });
});

describe("applyStripeEvent", () => {
  const co = (over = {}) => ({ "companies/c1": { name: "Luma", plan: "trial", ...over } });
  const ev = (type, object, created = 1700000000) => ({ id: "evt_1", type, created, data: { object } });

  it("checkout.session.completed -> pro/active with period end and Stripe ids", async () => {
    const db = fakeDb(co()); const stripe = fakeStripe();
    const r = await applyStripeEvent(ev("checkout.session.completed", { mode: "subscription", client_reference_id: "c1", customer: "cus_1", subscription: "sub_1" }), { db, stripe, now: NOW });
    expect(r.handled).toBe(true);
    expect(db.docs["companies/c1"]).toMatchObject({ plan: "pro", subscriptionStatus: "active", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", currentPeriodEnd: iso(1800000000), pastDueSince: null, stripeEventAt: 1700000000 });
    expect(stripe.calls[0]).toEqual(["getSub", "sub_1"]);
  });
  it("ignores checkout sessions that are not subscriptions", async () => {
    const r = await applyStripeEvent(ev("checkout.session.completed", { mode: "payment", client_reference_id: "c1" }), { db: fakeDb(co()), stripe: fakeStripe() });
    expect(r).toMatchObject({ handled: false, reason: "not_subscription" });
  });
  it("subscription.updated past_due starts the grace clock once, active clears it", async () => {
    const db = fakeDb(co({ plan: "pro", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" }));
    const sub = (status) => ({ id: "sub_1", customer: "cus_1", status, metadata: { companyId: "c1" }, items: { data: [{ current_period_end: 1800000000 }] } });
    await applyStripeEvent(ev("customer.subscription.updated", sub("past_due"), 10), { db, stripe: fakeStripe(), now: NOW });
    expect(db.docs["companies/c1"]).toMatchObject({ subscriptionStatus: "past_due", pastDueSince: new Date(NOW).toISOString() });
    await applyStripeEvent(ev("customer.subscription.updated", sub("past_due"), 11), { db, stripe: fakeStripe(), now: NOW + 86400000 });
    expect(db.docs["companies/c1"].pastDueSince).toBe(new Date(NOW).toISOString()); // unchanged
    await applyStripeEvent(ev("customer.subscription.updated", sub("active"), 12), { db, stripe: fakeStripe(), now: NOW + 2 * 86400000 });
    expect(db.docs["companies/c1"]).toMatchObject({ subscriptionStatus: "active", pastDueSince: null });
  });
  it("subscription.deleted -> canceled; company found through the Stripe customer when metadata is missing", async () => {
    const db = fakeDb(co({ plan: "pro", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" }));
    const r = await applyStripeEvent(ev("customer.subscription.deleted", { id: "sub_1", customer: "cus_1", status: "canceled" }), { db, stripe: fakeStripe(), now: NOW });
    expect(r).toMatchObject({ handled: true, companyId: "c1" });
    expect(db.docs["companies/c1"]).toMatchObject({ subscriptionStatus: "canceled", plan: "pro" });
  });
  it("invoice.payment_failed -> past_due (only for companies with a subscription)", async () => {
    const db = fakeDb(co({ plan: "pro", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", subscriptionStatus: "active" }));
    const r = await applyStripeEvent(ev("invoice.payment_failed", { customer: "cus_1" }), { db, stripe: fakeStripe(), now: NOW });
    expect(r.handled).toBe(true);
    expect(db.docs["companies/c1"]).toMatchObject({ subscriptionStatus: "past_due", pastDueSince: new Date(NOW).toISOString(), plan: "pro" });
    const db2 = fakeDb(co({ stripeCustomerId: "cus_1" }));
    expect(await applyStripeEvent(ev("invoice.payment_failed", { customer: "cus_1" }), { db: db2, stripe: fakeStripe() })).toMatchObject({ handled: false, reason: "no_subscription" });
    expect(db2.patches).toHaveLength(0);
  });
  it("never writes incomplete subscriptions (an abandoned first payment must not lock the trial)", async () => {
    const db = fakeDb(co({ stripeCustomerId: "cus_1" }));
    for (const status of ["incomplete", "incomplete_expired"]) {
      const r = await applyStripeEvent(ev("customer.subscription.updated", { id: "sub_9", customer: "cus_1", status, metadata: { companyId: "c1" } }), { db, stripe: fakeStripe() });
      expect(r.handled).toBe(false);
    }
    expect(db.patches).toHaveLength(0);
  });
  it("skips stale (out-of-order) events, other customers' events and old subscriptions", async () => {
    const db = fakeDb(co({ plan: "pro", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_new", stripeEventAt: 500, subscriptionStatus: "active" }));
    const s = (over) => ({ id: "sub_new", customer: "cus_1", status: "canceled", metadata: { companyId: "c1" }, ...over });
    expect(await applyStripeEvent(ev("customer.subscription.updated", s(), 400), { db, stripe: fakeStripe() })).toMatchObject({ reason: "stale_event" });
    expect(await applyStripeEvent(ev("customer.subscription.updated", s({ customer: "cus_other" }), 600), { db, stripe: fakeStripe() })).toMatchObject({ reason: "customer_mismatch" });
    expect(await applyStripeEvent(ev("customer.subscription.deleted", s({ id: "sub_old" }), 600), { db, stripe: fakeStripe() })).toMatchObject({ reason: "other_subscription" });
    expect(db.patches).toHaveLength(0);
  });
  it("unknown company and unrelated events are acknowledged without writing", async () => {
    const db = fakeDb({});
    expect(await applyStripeEvent(ev("customer.subscription.updated", { id: "s", customer: "cus_x", status: "active" }), { db, stripe: fakeStripe() })).toMatchObject({ handled: false, reason: "company_not_found" });
    expect(await applyStripeEvent(ev("charge.succeeded", {}), { db, stripe: fakeStripe() })).toMatchObject({ handled: false, reason: "ignored_type" });
    expect(db.patches).toHaveLength(0);
  });
  it("a metadata companyId that is not a safe id is not used as a path", async () => {
    const db = fakeDb(co({ stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" }));
    const r = await applyStripeEvent(ev("customer.subscription.updated", { id: "sub_1", customer: "cus_1", status: "active", metadata: { companyId: "../users/x" } }), { db, stripe: fakeStripe(), now: NOW });
    expect(r.companyId).toBe("c1");
  });
});

describe("HTTP handlers", () => {
  let pair, saJson;
  beforeAll(async () => { pair = await makeKeyPair(); saJson = JSON.stringify({ client_email: "s@x", private_key: pair.pem, project_id: PID }); });
  beforeEach(() => { _resetKeyCache(); _resetTokenCache(); });

  const env = () => ({ FIREBASE_SERVICE_ACCOUNT: saJson, STRIPE_SECRET_KEY: "sk_test_1", STRIPE_PRICE_ID: "price_123", STRIPE_WEBHOOK_SECRET: "whsec_x", APP_URL: "https://app.example.com/" });
  const docs = () => ({
    "companies/c1": { name: "Luma Painting", email: "luma@example.com", trialEndsAt: new Date(Date.now() + 10 * 86400000).toISOString() },
    "companies/c1/members/owner1": { role: "owner" },
    "companies/c1/members/admin1": { role: "admin" },
  });
  const req = async (uid, body, { token, url = "https://app.example.com/api/billing/checkout" } = {}) => {
    const tok = token ?? await signIdToken(pair, idTokenClaims(PID, uid, Date.now()));
    return new Request(url, { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  };
  const deps = (db, stripe) => ({ db, stripe, keys: [pair.jwk] });
  const status = async (p) => p.then(() => 200, (e) => e.status);

  it("checkout: owner gets a Checkout Session; customer is created once and saved; trial end is honoured", async () => {
    const db = fakeDb(docs()); const stripe = fakeStripe();
    const res = await checkout({ request: await req("owner1", { companyId: "c1" }), env: env() }, deps(db, stripe));
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/s1" });
    expect(db.docs["companies/c1"].stripeCustomerId).toBe("cus_new");
    const [, cust, idem] = stripe.calls[0];
    expect(cust).toMatchObject({ name: "Luma Painting", metadata: { companyId: "c1", ownerUid: "owner1" } });
    expect(idem).toBe("tw-customer-c1");
    const p = stripe.calls[1][1];
    expect(p).toMatchObject({
      mode: "subscription", customer: "cus_new", client_reference_id: "c1",
      line_items: [{ price: "price_123", quantity: 1 }],
      success_url: "https://app.example.com/settings?section=billing&checkout=success",
      cancel_url: "https://app.example.com/settings?section=billing&checkout=cancel",
      subscription_data: { metadata: { companyId: "c1" } },
    });
    expect(typeof p.subscription_data.trial_end).toBe("number");
    // second call reuses the customer
    const stripe2 = fakeStripe();
    await checkout({ request: await req("owner1", { companyId: "c1" }), env: env() }, deps(db, stripe2));
    expect(stripe2.calls.map((c) => c[0])).toEqual(["checkout"]);
  });
  it("checkout: no trial_end when the trial is over or nearly over", async () => {
    const d = docs(); d["companies/c1"].trialEndsAt = new Date(Date.now() + 86400000).toISOString();
    const stripe = fakeStripe();
    await checkout({ request: await req("owner1", { companyId: "c1" }), env: env() }, deps(fakeDb(d), stripe));
    expect(stripe.calls.at(-1)[1].subscription_data.trial_end).toBeUndefined();
  });
  it("checkout: admins, strangers, missing/forged tokens and bad ids are refused", async () => {
    const db = fakeDb(docs()); const stripe = fakeStripe();
    expect(await status(checkout({ request: await req("admin1", { companyId: "c1" }), env: env() }, deps(db, stripe)))).toBe(403);
    expect(await status(checkout({ request: await req("stranger", { companyId: "c1" }), env: env() }, deps(db, stripe)))).toBe(403);
    expect(await status(checkout({ request: await req("owner1", { companyId: "c1" }, { token: "abc.def.ghi" }), env: env() }, deps(db, stripe)))).toBe(401);
    const forged = await signIdToken(await makeKeyPair(), idTokenClaims(PID, "owner1", Date.now()));
    expect(await status(checkout({ request: await req("owner1", { companyId: "c1" }, { token: forged }), env: env() }, deps(db, stripe)))).toBe(401);
    expect(await status(checkout({ request: await req("owner1", { companyId: "../x" }), env: env() }, deps(db, stripe)))).toBe(400);
    expect(await status(checkout({ request: new Request("https://x/api", { method: "POST", body: "{}" }), env: env() }, deps(db, stripe)))).toBe(401);
    expect(stripe.calls).toHaveLength(0);
  });
  it("checkout: 503 with a friendly message when env vars are missing", async () => {
    const e = env(); delete e.STRIPE_PRICE_ID;
    expect(await status(checkout({ request: await req("owner1", { companyId: "c1" }), env: e }, deps(fakeDb(docs()), fakeStripe())))).toBe(503);
  });

  it("portal: owner with a customer gets a portal URL; without a customer gets 400", async () => {
    const d = docs(); d["companies/c1"].stripeCustomerId = "cus_1";
    const stripe = fakeStripe();
    const res = await portal({ request: await req("owner1", { companyId: "c1" }), env: env() }, deps(fakeDb(d), stripe));
    expect(await res.json()).toEqual({ url: "https://billing.stripe.test/p1" });
    expect(stripe.calls[0][1]).toEqual({ customer: "cus_1", return_url: "https://app.example.com/settings?section=billing" });
    expect(await status(portal({ request: await req("owner1", { companyId: "c1" }), env: env() }, deps(fakeDb(docs()), fakeStripe())))).toBe(400);
    expect(await status(portal({ request: await req("admin1", { companyId: "c1" }), env: env() }, deps(fakeDb(d), fakeStripe())))).toBe(403);
  });

  async function signedWebhook(event, { secret = "whsec_x", t = Math.floor(Date.now() / 1000), body } = {}) {
    const raw = body ?? JSON.stringify(event);
    const sig = await hmacSha256Hex(secret, `${t}.${raw}`);
    return new Request("https://app.example.com/api/billing/webhook", { method: "POST", headers: { "Stripe-Signature": `t=${t},v1=${sig}` }, body: raw });
  }
  const paid = { id: "evt_a", type: "checkout.session.completed", created: 1700000000, data: { object: { mode: "subscription", client_reference_id: "c1", customer: "cus_1", subscription: "sub_1" } } };

  it("webhook: a correctly signed event updates the company", async () => {
    const db = fakeDb(docs());
    const res = await webhook({ request: await signedWebhook(paid), env: env() }, { db, stripe: fakeStripe() });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, handled: true });
    expect(db.docs["companies/c1"]).toMatchObject({ plan: "pro", subscriptionStatus: "active" });
  });
  it("webhook: bad signature, tampered body, old timestamp -> 400 and nothing written", async () => {
    const db = fakeDb(docs());
    const bad = [
      await signedWebhook(paid, { secret: "whsec_wrong" }),
      await signedWebhook(paid, { t: Math.floor(Date.now() / 1000) - 3600 }),
      new Request("https://x", { method: "POST", body: JSON.stringify(paid) }),
    ];
    const good = await signedWebhook(paid);
    const tampered = new Request("https://x", { method: "POST", headers: good.headers, body: JSON.stringify({ ...paid, id: "evt_evil" }) });
    for (const r of [...bad, tampered]) expect((await webhook({ request: r, env: env() }, { db, stripe: fakeStripe() })).status).toBe(400);
    expect(db.patches).toHaveLength(0);
  });
  it("webhook: Firestore failure -> 500 (Stripe will retry); missing env -> 503", async () => {
    const db = fakeDb(docs()); db.patch = async () => { throw new Error("boom"); };
    expect((await webhook({ request: await signedWebhook(paid), env: env() }, { db, stripe: fakeStripe() })).status).toBe(500);
    const e = env(); delete e.STRIPE_WEBHOOK_SECRET;
    expect((await webhook({ request: await signedWebhook(paid), env: e }, { db, stripe: fakeStripe() })).status).toBe(503);
  });
  it("webhook: unrelated event types are acknowledged with 200", async () => {
    const res = await webhook({ request: await signedWebhook({ id: "evt_z", type: "charge.succeeded", data: { object: {} } }), env: env() }, { db: fakeDb(docs()), stripe: fakeStripe() });
    expect(res.status).toBe(200);
  });
});
