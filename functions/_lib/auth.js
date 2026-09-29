// Shared request checks for checkout.js and portal.js: who is calling, and are they the OWNER of that company?
import { verifyFirebaseIdToken } from "./jwt.js";
import { firestore } from "./firestore.js";
import { HttpError, isSafeId } from "./util.js";

export function requireEnv(env, names) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) {
    console.error("Billing is not configured. Missing env vars: " + missing.join(", "));
    throw new HttpError(503, "Billing isn't set up yet.");
  }
}

/**
 * Verifies the Firebase ID token in `Authorization: Bearer ...`, reads { companyId } from the JSON body and checks
 * companies/{companyId}/members/{uid}.role === "owner" using the service account.
 * Returns { uid, email, companyId, company, db } where `company` is the decoded company document.
 */
export async function requireOwner(request, env, deps = {}) {
  requireEnv(env, ["FIREBASE_SERVICE_ACCOUNT"]);
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization") || "");
  if (!m) throw new HttpError(401, "Please sign in again.");
  let body;
  try { body = await request.json(); } catch { throw new HttpError(400, "Invalid request"); }
  const companyId = body && body.companyId;
  if (!isSafeId(companyId)) throw new HttpError(400, "Invalid company");

  const db = deps.db || firestore(env);
  const claims = await verifyFirebaseIdToken(m[1], { projectId: db.projectId, keys: deps.keys, fetchImpl: deps.fetchImpl });
  const member = await db.get(`companies/${companyId}/members/${claims.sub}`);
  if (!member || member.data.role !== "owner") throw new HttpError(403, "Only the owner of the company can manage billing.");
  const company = await db.get(`companies/${companyId}`);
  if (!company) throw new HttpError(404, "Company not found");
  return { uid: claims.sub, email: claims.email || "", companyId, company: company.data, db };
}

/** Where Stripe sends people back to. APP_URL wins; otherwise the URL this function is served from. */
export function appOrigin(request, env) {
  return String(env.APP_URL || new URL(request.url).origin).replace(/\/+$/, "");
}
