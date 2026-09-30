/** Estimate math and helpers — ported from the prototype (calcEstimate, calcMaterials, jobHours, crewCost, jobEconomics, presets). */
import { num, r2, money } from "./money";
import { SERVICES } from "./services.data";
import { defaultSettings } from "./settings";
import { catalogHrs, findTradeJobType, isPaintingTrade, leadServiceJob, jobTypePreset, tradeById, tradeDefaultPreset, tradeJobTypes, usesCabinetTools } from "./trades";
import type { Client, Discount, Estimate, Item, JobType, Settings, TypePreset } from "./types";

export const JOB_TYPES: { id: JobType; en: string; es: string; hint: [string, string] }[] = [
  { id: "cabinets", en: "Kitchen cabinets", es: "Gabinetes de cocina", hint: ["Doors, drawers, spray finish", "Puertas, cajones, acabado a pistola"] },
  { id: "interior", en: "Interior painting", es: "Pintura interior", hint: ["Walls, ceilings, trim, doors", "Paredes, techos, molduras, puertas"] },
  { id: "exterior", en: "Exterior painting", es: "Pintura exterior", hint: ["Stucco, siding, trim, doors", "Estuco, siding, molduras, puertas"] },
  { id: "other", en: "Other job", es: "Otro trabajo", hint: ["Drywall, repairs, anything else", "Drywall, reparaciones, lo que sea"] },
];
export const jobTypeOf = (e?: Pick<Estimate, "jobType"> | null): JobType => (e && e.jobType) || "cabinets";
export const jobTypeLabel = (id: JobType, es = false) => {
  const t = JOB_TYPES.find((x) => x.id === id);
  if (t) return es ? t.es : t.en;
  const f = findTradeJobType(id); // a job type of another trade (cleaning, electrical, ...)
  if (f) return es ? f.job.es : f.job.en;
  return es ? JOB_TYPES[0].es : JOB_TYPES[0].en;
};
/** The job types offered for a trade: painting's four (JOB_TYPES), otherwise the trade's own. */
export const jobTypesOf = (trade?: string | null): { id: JobType; en: string; es: string; hint: [string, string] }[] =>
  isPaintingTrade(trade) ? JOB_TYPES : tradeJobTypes(trade).map((j) => ({ id: j.id, en: j.en, es: j.es, hint: j.hint }));
export const svcById = (id?: string) => SERVICES.find((s) => s.id === id) || null;
/** Rate a NEW "other work" line starts with: the contractor's override from Settings (settings.serviceRates) or the catalog default. */
export const serviceRate = (s: Pick<Settings, "serviceRates">, sv: { id: string; rate: number }): number => {
  const o = s.serviceRates?.[sv.id];
  return typeof o === "number" && isFinite(o) && o >= 0 ? o : sv.rate;
};

export const payPlanOn = (e: Pick<Estimate, "payPlanOn" | "payPlan">) => !!(e && e.payPlanOn && e.payPlan && e.payPlan.length >= 2);
export const defaultPlan = () => [
  { label: "Deposit", labelEs: "Depósito", pct: 50 },
  { label: "When painting is done", labelEs: "Al terminar de pintar", pct: 40 },
  { label: "Final walkthrough", labelEs: "Al revisar con el cliente", pct: 10 },
];

export function findDiscount(s: Settings, code?: string): Discount | null {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return null;
  return s.discounts.find((d) => String(d.code).trim().toUpperCase() === c && d.active !== false) || null;
}

