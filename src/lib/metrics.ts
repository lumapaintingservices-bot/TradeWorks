/**
 * Metrics library — pure port of the prototype's dashboard / reports / charts maths (no React, no Firebase, no hooks).
 *
 * Everything takes plain arrays plus a `now: Date` (see `Ctx`), so it can be unit-tested against the prototype's own
 * functions (src/lib/metrics.test.ts runs them through node:vm on the same inputs).
 *
 * Prototype function -> export:
 *   jobExpenses / jobCosts ............ jobCosts          plFor ............ plFor            incomeRows ..... incomeRows
 *   marketingFor ...................... marketingFor      wonSummary ....... wonSummary       closeStats ..... closeStats
 *   netProfitHTML (numbers) ........... netProfit        KPI_LIB .......... KPI_LIB          kpiValue(id,b) . kpiRaw
 *   kpiCardHTML (value + delta) ....... kpiValue         periodPair ....... periodPair       kpiSeries ...... kpiSeries
 *   insightsHTML (numbers) ............ insights, insightMonthJobs, PRICE_BANDS, bandLabel
 *   goalHTML (numbers) ................ goalProgress     glanceHTML (still to collect) .... stillToCollect
 *   glanceHTML (cash this month) ...... cashThisMonth    glanceHTML (invoices card) ....... invoiceSummary
 *   glanceHTML (P&L card) ............. plCompare        glMoneyChartHTML / monthSeries ... moneySeries
 *   viewReports (P&L / jobs / mkt) .... plSeries, plBreakdown, profitByJob, allJobsRows, marketingRows
 *   exportCSV ......................... exportCsv (+ exportCsvRows, csvFileName)
 *
 * Deliberate differences from the prototype (React data shapes):
 *  - invoices reference their job with `estId` (prototype: `estimateId`) and change-order invoices have kind "co" (prototype "change").
 *  - job status comes from ./followups `jobStatus` (an invoice status of "Sent" no longer overrides the estimate status).
 *  - `goal` (monthly sales goal, prototype `DB.goal.sales`) is passed as an argument: Settings has no such field yet.
 *  - user-visible words that the prototype produced with TT() ("Not set", "Unnamed client", month names) follow `ctx.lang` (default "en").
 */
import { calcEstimate, calcMaterials, crewCost, jobHours, jobTypeLabel, jobTypeOf, laborModeFor } from "./estimate";
import {
  allExpenseRows, addMonthsYM, expCatLabel, expCats, inBounds, isMarketingCat, jobExpensesTotal, lastDayOfMonth, legacyJobExpenses, rowsInRange,
  type Bounds,
} from "./expenses";
import { addDaysISO, daysBetween, dayOf, jobStatus as statusOf, todayISO } from "./followups";
import { coSignedTotal } from "./invoices";
import { num, r2 } from "./money";
import { entryPay, overtime } from "./team";
import type { Client, EstStatus, Estimate, Expense, HourEntry, Invoice, Payout, Settings, Worker } from "./types";

export type { Bounds };
export type Lang = "en" | "es";
export type Ctx = {
  estimates: Estimate[]; invoices: Invoice[]; expenses: Expense[]; payouts: Payout[]; hours: HourEntry[]; workers: Worker[]; clients: Client[];
  settings: Settings; now: Date; lang?: Lang;
};

/* ------------------------------------------------------------------ small shared helpers */
type Flagged = { deleted?: boolean };
const live = <T,>(a: T[] | undefined): T[] => (a || []).filter((x) => !(x as Flagged).deleted);
const lang = (c: Ctx): Lang => c.lang || "en";
const tt = (c: Ctx, en: string, es: string) => (lang(c) === "es" ? es : en);
const today = (c: Ctx) => todayISO(c.now);
const monthStart = (iso: string) => iso.slice(0, 7) + "-01";
const lastDay = (ym: string) => lastDayOfMonth(ym);
const yearBounds = (y: string | number): Bounds => ({ from: `${y}-01-01`, to: `${y}-12-31` });
const isYear = (k: string) => /^\d{4}$/.test(k);
const monthLabel = (ym: string, l: Lang) => new Date(ym + "-15T12:00:00").toLocaleDateString(l === "es" ? "es-US" : "en-US", { month: "short" }).replace(".", "");
/** "September 2026" — the chart tooltip title (monthSeries `tip`). */
const monthTip = (ym: string, l: Lang) => new Date(ym + "-15T12:00:00").toLocaleDateString(l === "es" ? "es-US" : "en-US", { month: "long", year: "numeric" });

/** Job states that count as "won" (prototype WON_ST). */
export const WON_ST: Record<string, 1> = { "Accepted": 1, "Deposit Paid": 1, "Paid in Full": 1 };
export const isWon = (st: string) => !!WON_ST[st];
export const jobStatus = (c: Ctx, e: Estimate): EstStatus => statusOf(e, c.invoices);
/** Prototype jobRefDate: the day a job is filed under in money reports. */
export const jobRefDate = (e: Estimate) => e.startDate || e.date || "";
const invoicesOfJob = (c: Ctx, estId: string) => c.invoices.filter((v) => v.estId === estId);
const paidOfJob = (c: Ctx, estId: string) => invoicesOfJob(c, estId).reduce((t, v) => t + (v.status === "Paid" ? num(v.amount) : 0), 0);
const totalOf = (c: Ctx, e: Estimate) => calcEstimate(e, c.settings).total;
const workerOf = (c: Ctx, id: string) => c.workers.find((w) => w.id === id);
// labor cost of an entry = straight time + its share of the week's overtime (computed once per hours list)
const otCache = new WeakMap<HourEntry[], Map<string, number>>();
const otOf = (c: Ctx) => { let m = otCache.get(c.hours); if (!m) { m = overtime(live(c.hours), c.workers).byEntry; otCache.set(c.hours, m); } return m; };
const hourCost = (c: Ctx, h: HourEntry) => entryPay(h, workerOf(c, h.workerId), otOf(c));
const clientOf = (c: Ctx, id?: string) => (id ? c.clients.find((x) => x.id === id) : undefined);

