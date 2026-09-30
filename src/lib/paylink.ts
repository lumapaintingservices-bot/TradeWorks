/**
 * Invoice payment link (/pay/:token). Pure functions, no I/O.
 *
 * The client never reads the owner's invoice: the owner's app writes a public copy to paylink/{token}
 * = { owner, invId, data: JSON(PayModel), client: { views, paid } }. The client may only add views and say
 * "I paid" (rules); the owner confirms, which marks the invoice paid.
 */
import { invKindLabel, invoiceSheetData, isPaid, type InvoiceRec, type InvoiceSheet } from "./invoices";
import { money, num, r2 } from "./money";
import { payMethodsOf } from "./payMethods";
import type { Brand } from "./portal";
import type { Estimate, Settings } from "./types";

export type PayKind = "zelle" | "venmo" | "cashapp" | "paypal" | "check" | "card" | "cash";
export type PayMethod = { kind: PayKind; to: string; name?: string };

export type PayModel = {
  v: 1;
  inv: { number: string; kind: InvoiceRec["kind"]; date: string; amount: number; paid: boolean; paidDate: string; estNumber: string;
         clientName: string; address: string; titleEn: string; titleEs: string };
  sheet: { en: InvoiceSheet; es: InvoiceSheet };
  lang: "en" | "es";
  business: Brand;
  methods: PayMethod[];
  note: string;
  reviewUrl: string;
};
export type PayClient = { views?: string[]; paid?: { method: string; at: string; note?: string } | null };
export type PayDoc = { id: string; owner: string; invId: string; data: string; client?: PayClient };