export function calcEstimate(e: Estimate, s: Settings) {
  type Line = { kind: string; item?: Item | Estimate["upgrades"][number]; qty: number; rate: number; amount: number };
  const lines: Line[] = [];
  if (num(e.doors) > 0) lines.push({ kind: "door", qty: num(e.doors), rate: num(e.doorRate), amount: num(e.doors) * num(e.doorRate) });
  if (num(e.drawers) > 0) lines.push({ kind: "drawer", qty: num(e.drawers), rate: num(e.drawerRate), amount: num(e.drawers) * num(e.drawerRate) });
  if (e.frameMode === "separate" && num(e.frames) > 0) lines.push({ kind: "frame", qty: num(e.frames), rate: num(e.frameRate), amount: num(e.frames) * num(e.frameRate) });
  if (e.boxMode === "separate" && num(e.boxes) > 0) lines.push({ kind: "box", qty: num(e.boxes), rate: num(e.boxRate), amount: num(e.boxes) * num(e.boxRate) });
  for (const it of e.items || []) lines.push({ kind: "custom", item: it, qty: num(it.qty), rate: num(it.rate), amount: num(it.qty) * num(it.rate) });

  const optional: Estimate["upgrades"] = [];
  let optionalTotal = 0;
  for (const up of e.upgrades || []) {
    const amt = num(up.qty) * num(up.rate);
    if (up.included) lines.push({ kind: "upgrade", item: up, qty: num(up.qty), rate: num(up.rate), amount: amt });
    else if (up.desc || up.descEs) { optional.push(up); optionalTotal += amt; }
  }
  optionalTotal = Math.round(optionalTotal * 100) / 100;

  const matRows = e.showMaterials ? e.materialsList || [] : [];
  let materialsTotal = 0;
  for (const m of matRows) materialsTotal += num(m.qty) * num(m.rate);
  materialsTotal = Math.round(materialsTotal * 100) / 100;
  const materialsAdded = e.showMaterials && e.materialsMode === "added" ? materialsTotal : 0;

  let workSubtotal = 0;
  for (const l of lines) workSubtotal += l.amount;
  workSubtotal = Math.round(workSubtotal * 100) / 100;
  const subtotal = Math.round((workSubtotal + materialsAdded) * 100) / 100;

  let discAmt = 0, discLabel = "", discLabelEs = "";
  if (e.discountMode === "code") {
    const d = findDiscount(s, e.discountCode);
    if (d) {
      discAmt = d.type === "fixed" ? num(d.value) : (subtotal * num(d.value)) / 100;
      const v = d.type === "fixed" ? money(d.value) : num(d.value) + "%";
      discLabel = (d.label || "Discount") + " (" + v + ")";
      discLabelEs = (d.labelEs || d.label || "Descuento") + " (" + v + ")";
    }
  } else if (e.discountMode === "manual") {
    if (e.manualType === "fixed") {
      discAmt = num(e.manualValue);
      discLabel = e.manualLabel || "Discount";
      discLabelEs = e.manualLabelEs || e.manualLabel || "Descuento";
    } else {
      discAmt = (subtotal * num(e.manualValue)) / 100;
      discLabel = (e.manualLabel || "Discount") + " (" + num(e.manualValue) + "%)";
      discLabelEs = (e.manualLabelEs || e.manualLabel || "Descuento") + " (" + num(e.manualValue) + "%)";
    }
  }
  if (discAmt > subtotal) discAmt = subtotal;
  if (discAmt < 0) discAmt = 0;
  discAmt = Math.round(discAmt * 100) / 100;

  const afterDisc = Math.round((subtotal - discAmt) * 100) / 100;
  const taxAmt = e.taxEnabled ? Math.round(((afterDisc * num(e.taxRate)) / 100) * 100) / 100 : 0;
  const total = Math.round((afterDisc + taxAmt) * 100) / 100;
  const depositPct = payPlanOn(e) ? num(e.payPlan[0].pct) : num(e.depositPct);
  const deposit = Math.round(((total * depositPct) / 100) * 100) / 100;
  const balance = Math.round((total - deposit) * 100) / 100;
  return { lines, optional, optionalTotal, workSubtotal, materialsTotal, materialsAdded, subtotal, discAmt, discLabel, discLabelEs, afterDisc, taxAmt, total, deposit, balance, depositPct };
}

const frameUnits = (e: Estimate) => (e.frameMode === "separate" ? num(e.frames) : e.frameMode === "none" ? 0 : num(e.doors));
const boxUnits = (e: Estimate) => (e.boxMode === "separate" ? num(e.boxes) : e.boxMode === "none" ? 0 : num(e.doors));

function itemSqft(it: Item): number {
  const sv = it.svc ? svcById(it.svc) : null;
  if (sv && sv.sqftPerUnit !== undefined && sv.sqftPerUnit !== null) return num(it.qty) * num(sv.sqftPerUnit);
  const u = String(it.unit || "").toLowerCase();
  if (u.indexOf("sq") >= 0 || u.indexOf("pie²") >= 0 || u.indexOf("ft2") >= 0) return num(it.qty);
  if (u.indexOf("lin") >= 0 || u.indexOf("lineal") >= 0) return num(it.qty) * 0.6;
  return 0;
}
export const otherSqft = (e: Estimate) => Math.round((e.items || []).reduce((t, it) => t + itemSqft(it), 0) * 10) / 10;
export function jobSqft(e: Estimate, s: Settings) {
  const m = s.materials;
  return num(e.doors) * num(m.sqftPerDoor) + frameUnits(e) * num(m.frameSqftPerDoor) + boxUnits(e) * num(m.sqftPerBox) + num(e.drawers) * num(m.sqftPerDrawer);
}

