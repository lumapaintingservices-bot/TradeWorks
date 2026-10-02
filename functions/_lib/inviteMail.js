// The invitation e-mail TradeWorks sends for a company (POST /api/invite/send). Pure functions: no I/O.

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** Display name for the From header: the company's name, never able to break the header. */
export const fromHeader = (name, address) => `"${String(name || "TradeWorks").replace(/["<>\r\n\\]/g, "").slice(0, 70)}" <${address}>`;
export const isEmail = (e) => typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
export const normEmail = (e) => String(e || "").trim().toLowerCase();

/** Not more than one e-mail a minute and 5 in all per invitation (it is recreated when the owner invites again). */
export const RESEND_GAP_MS = 60_000;
export const MAX_SENDS = 5;
export function sendBlock(inv, nowMs) {
  const count = Number(inv?.emailCount) || 0;
  if (count >= MAX_SENDS) return "too-many";
  const last = Date.parse(String(inv?.emailedAt || ""));
  if (last && nowMs - last < RESEND_GAP_MS) return "too-soon";
  return null;
}

const ROLE = { en: { worker: "a worker", admin: "an admin", owner: "an owner" }, es: { worker: "trabajador", admin: "administrador", owner: "dueño" } };

/**
 * The e-mail itself, in the inviter's language. `logoUrl` is shown only when it is an https address (an uploaded logo);
 * every name comes from the database, so everything is escaped.
 * -> { subject, html, text }
 */
export function inviteEmail({ to, companyName, logoUrl, inviterName, role, appUrl, lang }) {
  const es = lang === "es";
  const company = String(companyName || "TradeWorks").slice(0, 120);
  const who = String(inviterName || "").slice(0, 80) || company;
  const r = (es ? ROLE.es : ROLE.en)[role] || (es ? ROLE.es.worker : ROLE.en.worker);
  const signup = `${appUrl}/signup?email=${encodeURIComponent(to)}`;
  const login = `${appUrl}/login`;
  const subject = es ? `${who} te invitó a ${company} en TradeWorks` : `${who} invited you to ${company} on TradeWorks`;
  const lines = es
    ? [`${who} te invitó a unirte a ${company} en TradeWorks como ${r}.`, `1. Crea tu cuenta con este mismo correo (${to}): ${signup}`, `2. Revisa tu correo y confirma tu cuenta (si no lo ves, busca en spam).`, `3. Entra y toca "Unirme". ¿Ya tienes cuenta? Entra aquí: ${login}`]
    : [`${who} invited you to join ${company} on TradeWorks as ${r}.`, `1. Create your account with this same e-mail (${to}): ${signup}`, `2. Check your e-mail and confirm your account (look in spam if you don't see it).`, `3. Sign in and tap "Join". Already have an account? Sign in here: ${login}`];
  const text = lines.join("\n\n");
  const logo = typeof logoUrl === "string" && /^https:\/\/[^\s"'<>]+$/.test(logoUrl)
    ? `<img src="${esc(logoUrl)}" alt="${esc(company)}" height="48" style="height:48px;max-width:200px;object-fit:contain;display:block;margin:0 0 20px">` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#F5F6F8;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0B0D12">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6F8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E6E8EC;border-radius:16px;padding:28px">
<tr><td>${logo}
<h1 style="font-size:20px;line-height:1.35;margin:0 0 12px;font-weight:700">${esc(es ? `Te invitaron a ${company}` : `You're invited to ${company}`)}</h1>
<p style="font-size:15px;line-height:1.55;margin:0 0 20px;color:#4B5263">${esc(es ? `${who} te invitó a unirte a ${company} en TradeWorks como ${r}.` : `${who} invited you to join ${company} on TradeWorks as ${r}.`)}</p>
<p style="margin:0 0 22px"><a href="${esc(signup)}" style="display:inline-block;background:#0B0D12;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${esc(es ? "Crear mi cuenta" : "Create my account")}</a></p>
<p style="font-size:13.5px;line-height:1.55;margin:0 0 8px;color:#4B5263">${esc(es ? `Usa este mismo correo: ${to}. Después confirma tu cuenta con el enlace que te llega (revisa spam), entra y toca "Unirme".` : `Use this same e-mail: ${to}. Then confirm your account with the link you get (check spam), sign in and tap "Join".`)}</p>
<p style="font-size:13.5px;line-height:1.55;margin:0;color:#4B5263">${esc(es ? "¿Ya tienes cuenta?" : "Already have an account?")} <a href="${esc(login)}" style="color:#1E6BFF">${esc(es ? "Entra aquí" : "Sign in here")}</a></p>
</td></tr></table>
<p style="font-size:12px;color:#9097A3;margin:16px 0 0">${esc(es ? "Si no esperabas esta invitación, puedes ignorar este correo." : "If you weren't expecting this invitation, you can ignore this e-mail.")}</p>
</td></tr></table></body></html>`;
  return { subject, html, text };
}