/** Handles people type with or without the @ / $ in front; only letters, digits, - and _ survive. */
export const cleanHandle = (v: unknown) => String(v ?? "").trim().replace(/^[@$]+/, "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
/** "paypal.me/luma", "https://www.paypal.me/luma/25" or "luma" -> "luma". */
export const cleanPaypal = (v: unknown) => {
  const s = String(v ?? "").trim();
  const m = /paypal\.me\/([A-Za-z0-9_-]+)/i.exec(s);
  return cleanHandle(m ? m[1] : s);
};

/**
 * Every way this company takes money, in the order the client sees it: the payment-method chips of Settings
 * (settings.payMethods: cash / card / zelle / check, see ./payMethods) plus the app handles (settings.payHandles).
 * Zelle needs an address to be listed; Venmo / Cash App / PayPal are listed when a handle is filled in.
 */
export function payOptionsOf(s: Pick<Settings, "payZelle" | "payZelleName" | "payMethods" | "payHandles">): PayMethod[] {
  const chips = payMethodsOf(s.payMethods), h = s.payHandles || {};
  const out: PayMethod[] = [];
  if (chips.includes("zelle") && String(s.payZelle || "").trim()) out.push({ kind: "zelle", to: String(s.payZelle).trim().slice(0, 120), name: String(s.payZelleName || "").trim().slice(0, 120) });
  if (cleanHandle(h.venmo)) out.push({ kind: "venmo", to: cleanHandle(h.venmo) });
  if (cleanHandle(h.cashapp)) out.push({ kind: "cashapp", to: cleanHandle(h.cashapp) });
  if (cleanPaypal(h.paypal)) out.push({ kind: "paypal", to: cleanPaypal(h.paypal) });
  if (chips.includes("check")) out.push({ kind: "check", to: String(h.checkTo || "").trim().slice(0, 200) });
  if (chips.includes("card")) out.push({ kind: "card", to: "" });
  if (chips.includes("cash")) out.push({ kind: "cash", to: "" });
  return out;
}

/** The app handles as printable lines ("Venmo: @luma"), for the invoice / estimate documents. */
export function payHandleLines(s: Pick<Settings, "payHandles">, es: boolean): string[] {
  const h = s.payHandles || {}, out: string[] = [];
  if (cleanHandle(h.venmo)) out.push("Venmo: @" + cleanHandle(h.venmo));
  if (cleanHandle(h.cashapp)) out.push("Cash App: $" + cleanHandle(h.cashapp));
  if (cleanPaypal(h.paypal)) out.push("PayPal: paypal.me/" + cleanPaypal(h.paypal));
  if (String(h.checkTo || "").trim()) out.push((es ? "Cheques a nombre de: " : "Checks payable to: ") + String(h.checkTo).trim().slice(0, 200));
  return out;
}

export const payKindName = (k: PayKind, es: boolean): string =>
  k === "zelle" ? "Zelle" : k === "venmo" ? "Venmo" : k === "cashapp" ? "Cash App" : k === "paypal" ? "PayPal"
    : k === "check" ? (es ? "Cheque" : "Check") : k === "card" ? (es ? "Tarjeta de crédito" : "Credit card") : (es ? "Efectivo" : "Cash");

/** What the client sees under the method name: "@luma", "$luma", "Pay to: Luma LLC". */
export function payMethodDetail(m: PayMethod, es: boolean): string {
  if (m.kind === "venmo") return "@" + m.to;
  if (m.kind === "cashapp") return "$" + m.to;
  if (m.kind === "paypal") return "paypal.me/" + m.to;
  if (m.kind === "check") return m.to ? (es ? "A nombre de: " : "Pay to: ") + m.to : (es ? "Entréguelo o envíelo por correo" : "Hand it to us or mail it");
  if (m.kind === "card") return es ? "Pídanos el enlace para pagar con tarjeta" : "Ask us for a card payment link";
  if (m.kind === "cash") return es ? "En persona" : "In person";
  return m.to;
}

/** A button that opens the payment app with the amount filled in (null when the method has no app link). */
export function payMethodUrl(m: PayMethod, amount: number, note: string): string | null {
  const amt = r2(Math.max(0, num(amount))).toFixed(2);
  if (m.kind === "venmo") return `https://venmo.com/?txn=pay&audience=private&recipients=${encodeURIComponent(m.to)}&amount=${amt}&note=${encodeURIComponent(note.slice(0, 80))}`;
  if (m.kind === "cashapp") return `https://cash.app/$${encodeURIComponent(m.to)}/${amt}`;
  if (m.kind === "paypal") return `https://paypal.me/${encodeURIComponent(m.to)}/${amt}USD`;
  return null;
}
/** Text the "Copy" button copies (null when there is nothing worth copying). */
export const payMethodCopy = (m: PayMethod): string | null => (m.kind === "cash" || m.kind === "card" || !m.to ? null : m.kind === "venmo" ? "@" + m.to : m.kind === "cashapp" ? "$" + m.to : m.to);

/** Public copy of one invoice. Only what the printed invoice already shows travels (no costs, no notes to the crew). */
export function payModel(v: InvoiceRec, e: Estimate, s: Settings, b: Brand): PayModel {
  const en = invoiceSheetData(v, e, s, "en"), es = invoiceSheetData(v, e, s, "es");
  return {
    v: 1,
    inv: { number: v.number, kind: v.kind, date: v.date, amount: r2(num(v.amount)), paid: isPaid(v), paidDate: isPaid(v) ? v.paidDate || "" : "",
           estNumber: v.estNumber || e.number || "", clientName: e.clientName || v.clientName || "", address: e.address || v.address || "",
           titleEn: en.title || invKindLabel(v, false), titleEs: es.title || invKindLabel(v, true) },
    sheet: { en, es }, lang: e.docLang === "es" ? "es" : "en", business: b,
    methods: payOptionsOf(s), note: String(s.payNote || "").slice(0, 500), reviewUrl: String(s.reviewUrl || "").slice(0, 500),
  };
}

/* Anything a visitor wrote is clipped before it reaches the owner's invoice. */
const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);

/**
 * What the client did on the payment link, as a patch for the owner's invoice. Pure.
 * A claim is applied once (payClaimSeen = its time); an invoice that is already paid ignores it.
 */
export function payApply(v: InvoiceRec, c: PayClient | undefined): Partial<InvoiceRec> | null {
  const patch: Partial<InvoiceRec> = {};
  const views = (c?.views || []).length;
  if (views !== num(v.payViews)) patch.payViews = views;
  const at = c?.paid ? clip(c.paid.at, 40) : "";
  if (at && at !== v.payClaimSeen) {
    patch.payClaimSeen = at;
    if (!isPaid(v)) patch.payClaim = { method: clip(c!.paid!.method, 40), at, note: clip(c!.paid!.note, 300) };
  }
  return Object.keys(patch).length ? patch : null;
}

export function payLinkMessage(v: InvoiceRec, link: string, businessName: string, lang: "en" | "es"): string {
  const first = String(v.clientName || "").split(" ")[0];
  const what = invKindLabel(v, lang === "es").toLowerCase();
  return lang === "es"
    ? `Hola ${first}, aquí está su factura ${v.number} (${what}) por ${money(v.amount)}.\n\nEn este enlace la puede ver y pagar desde el teléfono:\n${link}\n\nGracias,\n${businessName}`
    : `Hi ${first}, here is your invoice ${v.number} (${what}) for ${money(v.amount)}.\n\nYou can view and pay it from your phone here:\n${link}\n\nThank you,\n${businessName}`;
}