/** Prototype nameOf: linked client first, then the record's own snapshot. Works for estimates and invoices. */
export function nameOf(c: Ctx, r: { clientId?: string; clientName?: string }): string {
  const cl = clientOf(c, r.clientId);
  return (cl && cl.name) || r.clientName || tt(c, "Unnamed client", "Cliente sin nombre");
}

/** Prototype rangeBounds(kind) of the dashboard: month / year use "-31" / "-12-31" upper bounds, anything else is all time. */
export function wonRangeBounds(kind: string, now: Date): Bounds {
  const t = todayISO(now);
  if (kind === "month") return { from: t.slice(0, 7) + "-01", to: t.slice(0, 7) + "-31" };
  if (kind === "year") return yearBounds(t.slice(0, 4));
  return { from: "", to: "" };
}

/* ------------------------------------------------------------------ job costs (jobCosts) */
export type JobCosts = {
  price: number; paid: number; mat: number; plannedMat: number; other: number; labor: number; hrs: number; cost: number; profit: number; margin: number; hasReal: boolean;
};
/** Port of jobCosts(e): price, paid (paid invoices), materials (receipts), other job expenses, labor (hours x rate), profit, margin, planned materials. */
export function jobCosts(c: Ctx, e: Estimate): JobCosts {
  let mat = jobExpensesTotal(c.expenses, e.id, legacyJobExpenses(e)), other = 0, labor = 0, hrs = 0;
  if (!(mat > 0)) mat = 0;
  for (const x of live(c.expenses)) { if (x.estId !== e.id) continue; if (x.category !== "materials") other += num(x.amount); }
  for (const h of live(c.hours)) if (h.estId === e.id) { labor += hourCost(c, h); hrs += num(h.hours); }
  const price = totalOf(c, e), paid = paidOfJob(c, e.id);
  let plannedMat = 0; try { plannedMat = calcMaterials(e, c.settings).totalCost; } catch { /* no plan */ }
  const cost = r2(mat + other + labor), profit = r2(price - cost);
  return { price, paid, mat: r2(mat), plannedMat, other: r2(other), labor: r2(labor), hrs, cost, profit, margin: price ? (profit / price) * 100 : 0, hasReal: mat > 0 || other > 0 || labor > 0 };
}

/* ------------------------------------------------------------------ P&L, income, marketing */
export type IncomeRow = { date: string; amount: number; v: Invoice };
/** Port of incomeRows(b): paid invoices by the day they were paid (paidDate, else the invoice date). */
export function incomeRows(c: Ctx, b: Bounds): IncomeRow[] {
  const out: IncomeRow[] = [];
  for (const v of c.invoices) { if (v.status !== "Paid") continue; const d = v.paidDate || v.date; if (inBounds(d, b)) out.push({ date: d, amount: num(v.amount), v }); }
  return out;
}
export type PL = { income: number; expenses: number; profit: number; cats: Record<string, number>; margin: number };
/** Port of plFor(b): income = invoices Paid by paidDate; expenses = every ledger row + legacy job receipts + team payouts (category "team"). */
export function plFor(c: Ctx, b: Bounds): PL {
  let inc = 0; for (const r of incomeRows(c, b)) inc += r.amount;
  const cats: Record<string, number> = {}; let exp = 0;
  for (const r of rowsInRange(allExpenseRows(c.expenses, c.estimates), b)) { cats[r.cat] = (cats[r.cat] || 0) + r.amount; exp += r.amount; }
  let team = 0; for (const p of live(c.payouts)) if (inBounds(p.date, b)) team += num(p.amount);
  if (team) { cats.team = team; exp += team; }
  return { income: r2(inc), expenses: r2(exp), profit: r2(inc - exp), cats, margin: inc ? ((inc - exp) / inc) * 100 : 0 };
}
export type MarketingRow = { spend: number; leads: number; won: number; rev: number };
/** Port of marketingFor(b): per lead source -> spend (ads + lead fees), leads, won, revenue. */
export function marketingFor(c: Ctx, b: Bounds): Record<string, MarketingRow> {
  const src: Record<string, MarketingRow> = {};
  const notSet = tt(c, "Not set", "Sin anotar");
  const o = (s: string) => { s = s || notSet; return (src[s] = src[s] || { spend: 0, leads: 0, won: 0, rev: 0 }); };
  for (const r of rowsInRange(allExpenseRows(c.expenses, c.estimates), b)) if (isMarketingCat(r.cat)) o(r.source || notSet).spend += r.amount;
  /* a lead = a client who reached out: every estimate with a source, plus leads that never got an estimate */
  const counted: Record<string, 1> = {};
  for (const e of c.estimates) {
    if (!inBounds(e.date, b) || !e.leadSource) continue;
    const key = e.clientId || nameOf(c, e);
    if (!counted[key]) { counted[key] = 1; o(e.leadSource).leads++; }
    if (isWon(jobStatus(c, e))) { const x = o(e.leadSource); x.won++; x.rev += totalOf(c, e); }
  }
  for (const cl of c.clients) {
    if ((cl as Flagged).deleted || !cl.source || counted[cl.id] || !inBounds(dayOf(cl.createdAt), b)) continue;
    if (c.estimates.some((e) => e.clientId === cl.id)) continue;
    counted[cl.id] = 1; o(String(cl.source).replace(/^Website \(([^)]+)\)$/, "$1")).leads++;
  }
  return src;
}
export type MarketingSummaryRow = MarketingRow & { source: string; cpl: number; cpj: number; roi: number };
/** Numbers of the Reports > Marketing tab: rows sorted by spend then revenue, cost per lead / per job won, return per $1, and totals. */
export function marketingRows(c: Ctx, b: Bounds) {
  const src = marketingFor(c, b);
  const keys = Object.keys(src).sort((a, z) => src[z].spend - src[a].spend || src[z].rev - src[a].rev);
  let spend = 0, leads = 0, won = 0, rev = 0;
  const rows: MarketingSummaryRow[] = keys.map((s) => {
    const x = src[s]; spend += x.spend; leads += x.leads; won += x.won; rev += x.rev;
    return { source: s, ...x, cpl: x.leads && x.spend ? x.spend / x.leads : 0, cpj: x.won && x.spend ? x.spend / x.won : 0, roi: x.spend ? x.rev / x.spend : 0 };
  });
  return { rows, totals: { spend, leads, won, rev, cpl: leads && spend ? spend / leads : 0, cpj: won && spend ? spend / won : 0, roi: spend ? rev / spend : 0 } };
}

