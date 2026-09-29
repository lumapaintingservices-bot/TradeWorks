import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_JWK_URL, _resetKeyCache, _resetTokenCache, getGoogleKeys, getServiceAccountToken, parseServiceAccount, serviceAccountAssertion, signJwtRS256, verifyFirebaseIdToken } from "./jwt.js";
import { idTokenClaims, makeKeyPair, signIdToken } from "./testkeys.js";
import { b64urlDecode, b64urlEncode } from "./util.js";

const PID = "tradeworks-test";
const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);
let pair, other;
beforeEach(async () => { pair ??= await makeKeyPair(); other ??= await makeKeyPair("test-kid"); _resetKeyCache(); _resetTokenCache(); });

const verify = (tok, opts = {}) => verifyFirebaseIdToken(tok, { projectId: PID, keys: [pair.jwk], now: NOW, ...opts });
const rejects = async (p, status = 401) => { await expect(p).rejects.toMatchObject({ status }); };

describe("signJwtRS256", () => {
  it("produces a 3-part token whose header and claims decode, and verifies with the public key", async () => {
    const tok = await signJwtRS256({ a: 1 }, pair.pem, { kid: "k1" });
    const [h, p, s] = tok.split(".");
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ alg: "RS256", typ: "JWT", kid: "k1" });
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(p)))).toEqual({ a: 1 });
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pair.publicKey, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
});

describe("verifyFirebaseIdToken", () => {
  it("accepts a valid token and returns its claims", async () => {
    const c = await verify(await signIdToken(pair, idTokenClaims(PID, "user123", NOW)));
    expect(c.sub).toBe("user123");
    expect(c.email).toBe("user123@example.com");
  });
  it("rejects a token signed by a different key with the same kid", async () => {
    await rejects(verify(await signIdToken(other, idTokenClaims(PID, "u", NOW))));
  });
  it("rejects a tampered payload", async () => {
    const tok = await signIdToken(pair, idTokenClaims(PID, "u", NOW));
    const [h, p, s] = tok.split(".");
    const forged = { ...JSON.parse(new TextDecoder().decode(b64urlDecode(p))), sub: "admin" };
    await rejects(verify(`${h}.${b64urlEncode(JSON.stringify(forged))}.${s}`));
  });
  it("rejects an expired token", async () => {
    await rejects(verify(await signIdToken(pair, idTokenClaims(PID, "u", NOW, { exp: Math.floor(NOW / 1000) - 1 }))));
  });
  it("rejects a token issued in the future", async () => {
    await rejects(verify(await signIdToken(pair, idTokenClaims(PID, "u", NOW, { iat: Math.floor(NOW / 1000) + 3600 }))));
  });
  it("rejects wrong audience and wrong issuer", async () => {
    await rejects(verify(await signIdToken(pair, idTokenClaims(PID, "u", NOW, { aud: "other-project" }))));
    await rejects(verify(await signIdToken(pair, idTokenClaims(PID, "u", NOW, { iss: "https://securetoken.google.com/other-project" }))));
    await rejects(verify(await signIdToken(pair, idTokenClaims(PID, "u", NOW, { iss: "https://accounts.google.com" }))));
  });
  it("rejects missing or empty subject", async () => {
    await rejects(verify(await signIdToken(pair, idTokenClaims(PID, "u", NOW, { sub: "" }))));
    const c = idTokenClaims(PID, "u", NOW); delete c.sub;
    await rejects(verify(await signIdToken(pair, c)));
  });
  it("rejects unknown kid, alg none and garbage", async () => {
    await rejects(verify(await signIdToken(pair, idTokenClaims(PID, "u", NOW), "nope")));
    const none = `${b64urlEncode(JSON.stringify({ alg: "none", kid: "test-kid" }))}.${b64urlEncode(JSON.stringify(idTokenClaims(PID, "u", NOW)))}.`;
    await rejects(verify(none));
    for (const bad of ["", "a.b", "a.b.c", "....", undefined, null]) await rejects(verify(bad));
  });
  it("fetches Google's keys once and caches them (refetches on unknown kid)", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ keys: [pair.jwk] }), { headers: { "Cache-Control": "public, max-age=3600" } }));
    const tok = await signIdToken(pair, idTokenClaims(PID, "u", NOW));
    await verifyFirebaseIdToken(tok, { projectId: PID, fetchImpl, now: NOW });
    await verifyFirebaseIdToken(tok, { projectId: PID, fetchImpl, now: NOW + 1000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(GOOGLE_JWK_URL);
    const unknown = await signIdToken(pair, idTokenClaims(PID, "u", NOW), "rotated");
    await rejects(verifyFirebaseIdToken(unknown, { projectId: PID, fetchImpl, now: NOW }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await getGoogleKeys({ fetchImpl, now: NOW + 3_700_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe("service account token", () => {
  const sa = (pem) => JSON.stringify({ client_email: "svc@tradeworks-test.iam.gserviceaccount.com", private_key: pem, private_key_id: "kid9", project_id: PID, token_uri: "https://oauth2.googleapis.com/token" });

  it("parseServiceAccount validates and restores escaped newlines", () => {
    expect(() => parseServiceAccount("nope")).toThrow(/valid JSON/);
    expect(() => parseServiceAccount("{}")).toThrow(/client_email/);
    expect(parseServiceAccount(JSON.stringify({ client_email: "a", private_key: "x\\ny" })).private_key).toBe("x\ny");
  });

  it("builds a correctly signed assertion (iss, scope, aud, 1h lifetime)", async () => {
    const tok = await serviceAccountAssertion(parseServiceAccount(sa(pair.pem)), "https://www.googleapis.com/auth/datastore", NOW);
    const [h, p, s] = tok.split(".");
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toMatchObject({ alg: "RS256", kid: "kid9" });
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
    expect(claims).toEqual({ iss: "svc@tradeworks-test.iam.gserviceaccount.com", scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: NOW / 1000, exp: NOW / 1000 + 3600 });
    expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pair.publicKey, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`))).toBe(true);
  });

  it("exchanges the assertion at Google, sends the right form, and caches the token", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ access_token: "ya29.token", expires_in: 3600 })); };
    const raw = sa(pair.pem.replace(/\n/g, "\\n")); // as pasted from the Google JSON file: newlines escaped inside the string
    const t1 = await getServiceAccountToken(raw, { fetchImpl, now: NOW });
    expect(t1).toBe("ya29.token");
    const form = new URLSearchParams(calls[0].init.body);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(form.get("assertion").split(".")).toHaveLength(3);
    expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");
    expect(await getServiceAccountToken(raw, { fetchImpl, now: NOW + 60_000 })).toBe("ya29.token");
    expect(calls).toHaveLength(1);
    await getServiceAccountToken(raw, { fetchImpl, now: NOW + 3_600_000 });
    expect(calls).toHaveLength(2);
  });

  it("throws a clear error when Google refuses", async () => {
    const fetchImpl = async () => new Response("invalid_grant", { status: 400 });
    await expect(getServiceAccountToken(sa(pair.pem), { fetchImpl, now: NOW })).rejects.toThrow(/400/);
  });
});
