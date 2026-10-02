// POST /api/portal/sign  { token, kind: "est" | "co", coId?, name, img, total?, picks?, lang, tz }  ->  { ok, at, copy, emailed }
// Public: the client signs the estimate (or a change order) on the link /p/:token, not signed in. The signature is written HERE
// with the service account, so (firestore.rules) nobody can add, change or remove it from a browser. It also keeps a copy of
// exactly what was signed (portal/{token}/signed/{id}: the document as published, picks, name, drawing, server time, IP,
// device, SHA-256 fingerprint) and e-mails that copy to the client when the estimate has their e-mail and Resend is set up.
import { appOrigin, requireEnv } from "../../_lib/auth.js";
import { firestore } from "../../_lib/firestore.js";
import { fromHeader } from "../../_lib/inviteMail.js";
import { checkSignInput, copyId, fingerprint, isToken, signCheck, signedEmail } from "../../_lib/signCopy.js";
import { HttpError, handle, json, methodNotAllowed, onOptions } from "../../_lib/util.js";

const DEFAULT_FROM = "documents@lumapaintingservices.com";
const MAX_COPY = 900_000; // a Firestore document holds 1 MiB: keep room for the rest of the copy

async function resend(apiKey, mail, fetchImpl = fetch) {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: mail.from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text, ...(mail.replyTo ? { reply_to: mail.replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

const WHY = {
  "bad:name": [400, "Type your name."], "bad:img": [400, "Sign in the box first."], "bad:co": [400, "Invalid request"],
  "no:signed": [409, "This was already signed."], "no:co-gone": [409, "This change is no longer open."],
  "no:total": [409, "The estimate changed while you were looking at it. Check it again and sign."],
};
const fail = (e) => { const w = WHY[String(e && e.message)]; if (w) throw new HttpError(w[0], w[1]); throw e; };

export async function portalSign({ request, env }, deps = {}) {
  requireEnv(env, ["FIREBASE_SERVICE_ACCOUNT"]);
  let body;
  try { body = await request.json(); } catch { throw new HttpError(400, "Invalid request"); }
  if (!isToken(body && body.token)) throw new HttpError(400, "Invalid link");
  const token = body.token;
  let inp;
  try { inp = checkSignInput(body); } catch (e) { fail(e); }
  const db = deps.db || firestore(env);
  const now = deps.now ? deps.now() : Date.now();
  const at = new Date(now).toISOString();
  const ip = String(request.headers.get("CF-Connecting-IP") || "").slice(0, 64);
  const ua = String(request.headers.get("User-Agent") || "").slice(0, 300);

  // read, check, write the signature only if nobody changed the link in between (two taps / two phones): retried once
  for (let attempt = 0; attempt < 2; attempt++) {
    const doc = await db.get(`portal/${token}`);
    if (!doc || !doc.data.data) throw new HttpError(404, "This link isn't active.");
    let m;
    try { m = JSON.parse(doc.data.data); } catch { throw new HttpError(404, "This link isn't active."); }
    const client = doc.data.client || {};
    let ok;
    try { ok = signCheck(m, client, inp); } catch (e) { fail(e); }

    const id = copyId(inp.kind, inp.coId, now);
    const amount = inp.kind === "co" ? Number(ok.co.amount) || 0 : ok.total;
    const picks = inp.kind === "co" ? {} : ok.picks;
    const signed = { data: doc.data.data.length <= MAX_COPY ? doc.data.data : "", kind: inp.kind, coId: inp.coId, picks, name: inp.name, img: inp.img, at, amount };
    const hash = await fingerprint(signed);
    const copy = {
      ...signed, ...(signed.data ? {} : { dataTooBig: true }), hash, ip, ua, tz: inp.tz, lang: inp.lang,
      number: String(doc.data.number || m.e.number || ""), owner: String(doc.data.owner || ""), estId: String(doc.data.estId || ""),
      ...(inp.kind === "co" ? { coN: ok.co.n } : {}),
    };
    await db.create(`portal/${token}/signed/${id}`, copy);
    const mark = { name: inp.name, img: inp.img, at, server: true, copy: id };
    const fields = inp.kind === "co"
      ? { [`client.coSign.${inp.coId}`]: mark }
      : { "client.sign": { ...mark, total: amount }, "client.picks": picks };
    const written = await db.update(`portal/${token}`, fields, { updateTime: doc.updateTime });
    if (!written) { await db.remove(`portal/${token}/signed/${id}`); continue; } // changed meanwhile: look again

    // the client's copy by e-mail (never fails the signature)
    let emailed = false;
    const mail = signedEmail({ m, kind: inp.kind, co: ok.co, name: inp.name, at, amount, picks, tz: inp.tz, lang: inp.lang, url: `${appOrigin(request, env)}/p/${token}/signed/${id}`,
      privacyUrl: /^[A-Za-z0-9_-]{1,128}$/.test(String(doc.data.owner || "")) ? `${appOrigin(request, env)}/privacy/${doc.data.owner}` : "" });
    if (mail.to && env.RESEND_API_KEY) {
      const b = m.s.business || {};
      try {
        await (deps.sendMail || ((x) => resend(env.RESEND_API_KEY, x, deps.fetchImpl)))({
          from: fromHeader(b.name || "TradeWorks", String(env.DOCS_FROM_ADDRESS || env.MAIL_FROM_ADDRESS || DEFAULT_FROM)), to: mail.to,
          replyTo: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(b.email || "")) ? b.email : undefined, subject: mail.subject, html: mail.html, text: mail.text,
        });
        emailed = true;
        await db.patch(`portal/${token}/signed/${id}`, { emailedTo: mail.to, emailedAt: new Date(deps.now ? deps.now() : Date.now()).toISOString() }).catch(() => {});
      } catch (e) { console.error("signed copy e-mail:", e && e.message); }
    }
    return json({ ok: true, at, copy: id, emailed });
  }
  throw new HttpError(409, "Someone else is changing this link right now. Try again.");
}

export const onRequestPost = handle((ctx) => portalSign(ctx));
export const onRequestOptions = onOptions;
export const onRequest = () => methodNotAllowed();