/** Years that have estimates or ledger rows, plus the current one, newest first (Reports range pills). */
export function reportYears(c: Ctx): string[] {
  const years: Record<string, 1> = { [today(c).slice(0, 4)]: 1 };
  for (const e of c.estimates) { const y = String(e.date || "").slice(0, 4); if (isYear(y)) years[y] = 1; }
  for (const x of live(c.expenses)) { const y = String(x.date || "").slice(0, 4); if (isYear(y)) years[y] = 1; }
  return Object.keys(years).sort().reverse();
}
export type PlPoint = { key: string; label: string; b: Bounds; inc: number; exp: number; pro: number };
/** Reports > P&L chart: 12 months of a picked year, or one point per year when the range is "all". */
export function plSeries(c: Ctx, rangeKey: string): PlPoint[] {
  const l = lang(c), pts: Omit<PlPoint, "inc" | "exp" | "pro">[] = [];
  if (isYear(rangeKey)) for (let i = 0; i < 12; i++) { const mk = rangeKey + "-" + String(i + 1).padStart(2, "0"); pts.push({ key: mk, label: monthLabel(mk, l), b: { from: mk + "-01", to: mk + "-31" } }); }
  else reportYears(c).slice().sort().forEach((y) => pts.push({ key: y, label: y, b: yearBounds(y) }));
  return pts.map((m) => { const p = plFor(c, m.b); return { ...m, inc: p.income, exp: p.expenses, pro: p.profit }; });
}
/** "Where the money went": categories by amount (team payments included), each with its % of total expenses. */
export function plBreakdown(pl: PL): { cat: string; amount: number; pct: number }[] {
  return Object.keys(pl.cats).sort((a, z) => pl.cats[z] - pl.cats[a]).map((k) => ({ cat: k, amount: pl.cats[k], pct: pl.expenses ? Math.round((pl.cats[k] / pl.expenses) * 100) : 0 }));
}
/** Home "Profit & loss" card: this period vs the previous one; `deltaPct` is null when the previous profit is 0. */
export function plCompare(c: Ctx, period: Period) {
  const pp = periodPair(period, c.now), a = plFor(c, pp[0]), b = plFor(c, pp[1]);
  return { a, b, deltaPct: b.profit ? ((a.profit - b.profit) / Math.abs(b.profit)) * 100 : null };
}
/** Cash this month: money in - money out from the 1st to today (glanceHTML "Cash this month"). */
export function cashThisMonth(c: Ctx): PL & { max: number } {
  const cm = plFor(c, { from: monthStart(today(c)), to: today(c) });
  return { ...cm, max: Math.max(cm.income, cm.expenses, 1) };
}
/** Money tab tiles (netProfitHTML): money in, money out split into materials / team / other, net profit and margin. */
export function netProfit(c: Ctx, kind: string) {
  const pl = plFor(c, wonRangeBounds(kind, c.now)), materials = pl.cats.materials || 0, team = pl.cats.team || 0;
  return { income: pl.income, expenses: pl.expenses, profit: pl.profit, margin: pl.margin, materials, team, other: r2(pl.expenses - materials - team) };
}

/* ------------------------------------------------------------------ money tab: won / close stats */
export type WonRow = { e: Estimate; st: EstStatus; total: number; paid: number; due: number; mat: number };
export type WonSummary = { kind: string; list: WonRow[]; n: number; total: number; collected: number; due: number; mat: number; after: number; avg: number };
/** Port of wonSummary(kind): signed jobs (incl. signed change orders) in the period, what was collected, materials, what is left. */
export function wonSummary(c: Ctx, kind: string): WonSummary {
  const b = wonRangeBounds(kind, c.now), list: WonRow[] = []; let total = 0, collected = 0, mat = 0;
  for (const e of c.estimates) {
    const st = jobStatus(c, e);
    if (!isWon(st)) continue;
    const d = jobRefDate(e);
    if (b.from && (!d || d < b.from || d > b.to)) continue;
    const tot = totalOf(c, e) + coSignedTotal(e), paid = paidOfJob(c, e.id);
    const listed = jobExpensesTotal(c.expenses, e.id, legacyJobExpenses(e));
    let mc = listed > 0 ? listed : num(e.actualMaterialCost); // actualMaterials(e)
    if (!(mc > 0)) mc = calcMaterials(e, c.settings).totalCost;
    total += tot; collected += paid; mat += num(mc);
    list.push({ e, st, total: r2(tot), paid: r2(paid), due: r2(tot - paid), mat: r2(mc) });
  }
  list.sort((a, z) => String(jobRefDate(z.e)).localeCompare(String(jobRefDate(a.e))));
  return { kind, list, n: list.length, total: r2(total), collected: r2(collected), due: r2(total - collected), mat: r2(mat), after: r2(total - mat), avg: list.length ? r2(total / list.length) : 0 };
}
export type CloseStats = { sent: number; won: number; lost: number; open: number; rate: number; decided: number; avgBid: number };
/** Port of closeStats(kind): close rate and average bid by estimate date. */
export function closeStats(c: Ctx, kind: string): CloseStats {
  const b = wonRangeBounds(kind, c.now); let sent = 0, won = 0, lost = 0, bids = 0;
  for (const e of c.estimates) {
    const st = jobStatus(c, e);
    if (st === "Draft") continue;
    const d = e.date || e.sentAt || "";
    if (b.from && (!d || d.slice(0, 10) < b.from || d.slice(0, 10) > b.to)) continue;
    sent++; bids += totalOf(c, e);
    if (isWon(st)) won++; else if (st === "Declined") lost++;
  }
  return { sent, won, lost, open: sent - won - lost, rate: sent ? Math.round((won / sent) * 100) : 0, decided: won + lost ? Math.round((won / (won + lost)) * 100) : 0, avgBid: sent ? r2(bids / sent) : 0 };
}

