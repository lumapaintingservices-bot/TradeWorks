// Stripe REST calls with fetch (no SDK). Bodies are form-encoded, as Stripe requires.

/** Nested object -> Stripe form encoding: { a: { b: 1 }, c: [{ d: 2 }] } -> a[b]=1&c[0][d]=2 */
export function formEncode(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === "object" ? formEncode(item, `${key}[${i}]`, out) : out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(item)}`)));
    else if (typeof v === "object") formEncode(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out;
}

/** API version sent with v2 requests (Stripe requires one; bump it deliberately). */
export const STRIPE_V2_VERSION = "2026-08-26.dahlia";

export function stripeClient(secretKey, fetchImpl = fetch) {
  // `account`: a connected account id (acct_...) to act ON that account (Stripe Connect direct charges).
  async function call(method, path, params, idempotencyKey, account) {
    const headers = { Authorization: "Bearer " + secretKey };
    if (account) headers["Stripe-Account"] = account;
    let url = "https://api.stripe.com" + path;
    let body;
    if (method === "POST") {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
      body = formEncode(params || {}).join("&");
    }
    const res = await fetchImpl(url, { method, headers, body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Stripe ${method} ${path}: ${res.status} ${data?.error?.message || ""}`);
    return data;
  }
  // Stripe v2 APIs (Accounts v2): JSON bodies and a pinned API version.
  async function callV2(method, path, json, idempotencyKey) {
    const headers = { Authorization: "Bearer " + secretKey, "Stripe-Version": STRIPE_V2_VERSION };
    if (method === "POST") { headers["Content-Type"] = "application/json"; if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey; }
    const res = await fetchImpl("https://api.stripe.com" + path, { method, headers, body: method === "POST" ? JSON.stringify(json || {}) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Stripe ${method} ${path.split("?")[0]}: ${res.status} ${data?.error?.code || ""} ${data?.error?.message || ""}`);
    return data;
  }
  return {
    createCustomer: (params, idem) => call("POST", "/v1/customers", params, idem),
    createCheckoutSession: (params) => call("POST", "/v1/checkout/sessions", params),
    createPortalSession: (params) => call("POST", "/v1/billing_portal/sessions", params),
    getSubscription: (id) => call("GET", "/v1/subscriptions/" + encodeURIComponent(id)),
    // Stripe Connect with Accounts v2: card payments on invoice payment links (see ./connect.js)
    createAccount: (json, idem) => callV2("POST", "/v2/core/accounts", json, idem),
    getAccount: (id) => callV2("GET", "/v2/core/accounts/" + encodeURIComponent(id) + "?include[0]=configuration.merchant&include[1]=requirements"),
    createAccountLink: (json) => callV2("POST", "/v2/core/account_links", json),
    createAccountCheckoutSession: (account, params) => call("POST", "/v1/checkout/sessions", params, undefined, account),
  };
}

/** current_period_end moved onto the subscription items in newer Stripe API versions; support both. Returns ISO or null. */
export function periodEndIso(sub) {
  const s = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return typeof s === "number" ? new Date(s * 1000).toISOString() : null;
}
