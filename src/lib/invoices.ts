/** Invoices — port of createInvoices / createPlanInvoices / nextInvNumber / syncInvoices / signChangeOrder / jobStatus / invoiceSheet (prototype). Pure functions, no I/O. */
import { calcEstimate, payPlanOn, todayISO, uid } from "./estimate";
import { num, r2 } from "./money";
import type { ChangeOrder, EstStatus, Estimate, Invoice, Settings } from "./types";

export const INV_PREFIX = "INV-";
export type InvKind = "deposit" | "balance" | "full" | "progress" | "co";

/**
 * Invoice record as this module writes it. It is a superset of `Invoice` in types.ts:
 * `full` (one payment) and `progress` (payment stages) kinds, and a snapshot of the client.
 * `status` is "Unpaid" | "Paid" (older "Draft"/"Sent" values are read as unpaid).
 */
export type InvoiceRec = Omit<Invoice, "kind" | "status"> & {
  kind: InvKind; status: "Unpaid" | "Paid" | "Draft" | "Sent";
  estNumber?: string; clientId?: string; clientName?: string; address?: string; phone?: string; email?: string;
  percent?: number; stage?: number; stages?: number; label?: string; labelEs?: string; coN?: number; note?: string;
  /** Public payment link (paylink/{token}), and what the client did on it (src/lib/paylink.ts payApply). */
  pay?: { token: string }; payViews?: number;
  payClaim?: { method: string; at: string; note?: string }; payClaimSeen?: string;
  /** How it was paid (set when the owner confirms a payment). */
  paidMethod?: string;
};
export const asInv = (v: Invoice): InvoiceRec => v as unknown as InvoiceRec;
export const isPaid = (v: Pick<InvoiceRec, "status">) => v.status === "Paid";
export const isChangeInv = (v: Pick<InvoiceRec, "kind">) => v.kind === "co";

/** Display order inside one job (invOrder). */
export function invOrder(v: InvoiceRec): number {
  if (v.kind === "deposit" || v.kind === "full") return 0;
  if (v.kind === "progress") return 1 + num(v.stage);
  if (v.kind === "balance") return 50;
  return 100 + num(v.coN);
}
export const invoicesFor = (all: InvoiceRec[], estId: string) => all.filter((v) => v.estId === estId).sort((a, b) => invOrder(a) - invOrder(b));
export const mainInvoicesFor = (all: InvoiceRec[], estId: string) => invoicesFor(all, estId).filter((v) => !isChangeInv(v));

/** Next invoice counter: settings counter, but never below the highest number already used. */
export function nextInvNumber(s: Pick<Settings, "numbering">, all: Pick<InvoiceRec, "number">[]): number {
  let n = num(s.numbering?.nextInv) || 1001;
  for (const v of all) {
    const str = String(v.number || "");
    if (str.indexOf(INV_PREFIX) !== 0) continue;
    const m = /(\d+)$/.exec(str);
    const k = m ? Number(m[1]) : 0;
    if (k >= n) n = k + 1;
  }
  return n;
}
export const invNumberText = (n: number) => INV_PREFIX + n;

/** Amount of each payment stage; the last one takes the rounding difference (planAmounts). */
export function planAmounts(e: Pick<Estimate, "payPlan">, total: number): number[] {
  let acc = 0;
  const n = e.payPlan.length;
  return e.payPlan.map((st, i) => {
    const a = i === n - 1 ? r2(total - acc) : r2((total * num(st.pct)) / 100);
    acc = r2(acc + a);
    return a;
  });
}

export function makeInvoice(e: Estimate, kind: InvKind, percent: number, amount: number, n: number, over: Partial<InvoiceRec> = {}): InvoiceRec {
  return {
    id: uid("i"), number: invNumberText(n), estId: e.id, estNumber: e.number, clientId: e.clientId, clientName: e.clientName,
    address: e.address, phone: e.phone, email: e.email, kind, percent, amount, date: todayISO(), status: "Unpaid", paidDate: "", ...over,
  };
}

export type CreateResult =
  | { ok: false; reason: "exists" | "empty" }
  | { ok: true; invoices: InvoiceRec[]; nextInv: number; status?: EstStatus };

/** Deposit + balance (or one full invoice, or one per payment stage) for an estimate that has none yet. */
export function createInvoices(e: Estimate, s: Settings, all: InvoiceRec[]): CreateResult {
  if (mainInvoicesFor(all, e.id).length) return { ok: false, reason: "exists" };
  const t = calcEstimate(e, s);
  if (t.total <= 0) return { ok: false, reason: "empty" };
  const n = nextInvNumber(s, all);
  const out: InvoiceRec[] = [];
  if (payPlanOn(e)) {
    const amts = planAmounts(e, t.total);
    e.payPlan.forEach((st, i) => out.push(makeInvoice(e, "progress", num(st.pct), amts[i], n + i, { stage: i, stages: e.payPlan.length, label: st.label, labelEs: st.labelEs || st.label })));
  } else if (t.deposit > 0 && t.balance > 0) {
    out.push(makeInvoice(e, "deposit", t.depositPct, t.deposit, n), makeInvoice(e, "balance", 100 - t.depositPct, t.balance, n + 1));
  } else out.push(makeInvoice(e, "full", 100, t.total, n));
  const accept = e.status === "Draft" || e.status === "Sent" || e.status === "Viewed";
  return { ok: true, invoices: out, nextInv: n + out.length, status: accept ? "Accepted" : undefined };
}