/* ------------------------------------------------------------------ profit by job / all jobs */
export type JobRow = {
  e: Estimate; c: JobCosts;
  /** "All jobs: income vs costs" numbers (allJobsHTML). */
  expMat: number; expLab: number; expCost: number; actCost: number; inPct: number; coPct: number; margin: number; over: boolean;
};
/** Won jobs of a period with their real costs, most profitable first (Reports > Profit by job), plus totals and the all-jobs bars. */
export function profitByJob(c: Ctx, b: Bounds) {
  const jobs = c.estimates.filter((e) => isWon(jobStatus(c, e)) && inBounds(jobRefDate(e), b)).map((e) => ({ e, c: jobCosts(c, e) })).sort((p, q) => q.c.profit - p.c.profit);
  let profit = 0, revenue = 0; for (const j of jobs) { profit += j.c.profit; revenue += j.c.price; }
  const rows: JobRow[] = jobs.map((j) => {
    const e = j.e, k = j.c, expMat = k.plannedMat || 0; let expLab = 0;
    try { if (laborModeFor(e, c.settings) === "crew") expLab = crewCost(e, jobHours(e, c.settings), c.settings); } catch { /* no plan */ }
    const expCost = r2(expMat + expLab), actCost = k.cost;
    const inPct = k.price ? Math.min(100, (k.paid / k.price) * 100) : 0, coPct = expCost ? Math.min(100, (actCost / expCost) * 100) : actCost ? 100 : 0;
    const margin = k.hasReal ? k.margin : k.price ? ((k.price - expCost) / k.price) * 100 : 0;
    return { e, c: k, expMat, expLab, expCost, actCost, inPct, coPct, margin, over: !!(expCost && actCost > expCost) };
  });
  return { rows, jobs: jobs.length, revenue, profit, margin: revenue ? (profit / revenue) * 100 : null };
}
/** Alias kept for readability where only the bars are needed. */
export const allJobsRows = (c: Ctx, b: Bounds) => profitByJob(c, b).rows;

/* ------------------------------------------------------------------ periods and KPIs */
export type Period = "month" | "lastmonth" | "ytd" | "lastyear";
export const KPI_PERIODS: [Period, string, string][] = [["month", "This month", "Este mes"], ["lastmonth", "Last month", "Mes pasado"], ["ytd", "This year to date", "Este año hasta hoy"], ["lastyear", "Last year", "Año pasado"]];
/** Port of periodPair(p): the period and the one it is compared with (unknown values behave like "ytd"). */
export function periodPair(p: Period | string, now: Date): [Bounds, Bounds] {
  const t = todayISO(now), y = +t.slice(0, 4);
  if (p === "month") { const pm = addMonthsYM(t.slice(0, 7), -1), dd = t.slice(8, 10), pl = lastDay(pm).slice(8); return [{ from: monthStart(t), to: t }, { from: pm + "-01", to: pm + "-" + (dd > pl ? pl : dd) }]; }
  if (p === "lastmonth") { const a = addMonthsYM(t.slice(0, 7), -1), b = addMonthsYM(t.slice(0, 7), -2); return [{ from: a + "-01", to: lastDay(a) }, { from: b + "-01", to: lastDay(b) }]; }
  if (p === "lastyear") return [yearBounds(y - 1), yearBounds(y - 2)];
  return [{ from: y + "-01-01", to: t }, { from: y - 1 + "-01-01", to: y - 1 + t.slice(4) }];
}

export type KpiFormat = "money" | "pct" | "count";
export type KpiDef = {
  id: string; en: string; es: string; subEn: string; subEs: string; format: KpiFormat;
  /** true = green when it goes down (money out, cost per lead...). */
  lowerIsBetter: boolean;
  /** true = "as of today" KPI: ignores the period and has no previous-period comparison. */
  asOfToday: boolean;
  /** key in KPI_ICONS (src/design/icons.ts) — same as the id. */
  icon: string;
  value: (c: Ctx, b: Bounds) => number | null;
};
const wonJobs = (c: Ctx, b: Bounds) => c.estimates.filter((e) => isWon(jobStatus(c, e)) && inBounds(jobRefDate(e), b));
const sumMarketing = (c: Ctx, b: Bounds) => { const m = marketingFor(c, b); let sp = 0, ld = 0; for (const k of Object.keys(m)) { sp += m[k].spend; ld += m[k].leads; } return { sp, ld }; };
const def = (id: string, en: string, es: string, subEn: string, subEs: string, format: KpiFormat, value: KpiDef["value"], o: { bad?: boolean; now?: boolean } = {}): KpiDef =>
  ({ id, en, es, subEn, subEs, format, lowerIsBetter: !!o.bad, asOfToday: !!o.now, icon: id, value });

