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

export function stripeClient(secretKey, fetchImpl = fetch) {
  async function call(method, path, params, idempotencyKey) {
    const headers = { Authorization: "Bearer " + secretKey };
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
  return {
    createCustomer: (params, idem) => call("POST", "/v1/customers", params, idem),
    createCheckoutSession: (params) => call("POST", "/v1/checkout/sessions", params),
    createPortalSession: (params) => call("POST", "/v1/billing_portal/sessions", params),
    getSubscription: (id) => call("GET", "/v1/subscriptions/" + encodeURIComponent(id)),
  };
}

/** current_period_end moved onto the subscription items in newer Stripe API versions; support both. Returns ISO or null. */
export function periodEndIso(sub) {
  const s = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return typeof s === "number" ? new Date(s * 1000).toISOString() : null;
}
