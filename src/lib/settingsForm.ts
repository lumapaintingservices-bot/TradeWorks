/** Pure helpers for the Settings cards (validation, list editing, stable comparison). */
import type { Discount, Settings } from "./types";

/** JSON with sorted keys, so "did anything change?" is not fooled by Firestore reordering fields. */
export function stable(v: unknown): string {
  if (v === undefined) return "";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map((x) => (x === undefined ? "null" : stable(x))).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + stable(o[k])).join(",") + "}";
}
export const clone = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** Path of the first number below zero (or not a number) anywhere in `v`, or null. */
export function firstBadNumber(v: unknown, path = ""): string | null {
  if (typeof v === "number") return isFinite(v) && v >= 0 ? null : path || "value";
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const r = firstBadNumber(v[i], `${path}[${i}]`); if (r) return r; } return null; }
  if (v && typeof v === "object") { for (const [k, x] of Object.entries(v as Record<string, unknown>)) { const r = firstBadNumber(x, path ? `${path}.${k}` : k); if (r) return r; } }
  return null;
}

/** "one per line" text <-> list of lines. */
export const linesOf = (text: string): string[] => String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
export const textOf = (lines?: string[]): string => (lines || []).join("\n");

/** Moves item `i` one step (-1 up, +1 down). Returns a new list. */
export function moveItem<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || j < 0 || i >= list.length || j >= list.length) return list;
  const out = list.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Trim, drop empty and repeated (ignoring case) lead sources, keeping the first spelling and the order. */
export function cleanSources(list: string[]): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const raw of list) {
    const s = String(raw || "").trim().replace(/\s+/g, " ");
    const k = s.toLowerCase();
    if (!s || seen.has(k)) continue;
    seen.add(k); out.push(s);
  }
  return out;
}

export type DiscountCheck = { ok: true; list: Discount[] } | { ok: false; error: { en: string; es: string } };
/** Validates the discount table: code required and unique, value >= 0, percent <= 100. Codes are stored upper case. */
export function cleanDiscounts(list: Discount[]): DiscountCheck {
  const seen = new Set<string>(), out: Discount[] = [];
  for (const d of list) {
    const code = String(d.code || "").trim().toUpperCase();
    if (!code) return { ok: false, error: { en: "Every discount needs a code.", es: "Cada descuento necesita un código." } };
    if (seen.has(code)) return { ok: false, error: { en: `The code ${code} appears twice.`, es: `El código ${code} está repetido.` } };
    seen.add(code);
    const value = Number(d.value);
    if (!isFinite(value) || value < 0) return { ok: false, error: { en: `${code}: the value can't be negative.`, es: `${code}: el valor no puede ser negativo.` } };
    if (d.type === "percent" && value > 100) return { ok: false, error: { en: `${code}: a percent can't be more than 100.`, es: `${code}: un porcentaje no puede pasar de 100.` } };
    out.push({ code, type: d.type === "fixed" ? "fixed" : "percent", value, label: String(d.label || "").trim(), labelEs: String(d.labelEs || "").trim(), active: d.active !== false });
  }
  return { ok: true, list: out };
}

/** Only the rates that differ from the catalog default are stored as overrides. */
export function rateOverrides(catalog: { id: string; rate: number }[], rates: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sv of catalog) {
    const v = rates[sv.id];
    if (typeof v === "number" && isFinite(v) && v >= 0 && Math.round(v * 10000) !== Math.round(sv.rate * 10000)) out[sv.id] = v;
  }
  return out;
}

/** Whole-number counter (next estimate / invoice number): at least 1. */
export const counter = (n: number): number => Math.max(1, Math.round(Number(n) || 0));

export type Supplies = Settings["materials"]["supplies"];
/** Supplies for the form: the old "job" basis is shown as "item" (same math), missing qty is 1. */
export const formSupplies = (list: Supplies): Supplies => (list || []).map((s) => ({ ...s, basis: s.basis === "door" || s.basis === "drawer" ? s.basis : "item", qty: s.qty === undefined ? 1 : s.qty }));