/** The 14 KPIs of the library (KPI_LIB) with the maths of kpiValue(id, b). */
export const KPI_LIB: KpiDef[] = [
  def("job_margin", "Job profit margin", "Margen de los trabajos", "Real profit ÷ price of the jobs won", "Ganancia real ÷ precio de los trabajos ganados", "pct", (c, b) => {
    let pr = 0, pc = 0; for (const e of wonJobs(c, b)) { const k = jobCosts(c, e); pr += k.profit; pc += k.price; } return pc ? (pr / pc) * 100 : null; }),
  def("net_profit", "Net profit", "Ganancia neta", "Money in − everything spent", "Lo que entró − todo lo gastado", "money", (c, b) => plFor(c, b).profit),
  def("sales_won", "Sales won", "Ventas ganadas", "Jobs signed in the period", "Trabajos firmados en el periodo", "money", (c, b) => { let s = 0; for (const e of wonJobs(c, b)) s += totalOf(c, e); return s; }),
  def("backlog", "Backlog", "Trabajo por hacer", "Signed jobs not paid in full yet", "Trabajos firmados sin pagar completos", "money", (c) => {
    let bk = 0; for (const e of c.estimates) { const st = jobStatus(c, e); if (isWon(st) && st !== "Paid in Full") bk += totalOf(c, e); } return bk; }, { now: true }),
  def("money_in", "Money in", "Entró", "Invoices paid", "Facturas pagadas", "money", (c, b) => plFor(c, b).income),
  def("money_out", "Money out", "Salió", "Expenses + team payments", "Gastos + pagos al equipo", "money", (c, b) => plFor(c, b).expenses, { bad: true }),
  def("close_rate", "Close rate", "Tasa de cierre", "Won ÷ estimates sent", "Ganados ÷ estimados enviados", "pct", (c, b) => {
    let sent = 0, w = 0; for (const e of c.estimates) { const st = jobStatus(c, e); if (!inBounds(e.date, b) || st === "Draft") continue; sent++; if (isWon(st)) w++; } return sent ? (w / sent) * 100 : null; }),
  def("avg_job", "Average job", "Trabajo promedio", "Average price of jobs won", "Precio promedio de los trabajos ganados", "money", (c, b) => {
    const w = wonJobs(c, b); let s = 0; for (const e of w) s += totalOf(c, e); return w.length ? s / w.length : null; }),
  def("leads", "New leads", "Leads nuevos", "Clients who reached out", "Clientes que escribieron", "count", (c, b) => { const m = marketingFor(c, b); let n = 0; for (const k of Object.keys(m)) n += m[k].leads; return n; }),
  def("cpl", "Cost per lead", "Costo por lead", "Ads + lead fees ÷ leads", "Publicidad + leads ÷ leads", "money", (c, b) => { const { sp, ld } = sumMarketing(c, b); return ld && sp ? sp / ld : null; }, { bad: true }),
  def("unpaid", "Unpaid invoices", "Facturas sin pagar", "Sent and not paid yet", "Enviadas y sin pagar", "money", (c) => {
    let u = 0; for (const v of c.invoices) { const st = v.status as string; if (st !== "Paid" && st !== "Draft" && st !== "Void") u += num(v.amount); } return u; }, { now: true, bad: true }),
  def("labor", "Team labor cost", "Costo del equipo", "Hours logged × rate", "Horas anotadas × tarifa", "money", (c, b) => { let l = 0; for (const h of live(c.hours)) if (inBounds(h.date, b)) l += hourCost(c, h); return l; }, { bad: true }),
  def("mat_pct", "Materials % of sales", "Materiales % de ventas", "Materials spent ÷ money in", "Materiales gastados ÷ lo que entró", "pct", (c, b) => { const p = plFor(c, b); return p.income ? ((p.cats.materials || 0) / p.income) * 100 : null; }, { bad: true }),
  def("jobs_done", "Jobs paid in full", "Trabajos pagados", "Jobs finished and paid", "Trabajos terminados y pagados", "count", (c, b) => c.estimates.filter((e) => jobStatus(c, e) === "Paid in Full" && inBounds(jobRefDate(e), b)).length),
];
/** The four cards shown until the contractor picks their own (KPI_DEFAULT). */
export const KPI_DEFAULT: { id: string; p: Period }[] = [{ id: "job_margin", p: "ytd" }, { id: "net_profit", p: "ytd" }, { id: "sales_won", p: "ytd" }, { id: "backlog", p: "ytd" }];
export const kpiDef = (id: string): KpiDef | undefined => KPI_LIB.find((k) => k.id === id);

/** Port of kpiValue(id, b): the raw number for explicit bounds (null = no data, shown as "—"). */
export function kpiRaw(c: Ctx, id: string, b: Bounds): number | null { const d = kpiDef(id); return d ? d.value(c, b) : null; }
/** Port of kpiFmt(def, v): "—" for no data, "52.0%", "12" or "$1,234.00". */
export function kpiFormat(d: Pick<KpiDef, "format">, v: number | null | undefined, fmtMoney: (n: number) => string): string {
  if (v === null || v === undefined || isNaN(v)) return "—";
  if (d.format === "pct") return v.toFixed(1) + "%";
  if (d.format === "count") return String(Math.round(v));
  return fmtMoney(v);
}
export type KpiResult = {
  id: string; period: Period; value: number | null; prev: number | null;
  /** % change vs the previous period (percentage POINTS for pct KPIs); null when it can't be computed or the KPI is "as of today". */
  delta: number | null; deltaIsPoints: boolean; good: boolean | null;
};
/** Port of the numbers in kpiCardHTML: value for the period, previous-period value and the delta pill. */
export function kpiValue(c: Ctx, id: string, period: Period | string = "ytd"): KpiResult {
  const d = kpiDef(id), pp = periodPair(period, c.now), p = (period || "ytd") as Period;
  if (!d) return { id, period: p, value: null, prev: null, delta: null, deltaIsPoints: false, good: null };
  const value = d.value(c, pp[0]), prev = d.asOfToday ? null : d.value(c, pp[1]);
  let delta: number | null = null;
  if (prev !== null && prev !== undefined && value !== null && !isNaN(prev) && !isNaN(value)) {
    const dd = d.format === "pct" ? value - prev : prev ? ((value - prev) / Math.abs(prev)) * 100 : null;
    if (dd !== null && isFinite(dd)) delta = dd;
  }
  return { id, period: p, value, prev, delta, deltaIsPoints: d.format === "pct", good: delta === null ? null : d.lowerIsBetter ? delta <= 0 : delta >= 0 };
}
export type SeriesPoint = { key: string; label: string; tip: string; v: number };
/** Port of kpiSeries(id): one value per month, oldest first (default last 6 months); no data counts as 0. */
export function kpiSeries(c: Ctx, id: string, months = 6): SeriesPoint[] {
  const out: SeriesPoint[] = [], t = today(c).slice(0, 7);
  for (let i = months - 1; i >= 0; i--) {
    const ym = addMonthsYM(t, -i);
    out.push({ key: ym, label: monthLabel(ym, lang(c)), tip: monthTip(ym, lang(c)), v: kpiRaw(c, id, { from: ym + "-01", to: lastDay(ym) }) || 0 });
  }
  return out;
}

