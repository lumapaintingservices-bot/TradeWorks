/** Pre-written client messages — port of fillTemplate / waNumber / digitsOnly and the default templates of the prototype. */
import { calcEstimate } from "./estimate";
import { fmtDate } from "./format";
import { addDaysISO, todayISO as todayOf } from "./followups";
import { money } from "./money";
import type { Estimate, MessageTemplates, Settings } from "./types";

export type Lang = "en" | "es";
export type TplKey = "lead" | "send" | "follow" | "noview" | "viewed" | "deposit" | "balance" | "review" | "warranty";
export const TPL_KEYS: TplKey[] = ["lead", "send", "follow", "noview", "viewed", "deposit", "balance", "review", "warranty"];

/** Placeholders every template understands ({first} is new: first name, used by the lead greeting). */
export const PLACEHOLDERS = ["{client}", "{first}", "{number}", "{total}", "{deposit}", "{balance}", "{valid}", "{start}", "{business}", "{phone}", "{email}", "{website}", "{date}"];

export const TPL_LABELS: Record<TplKey, { en: string; es: string }> = {
  lead: { en: "First reply to a new lead", es: "Primera respuesta a un lead nuevo" },
  send: { en: "Send the estimate", es: "Enviar el presupuesto" },
  follow: { en: "Follow up — no answer", es: "Seguimiento — sin respuesta" },
  noview: { en: "Hasn't opened the link", es: "No ha abierto el enlace" },
  viewed: { en: "Viewed it, hasn't signed", es: "Lo vio y no ha firmado" },
  deposit: { en: "Deposit reminder", es: "Recordatorio de depósito" },
  balance: { en: "Balance due", es: "Saldo pendiente" },
  review: { en: "Ask for a review", es: "Pedir una reseña" },
  warranty: { en: "Warranty check-in", es: "Revisión de garantía" },
};

