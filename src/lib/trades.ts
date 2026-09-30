/**
 * Trades: pure helpers over the trade templates in trades.data.ts (no React, no Firebase).
 *  - normalizeTrade: any stored company.trade -> a known trade id ("" / cabinets / painting -> painting, unknown text -> custom)
 *  - the service catalog (settings.catalog, or the trade's starter list) and how a catalog row becomes an estimate line
 *  - onboarding prices, switching trade without overwriting the company's own edits, job types and their standard texts
 * Painting keeps the original behavior: its catalog is services.data.ts (+ settings.serviceRates), its job types typePresets.data.ts.
 */
import { num } from "./money";
import { SERVICES } from "./services.data";
import { TRADE_LIST, type LeadQuestion, type LeadService, type Trade, type TradeId, type TradeJobType } from "./trades.data";
import type { CatalogItem, Item, Settings, TypePreset } from "./types";

export type { Trade, TradeId, TradeJobType, LeadQuestion, LeadService, PriceQuestion } from "./trades.data";
export { TRADE_LIST };

export const DEFAULT_TRADE: TradeId = "painting";
const BY_ID = new Map<string, Trade>(TRADE_LIST.map((t) => [t.id, t]));

/** "" / undefined (never chose) and the old "cabinets" / "painting" values keep the painting behavior; unknown text becomes custom. */
export function normalizeTrade(v?: string | null): TradeId {
  const k = String(v ?? "").trim().toLowerCase();
  if (!k || k === "cabinets" || k === "cabinet" || k === "painting") return "painting";
  return BY_ID.has(k) ? (k as TradeId) : "custom";
}
export const tradeById = (v?: string | null): Trade => BY_ID.get(normalizeTrade(v))!;
export const isPaintingTrade = (v?: string | null) => normalizeTrade(v) === "painting";
/** Cabinet controls (doors/drawers/frames/boxes, finish tiers) and the paint & supplies calculator. */
export const usesCabinetTools = (v?: string | null) => tradeById(v).cabinetTools;
export const tradeLabel = (v: string | null | undefined, es = false) => { const t = tradeById(v); return es ? t.es : t.en; };

/* ---------- catalog ---------- */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const validRate = (n: unknown): n is number => typeof n === "number" && isFinite(n) && n >= 0;

/** Painting's catalog: the built-in services with the contractor's price overrides (settings.serviceRates). */
export function paintingCatalog(serviceRates?: Record<string, number>): CatalogItem[] {
  return SERVICES.map((s) => {
    const o = serviceRates?.[s.id];
    return { id: s.id, en: s.en, es: s.es, unit: s.unit, unitEs: s.unitEs, rate: validRate(o) ? o : s.rate };
  });
}
/** The trade's starter services (placeholders to edit). */
export function starterCatalog(trade?: string | null, serviceRates?: Record<string, number>): CatalogItem[] {
  const t = tradeById(trade);
  return t.id === "painting" ? paintingCatalog(serviceRates) : clone(t.catalog);
}
/** The company's services: what it saved, else the trade's starter list (lazy: nothing to migrate). */
export function catalogOf(s: Pick<Settings, "trade" | "catalog" | "serviceRates">): CatalogItem[] {
  return Array.isArray(s.catalog) ? s.catalog : starterCatalog(s.trade, s.serviceRates);
}
/** Hours per unit for a catalog service (0 when unknown). */
export const catalogHrs = (s: Pick<Settings, "trade" | "catalog" | "serviceRates">, id?: string): number => {
  if (!id) return 0;
  const c = catalogOf(s).find((x) => x.id === id);
  return c && validRate(c.hrs) ? c.hrs : 0;
};
/** A NEW estimate line from a catalog row. Painting's built-in services start at qty 0 (as always); other services at 1. */
export function catalogLine(c: CatalogItem, id: string): Item {
  const builtin = SERVICES.some((x) => x.id === c.id);
  return { id, desc: c.en, descEs: c.es, qty: builtin ? 0 : 1, unit: c.unit, rate: c.rate, svc: c.id };
}