/* ------------------------------------------------------------------ home: money series, still to collect, invoices, goal */
/** Port of glMoneyChartHTML numbers + monthSeries(12, plFor): money in / out per month, the 12-month total and the change vs the 12 months before. */
export function moneySeries(c: Ctx, months = 12) {
  const t = today(c).slice(0, 7), points = [];
  let total = 0;
  for (let i = months - 1; i >= 0; i--) {
    const ym = addMonthsYM(t, -i), p = plFor(c, { from: ym + "-01", to: lastDay(ym) });
    points.push({ key: ym, label: monthLabel(ym, lang(c)), tip: monthTip(ym, lang(c)), income: p.income, expenses: p.expenses, profit: p.profit });
    total += p.income;
  }
  const prevTotal = plFor(c, { from: addMonthsYM(t, -(2 * months - 1)) + "-01", to: lastDay(addMonthsYM(t, -months)) }).income;
  return { points, total, prevTotal, deltaPct: prevTotal ? ((total - prevTotal) / prevTotal) * 100 : null };
}
export type OweRow = { e: Estimate; v: number };
/** "Still to collect" (signed jobs with a balance > 50 cents, biggest first) and "deposits in on jobs not finished yet" (glanceHTML). */
export function stillToCollect(c: Ctx) {
  const toCollect: OweRow[] = [], ahead: OweRow[] = [], t = today(c);
  for (const e of c.estimates) {
    const st = jobStatus(c, e); if (!isWon(st)) continue;
    const k = jobCosts(c, e), owe = r2(k.price - k.paid);
    if (owe > 0.5) toCollect.push({ e, v: owe });
    const done = st === "Paid in Full" || (e.startDate && addDaysISO(e.startDate, Math.max(0, num(e.days) - 1)) < t);
    if (!done && k.paid > 0.5) ahead.push({ e, v: k.paid });
  }
  toCollect.sort((a, z) => z.v - a.v); ahead.sort((a, z) => z.v - a.v);
  return { list: toCollect, total: toCollect.reduce((s, x) => s + x.v, 0), ahead, aheadTotal: ahead.reduce((s, x) => s + x.v, 0) };
}
/** Invoices card: unpaid split into overdue (dated more than 3 days ago) / not due yet, and what was paid in the last 30 days. */
export function invoiceSummary(c: Ctx, now: Date = c.now) {
  const t = todayISO(now), cut = addDaysISO(t, -3), since = addDaysISO(t, -30);
  let overdue = 0, notDue = 0, paid30 = 0;
  for (const v of c.invoices) {
    const st = v.status as string;
    if (st === "Paid") { if ((v.paidDate || v.date) >= since) paid30 += num(v.amount); continue; }
    if (st === "Draft" || st === "Void") continue;
    if (String(v.date || "") < cut) overdue += num(v.amount); else notDue += num(v.amount);
  }
  const unpaid = overdue + notDue;
  return { overdue, notDue, unpaid, paid30, max: Math.max(unpaid, paid30, 1) };
}
/** Port of goalHTML numbers: this month's signed sales against the monthly goal (`goal` = the contractor's sales goal, 0 = not set). */
export function goalProgress(c: Ctx, now: Date = c.now, goal = 0) {
  const g = num(goal), t = todayISO(now);
  const won = kpiRaw({ ...c, now }, "sales_won", { from: monthStart(t), to: t }) || 0, pct = g ? Math.min(100, (won / g) * 100) : 0;
  return {
    goal: g, won, pct, hit: g > 0 && pct >= 100, daysLeft: daysBetween(t, lastDay(t.slice(0, 7))),
    monthName: new Date(t + "T12:00:00").toLocaleDateString(lang(c) === "es" ? "es-US" : "en-US", { month: "long" }),
  };
}

