/**
 * Expenses — pure logic ported from the prototype (section "18 · EXPENSES" and "21 · BANK CSV IMPORT").
 * No React, no Firebase: everything takes plain arrays so it can be unit-tested against the prototype's own functions.
 */
import { num, r2 } from "./money";
import type { Estimate, Expense, Payout } from "./types";

/* ------------------------------------------------------------------ categories */
export type ExpCat = { id: string; en: string; es: string; custom?: boolean };
export const EXP_CATS: ExpCat[] = [
  { id: "materials", en: "Materials", es: "Materiales" },
  { id: "labor", en: "Labor / subcontractors", es: "Mano de obra / subcontratistas" },
  { id: "ads", en: "Ads & marketing", es: "Publicidad y marketing" },
  { id: "leads", en: "Lead fees", es: "Costo de leads" },
  { id: "fuel", en: "Fuel & vehicle", es: "Gasolina y vehículo" },
  { id: "tools", en: "Tools & equipment", es: "Herramientas y equipo" },
  { id: "insurance", en: "Insurance", es: "Seguros" },
  { id: "software", en: "Software & phone", es: "Software y teléfono" },
  { id: "office", en: "Office & supplies", es: "Oficina y suministros" },
  { id: "other", en: "Other", es: "Otros" },
];
/** Team payments are not expenses in the ledger; reports show them as this pseudo-category. */
export const TEAM_CAT: ExpCat = { id: "team", en: "Team payments", es: "Pagos al equipo" };

/** Colour class suffix per category (see Expenses.css `.ex-cat.c-*`, all token based). Unknown/custom -> "other". */
export const CAT_TONE: Record<string, string> = {
  materials: "green", ads: "blue", leads: "blue", fuel: "sky", labor: "purple", insurance: "amber", software: "amber",
  tools: "orange", office: "teal", team: "pink", other: "gray",
};
export const catTone = (id: string) => CAT_TONE[id] || "gray";

/** Paid-with values are stored in English (as in the prototype); labels are shown per language. */
export const EXP_METHODS = ["Card", "Cash", "Zelle", "Check", "Transfer"] as const;
export const METHOD_ES: Record<string, string> = { Card: "Tarjeta", Cash: "Efectivo", Zelle: "Zelle", Check: "Cheque", Transfer: "Transferencia" };

type CustomCat = string | { id?: string; name?: string };
/** Built-in categories plus the contractor's own (settings.expCats: plain names, or {id,name} from the prototype). */
export function expCats(custom?: CustomCat[]): ExpCat[] {
  const extra: ExpCat[] = [];
  for (const c of custom || []) {
    const name = typeof c === "string" ? c : c?.name || c?.id || "";
    const id = typeof c === "string" ? c : c?.id || c?.name || "";
    if (name && id && !EXP_CATS.some((b) => b.id === id) && !extra.some((x) => x.id === id)) extra.push({ id, en: name, es: name, custom: true });
  }
  return EXP_CATS.concat(extra);
}
export function expCatLabel(id: string, es: boolean, custom?: CustomCat[]): string {
  const c = expCats(custom).find((x) => x.id === id) || (id === TEAM_CAT.id ? TEAM_CAT : undefined);
  return c ? (es ? c.es : c.en) : es ? "Otros" : "Other";
}
export const isMarketingCat = (id: string) => id === "ads" || id === "leads";

/* ------------------------------------------------------------------ date ranges */
export type Bounds = { from: string; to: string };
export type RangeKey = "month" | "lastmonth" | "ytd" | "lastyear" | "all" | "custom" | string; // a 4-digit year is also valid
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addMonthsYM = (ym: string, n: number): string => {
  const total = Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(5, 7)) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
};
export const lastDayOfMonth = (ym: string): string => `${ym}-${String(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()).padStart(2, "0")}`;

