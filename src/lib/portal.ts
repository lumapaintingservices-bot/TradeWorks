/** Client link (portal) logic — port of portalSnapshot / portalApply from the prototype. */
import { calcEstimate, findDiscount, servicesLine } from "./estimate";
import { num } from "./money";
import type { ChatMsg, Estimate, Settings } from "./types";

/** Fields that must never reach the client's phone. */
export const PORTAL_STRIP = ["expenses", "actualPrimerGal", "actualPaintGal", "actualMaterialCost", "activity", "snooze", "portalSeen",
  "chat", "chatUnread", "extraHrs", "crewNotes", "leadSource", "portalViews", "reviewAsked", "portal", "laborMode", "payClaim", "createdAt", "updatedAt", "companyId"];

export type Brand = { name: string; phone: string; email: string; website: string; area: string; logoUrl: string; brandColor: string };
export type PortalModel = {
  v: 1; e: Estimate;
  s: { business: Brand; pricing: Settings["pricing"]; tax: Settings["tax"]; discounts: Settings["discounts"];
       showcase?: { id: string; url: string; caption: string }[];
       services?: { en: string; es: string };
       reviewUrl: string; websiteUrl: string; instagramUrl: string; payZelle: string; payZelleName: string; payNote: string };
};
export type ClientState = {
  views?: string[]; picks?: Record<string, boolean>; sign?: { name: string; img: string; at: string; total: number };
  chat?: ChatMsg[]; paid?: { method: string; at: string };
  /** Change orders the client approved on the link, by change order id. */
  coSign?: Record<string, { name: string; img: string; at: string }>;
};
export type PortalDoc = { id: string; owner: string; estId: string; number?: string; data: string; client?: ClientState };

export function newToken(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const arr = new Uint32Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => a.charAt(n % a.length)).join("");
}

export function portalSnapshot(e: Estimate, s: Settings, b: Brand, extra: { reviewUrl?: string; websiteUrl?: string; instagramUrl?: string } = {}): PortalModel {
  const x = JSON.parse(JSON.stringify(e)) as Estimate;
  PORTAL_STRIP.forEach((k) => delete (x as unknown as Record<string, unknown>)[k]);
  if (!x.showMaterials) x.materialsList = [];
  // job photos travel only when shown on the link, and only what the client needs (no storage paths, no showcase flags)
  x.photos = e.showPhotos ? (e.photos || []).filter((ph) => ph.url).map((ph) => ({ id: ph.id, kind: ph.kind || "", caption: ph.caption || "", url: ph.url })) : [];
  x.showPhotos = !!(e.showPhotos && x.photos.length);
  // job-day work data (checklist ticks, crew tasks, paint colors) stays with the contractor
  delete x.check; delete x.jobTasks; delete x.colors;
  // hidden lines travel only as numbers: the total adds up but the client never gets the wording
  x.items = (x.items || []).map((it) => (it.hidden ? { id: it.id, qty: num(it.qty), rate: num(it.rate), hidden: true, desc: "", descEs: "", unit: "" } : it));
  if (x.signature) x.signature = { name: x.signature.name || "", img: "", date: x.signature.date || "", via: "", at: "" };
  // change orders travel without images; drafts stay private until the owner sends them
  x.changeOrders = (e.changeOrders || []).filter((c) => c.id && c.status !== "draft").map((c) => ({
    id: c.id, n: c.n, desc: c.desc || "", descEs: c.descEs || "", amount: num(c.amount), status: c.status, signedName: c.signedName || "", signedAt: c.signedAt || "",
  }));
  const f = e.discountMode === "code" ? findDiscount(s, e.discountCode) : null;
  return { v: 1, e: x, s: { business: b, pricing: s.pricing, tax: s.tax, discounts: f ? [f] : [],
    services: { en: servicesLine(e, s, "en"), es: servicesLine(e, s, "es") },
    reviewUrl: extra.reviewUrl || "", websiteUrl: extra.websiteUrl || b.website || "", instagramUrl: extra.instagramUrl || "",
    showcase: (s.showcase || []).filter((x) => x.url).map((x) => ({ id: x.id, url: x.url, caption: x.caption || "" })),
    payZelle: s.payZelle || "", payZelleName: s.payZelleName || "", payNote: s.payNote || "" } };
}