/* ------------------------------------------------------------------ charts tab (insightsHTML numbers) */
export const PRICE_BANDS: [number, number][] = [[0, 2000], [2000, 4000], [4000, 6000], [6000, 8000], [8000, 12000], [12000, Infinity]];
/** Port of bandLabel: "$2k–4k" / "$12k+". */
export function bandLabel(b: [number, number]): string {
  const k = (x: number) => "$" + (x >= 1000 ? x / 1000 + "k" : x);
  return b[1] === Infinity ? k(b[0]) + "+" : k(b[0]) + "–" + k(b[1]);
}
export type InsMonth = { key: string; label: string; q: number; w: number; n: number; nw: number; future?: boolean };
export type InsGroup = { name: string; n: number; w: number; v: number; pct: number };
export type InsBand = { lo: number; hi: number; label: string; sent: number; won: number; lost: number; pct: number; best: boolean };
export type Insights = {
  range: string; bounds: Bounds; years: string[]; byYear: boolean; mLen: 4 | 7;
  sent: number; won: number; lost: number; wonTotal: number;
  /** Round(won / sent * 100), null when nothing was sent. */
  closeRate: number | null; decidedRate: number | null; avgJob: number | null;
  /** Average days from sent to signed, null when no data. */
  avgDays: number | null;
  /** Same period a year earlier (only when a single year is picked). */
  prevWon: number | null; ytdWon: number; deltaPct: number | null;
  months: InsMonth[];
  funnel: { id: "leads" | "sent" | "opened" | "won" | "paid"; en: string; es: string; n: number; conv: number | null }[];
  bands: InsBand[]; bestBand: InsBand | null;
  bySource: InsGroup[]; byType: InsGroup[];
};
function insightsRange(c: Ctx, range: string): { k: string; b: Bounds; yList: string[] } {
  const now = today(c), yNow = now.slice(0, 4), years: Record<string, 1> = { [yNow]: 1 };
  for (const e of c.estimates) { const y = String(e.date || "").slice(0, 4); if (isYear(y)) years[y] = 1; }
  const yList = Object.keys(years).sort().reverse();
  let k = range === "last12" ? "12m" : range || yNow;
  if (k === "year") k = yNow;
  let b: Bounds = { from: "", to: "" };
  if (isYear(k)) b = yearBounds(k);
  else if (k === "12m") b = { from: addMonthsYM(now.slice(0, 7), -11) + "-01", to: now };
  return { k, b, yList };
}
/** Port of insightsHTML(): tiles, month buckets by estimate date, funnel, close rate by price band / lead source / job type. Range = "2026" | "last12" | "all". */
export function insights(c: Ctx, range: string | number = todayISO(c.now).slice(0, 4)): Insights {
  const now = today(c), yNow = now.slice(0, 4), l = lang(c);
  const { k, b, yList } = insightsRange(c, String(range));
  const list = c.estimates.filter((e) => inBounds(e.date, b)), st = new Map(c.estimates.map((e) => [e.id, jobStatus(c, e)] as const));
  const sent = list.filter((e) => st.get(e.id) !== "Draft"), won = sent.filter((e) => isWon(st.get(e.id)!)), lost = sent.filter((e) => st.get(e.id) === "Declined");
  let wonTot = 0; for (const e of won) wonTot += totalOf(c, e);
  const dts: number[] = [];
  for (const e of won) { const a = e.sentAt || e.date, z = e.signature && e.signature.date; if (a && z) { const d = daysBetween(String(a).slice(0, 10), String(z).slice(0, 10)); if (d >= 0 && d < 365) dts.push(d); } }
  const avgDays = dts.length ? dts.reduce((x, y) => x + y, 0) / dts.length : null;
  let prevWon: number | null = null;
  if (isYear(k)) {
    const py = String(+k - 1), pb = { from: py + "-01-01", to: k === yNow ? py + now.slice(4) : py + "-12-31" };
    prevWon = 0; for (const e of c.estimates) if (inBounds(e.date, pb) && isWon(st.get(e.id)!)) prevWon += totalOf(c, e);
  }
  let ytdWon = wonTot;
  if (k === yNow) { ytdWon = 0; for (const e of won) if (String(e.date || "") <= now) ytdWon += totalOf(c, e); }
  const deltaPct = prevWon !== null && prevWon > 0 ? Math.round(((ytdWon - prevWon) / prevWon) * 100) : null;

  /* month buckets: quoted vs won */
  const byYear = k === "all", mLen: 4 | 7 = byYear ? 4 : 7, months: InsMonth[] = [];
  if (byYear) yList.slice().reverse().forEach((y) => months.push({ key: y, label: y, q: 0, w: 0, n: 0, nw: 0 }));
  else if (isYear(k)) for (let mi = 0; mi < 12; mi++) { const key = k + "-" + String(mi + 1).padStart(2, "0"); months.push({ key, label: monthLabel(key, l), q: 0, w: 0, n: 0, nw: 0, future: key > now.slice(0, 7) }); }
  else for (let i = 11; i >= 0; i--) { const key = addMonthsYM(now.slice(0, 7), -i); months.push({ key, label: monthLabel(key, l), q: 0, w: 0, n: 0, nw: 0 }); }
  const mIdx: Record<string, number> = {}; months.forEach((m, i) => { mIdx[m.key] = i; });
  for (const e of c.estimates) {
    const s = st.get(e.id)!; if (s === "Draft") continue;
    const m = months[mIdx[String(e.date || "").slice(0, mLen)]]; if (!m) continue;
    const t = totalOf(c, e); m.q += t; m.n++;
    if (isWon(s)) { m.w += t; m.nw++; }
  }

  /* funnel: leads -> sent -> opened -> won -> paid */
  const leadsN = c.clients.filter((cl) => !(cl as Flagged).deleted && inBounds(dayOf(cl.createdAt), b)).length;
  const opened = sent.filter((e) => (e.portalViews || []).length || (e.portalSeen && e.portalSeen.views)).length;
  const paid = sent.filter((e) => st.get(e.id) === "Paid in Full").length;
  const steps: [Insights["funnel"][number]["id"], string, string, number][] = [["leads", "Clients & leads", "Clientes y leads", Math.max(leadsN, sent.length)], ["sent", "Estimates sent", "Estimados enviados", sent.length],
    ["opened", "Opened the link", "Abrieron el link", opened], ["won", "Won", "Ganados", won.length], ["paid", "Paid in full", "Pagados completos", paid]];
  const funnel = steps.map((s, i) => { const prev = i ? steps[i - 1][3] : 0; return { id: s[0], en: s[1], es: s[2], n: s[3], conv: i && prev ? Math.round((s[3] / prev) * 100) : null }; });

  /* close rate by price band */
  const bandAcc = PRICE_BANDS.map((bd) => ({ b: bd, sent: 0, won: 0, lost: 0 }));
  for (const e of sent) {
    const t = totalOf(c, e), x = bandAcc.find((z) => t >= z.b[0] && t < z.b[1]); if (!x) continue;
    x.sent++; if (isWon(st.get(e.id)!)) x.won++; else if (st.get(e.id) === "Declined") x.lost++;
  }
  const bandRows = bandAcc.filter((x) => x.sent);
  const bestAcc = bandRows.filter((x) => x.sent >= 2).sort((p, q) => q.won / q.sent - p.won / p.sent)[0];
  const bands: InsBand[] = bandRows.map((x) => ({ lo: x.b[0], hi: x.b[1], label: bandLabel(x.b), sent: x.sent, won: x.won, lost: x.lost, pct: Math.round((x.won / x.sent) * 100), best: bestAcc === x }));

  /* by source / by type */
  const group = (keyOf: (e: Estimate) => string, label: (k: string) => string): InsGroup[] => {
    const g = new Map<string, { n: number; w: number; v: number }>();
    for (const e of sent) { const key = keyOf(e), o = g.get(key) || { n: 0, w: 0, v: 0 }; g.set(key, o); o.n++; if (isWon(st.get(e.id)!)) { o.w++; o.v += totalOf(c, e); } }
    return [...g.keys()].sort((a, z) => g.get(z)!.v - g.get(a)!.v || g.get(z)!.n - g.get(a)!.n).map((key) => { const o = g.get(key)!; return { name: label(key), ...o, pct: Math.round((o.w / o.n) * 100) }; });
  };
  const bySource = group((e) => e.leadSource || tt(c, "Not set", "Sin anotar"), (x) => x);
  const byType = group((e) => jobTypeOf(e), (x) => jobTypeLabel(x as never, l === "es"));

  return {
    range: k, bounds: b, years: yList, byYear, mLen, sent: sent.length, won: won.length, lost: lost.length, wonTotal: wonTot,
    closeRate: sent.length ? Math.round((won.length / sent.length) * 100) : null,
    decidedRate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
    avgJob: won.length ? wonTot / won.length : null, avgDays, prevWon, ytdWon, deltaPct, months, funnel, bands, bestBand: bands.find((x) => x.best) || null, bySource, byType,
  };
}
/** Port of monthDetailHTML list: the (non-draft) estimates behind one month/year bar, biggest first. */
export function insightMonthJobs(c: Ctx, range: string | number, key: string): Estimate[] {
  const mLen = String(range) === "all" ? 4 : 7;
  return c.estimates.filter((e) => jobStatus(c, e) !== "Draft" && String(e.date || "").slice(0, mLen) === key).sort((a, z) => totalOf(c, z) - totalOf(c, a));
}

