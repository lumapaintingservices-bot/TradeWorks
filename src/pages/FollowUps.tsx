import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useClients, useCollection, useEstimates, useInvoices, useSettings } from "../data/hooks";
import { payLinkOf } from "../data/paylinks";
import type { Rec } from "../data/repo";
import { useT } from "../i18n";
import { followUps, leadClients, snoozeDate, type FollowUp } from "../lib/followups";
import { fmtDate } from "../lib/format";
import { asInv, type InvoiceRec } from "../lib/invoices";
import { buildMessage, coMessage, mailUrl, smsUrl, waUrl, type MsgCtx, type TplKey } from "../lib/messages";
import type { Client, Estimate } from "../lib/types";
import { useUi } from "../store/ui";
import { Modal } from "../ui/Modal";
import "./FollowUps.css";

type Snz = { snooze?: Record<string, string> };
/** companies/{cid}/autoemails/{id}, written by the daily reminders worker (workers/reminders). */
type AutoLog = { item?: string; status?: string; sentAt?: string; to?: string; kind?: string };

/** Everything the follow-up UI needs, computed once from the live collections. */
export function useFollowUps() {
  const lang = useUi((s) => s.lang);
  const { company } = useAuth();
  const { rows: estimates, save: saveEst } = useEstimates();
  const { rows: clients, save: saveClient } = useClients();
  const { rows: invoices } = useInvoices();
  const { settings } = useSettings();
  const { rows: sentLog } = useCollection<Rec & AutoLog>("autoemails");
  // reminders the daily worker already e-mailed: item id -> day sent
  const autoSent = useMemo(() => Object.fromEntries(sentLog.filter((r) => r.status === "sent" && r.item).map((r) => [r.item!, String(r.sentAt || "").slice(0, 10)])), [sentLog]);
  const items = useMemo(() => followUps({ estimates, clients, settings, invoices, lang, autoSent }), [estimates, clients, settings, invoices, lang, autoSent]);
  const ctx = useMemo<MsgCtx>(() => ({ settings, business: { name: company?.name || "", phone: company?.phone || "", email: company?.email || "", website: company?.website || "" } }), [settings, company]);
  return { items, ctx, estimates, clients, invoices, settings, saveEst, saveClient, leads: leadClients(clients, estimates) };
}

/** Counts for the nav badges: Dashboard = follow-ups, Pipeline = leads waiting for an estimate. */
export function useNavBadges() {
  const { items, leads } = useFollowUps();
  return { dashboard: items.length, pipeline: leads.length };
}

/** Message text for one item, in the client's language. Money reminders carry the invoice and its payment link. */
function messageFor(f: FollowUp, ctx: MsgCtx, est?: Estimate, client?: Client, inv?: InvoiceRec): { subject: string; body: string } | null {
  if (f.kind === "co" && est) {
    const co = (est.changeOrders || []).find((c) => String(c.id ?? c.n) === f.coId);
    return co ? { subject: `${f.lang === "es" ? "Cambio" : "Change order"} #${co.n} — ${ctx.business.name}`, body: coMessage(est, co, f.lang, ctx) } : null;
  }
  if (!f.tpl) return null;
  return buildMessage(f.tpl as TplKey, est || null, f.lang, { ...ctx, clientName: client?.name || f.who,
    invoice: inv ? { number: inv.number, amount: inv.amount } : undefined, payUrl: inv?.pay?.token ? payLinkOf(inv.pay.token) : undefined });
}