/** Settings shaped for calcEstimate, using only what the snapshot carries. */
export const modelSettings = (m: PortalModel): Settings => ({ pricing: m.s.pricing, tax: m.s.tax, discounts: m.s.discounts } as unknown as Settings);

/** An option the client can toggle: not already part of the owner's price (unless the client added it), and worded. */
export const isSelectable = (u: Estimate["upgrades"][number]) => (!u.included || !!u.byClient) && !!(u.desc || u.descEs);
export const isOwnerSigned = (m: PortalModel) => !!(m.e.signature && m.e.signature.name);

/** The estimate as the client currently sees it: their option picks applied. */
export function effective(m: PortalModel, client?: ClientState): Estimate {
  const picks = client?.picks || {};
  return { ...m.e, upgrades: (m.e.upgrades || []).map((u) => (isSelectable(u) && u.id in picks && !isOwnerSigned(m) ? { ...u, included: !!picks[u.id] } : u)) };
}
export const clientTotal = (m: PortalModel, client?: ClientState) => calcEstimate(effective(m, client), modelSettings(m)).total;

/* The client link is written by ANYONE who holds the token, so everything read back from it is clipped before it is copied
   into the owner's estimate (a 1 MB chat line or signature would otherwise make the estimate too big to save). */
const MAX_TEXT = 2000, MAX_NAME = 120, MAX_IMG = 400_000;
const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const okImg = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= MAX_IMG;
const clipMsg = (m: ChatMsg): ChatMsg => ({ from: m && m.from === "owner" ? "owner" : "client", text: clip(m && m.text, MAX_TEXT), at: clip(m && m.at, 40) });

const nowISO = () => new Date().toISOString();
const logAct = (e: Estimate, text: string) => { e.activity = [...(e.activity || []), { at: nowISO(), text }].slice(-100); };

/**
 * Applies what the client did on the link to the owner's estimate. Pure: returns a new estimate.
 * `seen` keeps track of what was already applied so nothing is logged twice.
 */