/** Tidy a catalog before saving: trim, fill the missing language from the other, unique ids, no negative numbers, drop unnamed rows. */
export function cleanCatalog(list: CatalogItem[]): CatalogItem[] {
  const seen = new Set<string>(), out: CatalogItem[] = [];
  for (const raw of list) {
    const en = String(raw.en ?? "").trim().replace(/\s+/g, " "), es = String(raw.es ?? "").trim().replace(/\s+/g, " ");
    if (!en && !es) continue;
    let id = String(raw.id || "").trim() || "svc-" + Math.random().toString(36).slice(2, 8);
    while (seen.has(id)) id += "x";
    seen.add(id);
    const unit = String(raw.unit ?? "").trim(), unitEs = String(raw.unitEs ?? "").trim();
    const row: CatalogItem = { id, en: en || es, es: es || en, unit: unit || unitEs, unitEs: unitEs || unit, rate: validRate(raw.rate) ? Math.round(raw.rate * 10000) / 10000 : 0 };
    if (validRate(raw.hrs) && raw.hrs > 0) row.hrs = Math.round(raw.hrs * 10000) / 10000;
    out.push(row);
  }
  return out;
}
const same = (a: CatalogItem[], b: CatalogItem[]) => JSON.stringify(cleanCatalog(a)) === JSON.stringify(cleanCatalog(b));
/** True when the catalog is exactly the trade's starter list (nothing of the company's own to lose). */
export function catalogIsPristine(catalog: CatalogItem[] | undefined, trade?: string | null, serviceRates?: Record<string, number>): boolean {
  return !Array.isArray(catalog) || same(catalog, starterCatalog(trade, serviceRates));
}
/** Adds the trade's starter items that are not in the catalog yet (by id); never changes an existing row. */
export function mergeStarterItems(catalog: CatalogItem[], trade?: string | null): { catalog: CatalogItem[]; added: number } {
  const have = new Set(catalog.map((c) => c.id));
  const add = starterCatalog(trade).filter((c) => !have.has(c.id));
  return { catalog: [...catalog, ...add], added: add.length };
}

/* ---------- onboarding prices ---------- */
export type PriceAnswers = Record<string, string | number | undefined>;
/** Applies the typed answers (question id -> price) to the trade's starter catalog. Empty / invalid answers keep the starter rate. */
export function catalogWithPrices(trade: string | null | undefined, answers: PriceAnswers): CatalogItem[] {
  const t = tradeById(trade), cat = starterCatalog(t.id);
  for (const q of t.prices) {
    if (!("item" in q.target)) continue;
    const raw = answers[q.id];
    if (raw === undefined || raw === "") continue;
    const n = Number(raw), item = q.target.item;
    const row = cat.find((c) => c.id === item);
    if (row && validRate(n)) row.rate = n;
  }
  return cat;
}
export type OwnService = { name: string; unit: string; price: string | number };
/** A custom trade's first services (name, unit, price) -> catalog rows. Rows without a name are dropped. */
export function catalogFromOwn(rows: OwnService[]): CatalogItem[] {
  const seen = new Set<string>();
  return cleanCatalog(rows.map((r, i) => {
    const name = String(r.name || "").trim();
    let id = "own-" + (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || i);
    while (seen.has(id)) id += "-" + i;
    seen.add(id);
    const unit = String(r.unit || "").trim() || "job";
    const n = Number(r.price);
    return { id, en: name, es: name, unit, unitEs: unit, rate: validRate(n) ? n : 0 };
  }));
}

export type OnboardingPrices = {
  trade: string; skip: boolean; answers: PriceAnswers; own: OwnService[]; depositPct: string | number;
};
/**
 * Settings patch written when onboarding finishes. `skip` ("I'll set my prices later") saves only the trade's starter list for
 * non-painting trades and nothing at all for painting, so the app's defaults stay untouched.
 */