export function calcMaterials(e: Estimate, s: Settings) {
  if (!usesCabinetTools(s.trade)) { // the paint & supplies calculator is for painting only; other trades enter their real materials cost
    return {
      sqft: 0, primerGal: 0, paintGal: 0, buyPrimer: 0, buyPaint: 0, primerCost: 0, paintCost: 0,
      wallSqft: 0, wallGal: 0, buyWall: 0, wallCost: 0, wallPrimerGal: 0, buyWallPrimer: 0, wallPrimerCost: 0,
      sundries: 0, supplyLines: [] as { name: string; units: number; basis: string; amt: number }[], totalCost: 0,
    };
  }
  const m = s.materials;
  const doors = num(e.doors), drawers = num(e.drawers);
  const sqft = jobSqft(e, s);
  const waste = 1 + num(m.wastePct) / 100;
  const cov = num(m.coverageSqftPerGal) || 1;
  const primerGal = ((sqft * num(m.primerCoats)) / cov) * waste;
  const paintGal = ((sqft * num(m.paintCoats)) / cov) * waste;
  const buyPrimer = Math.ceil(primerGal * 4) / 4;
  const buyPaint = Math.ceil(paintGal * 4) / 4;
  let primerCost = buyPrimer * num(m.primerCostPerGal);
  let paintCost = buyPaint * num(m.paintCostPerGal);
  let supplies = 0;
  let supplyLines: { name: string; units: number; basis: string; amt: number }[] = [];
  (m.supplies || []).forEach((sp) => {
    const mult = sp.basis === "door" ? doors : sp.basis === "drawer" ? drawers : sqft > 0 ? 1 : 0;
    const qty = sp.qty === undefined ? 1 : num(sp.qty);
    const units = qty * mult;
    const amt = units * num(sp.cost);
    if (units > 0) {
      supplies += amt;
      supplyLines.push({ name: sp.name, units: Math.round(units * 100) / 100, basis: sp.basis, amt: Math.round(amt * 100) / 100 });
    }
  });
  supplies = Math.round(supplies * 100) / 100;

  const wallSqft = otherSqft(e);
  const wallCov = num(m.wallCoverageSqftPerGal) || 350;
  const wallGal = ((wallSqft * (num(m.wallCoats) || 0)) / wallCov) * waste;
  const wallPrimerGal = ((wallSqft * num(m.wallPrimerCoats)) / wallCov) * waste;
  const buyWall = Math.ceil(wallGal * 4) / 4;
  const buyWallPrimer = Math.ceil(wallPrimerGal * 4) / 4;
  let wallCost = Math.round(buyWall * num(m.wallPaintCostPerGal) * 100) / 100;
  let wallPrimerCost = Math.round(buyWallPrimer * num(m.wallPrimerCostPerGal) * 100) / 100;

  const buyer = e.matBuyer || "me";
  if (buyer === "paint" || buyer === "client") { primerCost = 0; paintCost = 0; wallCost = 0; wallPrimerCost = 0; }
  if (buyer === "client") { supplies = 0; supplyLines = supplyLines.map((l) => ({ ...l, amt: 0 })); }
  const totalCost = Math.round((primerCost + paintCost + supplies + wallCost + wallPrimerCost) * 100) / 100;
  return {
    sqft: Math.round(sqft * 10) / 10,
    primerGal: Math.round(primerGal * 100) / 100, paintGal: Math.round(paintGal * 100) / 100, buyPrimer, buyPaint,
    primerCost: Math.round(primerCost * 100) / 100, paintCost: Math.round(paintCost * 100) / 100,
    wallSqft, wallGal: Math.round(wallGal * 100) / 100, buyWall, wallCost,
    wallPrimerGal: Math.round(wallPrimerGal * 100) / 100, buyWallPrimer, wallPrimerCost,
    sundries: supplies, supplyLines, totalCost,
  };
}

