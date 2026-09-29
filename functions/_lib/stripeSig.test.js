import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacSha256Hex, parseSignatureHeader, verifyStripeSignature } from "./stripeSig.js";
import { b64urlDecode, b64urlEncode, timingSafeEqual } from "./util.js";

const SECRET = "whsec_test_secret";
const BODY = '{"id":"evt_test","object":"event"}';
const T = 1700000000;
// Known vector, produced independently with `openssl dgst -sha256 -hmac` and node:crypto (not with this code).
const KNOWN_SIG = "8042376f6ca064adbe037642a718227dfd59047137eb49497a54c49eb0cfb724";
const NOW = T * 1000;

describe("hmacSha256Hex", () => {
  it("matches the known vector", async () => {
    expect(await hmacSha256Hex(SECRET, `${T}.${BODY}`)).toBe(KNOWN_SIG);
  });
  it("matches node:crypto on random input", async () => {
    const msg = "héllo ✓ " + Math.random();
    expect(await hmacSha256Hex("k", msg)).toBe(createHmac("sha256", "k").update(msg).digest("hex"));
  });
});

describe("parseSignatureHeader", () => {
  it("parses t and multiple v1", () => {
    expect(parseSignatureHeader("t=123,v1=aa,v0=zz,v1=bb")).toEqual({ t: 123, v1: ["aa", "bb"] });
  });
  it("copes with junk", () => {
    expect(parseSignatureHeader(null).v1).toEqual([]);
    expect(Number.isNaN(parseSignatureHeader("v1=aa").t)).toBe(true);
  });
});

describe("verifyStripeSignature", () => {
  const header = `t=${T},v1=${KNOWN_SIG}`;
  it("accepts a valid signature", async () => {
    expect(await verifyStripeSignature(BODY, header, SECRET, { now: NOW })).toEqual({ ok: true });
  });
  it("accepts when one of several v1 signatures matches (secret rotation)", async () => {
    expect((await verifyStripeSignature(BODY, `t=${T},v1=${"0".repeat(64)},v1=${KNOWN_SIG}`, SECRET, { now: NOW })).ok).toBe(true);
  });
  it("rejects a changed body", async () => {
    expect(await verifyStripeSignature(BODY + " ", header, SECRET, { now: NOW })).toEqual({ ok: false, reason: "no_match" });
  });
  it("rejects a wrong secret and a changed timestamp", async () => {
    expect((await verifyStripeSignature(BODY, header, "whsec_other", { now: NOW })).ok).toBe(false);
    expect((await verifyStripeSignature(BODY, `t=${T + 1},v1=${KNOWN_SIG}`, SECRET, { now: NOW })).ok).toBe(false);
  });
  it("rejects a truncated or empty signature", async () => {
    expect((await verifyStripeSignature(BODY, `t=${T},v1=${KNOWN_SIG.slice(0, 60)}`, SECRET, { now: NOW })).ok).toBe(false);
    expect((await verifyStripeSignature(BODY, `t=${T},v1=`, SECRET, { now: NOW })).ok).toBe(false);
  });
  it("rejects missing header / missing secret", async () => {
    expect(await verifyStripeSignature(BODY, null, SECRET, { now: NOW })).toEqual({ ok: false, reason: "bad_header" });
    expect(await verifyStripeSignature(BODY, header, "", { now: NOW })).toEqual({ ok: false, reason: "no_secret" });
  });
  it("enforces the 5-minute tolerance in both directions", async () => {
    expect((await verifyStripeSignature(BODY, header, SECRET, { now: NOW + 300_000 })).ok).toBe(true);
    expect(await verifyStripeSignature(BODY, header, SECRET, { now: NOW + 301_000 })).toEqual({ ok: false, reason: "outside_tolerance" });
    expect((await verifyStripeSignature(BODY, header, SECRET, { now: NOW - 301_000 })).ok).toBe(false);
  });
  it("verifies a freshly generated signature with node:crypto", async () => {
    const body = JSON.stringify({ id: "evt_1", type: "invoice.payment_failed", data: { object: { customer: "cus_1" } } });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", "whsec_abc").update(`${t}.${body}`).digest("hex");
    expect((await verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_abc")).ok).toBe(true);
  });
});

describe("util", () => {
  it("timingSafeEqual", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
  it("base64url round trip", () => {
    const bytes = new Uint8Array([251, 255, 254, 0, 1, 2, 250]);
    const s = b64urlEncode(bytes);
    expect(s).not.toMatch(/[+/=]/);
    expect(Array.from(b64urlDecode(s))).toEqual(Array.from(bytes));
    expect(Buffer.from(b64urlEncode("hi?>"), "utf8").toString()).toBe(Buffer.from("hi?>").toString("base64url"));
  });
});
