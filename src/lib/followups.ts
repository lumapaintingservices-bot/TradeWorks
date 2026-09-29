/** Follow-ups ("who to write to today") — pure port of followUpsV4() plus the small date/status helpers it needs. */
import { calcEstimate } from "./estimate";
import { fmtDate } from "./format";
import { money, num } from "./money";
import type { TplKey } from "./messages";
import type { Client, EstStatus, Estimate, Invoice, Settings } from "./types";

/* ---------------- date helpers (ports of todayISO / addDaysISO / daysBetween) ---------------- */
const p2 = (n: number) => (n < 10 ? "0" : "") + n;
export const todayISO = (now: Date = new Date()) => `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
export function addDaysISO(iso: string | undefined, days: number): string {
  const p = String(iso || todayISO()).split("-");
  const d = new Date(num(p[0]), num(p[1]) - 1, num(p[2]));
  d.setDate(d.getDate() + num(days));
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
export function daysBetween(a?: string, b?: string): number {
  const pa = String(a || "").split("-"), pb = String(b || "").split("-");
  if (pa.length !== 3 || pb.length !== 3) return 0;
  return Math.round((Date.UTC(num(pb[0]), num(pb[1]) - 1, num(pb[2])) - Date.UTC(num(pa[0]), num(pa[1]) - 1, num(pa[2]))) / 86400000);
}
/** YYYY-MM-DD out of an ISO string, a "YYYY-MM-DD", or a Firestore Timestamp; "" when unknown. */
export function dayOf(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  const o = v as { toDate?: () => Date; seconds?: number };
  if (typeof o.toDate === "function") return todayISO(o.toDate());
  if (typeof o.seconds === "number") return todayISO(new Date(o.seconds * 1000));
  return "";
}
/** "Sep 3, 8:15 PM" (port of fmtWhen). */
export function fmtWhen(iso?: string, lang: "en" | "es" = "en"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/* ---------------- job status (port of jobStatus: invoices override the estimate's own status) ---------------- */
export const invoicesOf = (invoices: Invoice[], estId: string) => invoices.filter((v) => v.estId === estId);
export const mainInvoicesOf = (invoices: Invoice[], estId: string) => invoicesOf(invoices, estId).filter((v) => v.kind !== "co");
export function jobStatus(e: Estimate, invoices: Invoice[] = []): EstStatus {
  const invs = invoicesOf(invoices, e.id);
  if (invs.length) {
    if (invs.every((v) => v.status === "Paid")) return "Paid in Full";
    if (invs.some((v) => v.status === "Paid")) return "Deposit Paid";
  }
  return e.status || "Draft";
}

/* ---------------- leads ---------------- */
/** Clients with no estimate that were not taken off the pipeline (port of leadClients). */
export function leadClients<C extends Client>(clients: C[], estimates: { clientId: string }[]): C[] {
  const has = new Set(estimates.map((e) => e.clientId));
  return clients.filter((c) => !c.archived && !has.has(c.id));
}
/** Leads taken off the pipeline with the X (port of archivedLeads), newest first. */
export function archivedLeads<C extends Client>(clients: C[], estimates: { clientId: string }[]): C[] {
  const has = new Set(estimates.map((e) => e.clientId));
  const at = (c: C) => String((c as { archivedAt?: string }).archivedAt || dayOf(c.updatedAt) || dayOf(c.createdAt) || "");
  return clients.filter((c) => c.archived && !has.has(c.id)).sort((a, b) => at(b).localeCompare(at(a)));
}

/* ---------------- wording ---------------- */
/** "opened once / twice / 5 times", with when it was last. */
export function openedText(n: number, when?: string, lang: "en" | "es" = "en", cap = false): string {
  n = num(n);
  const es = lang === "es";
  const base = es ? (n === 1 ? "lo abrió una vez" : n === 2 ? "lo abrió dos veces" : `lo abrió ${n} veces`)
    : (n === 1 ? "opened once" : n === 2 ? "opened twice" : `opened ${n} times`);
  const tail = when ? (n === 1 ? (es ? ` el ${when}` : ` on ${when}`) : (es ? `, la última ${when}` : `, last ${when}`)) : "";
  const t = base + tail;
  return cap ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/* ---------------- follow-ups ---------------- */
export type FollowKind = "lead" | "chat" | "noview" | "viewed" | "follow" | "deposit" | "co" | "payclaim" | "balance" | "review" | "warranty";
export type FollowUp = {
  /** Unique per item: "{estId|clientId}:{key}". */
  id: string;
  /** Snooze key (estimate.snooze[key] / client.snooze[key]); "co{id}" for change orders. */
  key: string;
  kind: FollowKind;
  estId?: string; clientId?: string; coId?: string;
  /** CSS colour token for the little bar on the left. */
  color: string;
  /** Urgency, biggest first. */
  sort: number;
  title: string; detail: string;
  /** Message template key (see messages.ts); absent when there is nothing to write (chat, payclaim). */
  tpl?: TplKey;
  /** True when the owner has to open the estimate instead of writing (chat, payclaim). */
  open?: boolean;
  who: string; phone: string; email: string; number?: string; lang: "en" | "es";
};
export const DEFAULT_FOLLOWUP_DAYS = 5;
export const SNOOZE_DAYS = 3;
type Snoozable = { snooze?: Record<string, string> };
export const isSnoozed = (o: Snoozable, key: string, today: string) => !!(o.snooze && o.snooze[key] && o.snooze[key] > today);
/** The ISO date a "Done / hide" click hides an item until. */
export const snoozeDate = (now: Date = new Date(), days = SNOOZE_DAYS) => addDaysISO(todayISO(now), days);

export type FollowUpInput = {
  estimates: Estimate[]; clients: Client[]; settings: Settings;
  /** Needed for deposit / balance / paid rules; without it estimates keep their own status. */
  invoices?: Invoice[];
  now?: Date; lang?: "en" | "es";
};

export function followUps({ estimates, clients, settings, invoices = [], now = new Date(), lang = "en" }: FollowUpInput): FollowUp[] {
  const es = lang === "es", L = (en: string, sp: string) => (es ? sp : en);
  const today = todayISO(now), limit = num(settings.followUpDays) || DEFAULT_FOLLOWUP_DAYS;
  const out: FollowUp[] = [];
  const byId = new Map(clients.map((c) => [c.id, c]));

  leadClients(clients, estimates).forEach((c) => {
    const d = daysBetween(dayOf(c.createdAt) || today, today);
    if (d >= 1 && !isSnoozed(c as Snoozable, "lead", today))
      out.push({ id: `${c.id}:lead`, key: "lead", kind: "lead", clientId: c.id, color: "var(--ink-3)", sort: d, tpl: "lead",
        title: L("New lead waiting", "Lead nuevo esperando"), detail: L(`${d} days, no estimate yet`, `${d} días, sin estimado`),
        who: c.name || "", phone: c.phone || "", email: c.email || "", lang: c.lang === "es" ? "es" : "en" });
  });

  estimates.forEach((e) => {
    const cl = byId.get(e.clientId);
    const base = { estId: e.id, who: (cl && cl.name) || e.clientName || "", phone: e.phone || (cl && cl.phone) || "", email: e.email || (cl && cl.email) || "",
      number: e.number, lang: (e.docLang || (cl && cl.lang) || "en") as "en" | "es" };
    const push = (key: string, kind: FollowKind, f: Omit<FollowUp, "id" | "key" | "kind" | "estId" | "who" | "phone" | "email" | "number" | "lang">) =>
      out.push({ id: `${e.id}:${key}`, key, kind, ...base, ...f });
    const st = jobStatus(e, invoices), t = calcEstimate(e, settings), main = mainInvoicesOf(invoices, e.id);
    const dfmt = (iso: string) => fmtDate(iso, lang);

    if (num(e.chatUnread))
      push("chat", "chat", { color: "var(--bad)", open: true, sort: 999, title: L("New message from the client", "Mensaje nuevo del cliente"),
        detail: String(((e.chat || []).slice(-1)[0] || { text: "" }).text || "").slice(0, 80) });

    if ((st === "Sent" || st === "Viewed") && !e.signature) {
      const d = daysBetween(e.sentAt || e.date, today), views = (e.portalViews || []).length;
      if (e.portal && !views && d >= 2 && !isSnoozed(e, "noview", today))
        push("noview", "noview", { tpl: "noview", color: "var(--acc)", sort: d, title: L("Hasn't opened the link", "No ha abierto el enlace"),
          detail: L(`sent ${d} days ago, ${money(t.total)}`, `enviado hace ${d} días, ${money(t.total)}`) });
      else if (views && d >= 2 && !isSnoozed(e, "viewed", today)) {
        const last = (e.portalViews || [])[views - 1];
        push("viewed", "viewed", { tpl: "viewed", color: "var(--warn)", sort: d + 5, title: L("Viewed it, hasn't signed", "Lo vio y no ha firmado"),
          detail: openedText(views, fmtWhen(last, lang), lang) });
      } else if (!e.portal && d >= limit && !isSnoozed(e, "follow", today))
        push("follow", "follow", { tpl: "follow", color: "var(--ink-3)", sort: d, title: L("No answer yet", "Sin respuesta"),
          detail: L(`sent ${d} days ago, ${money(t.total)}`, `enviado hace ${d} días, ${money(t.total)}`) });
    }

    if (st === "Accepted" && !isSnoozed(e, "deposit", today)) {
      const first = main.find((v) => v.kind === "deposit") || main[0];
      if (!first || first.status !== "Paid")
        push("deposit", "deposit", { tpl: "deposit", color: "var(--icon-teal)", sort: 50, title: L("Collect the deposit", "Cobrar el depósito"),
          detail: money(first ? first.amount : t.deposit) + (e.startDate ? ", " + L("starts", "empieza") + " " + dfmt(e.startDate) : "") });
    }

    (e.changeOrders || []).forEach((co) => {
      const key = "co" + (co.id ?? co.n);
      if (co.status !== "signed" && num(co.amount) > 0 && !isSnoozed(e, key, today))
        push(key, "co", { coId: String(co.id ?? co.n), color: "var(--icon-teal)", sort: 60,
          title: L(`Change #${co.n} waiting for signature`, `Cambio #${co.n} esperando firma`),
          detail: (es ? co.descEs || co.desc : co.desc || co.descEs) + ", " + money(co.amount) });
    });

    if (e.payClaim && st === "Accepted" && !isSnoozed(e, "payclaim", today))
      push("payclaim", "payclaim", { color: "var(--ok)", open: true, sort: 900, title: L("Confirm the deposit", "Confirmar el depósito"),
        detail: L(`client says it was sent by ${e.payClaim.method || ""}`, `el cliente dice que lo envió por ${e.payClaim.method || ""}`) });

    const endD = e.startDate ? addDaysISO(e.startDate, Math.max(1, num(e.days) || 1) - 1) : "";
    if (st === "Deposit Paid" && endD && endD < today && !isSnoozed(e, "balance", today)) {
      const bal = main.filter((v) => v.status !== "Paid").slice(-1)[0];
      const paid = invoicesOf(invoices, e.id).reduce((a, v) => a + (v.status === "Paid" ? num(v.amount) : 0), 0);
      push("balance", "balance", { tpl: "balance", color: "var(--acc)", sort: 55, title: L("Collect the balance", "Cobrar el saldo"),
        detail: money(bal ? bal.amount : Math.max(0, t.total - paid)) + " · " + L("job ended", "el trabajo terminó") + " " + dfmt(endD) });
    }

    if (st === "Paid in Full" && e.reviewAsked && !e.warrantyChecked && (endD || e.date) && daysBetween(endD || e.date, today) >= 330 && !isSnoozed(e, "warranty", today))
      push("warranty", "warranty", { tpl: "warranty", color: "var(--icon-purple)", sort: 2, title: L("Warranty check-in", "Revisión de garantía"),
        detail: L("about a year since the job", "cerca de un año desde el trabajo") });

    if (st === "Paid in Full" && !e.reviewAsked && !isSnoozed(e, "review", today))
      push("review", "review", { tpl: "review", color: "var(--ink)", sort: 1, title: L("Ask for a Google review", "Pedir reseña en Google"),
        detail: L("job paid in full", "trabajo pagado completo") });
  });

  return out.sort((a, b) => b.sort - a.sort);
}