export function portalApply(est: Estimate, c: ClientState | undefined, lang: "en" | "es" = "en"): { e: Estimate; changed: boolean; news: string } {
  const TT = (a: string, b: string) => (lang === "es" ? b : a);
  const e = JSON.parse(JSON.stringify(est)) as Estimate;
  if (!c) return { e: est, changed: false, news: "" };
  const seen = (e.portalSeen ||= { views: 0, picks: "{}", sign: false, co: {} });
  const who = e.clientName || TT("The client", "El cliente");
  let changed = false, news = "";

  const views = c.views || [];
  if (views.length > num(seen.views)) {
    e.portalViews = views.slice(-30).map((v) => clip(v, 40)); seen.views = views.length; changed = true;
    logAct(e, views.length === 1 ? TT("Opened the link", "Abrió el enlace") : TT(`Opened the link (time ${views.length})`, `Abrió el enlace (${views.length}ª vez)`));
    if (e.status === "Sent") e.status = "Viewed";
    news = TT(`${who} opened the estimate`, `${who} abrió el presupuesto`);
  }
  const pj = JSON.stringify(c.picks || {});
  if (pj.length <= 20_000 && pj !== (seen.picks || "{}")) {
    const picks = c.picks || {};
    let prev: Record<string, boolean> = {};
    try { prev = JSON.parse(seen.picks || "{}"); } catch { prev = {}; }
    if (!e.signature) {
      (e.upgrades || []).forEach((u) => {
        if (!(u.id in picks) || prev[u.id] === picks[u.id]) return;
        if (u.included && !u.byClient) return;
        if (!!u.included === !!picks[u.id]) return;
        u.included = !!picks[u.id]; u.byClient = !!picks[u.id];
        logAct(e, (picks[u.id] ? TT("Added: ", "Agregó: ") : TT("Removed: ", "Quitó: ")) + (lang === "es" ? u.descEs || u.desc : u.desc || u.descEs));
      });
      news = TT(`${who} changed the options`, `${who} cambió las opciones`);
    }
    seen.picks = pj; changed = true;
  }
  const chat = c.chat || [], had = (e.chat || []).length;
  if (chat.length !== had) {
    const fresh = chat.slice(had).filter((m) => m.from === "client").length;
    e.chat = chat.slice(-200).map(clipMsg); changed = true;
    if (fresh) {
      e.chatUnread = num(e.chatUnread) + fresh;
      logAct(e, TT("Message: ", "Mensaje: ") + "“" + String(chat[chat.length - 1].text || "").slice(0, 60) + "”");
      news = TT(`New message from ${who}`, `Mensaje nuevo de ${who}`);
    }
  }
  if (c.sign && okImg(c.sign.img) && !seen.sign) {
    seen.sign = true; changed = true;
    if (!e.signature) {
      e.signature = { name: clip(c.sign.name, MAX_NAME) || e.clientName, img: c.sign.img, date: String(c.sign.at || nowISO()).slice(0, 10), via: "link", at: clip(c.sign.at, 40) };
      if (e.status === "Draft" || e.status === "Sent" || e.status === "Viewed") e.status = "Accepted";
      logAct(e, TT(`Signed and accepted from the link ($${clip(c.sign.total, 20)})`, `Firmó y aceptó desde el enlace ($${clip(c.sign.total, 20)})`));
      news = TT(`${who} signed the estimate!`, `¡${who} firmó el presupuesto!`);
    }
  }
  const paidAt = c.paid ? clip(c.paid.at, 40) : "", paidHow = c.paid ? clip(c.paid.method, 40) : "";
  if (c.paid && paidAt && seen.paid !== paidAt) {
    seen.paid = paidAt; changed = true; e.payClaim = { method: paidHow, at: paidAt };
    logAct(e, TT(`Client says the deposit was sent (${paidHow})`, `El cliente dice que envió el depósito (${paidHow})`));
    news = TT(`${who} says the deposit was sent`, `${who} dice que envió el depósito`);
  }
  const cos = c.coSign || {}, seenCo = (seen.co ||= {});
  for (const id of Object.keys(cos)) {
    const sg = cos[id];
    if (!sg || !okImg(sg.img) || seenCo[id]) continue;
    const co = (e.changeOrders || []).find((x) => x.id === id);
    if (!co || co.status === "draft") continue; // unknown or not offered to the client: ignore
    seenCo[id] = 1; changed = true;
    if (co.status === "signed") continue; // the owner already signed it here
    co.status = "signed"; co.signedName = clip(sg.name, MAX_NAME) || e.clientName; co.signedAt = String(sg.at || nowISO()).slice(0, 10); co.sigImg = sg.img;
    (co as { via?: string }).via = "link";
    logAct(e, TT(`Change order #${co.n} approved from the link ($${num(co.amount)})`, `Orden de cambio #${co.n} aprobada desde el enlace ($${num(co.amount)})`));
    news = TT(`${who} approved change order #${co.n}!`, `¡${who} aprobó la orden de cambio #${co.n}!`);
  }
  if (changed) e.updatedAt = undefined;
  return { e: changed ? e : est, changed, news };
}

export function sendLinkMessage(e: Estimate, total: string, link: string, businessName: string, lang: "en" | "es"): string {
  const first = String(e.clientName || "").split(" ")[0];
  return lang === "es"
    ? `Hola ${first}, aquí está su presupuesto ${e.number} por ${total}.\n\nEn este enlace lo puede ver completo, escoger las opciones y firmarlo desde el teléfono. Si tiene preguntas, me escribe ahí mismo:\n${link}\n\n${businessName}`
    : `Hi ${first}, here is your estimate ${e.number} for ${total}.\n\nOn this link you can see all of it, pick the options and sign from your phone. If you have questions, you can message me right there:\n${link}\n\n${businessName}`;
}