export const DEFAULT_TEMPLATES: Record<TplKey, { en: string; es: string }> = {
  lead: {
    en: "Hi {first}, this is {business}. Thanks for reaching out about your project. When is a good time for me to come by and take a look? The visit and the estimate are free.\n\n{phone}",
    es: "Hola {first}, le escribe {business}. Gracias por contactarnos por su proyecto. ¿Cuándo le queda bien que pase a verlo? La visita y el presupuesto son gratis.\n\n{phone}",
  },
  send: {
    en: "Hi {client},\n\nThank you for having me out. Attached is your estimate {number} for {total}.\n\nIt covers the full on-site refinishing: cleaning, degreasing, sanding and spraying, all materials included, with a 2-year workmanship warranty. The schedule is 5 days on site, {deposit} to start and {balance} on the final day.\n\nThe estimate is good through {valid}. Any questions, just call or text me.\n\n{business}\n{phone}",
    es: "Hola {client},\n\nGracias por recibirme. Le adjunto su presupuesto {number} por {total}.\n\nIncluye todo el proceso en sitio: limpieza, desengrase, lijado y pintura a pistola, con todos los materiales incluidos y garantía de mano de obra de 2 años. Son 5 días de trabajo, {deposit} para comenzar y {balance} el último día.\n\nEl presupuesto es válido hasta {valid}. Cualquier pregunta, me llama o me escribe.\n\n{business}\n{phone}",
  },
  follow: {
    en: "Hi {client},\n\nJust checking in on the estimate I sent for your kitchen ({number}, {total}). No rush — I only ask because my schedule fills up a few weeks ahead and I would rather hold a spot for you than not.\n\nHappy to walk through any part of it, or adjust the scope if that helps.\n\n{business}\n{phone}",
    es: "Hola {client},\n\nLe escribo para dar seguimiento al presupuesto de su cocina ({number}, {total}). Sin prisa — se lo menciono porque mi agenda se llena con semanas de anticipación y prefiero apartarle un espacio.\n\nCon gusto le explico cualquier parte o ajusto el alcance si le ayuda.\n\n{business}\n{phone}",
  },
  noview: {
    en: "Hi {client},\n\nI sent you estimate {number} ({total}) with a link and wanted to make sure it reached you. You can open it from your phone, pick the options you like and sign right there.\n\nAny question, just reply to this message.\n\n{business}\n{phone}",
    es: "Hola {client},\n\nLe envié el presupuesto {number} ({total}) con un enlace y quería asegurarme de que le llegó. Puede abrirlo desde el teléfono, escoger las opciones que le gusten y firmarlo ahí mismo.\n\nCualquier pregunta, respóndame este mensaje.\n\n{business}\n{phone}",
  },
  viewed: {
    en: "Hi {client},\n\nI saw you had a chance to look at estimate {number} ({total}). Do you have any questions, or is there anything you would like me to adjust? Happy to go over any part of it.\n\nIf it looks good, you can sign right from the link.\n\n{business}\n{phone}",
    es: "Hola {client},\n\nVi que pudo revisar el presupuesto {number} ({total}). ¿Tiene alguna pregunta o quiere que ajuste algo? Con gusto le explico cualquier parte.\n\nSi todo está bien, puede firmarlo desde el mismo enlace.\n\n{business}\n{phone}",
  },
  deposit: {
    en: "Hi {client},\n\nWe are set to start on {start}. To hold the date I need the {deposit} deposit.\n\nYou can pay by Zelle to {phone}, card, check or cash — whatever is easiest.\n\n{business}\n{phone}",
    es: "Hola {client},\n\nQuedamos en comenzar el {start}. Para apartar la fecha necesito el depósito de {deposit}.\n\nPuede pagar por Zelle al {phone}, con tarjeta, cheque o efectivo — como le quede más cómodo.\n\n{business}\n{phone}",
  },
  balance: {
    en: "Hi {client},\n\nThe kitchen is finished. The remaining balance is {balance}.\n\nZelle to {phone}, card, check or cash. Thank you for trusting me with the work.\n\n{business}\n{phone}",
    es: "Hola {client},\n\nLa cocina quedó terminada. El saldo pendiente es {balance}.\n\nZelle al {phone}, tarjeta, cheque o efectivo. Gracias por confiarme el trabajo.\n\n{business}\n{phone}",
  },
  review: {
    en: "Hi {client},\n\nIt was a pleasure working on your kitchen. If you are happy with how it came out, a short Google review helps me more than anything else — it is how most of my clients find me.\n\nAnd if anything is not right, tell me first and I will come fix it.\n\n{business}\n{phone}",
    es: "Hola {client},\n\nFue un gusto trabajar en su cocina. Si quedó contento con el resultado, una reseña corta en Google me ayuda más que cualquier otra cosa — así es como me encuentra la mayoría de mis clientes.\n\nY si algo no quedó bien, dígamelo a mí primero y voy y lo arreglo.\n\n{business}\n{phone}",
  },
  warranty: {
    en: "Hi {client},\n\nIt's been about a year since we finished your project, so I wanted to check in. Everything is covered by your warranty — if you notice any chip or wear, just send me a photo and I'll take care of it.\n\nThank you again!\n{business}\n{phone}",
    es: "Hola {client},\n\nYa pasó cerca de un año desde que terminamos su proyecto y quería saber cómo sigue. Todo está cubierto por su garantía — si nota algún desgaste o golpe, mándeme una foto y lo arreglo.\n\n¡Gracias otra vez!\n{business}\n{phone}",
  },
};

/** Email subjects (not editable; same placeholders). */
export const DEFAULT_SUBJECTS: Record<TplKey, { en: string; es: string }> = {
  lead: { en: "Your project — {business}", es: "Su proyecto — {business}" },
  send: { en: "Your estimate — {number}", es: "Su presupuesto — {number}" },
  follow: { en: "Following up on estimate {number}", es: "Dando seguimiento al presupuesto {number}" },
  noview: { en: "Your estimate {number}", es: "Su presupuesto {number}" },
  viewed: { en: "Questions about estimate {number}?", es: "¿Preguntas sobre el presupuesto {number}?" },
  deposit: { en: "Deposit for {number} — starting {start}", es: "Depósito de {number} — comenzamos {start}" },
  balance: { en: "Balance for {number}", es: "Saldo de {number}" },
  review: { en: "Thank you — {client}", es: "Gracias — {client}" },
  warranty: { en: "How are your cabinets holding up?", es: "¿Cómo siguen sus gabinetes?" },
};

export type Business = { name: string; phone: string; email?: string; website?: string };
export type MsgCtx = {
  settings: Pick<Settings, "pricing" | "tax" | "discounts"> & Partial<Pick<Settings, "messageTemplates" | "reviewUrl">>;
  business: Business;
  /** App origin for the client link; defaults to location.origin. */
  origin?: string;
  /** Used by {client}/{first} when there is no estimate (a lead). */
  clientName?: string;
};