/** New amounts for unpaid invoices after the estimate changed (syncInvoices). Returns only the invoices that changed. */
export function syncInvoiceAmounts(e: Estimate, s: Settings, all: InvoiceRec[]): InvoiceRec[] {
  const t = calcEstimate(e, s), out: InvoiceRec[] = [];
  for (const v of invoicesFor(all, e.id)) {
    if (isPaid(v) || isChangeInv(v)) continue;
    const next = { ...v, clientId: e.clientId, clientName: e.clientName, address: e.address, phone: e.phone, email: e.email, estNumber: e.number };
    if (v.kind === "progress") {
      if (payPlanOn(e)) { const pa = planAmounts(e, t.total)[num(v.stage)]; if (pa !== undefined) next.amount = pa; }
    } else {
      next.amount = v.kind === "deposit" ? t.deposit : v.kind === "balance" ? t.balance : t.total;
      next.percent = v.kind === "deposit" ? t.depositPct : v.kind === "balance" ? 100 - t.depositPct : 100;
    }
    if (JSON.stringify(next) !== JSON.stringify(v)) out.push(next);
  }
  return out;
}

/** Sum of signed change orders (coSignedTotal). */
export const coSignedTotal = (e: Pick<Estimate, "changeOrders">): number => r2((e.changeOrders || []).filter((c) => c.status === "signed").reduce((a, c) => a + num(c.amount), 0));
/** Contract total = estimate total + signed change orders. */
export const contractTotal = (e: Estimate, s: Settings) => r2(calcEstimate(e, s).total + coSignedTotal(e));
export const changeInvoiceId = (coId: string) => "i-co-" + coId;
export const changeInvoiceFor = (all: InvoiceRec[], co: ChangeOrder) => all.find((v) => isChangeInv(v) && (v.coId === co.id || (co.id && v.id === changeInvoiceId(co.id)))) || null;

/** Signed change orders that still have no invoice. */
export const changesToInvoice = (e: Estimate, all: InvoiceRec[]) => (e.changeOrders || []).filter((c) => c.status === "signed" && num(c.amount) > 0 && !changeInvoiceFor(all, c));

/** Invoice for one signed change order. Deterministic id, so creating it twice never duplicates. */
export function makeChangeInvoice(e: Estimate, co: ChangeOrder, n: number): InvoiceRec {
  return makeInvoice(e, "co", 0, r2(co.amount), n, { id: changeInvoiceId(co.id || uid("co")), coId: co.id, coN: co.n });
}

/** Marks a change order signed (signChangeOrder). Returns the updated estimate pieces. */
export function signChange(e: Estimate, co: ChangeOrder, name: string, opts: { img?: string; via?: string } = {}): ChangeOrder[] {
  return (e.changeOrders || []).map((c) => (c.id === co.id && c.n === co.n && c.status !== "signed"
    ? { ...c, status: "signed", signedName: name, signedAt: todayISO(), ...(opts.img ? { sigImg: opts.img } : {}), via: opts.via || "here" } as ChangeOrder : c));
}
export const nextChangeNumber = (e: Pick<Estimate, "changeOrders">) => (e.changeOrders || []).reduce((m, c) => Math.max(m, num(c.n)), 0) + 1;

const PAID_STAGE: EstStatus[] = ["Deposit Paid", "Paid in Full"];
/**
 * Estimate status after an invoice was paid, un-paid or deleted. Returns null when nothing should change.
 * Every payment stage paid and every signed change order paid -> Paid in Full; first payment (deposit) paid -> Deposit Paid;
 * nothing paid any more -> back to Accepted.
 */
export function statusAfterPayment(e: Pick<Estimate, "id" | "status" | "changeOrders">, all: InvoiceRec[]): EstStatus | null {
  if (e.status === "Declined") return null;
  const invs = all.filter((v) => v.estId === e.id);
  const mains = invs.filter((v) => !isChangeInv(v));
  if (!mains.length) return null;
  const signed = (e.changeOrders || []).filter((c) => c.status === "signed");
  const coPaid = signed.every((c) => invs.some((v) => isChangeInv(v) && v.coId === c.id && isPaid(v)));
  if (mains.every(isPaid) && coPaid) return "Paid in Full";
  if (mains.some(isPaid)) return "Deposit Paid";
  return PAID_STAGE.includes(e.status) ? "Accepted" : null;
}

