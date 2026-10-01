/**
 * Measurements per job type: the things you count on an estimate of that type (walls in sq ft, ceilings, doors…),
 * each one a service of the company's catalog (unit + price). On the estimate they are number boxes; each one is
 * an ordinary line (Item with svc = the service id), so totals, hours, materials and documents work as before.
 * Cabinets keep their own doors / drawers / frames / boxes block on top of these.
 */
import { catalogLine, catalogOf } from "./trades";
import { num } from "./money";
import type { CatalogItem, Item, Settings } from "./types";

/** What each job type counts when the company has not chosen yet (ids of starter services; unknown ids are skipped). */
export const DEFAULT_MEASURES: Record<string, string[]> = {
  cabinets: [],
  interior: ["walls", "ceiling", "base", "crown", "doors", "windows", "closet", "accent", "drywall"],
  exterior: ["exterior", "soffit", "gutters", "wash", "doors", "windows"],
  other: [],
  "clean-std": ["clean-sqft", "clean-room", "clean-hour"],
  "clean-deep": ["clean-sqft", "clean-room", "clean-deep", "clean-oven", "clean-windows"],
  "clean-move": ["clean-move", "clean-oven", "clean-windows"],
  "clean-other": ["clean-hour", "clean-sqft"],
  "elec-service": ["elec-call", "elec-hour"],
  "elec-install": ["elec-outlet", "elec-gfci", "elec-light", "elec-fan"],
  "elec-panel": ["elec-panel", "elec-circuit", "elec-ev", "elec-permit"],
  "elec-other": ["elec-hour"],
  "plum-service": ["plum-call", "plum-hour", "plum-drain", "plum-leak"],
  "plum-install": ["plum-faucet", "plum-toilet", "plum-disposal"],
  "plum-heater": ["plum-heater", "plum-permit"],
  "plum-other": ["plum-hour"],
  "hand-hourly": ["hand-hour", "hand-min"],
  "hand-project": ["hand-mount", "hand-furn", "hand-shelf", "hand-drywall", "hand-door", "hand-caulk", "hand-haul"],
  "hand-other": ["hand-hour"],
  "land-recurring": ["land-visit", "land-hedge"],
  "land-project": ["land-sqft", "land-mulch", "land-hedge", "land-tree", "land-cleanup", "land-irr", "land-haul"],
  "land-other": ["land-hour"],
};

/** The service ids a job type counts: the company's choice, else the default. */
export function measureIds(s: Pick<Settings, "measures">, jobType: string): string[] {
  const own = s.measures?.[jobType];
  return Array.isArray(own) ? own : DEFAULT_MEASURES[jobType] || [];
}
/** The services a job type counts, in order (services that no longer exist are left out). */
export function measuresFor(s: Pick<Settings, "trade" | "catalog" | "serviceRates" | "measures">, jobType: string): CatalogItem[] {
  const cat = catalogOf(s);
  return measureIds(s, jobType).map((id) => cat.find((c) => c.id === id)).filter((c): c is CatalogItem => !!c);
}

/** For each measured service, the estimate line that holds it (the first line made from that service). */
export function measureLines(items: Item[], ids: string[]): Map<string, Item> {
  const out = new Map<string, Item>();
  for (const id of ids) { const it = items.find((x) => x.svc === id); if (it) out.set(id, it); }
  return out;
}

/** Sets how many of a measured service: changes its line, adds one, or (0 / empty) takes it off the estimate. */
export function setMeasureQty(items: Item[], c: CatalogItem, qty: number, newId: string): Item[] {
  const n = num(qty), at = items.findIndex((x) => x.svc === c.id);
  if (n <= 0) return at < 0 ? items : items.filter((_, i) => i !== at);
  if (at >= 0) return items.map((x, i) => (i === at ? { ...x, qty: n } : x));
  return [...items, { ...catalogLine(c, newId), qty: n }];
}
/** Changes the price of a measured service on this estimate only (its line must exist). */
export function setMeasureRate(items: Item[], id: string, rate: number): Item[] {
  const at = items.findIndex((x) => x.svc === id);
  return at < 0 ? items : items.map((x, i) => (i === at ? { ...x, rate: Math.max(0, num(rate)) } : x));
}

/** Total of the measured lines. */
export const measuresTotal = (lines: Map<string, Item>) => Math.round([...lines.values()].reduce((a, it) => a + num(it.qty) * num(it.rate), 0) * 100) / 100;