/** Prototype `monthBounds` (This month / Last month / this year to date / a given year / all) + Last year + custom. */
export function rangeBounds(key: RangeKey, today: string, custom?: Bounds): Bounds {
  if (key === "month") return { from: today.slice(0, 7) + "-01", to: today };
  if (key === "lastmonth") { const m = addMonthsYM(today.slice(0, 7), -1); return { from: m + "-01", to: lastDayOfMonth(m) }; }
  if (key === "ytd" || key === "year") return { from: today.slice(0, 4) + "-01-01", to: today };
  if (key === "lastyear") { const y = Number(today.slice(0, 4)) - 1; return { from: `${y}-01-01`, to: `${y}-12-31` }; }
  if (/^\d{4}$/.test(key)) return { from: key + "-01-01", to: key + "-12-31" };
  if (key === "custom") return { from: custom?.from || "", to: custom?.to || "9999-12-31" };
  return { from: "", to: "" };
}
/** Prototype `inBounds`: an empty `from` means "all time". */
export const inBounds = (d: string | undefined, b: Bounds): boolean => { const x = String(d || "").slice(0, 10); return !b.from || (x >= b.from && x <= b.to); };

/* ------------------------------------------------------------------ ledger rows and totals */
export type ExpenseRow = {
  id: string; date: string; vendor: string; amount: number; cat: string; estId: string; method: string; note: string; source: string;
  receiptUrl: string; rec?: Expense; legacy?: boolean;
};
type LegacyJobExpense = { id: string; amount?: number; desc?: string; date?: string };
/** Quick receipts logged inside a job before the ledger existed (estimate.expenses in prototype data). */
export const legacyJobExpenses = (e: Estimate): LegacyJobExpense[] => (e as unknown as { expenses?: LegacyJobExpense[] }).expenses || [];

/** The ledger plus legacy per-job receipts (prototype `allExpenseRows`). */
export function allExpenseRows(expenses: Expense[], estimates: Estimate[] = []): ExpenseRow[] {
  const rows: ExpenseRow[] = expenses.filter((x) => !(x as { deleted?: boolean }).deleted).map((x) => ({
    rec: x, id: x.id, date: x.date, vendor: x.vendor || "", amount: num(x.amount), cat: x.category || "other", estId: x.estId || "",
    method: x.method || "", note: x.note || "", source: x.source || "", receiptUrl: x.receiptUrl || "",
  }));
  for (const e of estimates) for (const x of legacyJobExpenses(e)) {
    if (!num(x.amount)) continue;
    rows.push({ legacy: true, id: "job-" + x.id, date: x.date || e.date, vendor: x.desc || "", amount: num(x.amount), cat: "materials", estId: e.id, method: "", note: "", source: "", receiptUrl: "" });
  }
  return rows;
}
export const rowsInRange = (rows: ExpenseRow[], b: Bounds) => rows.filter((r) => inBounds(r.date, b));

export type ExpenseTotals = { spent: number; ledger: number; team: number; materials: number; marketing: number; other: number };
/** The four tiles: spent (ledger + team payouts), materials, ads & leads, everything else (prototype `viewExpenses`). */
export function expenseTotals(rows: ExpenseRow[], payouts: Pick<Payout, "date" | "amount">[], b: Bounds): ExpenseTotals {
  let tot = 0, mat = 0, mkt = 0, other = 0, team = 0;
  for (const r of rowsInRange(rows, b)) { tot += r.amount; if (r.cat === "materials") mat += r.amount; else if (isMarketingCat(r.cat)) mkt += r.amount; else other += r.amount; }
  for (const p of payouts) if (inBounds(p.date, b)) team += num(p.amount);
  return { spent: r2(tot + team), ledger: r2(tot), team: r2(team), materials: r2(mat), marketing: r2(mkt), other: r2(other) };
}
/** Amount per category in a range, with team payouts as category 'team' (prototype `plFor`). Handy for Reports. */
export function categoryTotals(rows: ExpenseRow[], payouts: Pick<Payout, "date" | "amount">[], b: Bounds): { cats: Record<string, number>; total: number } {
  const cats: Record<string, number> = {}; let total = 0;
  for (const r of rowsInRange(rows, b)) { cats[r.cat] = (cats[r.cat] || 0) + r.amount; total += r.amount; }
  let team = 0; for (const p of payouts) if (inBounds(p.date, b)) team += num(p.amount);
  if (team) { cats.team = team; total += team; }
  return { cats, total: r2(total) };
}

