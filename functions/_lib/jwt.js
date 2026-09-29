// JWT helpers on WebCrypto only (no SDKs): verify Firebase ID tokens, sign RS256 JWTs, get a Google service-account token.
import { b64urlDecode, b64urlEncode, fromUtf8, HttpError } from "./util.js";

export const GOOGLE_JWK_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const CLOCK_SKEW = 300; // seconds of tolerance for iat / auth_time

const RS256_IMPORT = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

/* ------------------------------ signing ------------------------------ */

/** Imports a PEM "-----BEGIN PRIVATE KEY-----" (PKCS#8, what Google service-account JSON contains). */
export function importPrivateKey(pem) {
  const body = String(pem).replace(/-----BEGIN [A-Z ]+-----/, "").replace(/-----END [A-Z ]+-----/, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, RS256_IMPORT, false, ["sign"]);
}

/** Signs `claims` as an RS256 JWT with a PEM private key. Returns "header.payload.signature". */
export async function signJwtRS256(claims, privateKeyPem, header = {}) {
  const key = await importPrivateKey(privateKeyPem);
  const head = b64urlEncode(JSON.stringify({ alg: "RS256", typ: "JWT", ...header }));
  const payload = b64urlEncode(JSON.stringify(claims));
  const sig = await crypto.subtle.sign(RS256_IMPORT.name, key, new TextEncoder().encode(`${head}.${payload}`));
  return `${head}.${payload}.${b64urlEncode(new Uint8Array(sig))}`;
}

/* ----------------------- Firebase ID token check ---------------------- */

function decodePart(part) {
  try { return JSON.parse(fromUtf8(b64urlDecode(part))); } catch { throw new HttpError(401, "Invalid token"); }
}

let keyCache = { keys: null, until: 0 };

/** Google's public signing keys as JWKs, cached in memory (refetched on unknown kid or after an hour). */
export async function getGoogleKeys({ fetchImpl = fetch, now = Date.now(), force = false } = {}) {
  if (!force && keyCache.keys && now < keyCache.until) return keyCache.keys;
  const res = await fetchImpl(GOOGLE_JWK_URL);
  if (!res.ok) throw new Error("Could not load Google public keys: " + res.status);
  const data = await res.json();
  const cc = /max-age=(\d+)/.exec(res.headers?.get?.("Cache-Control") || "");
  const ttl = Math.min(Math.max(cc ? Number(cc[1]) : 3600, 60), 86400) * 1000;
  keyCache = { keys: data.keys || [], until: now + ttl };
  return keyCache.keys;
}
export const _resetKeyCache = () => { keyCache = { keys: null, until: 0 }; };

/**
 * Verifies a Firebase Auth ID token completely: RS256 signature against Google's keys, alg/kid, exp, iat, auth_time,
 * audience = project id, issuer = securetoken for that project, non-empty subject.
 * Returns the claims ({ sub, user_id, email, ... }); throws HttpError(401) otherwise.
 * `keys` (array of JWKs) can be injected for tests; otherwise they are fetched from Google.
 */
export async function verifyFirebaseIdToken(token, { projectId, keys, fetchImpl, now = Date.now() } = {}) {
  if (!projectId) throw new Error("projectId is required");
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3 || parts.some((p) => !p)) throw new HttpError(401, "Invalid token");
  const header = decodePart(parts[0]);
  const claims = decodePart(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new HttpError(401, "Invalid token");

  let list = keys || (await getGoogleKeys({ fetchImpl, now }));
  let jwk = list.find((k) => k.kid === header.kid);
  if (!jwk && !keys) { list = await getGoogleKeys({ fetchImpl, now, force: true }); jwk = list.find((k) => k.kid === header.kid); }
  if (!jwk) throw new HttpError(401, "Invalid token");

  const pub = await crypto.subtle.importKey("jwk", { ...jwk, alg: "RS256", ext: true }, RS256_IMPORT, false, ["verify"]);
  const ok = await crypto.subtle.verify(RS256_IMPORT.name, pub, b64urlDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new HttpError(401, "Invalid token");

  const sec = Math.floor(now / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= sec) throw new HttpError(401, "Session expired. Please sign in again.");
  if (typeof claims.iat !== "number" || claims.iat > sec + CLOCK_SKEW) throw new HttpError(401, "Invalid token");
  if (claims.auth_time != null && claims.auth_time > sec + CLOCK_SKEW) throw new HttpError(401, "Invalid token");
  if (claims.aud !== projectId) throw new HttpError(401, "Invalid token");
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new HttpError(401, "Invalid token");
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128) throw new HttpError(401, "Invalid token");
  return claims;
}

/* ------------------------ service-account token ----------------------- */

export function parseServiceAccount(raw) {
  let sa;
  try { sa = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON"); }
  if (!sa || !sa.client_email || !sa.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT is missing client_email or private_key");
  return { ...sa, private_key: String(sa.private_key).replace(/\\n/g, "\n") };
}

/** The signed assertion Google exchanges for an access token (RFC 7523). */
export function serviceAccountAssertion(sa, scope, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const claims = { iss: sa.client_email, scope, aud: sa.token_uri || "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 };
  return signJwtRS256(claims, sa.private_key, sa.private_key_id ? { kid: sa.private_key_id } : {});
}

let tokenCache = new Map();
export const _resetTokenCache = () => tokenCache.clear();

/** Mints (and caches until 1 minute before expiry) an OAuth access token for the service account. */
export async function getServiceAccountToken(rawServiceAccount, { scope = "https://www.googleapis.com/auth/datastore", fetchImpl = fetch, now = Date.now() } = {}) {
  const sa = parseServiceAccount(rawServiceAccount);
  const ck = sa.client_email + "|" + scope;
  const hit = tokenCache.get(ck);
  if (hit && now < hit.until) return hit.token;
  const assertion = await serviceAccountAssertion(sa, scope, now);
  const res = await fetchImpl(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
  });
  if (!res.ok) throw new Error("Google token request failed: " + res.status + " " + (await res.text()).slice(0, 200));
  const data = await res.json();
  if (!data.access_token) throw new Error("Google token response had no access_token");
  tokenCache.set(ck, { token: data.access_token, until: now + Math.max(60, (data.expires_in || 3600) - 60) * 1000 });
  return data.access_token;
}
