// Stripe webhook signature check (HMAC SHA-256, constant-time compare, replay tolerance) with WebCrypto.
import { timingSafeEqual, toHex, utf8 } from "./util.js";

export const DEFAULT_TOLERANCE = 300; // seconds (5 minutes)

/** Parses "t=1700000000,v1=abc,v1=def" -> { t: 1700000000, v1: ["abc","def"] } */
export function parseSignatureHeader(header) {
  const out = { t: NaN, v1: [] };
  for (const part of String(header || "").split(",")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") out.t = Number(v);
    else if (k === "v1") out.v1.push(v);
  }
  return out;
}

export async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, utf8(message)));
}

/**
 * Verifies a Stripe-Signature header against the RAW request body.
 * Returns { ok: true } or { ok: false, reason }. `now` is in ms.
 */
export async function verifyStripeSignature(rawBody, header, secret, { now = Date.now(), tolerance = DEFAULT_TOLERANCE } = {}) {
  if (!secret) return { ok: false, reason: "no_secret" };
  const { t, v1 } = parseSignatureHeader(header);
  if (!Number.isFinite(t) || v1.length === 0) return { ok: false, reason: "bad_header" };
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  let match = false;
  for (const sig of v1) if (timingSafeEqual(sig, expected)) match = true; // check all, no early exit
  if (!match) return { ok: false, reason: "no_match" };
  if (Math.abs(Math.floor(now / 1000) - t) > tolerance) return { ok: false, reason: "outside_tolerance" };
  return { ok: true };
}