/** Most-recent-first distinct vendors for the autocomplete (prototype `vendorsList`). */
export function vendorsList(expenses: Expense[], max = 60): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const x of [...expenses].sort((a, b) => String(b.date).localeCompare(String(a.date)))) {
    const v = String(x.vendor || "").trim();
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  }
  return out.slice(0, max);
}

/** Material spend recorded for one job: legacy per-job receipts + ledger rows of category 'materials' (prototype `jobExpenses`). */
export function jobExpensesTotal(expenses: Expense[], estId: string, legacy: { amount?: number }[] = []): number {
  let t = 0;
  for (const x of legacy) t += num(x.amount);
  for (const x of expenses) if (!(x as { deleted?: boolean }).deleted && x.estId === estId && x.category === "materials") t += num(x.amount);
  return Math.round(t * 100) / 100;
}
/**
 * Everything spent on one job, by kind: materials (category materials + legacy receipts on the estimate, same as jobExpensesTotal),
 * labor (category "labor": subcontractors / day labor paid as an expense) and other (every other category linked to the job:
 * tools, fuel, lead fees...). Used by Costs & profit so the profit counts every expense the owner tied to the job.
 */
export type JobSpend = { mat: number; labor: number; other: number; total: number };
export function jobSpend(expenses: Expense[], estId: string, legacy: { amount?: number }[] = []): JobSpend {
  const mat = jobExpensesTotal(estId ? expenses : [], estId, legacy); // no job id: an unsaved job has no linked expenses
  let labor = 0, other = 0;
  for (const x of expenses) {
    if ((x as { deleted?: boolean }).deleted || !estId || x.estId !== estId || x.category === "materials") continue;
    if (x.category === "labor") labor += num(x.amount); else other += num(x.amount);
  }
  return { mat, labor: r2(labor), other: r2(other), total: r2(mat + labor + other) };
}
/** Prototype `actualMaterials`: the listed receipts when there are any, otherwise the typed "real materials cost". */
export const actualMaterialsFrom = (listed: number, typed?: number) => (listed > 0 ? listed : num(typed));

/* ------------------------------------------------------------------ recurring */
/** settings.recurring rows. `from` (YYYY-MM) and `skip` (months the owner deleted on purpose) are additions to the stored shape. */
export type RecurringRule = { id: string; vendor: string; amount: number; category: string; source?: string; method?: string; note?: string; day: number; from?: string; active: boolean; skip?: string[] };
/** How many months back a rule may create missed months (a phone left closed for a long time never floods the ledger). */
export const RECURRING_MAX_BACKFILL = 24;
export const recurringId = (ruleId: string, ym: string) => `rec-${ruleId}-${ym}`;

/**
 * Prototype `runRecurring`, made pure: returns the expenses that are due and not yet in `existing`.
 * The id is deterministic (`rec-{ruleId}-{YYYY-MM}`) so two devices writing the same month write the same document.
 * Months missed since the rule started (or the last RECURRING_MAX_BACKFILL months) are created too.
 */