export type HourRow = { label: string; qty: number; per: number; h: number; note?: string; kind?: string };
export function jobHours(e: Estimate, s: Settings, lang: "en" | "es" = "en") {
  const p = s.production, rows: HourRow[] = [];
  let tot = 0;
  const TT = (en: string, es: string) => (lang === "es" ? es : en);
  const add = (label: string, qty: unknown, per: unknown, note = "", kind = "") => {
    const q = num(qty), pe = num(per), h = q * pe;
    if (h > 0) { rows.push({ label, qty: q, per: pe, h, note, kind }); tot += h; }
  };
  const doors = num(e.doors), drawers = num(e.drawers);
  add(TT("Cabinet doors", "Puertas de gabinete"), doors, p.doorHrs, "", "door");
  add(TT("Drawer fronts", "Frentes de cajón"), drawers, p.drawerHrs, "", "drawer");
  if (e.frameMode === "separate") add(TT("Frames", "Marcos"), e.frames, p.frameHrs, "", "frame");
  if (e.boxMode === "separate") add(TT("Boxes", "Cajas"), e.boxes, p.boxHrs, "", "box");
  if (doors + drawers > 0) add(TT("Set-up, masking and cleanup", "Preparar, tapar y limpiar"), 1, p.setupHrs);
  (e.items || []).forEach((it) => {
    const d = lang === "es" ? it.descEs || it.desc : it.desc || it.descEs;
    if (it.hrs !== undefined && it.hrs !== "" && it.hrs !== null) add(d || TT("Line", "Línea"), 1, num(it.hrs), TT("hours you typed", "horas que pusiste"));
    else add(d || TT("Line", "Línea"), it.qty, catalogHrs(s, it.svc) || num((p.svcHrs || {})[it.svc || ""]));
  });
  (e.changeOrders || []).forEach((co) => { if (co.status === "signed") add(TT("Change order #", "Cambio #") + co.n, 1, co.hours); });
  if (num(e.extraHrs)) { rows.push({ label: TT("Extra hours", "Horas extra"), qty: 1, per: num(e.extraHrs), h: num(e.extraHrs) }); tot += num(e.extraHrs); }
  return { rows, total: Math.round(tot * 10) / 10 };
}

export const laborModeFor = (e: Estimate, s: Settings) => ((e && e.laborMode) || s.production.laborMode || "solo") === "crew" ? "crew" : "solo";

export function crewCost(e: Estimate, h: { rows: HourRow[]; total: number }, s: Settings) {
  const p = s.production;
  if (p.payBy !== "piece") return r2(h.total * num(p.laborRate));
  const c = num(e.doors) * num(p.doorPay) + num(e.drawers) * num(p.drawerPay) +
    (e.frameMode === "separate" ? num(e.frames) * num(p.framePay) : 0) + (e.boxMode === "separate" ? num(e.boxes) * num(p.boxPay) : 0);
  let other = 0;
  h.rows.forEach((r) => { if (["door", "drawer", "frame", "box"].indexOf(r.kind || "") < 0) other += r.h; });
  return r2(c + other * num(p.laborRate));
}

/** @param actualMat materials really bought for this job (0 = use the calculator's estimate). */
export function jobEconomics(e: Estimate, s: Settings, actualMat = 0) {
  const p = s.production, t = calcEstimate(e, s), h = jobHours(e, s), mode = laborModeFor(e, s);
  const act = actualMat > 0 ? actualMat : num(e.actualMaterialCost);
  const mat = r2(act > 0 ? act : calcMaterials(e, s).totalCost);
  const co = r2((e.changeOrders || []).reduce((a, c) => a + (c.status === "signed" ? num(c.amount) : 0), 0));
  const revenue = r2(t.afterDisc + co);
  const labor = mode === "crew" ? crewCost(e, h, s) : 0;
  const cost = r2(labor + mat), profit = r2(revenue - cost);
  const tm = Math.min(90, Math.max(0, num(p.targetMargin))), th = num(p.targetHourly);
  const people = mode === "crew" ? Math.max(1, num(p.crewSize)) : 1;
  return {
    t, h, mode, labor, mat, matReal: act > 0, co, revenue, cost, profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0, target: tm, targetHourly: th,
    perHour: h.total > 0 ? profit / h.total : 0,
    suggested: mode === "crew" ? (cost > 0 ? Math.round(cost / (1 - tm / 100)) : 0) : h.total > 0 ? Math.round(mat + h.total * th) : 0,
    days: h.total / (people * Math.max(1, num(p.hoursPerDay))), people,
  };
}