export function FollowUpList({ limit = 5, title = true }: { limit?: number; title?: boolean }) {
  const t = useT();
  const nav = useNavigate();
  const toast = useUi((s) => s.toast);
  const lang = useUi((s) => s.lang);
  const { items, ctx, estimates, clients, invoices, saveEst, saveClient } = useFollowUps();
  const [all, setAll] = useState(false);
  const [msg, setMsg] = useState<FollowUp | null>(null);
  const shown = all ? items : items.slice(0, limit);

  const estOf = (f: FollowUp) => estimates.find((e) => e.id === f.estId);
  const clientOf = (f: FollowUp) => clients.find((c) => c.id === (f.clientId || estOf(f)?.clientId));
  const invOf = (f: FollowUp) => { const v = f.invId ? invoices.find((x) => x.id === f.invId) : undefined; return v ? asInv(v) : undefined; };

  /** "Done / hide 3 days": snoozes the item and notes it on the estimate. */
  async function done(f: FollowUp, via = "") {
    const until = snoozeDate();
    const e = estOf(f);
    if (e) {
      const next: Estimate = { ...e, snooze: { ...(e.snooze || {}), [f.key]: until } };
      if (f.key === "review") next.reviewAsked = true;
      if (f.key === "warranty") next.warrantyChecked = true;
      next.activity = [...(e.activity || []), { at: new Date().toISOString(), text: t("Follow-up", "Seguimiento") + (via ? ` (${via})` : "") + ": " + f.title }].slice(-100);
      await saveEst(next as never);
    } else {
      const c = clientOf(f);
      if (c) await saveClient({ ...c, snooze: { ...((c as Snz).snooze || {}), [f.key]: until } } as never);
    }
  }
  const open = (f: FollowUp) => (f.estId ? nav(`/estimates/${f.estId}`) : nav(`/estimates?new=1&client=${f.clientId}`));

  return (
    <section className="card fu-card" id="followCard">
      {title && (
        <div className="card-h"><h2>{t("Who to write to today", "A quién escribirle hoy")}{items.length > 0 && <span className="n"> · {items.length}</span>}</h2></div>
      )}
      <div className="fu-intro">{t("The app checks every client and tells you who to write to. The message is already written in their language; you just hit send.",
        "La app revisa cada cliente y te dice a quién escribirle. El mensaje ya va escrito en su idioma; tú solo le das enviar.")}</div>
      {shown.length === 0 && <div className="fu-empty">{t("Nobody waiting today — you are up to date.", "Nadie pendiente hoy — estás al día.")}</div>}
      {shown.map((f) => {
        const e = estOf(f), c = clientOf(f), m = f.open ? null : messageFor(f, ctx, e, c, invOf(f));
        return (
          <div className="fu-row" key={f.id}>
            <span className="fu-sw" style={{ background: f.color }} />
            <div className="fu-main">
              <div className="fu-t">{f.title}{f.emailed && <span className="fu-mailed">✉ {t("e-mailed", "correo enviado")} {fmtDate(f.emailed, lang)}</span>}</div>
              <div className="fu-s"><b>{f.who || "—"}</b>{f.number ? ` · ${f.number}` : ""} — {f.detail}</div>
              <div className="fu-act">
                {m && f.phone && <a className="btn sm wa" href={waUrl(f.phone, m.body)} target="_blank" rel="noopener noreferrer" onClick={() => done(f, "WhatsApp")}>WhatsApp</a>}
                {m && <button className="btn sm" onClick={() => setMsg(f)}>{t("Message", "Mensaje")}</button>}
                <button className="btn sm" onClick={() => open(f)}>{f.estId ? t("Open", "Abrir") : t("Estimate", "Presupuesto")}</button>
                {f.kind !== "chat" && (
                  <button className="btn sm" title={t("Hide for 3 days", "Esconder 3 días")} onClick={async () => { await done(f); toast(t("Hidden for 3 days", "Escondido 3 días")); }}>{t("Snooze", "Posponer")}</button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {items.length > limit && (
        <div className="fu-more"><button className="btn" onClick={() => setAll(!all)}>{all ? t("Show fewer", "Ver menos") : t(`Show all (${items.length})`, `Ver todos (${items.length})`)}</button></div>
      )}
      {msg && <MessageModal f={msg} ctx={ctx} est={estOf(msg)} client={clientOf(msg)} inv={invOf(msg)} onClose={() => setMsg(null)} onSent={(via) => { done(msg, via); setMsg(null); }} />}
    </section>
  );
}

/** Small editor: the filled template, editable, then WhatsApp / SMS / Email / Copy. */
function MessageModal({ f, ctx, est, client, inv, onClose, onSent }: { f: FollowUp; ctx: MsgCtx; est?: Estimate; client?: Client; inv?: InvoiceRec; onClose(): void; onSent(via: string): void }) {
  const t = useT();
  const toast = useUi((s) => s.toast);
  const init = messageFor(f, ctx, est, client, inv) || { subject: "", body: "" };
  const [subject, setSubject] = useState(init.subject);
  const [body, setBody] = useState(init.body);
  const email = est?.email || client?.email || f.email;
  const copy = async () => { try { await navigator.clipboard.writeText(body); toast(t("Copied", "Copiado")); } catch { window.prompt(t("Copy this text", "Copia este texto"), body); } };
  return (
    <Modal title={`${t("Message", "Mensaje")} — ${f.who}${f.number ? " · " + f.number : ""}`} onClose={onClose}>
      <div className="fu-note">{t(`Written in this client's language (${f.lang === "es" ? "Español" : "English"}). Edit anything before sending.`,
        `Escrito en el idioma de este cliente (${f.lang === "es" ? "Español" : "English"}). Cambia lo que quieras antes de enviar.`)}</div>
      <label className="f">{t("Subject (email)", "Asunto (correo)")}<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
      <label className="f">{t("Message", "Mensaje")}<textarea rows={11} value={body} onChange={(e) => setBody(e.target.value)} style={{ fontSize: 13.5 }} /></label>
      <div className="fu-send">
        {f.phone && <a className="btn wa" href={waUrl(f.phone, body)} target="_blank" rel="noopener noreferrer" onClick={() => onSent("WhatsApp")}>WhatsApp</a>}
        {f.phone && <a className="btn" href={smsUrl(f.phone, body)} onClick={() => onSent("SMS")}>SMS</a>}
        {email && <a className="btn" href={mailUrl(email, subject, body)} onClick={() => onSent("Email")}>{t("Email", "Correo")}</a>}
        <button className="btn" onClick={copy}>{t("Copy", "Copiar")}</button>
      </div>
      {!f.phone && !email && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{t("This client has no phone or email saved.", "Este cliente no tiene teléfono ni correo guardado.")}</p>}
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>{t("These open your own messaging app with the text already filled in — nothing is sent automatically.", "Esto abre tu propia app de mensajes con el texto ya escrito — no se envía nada automáticamente.")}</p>
    </Modal>
  );
}

export default FollowUpList;
