// Small shared helpers for the billing functions (Cloudflare Pages Functions, plain JS, WebCrypto only).

const enc = new TextEncoder();
const dec = new TextDecoder();

export const utf8 = (s) => enc.encode(s);
export const fromUtf8 = (b) => dec.decode(b);

export function b64urlEncode(input) {
  const bytes = typeof input === "string" ? enc.encode(input) : input;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(str) {
  const b64 = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two strings (does not exit early on the first difference). */
export function timingSafeEqual(a, b) {
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Firestore document ids we accept from the browser (blocks path tricks like "../"). */
export const isSafeId = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(s);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** CORS: the app and the functions normally share one origin (no CORS needed). Set ALLOWED_ORIGIN to allow another one. */
export function corsHeaders(request, env) {
  const allowed = env && env.ALLOWED_ORIGIN;
  const origin = request.headers.get("Origin");
  if (!allowed || !origin || origin !== allowed) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
}

/** Wraps a handler: turns HttpError into a JSON error, hides unexpected errors from the browser (logs them). */
export function handle(fn) {
  return async (ctx) => {
    const cors = corsHeaders(ctx.request, ctx.env);
    try {
      const res = await fn(ctx);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors);
      console.error("billing function error:", e && e.stack ? e.stack : e);
      return json({ error: "Something went wrong. Please try again." }, 500, cors);
    }
  };
}

export const onOptions = (ctx) => new Response(null, { status: 204, headers: corsHeaders(ctx.request, ctx.env) });
export const methodNotAllowed = () => json({ error: "Method not allowed" }, 405, { Allow: "POST, OPTIONS" });

/** ISO string / epoch ms / Date -> epoch ms, or null. */
export function toMs(v) {
  if (v == null || v === "") return null;
  const n = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(String(v));
  return Number.isFinite(n) ? n : null;
}
