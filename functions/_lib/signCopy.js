// Signing the client link (POST /api/portal/sign): checks, the signed copy and the e-mail with it. Pure functions: no I/O.
import { clientTotal, isOwnerSigned, isSelectable } from "../../src/lib/portal.ts";
import { esc, isEmail } from "./inviteMail.js";
import { isSafeId, toHex } from "./util.js";

export const MAX_NAME = 120;
export const MAX_IMG = 400_000;
/** A link token as newToken() makes them (24 letters / digits). */
export const isToken = (t) => typeof t === "string" && /^[A-Za-z0-9]{16,64}$/.test(t);
const isPng = (s) => typeof s === "string" && s.length > 30 && s.length <= MAX_IMG && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s);

/**
 * What the browser sent, checked: { kind: "est" | "co", coId?, name, img, total?, picks?, lang, tz }. Throws "bad:<why>".
 * Only the token, the name, the drawing and (for the estimate) the option picks and total the client saw come from the browser.
 */
export function checkSignInput(b) {
  const kind = b && b.kind === "co" ? "co" : "est";
  const name = String((b && b.name) || "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  if (!name) throw new Error("bad:name");
  if (!isPng(b && b.img)) throw new Error("bad:img");
  if (kind === "co" && !isSafeId(b && b.coId)) throw new Error("bad:co");
  const picks = {};
  if (b && b.picks && typeof b.picks === "object" && !Array.isArray(b.picks)) {
    for (const [k, v] of Object.entries(b.picks).slice(0, 200)) if (isSafeId(k) && typeof v === "boolean") picks[k] = v;
  }
  const tz = typeof (b && b.tz) === "string" && b.tz.length <= 64 && validTz(b.tz) ? b.tz : "UTC";
  return { kind, coId: kind === "co" ? b.coId : "", name, img: b.img, total: Number(b && b.total), picks, lang: b && b.lang === "es" ? "es" : "en", tz };
}
export function validTz(tz) { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } }

/** The client's option picks, kept only for options they may pick (the rest of the estimate is the owner's). */
export function signedPicks(m, picks) {
  const ok = new Set((m.e.upgrades || []).filter(isSelectable).map((u) => u.id));
  return Object.fromEntries(Object.entries(picks || {}).filter(([k]) => ok.has(k)));
}

/**
 * Can this be signed now? -> { total } for the estimate / { co } for a change order, or throws "no:<why>".
 * The estimate: not signed yet (here or by the owner), and the total with the client's picks equals what their screen showed.
 */
export function signCheck(m, client, inp) {
  const c = client || {};
  if (inp.kind === "co") {
    const co = (m.e.changeOrders || []).find((x) => x.id === inp.coId);
    if (!co || co.status === "draft") throw new Error("no:co-gone");
    if (co.status === "signed" || (c.coSign && c.coSign[inp.coId])) throw new Error("no:signed");
    return { co };
  }
  if (c.sign || isOwnerSigned(m)) throw new Error("no:signed");
  const picks = signedPicks(m, inp.picks);
  const total = clientTotal(m, { ...c, picks });
  if (!Number.isFinite(inp.total) || Math.abs(total - inp.total) > 0.005) throw new Error("no:total");
  return { total, picks };
}

/** Id of a signed copy: what was signed + when (portal/{token}/signed/{id}). */
export const copyId = (kind, coId, ms) => (kind === "co" ? `co-${coId}-${ms}` : `est-${ms}`).slice(0, 120);