/* ------------------------------------------------------------------ CSV exports (exportCSV) */
export type CsvKind = "expenses" | "pl" | "income" | "jobs" | "team";
type Cell = string | number | null | undefined;
/** Port of csvCell. */
export const csvCell = (v: Cell): string => {
  let s = String(v == null ? "" : v);
  // Spreadsheet formula injection: text that starts with = + - @ (or TAB / CR) would be run as a formula by Excel / Sheets.
  // Prefix a quote, but never touch real numbers (negative profit "-12.50" must stay a number) or number cells.
  if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
/** Rows -> CSV text: UTF-8 BOM, CRLF line ends (downloadCSV). */
export const csvText = (rows: Cell[][]): string => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
const byDate = <T extends { date: string }>(a: T, z: T) => String(a.date).localeCompare(String(z.date));
/** A whole calendar year -> that year, anything else -> "all" (the prototype exports by the Reports range pill). */
const yearOfBounds = (b: Bounds): string | null => { const m = /^(\d{4})-01-01$/.exec(b.from || ""); return m && b.to === m[1] + "-12-31" ? m[1] : null; };
/** File name as the prototype builds it (`LUMA-2026-expenses.csv`) with the company's own prefix. */
export function csvFileName(kind: CsvKind, b: Bounds, prefix = "TradeWorks"): string {
  const file = { expenses: "expenses", pl: "profit-and-loss", income: "income", jobs: "profit-by-job", team: "team-payments" }[kind];
  return `${prefix}-${yearOfBounds(b) || "all"}-${file}.csv`;
}
/** The rows of one export (header first). Header names are English, like the prototype's (accountants read them). */
export function exportCsvRows(kind: CsvKind, c: Ctx, b: Bounds): Cell[][] {
  const es = lang(c) === "es", custom = c.settings.expCats, teamLabel = tt(c, "Team payments", "Pagos al equipo");
  const est = (id: string) => c.estimates.find((e) => e.id === id);
  if (kind === "expenses") {
    const rows: Cell[][] = [["Date", "Vendor", "Category", "Source", "Job", "Client", "Paid with", "Amount", "Note", "Receipt"]];
    rowsInRange(allExpenseRows(c.expenses, c.estimates), b).sort(byDate).forEach((r) => {
      const e = r.estId ? est(r.estId) : undefined;
      const vendor = r.legacy && !r.vendor ? tt(c, "Job materials", "Materiales del trabajo") : r.vendor;
      rows.push([r.date, vendor, expCatLabel(r.cat, es, custom), r.source, e ? e.number : "", e ? nameOf(c, e) : "", r.method, r2(r.amount).toFixed(2), r.note, r.receiptUrl || r.rec?.receiptPath ? "yes" : ""]);
    });
    live(c.payouts).filter((p) => inBounds(p.date, b)).forEach((p) => { const w = workerOf(c, p.workerId); rows.push([p.date, w ? w.name : "", teamLabel, "", "", "", p.method || "", r2(p.amount).toFixed(2), p.note || "", ""]); });
    return rows;
  }
  if (kind === "pl") {
    const k = yearOfBounds(b), years: Record<string, 1> = {};
    for (const x of [...c.estimates, ...live(c.expenses)]) { const y = String(x.date || "").slice(0, 4); if (isYear(y)) years[y] = 1; }
    const ys = k ? [k] : Object.keys(years).sort(), cats = expCats(custom).map((x) => x.id).concat(["team"]);
    const out: Cell[][] = [["Month", "Income"].concat(cats.map((x) => (x === "team" ? "Team payments" : expCatLabel(x, es, custom)))).concat(["Total expenses", "Net profit"])];
    for (const y of ys) for (let i = 1; i <= 12; i++) {
      const m = y + "-" + String(i).padStart(2, "0"), p = plFor(c, { from: m + "-01", to: m + "-31" });
      out.push(([m, p.income.toFixed(2)] as Cell[]).concat(cats.map((x) => r2(p.cats[x] || 0).toFixed(2))).concat([p.expenses.toFixed(2), p.profit.toFixed(2)]));
    }
    return out;
  }
  if (kind === "income") {
    const inc: Cell[][] = [["Date paid", "Invoice", "Estimate", "Client", "Amount"]];
    incomeRows(c, b).sort(byDate).forEach((r) => {
      const v = r.v as Invoice & { estNumber?: string; clientId?: string; clientName?: string }, e = est(v.estId);
      inc.push([r.date, v.number, v.estNumber || (e ? e.number : ""), nameOf(c, v.clientId || v.clientName ? v : e || v), r.amount.toFixed(2)]);
    });
    return inc;
  }
  if (kind === "jobs") {
    const jr: Cell[][] = [["Job", "Client", "Type", "Price", "Materials", "Labor", "Other", "Profit", "Margin %"]];
    c.estimates.filter((e) => isWon(jobStatus(c, e)) && inBounds(jobRefDate(e), b)).forEach((e) => {
      const k = jobCosts(c, e);
      jr.push([e.number, nameOf(c, e), jobTypeLabel(jobTypeOf(e), es), k.price.toFixed(2), k.mat.toFixed(2), k.labor.toFixed(2), k.other.toFixed(2), k.profit.toFixed(2), k.margin.toFixed(1)]);
    });
    return jr;
  }
  const tr: Cell[][] = [["Date", "Worker", "Amount", "Method", "Note"]];
  live(c.payouts).filter((p) => inBounds(p.date, b)).forEach((p) => { const w = workerOf(c, p.workerId); tr.push([p.date, w ? w.name : "", r2(p.amount).toFixed(2), p.method || "", p.note || ""]); });
  return tr;
}
/** Port of exportCSV(kind): the file text (UTF-8 BOM + CRLF). */
export const exportCsv = (kind: CsvKind, c: Ctx, b: Bounds): string => csvText(exportCsvRows(kind, c, b));