/** Kind text used in lists: "Deposit · 50%", "Change order #2". */
export function invKindLabel(v: InvoiceRec, es: boolean): string {
  if (v.kind === "deposit") return es ? "Depósito" : "Deposit";
  if (v.kind === "balance") return es ? "Saldo" : "Balance";
  if (v.kind === "progress") return (es ? v.labelEs || v.label : v.label) || (es ? "Pago" : "Payment");
  if (v.kind === "co") return (es ? "Orden de cambio #" : "Change order #") + (v.coN || "");
  return es ? "Total" : "Full";
}
export const invKindText = (v: InvoiceRec, es: boolean) => (v.kind === "co" ? invKindLabel(v, es) : `${invKindLabel(v, es)} · ${num(v.percent)}%`);

/* -------------------- printable invoice data (invoiceSheet / changeInvoiceSheet) -------------------- */
export type SheetLine = { label: string; qty: number; unit: string; rate: number; amount: number };
export type SheetTotal = { label: string; amount?: number; tone?: "credit" | "grand" | "due" | "note" };
export type InvoiceSheet = {
  kind: InvKind; title: string; lines: SheetLine[]; totals: SheetTotal[]; dueNow: number;
  coDesc?: string; coApproved?: { name: string; date: string; img?: string };
};

export function invoiceSheetData(v: InvoiceRec, e: Estimate, s: Settings, lang: "en" | "es"): InvoiceSheet {
  const es = lang === "es", T = (a: string, b: string) => (es ? b : a);
  const title = invKindLabel(v, es);
  if (v.kind === "co") {
    const co = (e.changeOrders || []).find((c) => c.id === v.coId || c.n === v.coN);
    const desc = co ? (es ? co.descEs || co.desc : co.desc || co.descEs) : "";
    return {
      kind: "co", title, lines: [], dueNow: r2(v.amount), coDesc: desc || title,
      totals: [{ label: T("Due now", "A pagar ahora"), amount: r2(v.amount), tone: "due" }],
      coApproved: co && co.signedName ? { name: co.signedName, date: co.signedAt || "", img: co.sigImg } : undefined,
    };
  }
  const t = calcEstimate(e, s);
  const cabLabel = (k: string) => {
    const p = s.pricing;
    if (k === "door") return es ? (e.frameMode === "included" ? p.doorLabelEs : p.doorLabelNoFrameEs) : e.frameMode === "included" ? p.doorLabel : p.doorLabelNoFrame;
    if (k === "drawer") return es ? p.drawerLabelEs : p.drawerLabel;
    if (k === "frame") return es ? p.frameLabelEs : p.frameLabel;
    return es ? p.boxLabelEs : p.boxLabel;
  };
  const isHidden = (l: (typeof t.lines)[number]) => l.kind === "custom" && !!(l.item as { hidden?: boolean }).hidden;
  const lines: SheetLine[] = t.lines.filter((l) => !isHidden(l)).map((l) => {
    const it = l.item as { desc: string; descEs: string; unit?: string } | undefined;
    return { label: it ? (es ? it.descEs || it.desc : it.desc || it.descEs) : cabLabel(l.kind), qty: Math.round(l.qty * 100) / 100, unit: it?.unit || "", rate: l.rate, amount: l.amount };
  });
  const hidden = r2(t.lines.filter(isHidden).reduce((a, l) => a + l.amount, 0));
  if (hidden > 0) lines.push({ label: T("Additional work", "Trabajo adicional"), qty: 1, unit: "", rate: hidden, amount: hidden });
  if (t.materialsAdded > 0) lines.push({ label: T("Materials", "Materiales"), qty: 1, unit: "", rate: t.materialsAdded, amount: t.materialsAdded });

  const totals: SheetTotal[] = [{ label: T("Subtotal", "Subtotal"), amount: t.subtotal }];
  if (t.discAmt > 0) totals.push({ label: es ? t.discLabelEs : t.discLabel, amount: -t.discAmt, tone: "credit" });
  if (e.taxEnabled) totals.push({ label: `${T("Tax", "Impuesto")} ${num(e.taxRate)}%`, amount: t.taxAmt });
  totals.push({ label: T("Job total", "Total del trabajo"), amount: t.total, tone: "grand" });
  if (v.kind === "balance") totals.push({ label: `${T("Less deposit", "Menos depósito")} (${num(t.depositPct)}%)`, amount: -t.deposit, tone: "credit" });
  else if (v.kind === "deposit") totals.push({ label: T("Balance due later", "Saldo pendiente"), amount: t.balance });
  if (v.kind === "progress") totals.push({ label: `${invKindLabel(v, es)} (${num(v.percent)}%) · ${num(v.stage) + 1} / ${num(v.stages) || 1}`, tone: "note" });
  totals.push({ label: T("Due now", "A pagar ahora"), amount: r2(v.amount), tone: "due" });
  return { kind: v.kind, title: v.kind === "deposit" ? T("Deposit invoice", "Factura de depósito") : v.kind === "balance" ? T("Balance invoice", "Factura de saldo") : v.kind === "full" ? T("Invoice", "Factura") : title, lines, totals, dueNow: r2(v.amount) };
}