/* ---------- job-type presets ---------- */
export function typePreset(s: Settings, type: JobType): TypePreset {
  if (type === "cabinets" || !type) {
    return { days: num(s.processDays) || 5, spec: s.pricing.spec, specEs: s.pricing.specEs, scopeEn: s.scope.en.join("\n"), scopeEs: s.scope.es.join("\n"), termsEn: s.terms.en.join("\n"), termsEs: s.terms.es.join("\n") };
  }
  const d = defaultSettings().typePresets;
  const own = s.typePresets[type];
  if (own) return own;
  if (!isPaintingTrade(s.trade) || !d[type]) { // a trade job type: the trade's standard texts (edits are saved in settings.typePresets[id])
    const tp = jobTypePreset(type) || tradeDefaultPreset(s.trade);
    if (tp) return tp;
  }
  return d[type] || d.other!;
}
export function applyTypePreset(e: Estimate, s: Settings, type: JobType): Estimate {
  const p = typePreset(s, type);
  return { ...e, jobType: type, days: num(p.days) || e.days, spec: p.spec || "", specEs: p.specEs || "", scopeEn: p.scopeEn || "", scopeEs: p.scopeEs || "", termsEn: p.termsEn || "", termsEs: p.termsEs || "" };
}
export function servicesLine(e: Estimate, s: Settings, lang: "en" | "es"): string {
  const es = lang === "es", type = jobTypeOf(e);
  if (type !== "cabinets") {
    const p = s.typePresets[type] || (!isPaintingTrade(s.trade) ? jobTypePreset(type) : null);
    const v = p && (es ? p.servicesEs || p.services : p.services || p.servicesEs);
    if (v) return v;
  }
  return es ? s.servicesEs || s.services : s.services || s.servicesEs;
}
const firstShort = (e: Estimate, es: boolean, max: number) => {
  const first = (e.items || []).filter((it) => it.desc && !it.hidden)[0];
  return first ? String(es && first.descEs ? first.descEs : first.desc).split(/[—,(]/)[0].trim().slice(0, max) : "";
};
export function jobDetail(e: Estimate, lang: "en" | "es" = "en") {
  if (num(e.doors) || num(e.drawers)) return lang === "es" ? `${num(e.doors)} puertas · ${num(e.drawers)} cajones` : `${num(e.doors)} doors · ${num(e.drawers)} drawers`;
  return firstShort(e, lang === "es", 42);
}
export function jobWhat(e: Estimate, lang: "en" | "es" = "en") {
  if (num(e.doors) || num(e.drawers)) return lang === "es" ? `${num(e.doors)} puertas, ${num(e.drawers)} cajones` : `${num(e.doors)} doors, ${num(e.drawers)} drawers`;
  const f = firstShort(e, lang === "es", 40);
  return jobTypeLabel(jobTypeOf(e), lang === "es") + (f ? " · " + f : "");
}
export function suggestTypeFor(c?: Client | null, trade?: string | null): JobType | "" {
  if (!c) return "";
  if (!isPaintingTrade(trade)) { // request-form services of another trade map to that trade's job types
    const det = c.web?.details, ty = det?.types || [];
    for (const id of ty) { const j = leadServiceJob(trade, id); if (j) return j; }
    return "";
  }
  const s = String(c.web?.service || "").toLowerCase(), ty = c.web?.details?.types;
  if (ty && ty.length) {
    if (ty.includes("cabinets") || ty.includes("vanity")) return "cabinets";
    if (ty.includes("interior")) return "interior";
    if (ty.includes("exterior")) return "exterior";
    return "other";
  }
  if (/cabinet|vanity/.test(s)) return "cabinets";
  if (/interior/.test(s)) return "interior";
  if (/exterior/.test(s)) return "exterior";
  return "";
}

export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const uid = (p = "id") => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** A fresh Draft estimate seeded from Settings (newEstimateBlank). */
export function blankEstimate(s: Settings, number: string, lang: "en" | "es" = "en"): Estimate {
  const p = s.pricing, t = s.tax;
  return {
    id: uid("e"), number, date: todayISO(), validDays: num(p.validDays) || 30, status: "Draft",
    clientId: "", clientName: "", phone: "", email: "", address: "", docLang: lang, jobType: isPaintingTrade(s.trade) ? "cabinets" : tradeById(s.trade).jobTypes[0]?.id || "cabinets",
    doors: 0, drawers: 0, frames: 0, boxes: 0, doorRate: num(p.doorRate), drawerRate: num(p.drawerRate), frameRate: num(p.frameRate), boxRate: num(p.boxRate),
    frameMode: p.frameMode || "included", boxMode: p.boxMode || "included", spec: p.spec, specEs: p.specEs, items: [], upgrades: [],
    discountMode: "", discountCode: "", manualType: "percent", manualValue: 0, manualLabel: "Discount", manualLabelEs: "Descuento",
    taxEnabled: !!t.enabled, taxRate: num(t.rate), depositPct: num(p.depositPct), payPlanOn: false, payPlan: [],
    days: num(s.processDays) || 5, startDate: "", leadSource: "",
    scopeEn: s.scope.en.join("\n"), scopeEs: s.scope.es.join("\n"), termsEn: s.terms.en.join("\n"), termsEs: s.terms.es.join("\n"), notes: "", crewNotes: "",
    showMaterials: false, materialsMode: "included", materialsList: [], matBuyer: "me", extraHrs: 0, changeOrders: [],
  };
}