/** Template text: the contractor's override for this language, else the default. */
export function templateText(overrides: MessageTemplates | undefined, key: TplKey, lang: Lang): string {
  const o = overrides?.[key]?.[lang];
  return typeof o === "string" && o.trim() ? o : DEFAULT_TEMPLATES[key][lang];
}

export const firstName = (n?: string) => String(n || "").trim().split(/\s+/)[0] || "";

/** {client} {first} {number} {total} {deposit} {balance} {valid} {start} {business} {phone} {email} {website} {date} */
export function fillTemplate(txt: string, e: Estimate | null | undefined, lang: Lang, ctx: MsgCtx, today = todayOf()): string {
  const b = ctx.business;
  const name = (e && e.clientName) || ctx.clientName || "";
  const t = e ? calcEstimate(e, ctx.settings as Settings) : null;
  const map: Record<string, string> = {
    "{client}": name,
    "{first}": firstName(name),
    "{number}": e ? e.number || "" : "",
    "{total}": t ? money(t.total) : "",
    "{deposit}": t ? money(t.deposit) : "",
    "{balance}": t ? money(t.balance) : "",
    "{valid}": e ? fmtDate(addDaysISO(e.date, e.validDays), lang) : "",
    "{start}": e && e.startDate ? fmtDate(e.startDate, lang) : "",
    "{business}": b.name || "", "{phone}": b.phone || "", "{email}": b.email || "",
    "{website}": b.website || "", "{date}": fmtDate(today, lang),
  };
  let out = String(txt || "");
  for (const k in map) out = out.split(k).join(map[k]);
  return out;
}

export const clientLink = (token: string, origin?: string) => `${origin ?? (typeof location !== "undefined" ? location.origin : "")}/p/${token}`;

/** Filled subject + body for one template key. review adds the review URL; noview/viewed add the client link. */
export function buildMessage(key: TplKey, e: Estimate | null | undefined, lang: Lang, ctx: MsgCtx, today = todayOf()): { subject: string; body: string } {
  const body0 = fillTemplate(templateText(ctx.settings.messageTemplates, key, lang), e, lang, ctx, today);
  const subject = fillTemplate(DEFAULT_SUBJECTS[key][lang], e, lang, ctx, today);
  let body = body0;
  const reviewUrl = ctx.settings.reviewUrl;
  if (key === "review" && reviewUrl && body.indexOf(reviewUrl) < 0) body += "\n\n" + reviewUrl;
  if ((key === "noview" || key === "viewed") && e && e.portal && e.portal.token) body += "\n\n" + clientLink(e.portal.token, ctx.origin);
  return { subject, body };
}

/* ---------------- deep links ---------------- */
export const digitsOnly = (s: unknown) => String(s || "").replace(/[^0-9]/g, "");
/** wa.me wants country code + number: a bare 10-digit US number gets a leading 1. */
export function waNumber(phone: unknown): string {
  let d = digitsOnly(phone);
  if (d.length === 10) d = "1" + d;
  return d;
}
export const waUrl = (phone: unknown, text?: string) => "https://wa.me/" + waNumber(phone) + (text ? "?text=" + encodeURIComponent(text) : "");
export const smsUrl = (phone: unknown, text?: string) => "sms:" + digitsOnly(phone) + "?&body=" + encodeURIComponent(text || "");
export const mailUrl = (email: string | undefined, subject: string, text: string) =>
  "mailto:" + encodeURIComponent(email || "") + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(text);

/** Message about an unsigned change order (port of coMessage). */
export function coMessage(e: Estimate, co: { n: number; desc?: string; descEs?: string; amount: number }, lang: Lang, ctx: MsgCtx): string {
  const first = firstName(e.clientName), b = ctx.business;
  const link = e.portal && e.portal.token ? clientLink(e.portal.token, ctx.origin) : "";
  const d = lang === "es" ? co.descEs || co.desc : co.desc || co.descEs;
  const amount = money(co.amount);
  if (lang === "es")
    return `Hola ${first}, le dejo el cambio #${co.n} (${d}) por ${amount}.` +
      (link ? ` Puede revisarlo y firmarlo aquí: ${link}` : " Si está de acuerdo, respóndame este mensaje para confirmarlo.") + `\n\n${b.name}\n${b.phone}`;
  return `Hi ${first}, here is change order #${co.n} (${d}) for ${amount}.` +
    (link ? ` You can review and sign it here: ${link}` : " If you agree, just reply to this message to confirm.") + `\n\n${b.name}\n${b.phone}`;
}