export function runRecurring(rules: RecurringRule[] | undefined, existing: { id: string }[], today: string, note = "Monthly"): Expense[] {
  const ym = today.slice(0, 7), have = new Set(existing.map((x) => x.id)), out: Expense[] = [];
  for (const r of rules || []) {
    if (r.active === false || !num(r.amount)) continue;
    const floor = addMonthsYM(ym, -(RECURRING_MAX_BACKFILL - 1));
    let cur = r.from || ym;
    if (cur < floor) cur = floor;
    for (let guard = 0; guard < RECURRING_MAX_BACKFILL + 1 && cur <= ym; guard++, cur = addMonthsYM(cur, 1)) {
      const due = cur + "-" + String(Math.min(28, Math.max(1, num(r.day) || 1))).padStart(2, "0");
      const id = recurringId(r.id, cur);
      if (due > today || have.has(id) || (r.skip || []).includes(cur)) continue;
      have.add(id);
      out.push({ id, date: due, vendor: r.vendor, amount: num(r.amount), category: r.category || "other", source: r.source || "", method: r.method || "Card", note: r.note || note, recurId: r.id });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ bank CSV import */
export const BANK_GUESS: [RegExp, string][] = [
  [/home ?depot|lowe'?s|sherwin|benjamin moore|floor ?& ?decor|menards|ace hardware|harbor freight|amazon|walmart|target|ppg|behr|grainger/i, "materials"],
  [/thumbtack|angi|homeadvisor|houzz|yelp/i, "leads"],
  [/google\W*ads|googleads|facebk|facebook|meta\W*ads|instagram|nextdoor|vistaprint|yard sign/i, "ads"],
  [/shell|chevron|exxon|mobil|bp |wawa|racetrac|speedway|sunoco|marathon|circle ?k|7-eleven|citgo|valero|sunpass|toll|autozone|jiffy|car ?wash/i, "fuel"],
  [/insur|geico|progressive|state ?farm|next ?insurance|allstate|hiscox/i, "insurance"],
  [/adobe|google ?workspace|gsuite|microsoft|verizon|at&t|att\*|t-mobile|tmobile|framer|cloudflare|netlify|intuit|quickbooks|canva|apple\.com|icloud|dropbox|openai|anthropic/i, "software"],
  [/staples|office ?depot|ups|usps|fedex/i, "office"],
  [/festool|graco|fuji|titan|home depot tool|tool rental|sunbelt|united rentals/i, "tools"],
];
const BANK_SRC: [RegExp, string][] = [[/thumbtack/i, "Thumbtack"], [/google/i, "Google"], [/facebk|facebook|meta/i, "Facebook"], [/instagram/i, "Instagram"], [/nextdoor/i, "Nextdoor"]];

/** A learned rule: when the bank description contains `match` (lowercase), use this category / source / vendor name. */
export type BankRule = { match: string; category: string; source?: string; vendor?: string };
export type BankGuess = { cat: string; src: string; vendor?: string };
/** Learned rules first (settings.bankRules), then the built-in regexes (prototype `bankGuess`). */
export function bankGuess(desc: string, rules: BankRule[] = []): BankGuess | null {
  desc = String(desc || "");
  const low = desc.toLowerCase();
  for (const r of rules) if (r.match && low.includes(r.match.toLowerCase())) return { cat: r.category, src: r.source || "", vendor: r.vendor || "" };
  let cat = "", src = "";
  for (const [re, c] of BANK_GUESS) if (!cat && re.test(desc)) cat = c;
  if (isMarketingCat(cat)) for (const [re, s] of BANK_SRC) if (!src && re.test(desc)) src = s;
  return cat ? { cat, src } : null;
}

export function cleanVendor(desc: string): string {
  let d = String(desc || "").replace(/\s+/g, " ").trim();
  d = d.replace(/^(pos |debit |purchase |recurring |ach |card |checkcard |pmnt |payment to )+/i, "").replace(/#?\d{4,}.*$/, "").replace(/\s{2,}.*/, "").trim();
  return d.slice(0, 40) || String(desc || "").slice(0, 40);
}

export type Delimiter = "," | ";" | "\t";
/** Picks the delimiter that splits the first lines most consistently (commas inside quotes and decimal commas do not fool it). */
export function detectDelimiter(text: string): Delimiter {
  const lines: string[] = [];
  let cur = "", q = false;
  for (const ch of String(text || "").replace(/^﻿/, "")) {
    if (ch === '"') q = !q;
    if (!q && (ch === "\n" || ch === "\r")) { if (cur.trim()) lines.push(cur); cur = ""; if (lines.length >= 8) break; continue; }
    cur += ch;
  }
  if (cur.trim() && lines.length < 8) lines.push(cur);
  const score = (d: Delimiter) => {
    const counts = lines.map((l) => { let n = 0, inq = false; for (const ch of l) { if (ch === '"') inq = !inq; else if (!inq && ch === d) n++; } return n; }).filter((n) => n > 0);
    if (!counts.length) return { freq: 0, n: 0 };
    const tally = new Map<number, number>(); counts.forEach((n) => tally.set(n, (tally.get(n) || 0) + 1));
    let best = { freq: 0, n: 0 }; tally.forEach((freq, n) => { if (freq > best.freq || (freq === best.freq && n > best.n)) best = { freq, n }; });
    return best;
  };
  let pick: Delimiter = ",", top = score(",");
  for (const d of [";", "\t"] as const) { const s = score(d); if (s.freq > top.freq) { pick = d; top = s; } }
  return pick;
}

/** Prototype `parseCSV` (quotes, doubled quotes, CR/LF, BOM) with a delimiter: comma, semicolon or tab (auto-detected when omitted). */
export function parseCSV(text: string, delim?: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  text = String(text || "").replace(/^﻿/, "");
  const d = delim || detectDelimiter(text);
  const flush = () => { row.push(cell); cell = ""; };
  const endRow = () => { flush(); if (row.some((c) => c.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) flush();
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; endRow(); }
    else cell += ch;
  }
  flush(); if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

export type DateOrder = "mdy" | "dmy";
/**
 * Prototype `parseBankDate` -> YYYY-MM-DD ("" when unreadable). Slash dates are month/day/year like the prototype
 * unless `order` is "dmy" (Spanish/European statements, see `detectDateOrder`).
 */
export function parseBankDate(s: string, order: DateOrder = "mdy"): string {
  s = String(s || "").trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s))) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    const [mo, da] = order === "dmy" ? [m[2], m[1]] : [m[1], m[2]];
    return y + "-" + mo.padStart(2, "0") + "-" + da.padStart(2, "0");
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : isoDay(d);
}
/** Looks at a date column: a first part above 12 means day-first; otherwise month-first (the US default). */
export function detectDateOrder(values: string[]): DateOrder {
  let dm = 0, md = 0;
  for (const v of values) {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(String(v || "").trim());
    if (!m) continue;
    if (+m[1] > 12) dm++; else if (+m[2] > 12) md++;
  }
  return dm > md ? "dmy" : "mdy";
}

/**
 * Prototype `parseMoney`: "(12.30)", "-12.30", "12.30-" are negative; currency symbols and spaces are ignored; null when empty/unreadable.
 * Added: a decimal comma ("1.234,56" or "12,50") is understood; US numbers behave exactly like the prototype.
 */
export function parseMoney(s: string): number | null {
  s = String(s ?? "").trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  let t = s.replace(/[^0-9.,]/g, "");
  const lc = t.lastIndexOf(","), ld = t.lastIndexOf(".");
  if (lc >= 0 && (ld < 0 ? /,\d{1,2}$/.test(t) && (t.match(/,/g) || []).length === 1 : lc > ld)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = parseFloat(t);
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

/** Duplicate fingerprint stored on imported expenses (prototype `bankFp`). */
export const bankFp = (date: string, desc: string, amount: number) =>
  date + "|" + r2(Math.abs(amount)).toFixed(2) + "|" + String(desc || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);

export type BankMap = { date: number; desc: number; amount: number; debit: number; credit: number };
export type BankSign = "neg" | "pos";
export type BankFile = { head: string[]; rows: string[][]; map: BankMap; sign: BankSign; dateOrder: DateOrder };

/** Prototype `detect`: guesses the columns and whether charges are negative or positive. */
export function detectColumns(head: string[], rows: string[][]): { map: BankMap; sign: BankSign; dateOrder: DateOrder } {
  const h = head.map((x) => String(x).toLowerCase());
  const find = (re: RegExp) => h.findIndex((x) => re.test(x));
  const map: BankMap = {
    date: find(/date|fecha|posted/),
    desc: find(/desc|payee|merchant|concept|name|narrat/),
    debit: find(/debit|withdraw|cargo/),
    credit: find(/credit|deposit|abono/),
    amount: find(/amount|monto|importe|\bamt\b/),
  };
  if (map.desc < 0) map.desc = find(/memo|detail/); // the prototype took "details" first, which is the DEBIT/CREDIT flag in Chase checking files
  if (map.date < 0) map.date = 0;
  if (map.desc < 0) map.desc = h.length > 2 ? 2 : 1;
  if (map.amount < 0 && map.debit < 0) map.amount = h.length - 1;
  let sign: BankSign = "neg";
  if (map.amount >= 0 && map.debit < 0) {
    let neg = 0, pos = 0;
    for (const r of rows) { const v = parseMoney(r[map.amount]); if (v === null) continue; if (v < 0) neg++; else if (v > 0) pos++; }
    sign = neg >= pos ? "neg" : "pos";
  }
  return { map, sign, dateOrder: detectDateOrder(rows.map((r) => r[map.date])) };
}

/** CSV text -> header + rows + detected columns. The header is the first of the first 8 rows that mentions date/fecha (banks add summary lines on top). */
export function parseBankFile(text: string): BankFile | null {
  const all = parseCSV(text);
  if (all.length < 2) return null;
  let hi = 0;
  for (let i = 0; i < Math.min(8, all.length); i++) if (all[i].some((c) => /date|fecha/i.test(c))) { hi = i; break; }
  const head = all[hi], rows = all.slice(hi + 1);
  return { head, rows, ...detectColumns(head, rows) };
}

export type BankItem = { date: string; desc: string; vendor: string; amount: number; cat: string; src: string; estId: string; fp: string; dup: boolean; on: boolean; guessed: boolean; changed?: boolean };
/** Fingerprints of what is already in the ledger, used to flag possible duplicates (bank fingerprint, or same date + amount). */
export function duplicateIndex(expenses: Pick<Expense, "bankFp" | "date" | "amount">[]): Set<string> {
  const have = new Set<string>();
  for (const x of expenses) { if (x.bankFp) have.add(x.bankFp); have.add("m|" + x.date + "|" + r2(num(x.amount)).toFixed(2)); }
  return have;
}
/** Prototype `build`: one item per charge row, category guessed, duplicates unchecked. */
export function buildBankItems(f: Pick<BankFile, "rows" | "map" | "sign" | "dateOrder">, rules: BankRule[], expenses: Pick<Expense, "bankFp" | "date" | "amount">[]): BankItem[] {
  const have = duplicateIndex(expenses), items: BankItem[] = [];
  for (const r of f.rows) {
    const date = parseBankDate(r[f.map.date], f.dateOrder), desc = String(r[f.map.desc] ?? "").trim();
    let amt: number | null = null;
    if (f.map.debit >= 0) { const d = parseMoney(r[f.map.debit]); amt = d ? Math.abs(d) : null; }
    else { const v = parseMoney(r[f.map.amount]); if (v !== null) amt = f.sign === "neg" ? (v < 0 ? -v : null) : v > 0 ? v : null; }
    if (!date || !amt) continue;
    const fp = bankFp(date, desc, amt), g = bankGuess(desc, rules);
    const dup = have.has(fp) || have.has("m|" + date + "|" + r2(amt).toFixed(2));
    items.push({ date, desc, vendor: g?.vendor || cleanVendor(desc), amount: r2(amt), cat: g?.cat || "other", src: g?.src || "", estId: "", fp, dup, on: !dup, guessed: !!g });
  }
  return items;
}

export const MAX_BANK_RULES = 500;
/** Rules to remember after an import: every selected charge whose category the owner set (or that had no guess), keyed by cleaned vendor. */
export function learnRules(selected: BankItem[], rules: BankRule[]): BankRule[] {
  const out = rules.map((r) => ({ ...r }));
  for (const x of selected) {
    if (!(x.changed || !x.guessed)) continue;
    const key = cleanVendor(x.desc).toLowerCase();
    if (key.length < 3) continue;
    const src = isMarketingCat(x.cat) ? x.src : "";
    const ex = out.find((r) => r.match.toLowerCase() === key);
    if (ex) { ex.category = x.cat; ex.source = src; ex.vendor = x.vendor; } else out.push({ match: key, category: x.cat, source: src, vendor: x.vendor });
  }
  return out.slice(-MAX_BANK_RULES);
}
