/**
 * Automatic e-mail reminders — which reminders the daily worker (workers/reminders) e-mails by itself, and their text.
 * Pure: the worker loads the data, calls planEmails(), sends, and logs each one to companies/{cid}/autoemails/{id}
 * so the same reminder is never e-mailed twice. The app reads that log (followUps autoSent) to show "e-mailed" and to
 * keep the item out of "Who to write to today" for a few days, then it comes back for a personal WhatsApp nudge.
 */
import { referralLink } from "./clientProfile";
import { followUps, todayISO, type FollowUp } from "./followups";
import { asInv, type InvoiceRec } from "./invoices";
import { buildMessage, type Business, type TplKey } from "./messages";
import type { Client, Estimate, Invoice, Settings } from "./types";

/** Reminders that may go out automatically (the owner picks which in Settings). Leads, chats and change orders stay manual. */
export const AUTO_KINDS: TplKey[] = ["deposit", "balance", "overdue", "tomorrow", "noview", "viewed", "follow", "review", "refthanks"];
/** Money and schedule reminders: safe to automate. The sales follow-ups (noview / viewed / follow) and review stay opt-in. */
export const DEFAULT_AUTO_KINDS: TplKey[] = ["deposit", "balance", "overdue", "tomorrow"];
/** At most this many e-mails per company per day (a safety net against a data mistake sending dozens). */
export const MAX_PER_RUN = 20;

export const autoKindsOf = (s: Pick<Settings, "autoEmail">): TplKey[] => {
  const k = s.autoEmail?.kinds;
  return Array.isArray(k) ? AUTO_KINDS.filter((x) => k.includes(x)) : DEFAULT_AUTO_KINDS;
};
export const autoEmailOn = (s: Pick<Settings, "autoEmail">) => !!s.autoEmail?.on && autoKindsOf(s).length > 0;

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;
export const isEmail = (v: unknown) => EMAIL.test(String(v ?? "").trim());

/** Log document id for one reminder (Firestore ids may not contain "/"). */
export const autoEmailId = (itemId: string) => itemId.replace(/\//g, "_").slice(0, 300);

export type PlannedEmail = {
  /** followUps item id (also the log id, see autoEmailId). */
  id: string; kind: TplKey; estId?: string; invId?: string;
  to: string; lang: "en" | "es"; subject: string; body: string;
  /** Money reminder whose invoice has no payment link yet: the worker creates one and fills it in (see withPayLink). */
  needsPayLink?: boolean;
};

export type PlanInput = {
  estimates: Estimate[]; clients: Client[]; invoices: Invoice[]; settings: Settings;
  business: Business;
  /** Company id: builds each client's referral link ({reflink}, review requests). */
  companyId?: string;
  /** App address for links (client link, payment link), e.g. https://tradeworks-app.pages.dev */
  origin: string;
  /** Log ids already e-mailed (any status): never again. */
  sent: Set<string>;
  now?: Date;
};

/** How to answer, how to stop these e-mails (the privacy policy says clients may ask) and the company's privacy policy. */
const footer = (inp: Pick<PlanInput, "business" | "companyId" | "origin">, es: boolean) => {
  const b = inp.business, priv = inp.companyId && inp.origin ? `${inp.origin}/privacy/${inp.companyId}` : "";
  return "\n\n—\n" + (es
    ? `Mensaje enviado por ${b.name} con TradeWorks. Para responder, conteste este correo. ¿No quiere recibir estos correos? Responda “stop”.` + (priv ? `\nPolítica de privacidad: ${priv}` : "")
    : `Sent by ${b.name} with TradeWorks. To answer, just reply to this e-mail. Don't want these e-mails? Reply “stop”.` + (priv ? `\nPrivacy policy: ${priv}` : ""));
};

function messageOf(f: FollowUp, inp: PlanInput, inv: InvoiceRec | undefined, payUrl: string) {
  const e = inp.estimates.find((x) => x.id === f.estId) || null;
  const clientId = e?.clientId || f.clientId;
  return buildMessage(f.tpl as TplKey, e, f.lang, {
    settings: inp.settings, business: inp.business, origin: inp.origin, clientName: f.who,
    invoice: inv ? { number: inv.number, amount: inv.amount } : undefined, payUrl,
    friend: f.friend, refUrl: inp.companyId && clientId ? referralLink(inp.origin, inp.companyId, clientId) : undefined,
  }, todayISO(inp.now));
}

/** The client asked to stop automatic e-mails (client profile switch): by their client record, or any record with the same e-mail. */
export function optedOut(f: Pick<FollowUp, "estId" | "clientId" | "email">, inp: Pick<PlanInput, "estimates" | "clients">): boolean {
  const e = f.estId ? inp.estimates.find((x) => x.id === f.estId) : undefined;
  const cid = e?.clientId || f.clientId;
  const mail = String(f.email || "").trim().toLowerCase();
  return inp.clients.some((c) => c.noAutoEmail && ((!!cid && c.id === cid) || (!!mail && String(c.email || "").trim().toLowerCase() === mail)));
}

/** The e-mails to send today for one company, most urgent first, at most MAX_PER_RUN. */
export function planEmails(inp: PlanInput): PlannedEmail[] {
  if (!autoEmailOn(inp.settings)) return [];
  const kinds = new Set<string>(autoKindsOf(inp.settings));
  const items = followUps({ estimates: inp.estimates, clients: inp.clients, settings: inp.settings, invoices: inp.invoices, now: inp.now, lang: "en" });
  const out: PlannedEmail[] = [];
  for (const f of items) {
    if (!f.tpl || f.open || !kinds.has(f.tpl) || !isEmail(f.email) || inp.sent.has(autoEmailId(f.id)) || optedOut(f, inp)) continue;
    const inv0 = f.invId ? inp.invoices.find((v) => v.id === f.invId) : undefined;
    const inv = inv0 ? asInv(inv0) : undefined;
    const token = inv?.pay?.token;
    const payUrl = token ? `${inp.origin}/pay/${token}` : "";
    const m = messageOf(f, inp, inv, payUrl);
    out.push({ id: autoEmailId(f.id), kind: f.tpl, estId: f.estId, invId: f.invId, to: f.email.trim(), lang: f.lang,
      subject: m.subject, body: m.body + footer(inp, f.lang === "es"), needsPayLink: !!inv && !token && ["deposit", "balance", "overdue"].includes(f.tpl) });
    if (out.length >= MAX_PER_RUN) break;
  }
  return out;
}

/** Rebuilds one planned e-mail once its invoice got a payment link (the worker creates the link, then calls this). */
export function withPayLink(p: PlannedEmail, inp: PlanInput, token: string): PlannedEmail {
  const f = followUps({ estimates: inp.estimates, clients: inp.clients, settings: inp.settings, invoices: inp.invoices, now: inp.now, lang: "en" })
    .find((x) => autoEmailId(x.id) === p.id);
  const inv0 = p.invId ? inp.invoices.find((v) => v.id === p.invId) : undefined;
  if (!f || !inv0) return p;
  const m = messageOf(f, inp, asInv(inv0), `${inp.origin}/pay/${token}`);
  return { ...p, subject: m.subject, body: m.body + footer(inp, p.lang === "es"), needsPayLink: false };
}
