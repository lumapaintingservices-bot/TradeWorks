// Test helper (not used in production): generates an RSA key pair and signs Firebase-style ID tokens.
import { signJwtRS256 } from "./jwt.js";

export async function makeKeyPair(kid = "test-kid") {
  const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid, use: "sig", alg: "RS256" };
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", kp.privateKey)).toString("base64");
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
  return { jwk, pem, publicKey: kp.publicKey };
}

export function idTokenClaims(projectId, sub, now, extra = {}) {
  const s = Math.floor(now / 1000);
  return { iss: `https://securetoken.google.com/${projectId}`, aud: projectId, auth_time: s - 60, user_id: sub, sub, iat: s - 60, exp: s + 3600, email: sub + "@example.com", ...extra };
}

export const signIdToken = (pair, claims, kid = "test-kid") => signJwtRS256(claims, pair.pem, { kid });
