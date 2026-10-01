// POST /api/invite/send  { email, lang }  ->  { ok: true }
// E-mails the invitation invites/{email} with Resend. Auth: Authorization: Bearer <Firebase ID token>; the caller must be an
// owner / admin of the invitation's company (and a TradeWorks platform admin for an owner / admin invitation, like the rules).
// Not more than one e-mail a minute and 5 per invitation (invite.emailedAt / emailCount, written here with the service account).
import { appOrigin } from "../../_lib/auth.js";
import { firestore } from "../../_lib/firestore.js";
import { fromHeader, inviteEmail, isEmail, normEmail, sendBlock } from "../../_lib/inviteMail.js";
import { verifyFirebaseIdToken } from "../../_lib/jwt.js";
import { handle, HttpError, json, methodNotAllowed, onOptions } from "../../_lib/util.js";

const DEFAULT_FROM = "invites@lumapaintingservices.com";

async function resend(apiKey, mail, fetchImpl = fetch) {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: mail.from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text, ...(mail.replyTo ? { reply_to: mail.replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function sendInvite({ request, env }, deps = {}) {
  if (!env.FIREBASE_SERVICE_ACCOUNT || !env.RESEND_API_KEY) {
    console.error("Invite e-mails are not configured: FIREBASE_SERVICE_ACCOUNT and RESEND_API_KEY are needed.");
    throw new HttpError(503, "E-mail isn't set up yet.");
  }
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization") || "");
  if (!m) throw new HttpError(401, "Please sign in again.");
  let body;
  try { body = await request.json(); } catch { throw new HttpError(400, "Invalid request"); }
  const email = normEmail(body && body.email);
  if (!isEmail(email)) throw new HttpError(400, "Invalid e-mail");
  const lang = body && body.lang === "es" ? "es" : "en";

  const db = deps.db || firestore(env);
  const claims = deps.claims || await verifyFirebaseIdToken(m[1], { projectId: db.projectId, keys: deps.keys, fetchImpl: deps.fetchImpl });
  const uid = claims.sub;

  const inv = await db.get(`invites/${email}`);
  if (!inv) throw new HttpError(404, "That invitation no longer exists.");
  const cid = String(inv.data.companyId || "");
  const member = cid ? await db.get(`companies/${cid}/members/${uid}`) : null;
  if (!member || !["owner", "admin"].includes(member.data.role)) throw new HttpError(403, "Only the company's owner or admins can send its invitations.");
  if (inv.data.role !== "worker" && !(await db.get(`admins/${uid}`))) throw new HttpError(403, "Only TradeWorks can invite owners and admins.");

  const now = deps.now ? deps.now() : Date.now();
  const block = sendBlock(inv.data, now);
  if (block === "too-soon") throw new HttpError(429, "Wait a minute before sending it again.");
  if (block === "too-many") throw new HttpError(429, "This invitation was already e-mailed 5 times.");

  const company = await db.get(`companies/${cid}`);
  if (!company) throw new HttpError(404, "Company not found");
  const c = company.data;
  const mail = inviteEmail({
    to: email, companyName: c.name || inv.data.companyName, logoUrl: c.logoUrl, inviterName: inv.data.invitedByName || claims.name || "",
    role: inv.data.role, appUrl: appOrigin(request, env), lang,
  });
  const replyTo = isEmail(claims.email || "") ? claims.email : isEmail(c.email || "") ? c.email : undefined;
  await (deps.sendMail || ((x) => resend(env.RESEND_API_KEY, x, deps.fetchImpl)))({
    from: fromHeader(c.name || "TradeWorks", String(env.INVITE_FROM_ADDRESS || env.MAIL_FROM_ADDRESS || DEFAULT_FROM)), to: email, replyTo, ...mail,
  });
  await db.patch(`invites/${email}`, { emailedAt: new Date(now).toISOString(), emailCount: (Number(inv.data.emailCount) || 0) + 1 });
  return json({ ok: true });
}

export const onRequestPost = handle((ctx) => sendInvite(ctx));
export const onRequestOptions = onOptions;
export const onRequest = () => methodNotAllowed();