/** SHA-256 (hex) of the exact signed content: the document as published, the picks, who, the drawing, when, the amount. */
export async function fingerprint(x) {
  const s = JSON.stringify({ data: x.data, kind: x.kind, coId: x.coId || "", picks: x.picks || {}, name: x.name, img: x.img, at: x.at, amount: x.amount });
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** "October 1, 2026, 2:22 PM CDT" in the signer's time zone. */
export function fmtWhen(iso, tz, lang) {
  const d = new Date(iso);
  try { return d.toLocaleString(lang === "es" ? "es-US" : "en-US", { timeZone: tz, year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }); }
  catch { return d.toISOString().replace("T", " ").slice(0, 16) + " UTC"; }
}
const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The e-mail with the client's copy (their language). -> { subject, html, text } */
export function signedEmail({ m, kind, co, name, at, amount, picks, tz, lang, url, privacyUrl = "" }) {
  const es = lang === "es", b = m.s.business || {}, e = m.e;
  const T = (en, sp) => (es ? sp : en);
  const first = String(e.clientName || name || "").trim().split(/\s+/)[0] || "";
  const what = kind === "co" ? T(`change order #${co.n} for estimate ${e.number}`, `orden de cambio #${co.n} del presupuesto ${e.number}`) : T(`estimate ${e.number}`, `presupuesto ${e.number}`);
  const subject = (kind === "co" ? T(`Your signed change order #${co.n} (${e.number})`, `Su orden de cambio firmada #${co.n} (${e.number})`) : T(`Your signed estimate ${e.number}`, `Su presupuesto firmado ${e.number}`)) + ` — ${b.name || "TradeWorks"}`;
  const opts = kind === "est" ? (e.upgrades || []).filter((u) => isSelectable(u) && (u.id in picks ? picks[u.id] : u.included)).map((u) => (es ? u.descEs || u.desc : u.desc || u.descEs)).filter(Boolean) : [];
  const when = fmtWhen(at, tz, lang);
  const rows = [
    [kind === "co" ? T("Change order", "Orden de cambio") : T("Estimate", "Presupuesto"), kind === "co" ? `#${co.n} · ${e.number}` : e.number],
    ...(kind === "co" ? [[T("Change", "Cambio"), es ? co.descEs || co.desc : co.desc || co.descEs]] : []),
    [kind === "co" ? T("Amount", "Monto") : T("Total", "Total"), money(amount)],
    ...(opts.length ? [[T("Options you added", "Opciones que agregó"), opts.join(", ")]] : []),
    [T("Signed by", "Firmado por"), name],
    [T("Date and time", "Fecha y hora"), when],
  ];
  const addr = [b.name, b.address, b.phone, b.email].filter(Boolean).join(" · ");
  const logo = typeof b.logoUrl === "string" && /^https:\/\//.test(b.logoUrl) ? `<img src="${esc(b.logoUrl)}" alt="" style="max-height:48px;max-width:180px;margin-bottom:14px">` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#0b0d12">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:24px">
${logo}<h1 style="font-size:20px;margin:0 0 10px">${esc(T(`Thank you, ${first}`, `Gracias, ${first}`))}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 16px">${esc(T(`This is your copy of the ${what} you signed with ${b.name || "us"}. Keep this e-mail for your records.`, `Esta es su copia del ${what} que firmó con ${b.name || "nosotros"}. Guarde este correo.`))}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:8px 0;border-top:1px solid #eef0f3;color:#6b7280;width:42%;vertical-align:top">${esc(k)}</td><td style="padding:8px 0;border-top:1px solid #eef0f3;font-weight:600">${esc(v)}</td></tr>`).join("")}</table>
<p style="margin:22px 0 6px"><a href="${esc(url)}" style="display:inline-block;background:#0b0d12;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">${esc(T("See your signed copy", "Ver su copia firmada"))}</a></p>
<p style="font-size:12px;color:#6b7280;line-height:1.5;margin:12px 0 0">${esc(T("The copy shows the full document as it was when you signed, with your signature and the signing record.", "La copia muestra el documento completo tal como estaba al firmar, con su firma y el registro de la firma."))}</p>
</div><p style="font-size:12px;color:#6b7280;line-height:1.5;text-align:center;margin:14px 0 0">${esc(addr)}<br>${privacyUrl ? `<a href="${esc(privacyUrl)}" style="color:#6b7280">${esc(T("Privacy policy", "Política de privacidad"))}</a> · ` : ""}${esc(T("Sent by TradeWorks for", "Enviado por TradeWorks de parte de"))} ${esc(b.name || "")}</p></div></body></html>`;
  const text = [T(`Thank you, ${first}.`, `Gracias, ${first}.`), T(`This is your copy of the ${what} you signed with ${b.name || "us"}.`, `Esta es su copia del ${what} que firmó con ${b.name || "nosotros"}.`), "",
    ...rows.map(([k, v]) => `${k}: ${v}`), "", T("See your signed copy: ", "Ver su copia firmada: ") + url, "", addr, ...(privacyUrl ? [T("Privacy policy: ", "Política de privacidad: ") + privacyUrl] : [])].join("\n");
  return { subject, html, text, to: isEmail(String(e.email || "").trim().toLowerCase()) ? String(e.email).trim().toLowerCase() : "" };
}