export function onboardingSettingsPatch(s: Settings, o: OnboardingPrices): Partial<Settings> {
  const t = tradeById(o.trade), patch: Partial<Settings> = { trade: t.id };
  if (t.id === "custom") {
    if (!o.skip) { const own = catalogFromOwn(o.own); if (own.length) patch.catalog = own; }
    if (!o.skip) patch.pricing = { ...s.pricing, depositPct: depositOf(o.depositPct, t) };
    return patch;
  }
  if (t.id === "painting") {
    if (o.skip) return {};
    const pricing = { ...s.pricing, depositPct: depositOf(o.depositPct, t) };
    for (const q of t.prices) {
      const n = Number(o.answers[q.id]);
      if (o.answers[q.id] !== "" && o.answers[q.id] !== undefined && validRate(n) && n > 0 && "pricing" in q.target) pricing[q.target.pricing] = n;
    }
    return { pricing };
  }
  patch.catalog = o.skip ? starterCatalog(t.id) : catalogWithPrices(t.id, o.answers);
  if (!o.skip) patch.pricing = { ...s.pricing, depositPct: depositOf(o.depositPct, t) };
  return patch;
}
function depositOf(v: string | number, t: Trade): number {
  const n = Number(v);
  return v === "" || !isFinite(n) ? t.depositPct : Math.min(100, Math.max(0, n));
}

/* ---------- job types and their standard texts ---------- */
/** Job types of a non-painting trade (painting's are JOB_TYPES in estimate.ts). */
export const tradeJobTypes = (trade?: string | null): TradeJobType[] => tradeById(trade).jobTypes;
export function findTradeJobType(id?: string | null): { trade: Trade; job: TradeJobType } | null {
  if (!id) return null;
  for (const t of TRADE_LIST) { const j = t.jobTypes.find((x) => x.id === id); if (j) return { trade: t, job: j }; }
  return null;
}
/** The standard estimate texts of a trade job type (scope / terms fall back to the trade's). Users' edits live in settings.typePresets[id]. */
export function jobTypePreset(id: string): TypePreset | null {
  const f = findTradeJobType(id);
  if (!f) return null;
  const { trade: t, job: j } = f, sc = j.scope || t.scope, tm = j.terms || t.terms;
  return {
    days: j.days, spec: j.spec.en, specEs: j.spec.es, services: j.services.en, servicesEs: j.services.es,
    scopeEn: sc.en.join("\n"), scopeEs: sc.es.join("\n"), termsEn: tm.en.join("\n"), termsEs: tm.es.join("\n"),
  };
}
/** Fallback texts for a trade's estimates that do not belong to one of its job types (e.g. a trade that was switched). */
export function tradeDefaultPreset(trade?: string | null): TypePreset | null {
  const t = tradeById(trade);
  return t.jobTypes.length ? jobTypePreset(t.jobTypes[0].id) : null;
}

/* ---------- request form ---------- */
/** null = painting's built-in form. */
export const leadFormFor = (trade?: string | null) => tradeById(trade).lead;
/** Which of the trade's questions apply to the chosen services (a question without `only` always applies). */
export function questionsFor(trade: string | null | undefined, services: string[]): LeadQuestion[] {
  const l = tradeById(trade).lead;
  return l ? l.questions.filter((q) => !q.only || q.only.some((s) => services.includes(s))) : [];
}
export function serviceLabel(trade: string | null | undefined, id: string, es = false): string {
  const s = tradeById(trade).lead?.services.find((x) => x.id === id);
  return s ? (es ? s.es : s.en) : id;
}
export function leadServiceJob(trade: string | null | undefined, id: string): string | null {
  return tradeById(trade).lead?.services.find((x: LeadService) => x.id === id)?.job ?? null;
}

/** Suggested hours for a line when only qty is known: qty x hours per unit (used by tests and the Costs tab). */
export const lineHours = (s: Pick<Settings, "trade" | "catalog" | "serviceRates">, it: Pick<Item, "svc" | "qty">) => num(it.qty) * catalogHrs(s, it.svc);
