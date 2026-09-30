/**
 * Trade-aware dashboard KPIs (pure, no React / Firebase).
 *
 * Every number comes ONLY from the company's own records in `Ctx` (estimates, invoices, expenses, hours, clients) — no benchmarks.
 * The 14 prototype KPIs stay in metrics.ts (KPI_LIB, untouched, painting parity); this file adds the extra cards and the
 * per-trade choice of cards (`Trade.kpis` = defaults while dashCards is unset, `Trade.kpiMore` = offered first in the library).
 *
 *   to_collect ........ still to collect today (signed total − paid) ........ as of today
 *   jobs_won .......... signed jobs in the period (by job date)
 *   jobs_per_week ..... jobs_won ÷ weeks in the period (at least 1 week)
 *   jobs_per_month .... jobs_won ÷ months in the period (at least 1 month)
 *   avg_ticket ........ average price of the jobs won
 *   repeat_share ...... of the clients with a job won in the period, % that have 2+ jobs won (up to the end of the period)
 *   hours_logged ...... hours entered in Team in the period
 *   revenue_per_hour .. price of the won jobs that have hours ÷ their hours
 *   earn_per_hour ..... real profit (price − materials − other costs − labor) of the won jobs that have hours ÷ their hours
 *   mat_margin ........ (price − materials) ÷ price over the won jobs that have material receipts
 *   profit_after_mat .. price − materials receipts over the won jobs
 *   quote_to_win_days . average days from "sent" to the client's signature, for jobs signed in the period
 *   top_source_rev .... revenue of the best lead source (jobs won; "Not set" is ignored)
 */
import { addMonthsYM, inBounds, lastDayOfMonth, type Bounds } from "./expenses";
import { daysBetween, todayISO } from "./followups";
import { jobCosts, jobRefDate, jobStatus, isWon, kpiDef, kpiFormat, kpiSeries, kpiValue, KPI_DEFAULT, KPI_LIB, marketingFor, periodPair, stillToCollect, type Ctx, type KpiDef, type Period, type SeriesPoint } from "./metrics";
import { num } from "./money";
import { tradeById } from "./trades";
import type { Estimate, Settings } from "./types";

export type TradeKpiFormat = "money" | "pct" | "count" | "dec" | "days" | "perhour";
export type TradeKpiDef = {
  id: string; en: string; es: string; subEn: string; subEs: string; format: TradeKpiFormat;
  lowerIsBetter: boolean; asOfToday: boolean; icon: string;
  value: (c: Ctx, b: Bounds) => number | null;
};

const live = <T,>(a: T[] | undefined): T[] => (a || []).filter((x) => !(x as { deleted?: boolean }).deleted);
const won = (c: Ctx, b: Bounds) => live(c.estimates).filter((e) => isWon(jobStatus(c, e)) && inBounds(jobRefDate(e), b));
const clientKey = (c: Ctx, e: Estimate) => e.clientId || String(e.clientName || "").trim().toLowerCase();
const finite = (v: number) => (isFinite(v) ? v : null);
const periodDays = (b: Bounds) => (b.from && b.to ? Math.max(0, daysBetween(b.from, b.to)) + 1 : 0);

/** Signature day of a signed estimate ("" when the job was won without a stored signature date). */
const signedDay = (e: Estimate) => String(e.signature?.date || e.signature?.at || "").slice(0, 10);
const sentDay = (e: Estimate) => String(e.sentAt || e.date || "").slice(0, 10);

function withHours(c: Ctx, b: Bounds) {
  let price = 0, profit = 0, hrs = 0;
  for (const e of won(c, b)) { const k = jobCosts(c, e); if (k.hrs > 0) { price += k.price; profit += k.profit; hrs += k.hrs; } }
  return { price, profit, hrs };
}

const d = (id: string, icon: string, en: string, es: string, subEn: string, subEs: string, format: TradeKpiFormat, value: TradeKpiDef["value"], o: { bad?: boolean; now?: boolean } = {}): TradeKpiDef =>
  ({ id, en, es, subEn, subEs, format, lowerIsBetter: !!o.bad, asOfToday: !!o.now, icon, value });

/** Cards added on top of KPI_LIB (ids never clash with it). */
export const EXTRA_KPIS: TradeKpiDef[] = [
  d("to_collect", "unpaid", "Still to collect", "Por cobrar", "Signed jobs minus what was paid", "Trabajos firmados menos lo pagado", "money", (c) => stillToCollect(c).total, { now: true }),
  d("jobs_won", "jobs_done", "Jobs won", "Trabajos ganados", "Jobs signed in the period", "Trabajos firmados en el periodo", "count", (c, b) => won(c, b).length),
  d("jobs_per_week", "jobs_done", "Jobs per week", "Trabajos por semana", "Jobs won ÷ weeks in the period", "Trabajos ganados ÷ semanas del periodo", "dec", (c, b) => {
    const n = won(c, b).length; return finite(n / Math.max(1, periodDays(b) / 7)); }),
  d("jobs_per_month", "jobs_done", "Jobs per month", "Trabajos por mes", "Jobs won ÷ months in the period", "Trabajos ganados ÷ meses del periodo", "dec", (c, b) => {
    const n = won(c, b).length; return finite(n / Math.max(1, periodDays(b) / 30.44)); }),
  d("avg_ticket", "avg_job", "Average ticket", "Ticket promedio", "Average price of jobs won", "Precio promedio de los trabajos ganados", "money", (c, b) => {
    const w = won(c, b); let s = 0; for (const e of w) s += jobCosts(c, e).price; return w.length ? s / w.length : null; }),
  d("repeat_share", "leads", "Repeat clients", "Clientes que repiten", "Clients with 2+ jobs won ÷ clients with a job won", "Clientes con 2+ trabajos ganados ÷ clientes con trabajo ganado", "pct", (c, b) => {
    const upTo: Bounds = { from: "0000-01-01", to: b.to || "9999-12-31" }, per = new Set(won(c, b).map((e) => clientKey(c, e)).filter(Boolean));
    if (!per.size) return null;
    const count: Record<string, number> = {};
    for (const e of live(c.estimates)) { if (!isWon(jobStatus(c, e)) || !inBounds(jobRefDate(e), upTo)) continue; const k = clientKey(c, e); if (k) count[k] = (count[k] || 0) + 1; }
    let rep = 0; per.forEach((k) => { if ((count[k] || 0) >= 2) rep++; });
    return (rep / per.size) * 100; }),
  d("hours_logged", "labor", "Hours worked", "Horas trabajadas", "Hours entered in Team", "Horas anotadas en Equipo", "dec", (c, b) => {
    let h = 0, any = false; for (const x of live(c.hours)) if (inBounds(x.date, b)) { h += num(x.hours); any = true; } return any ? h : null; }),
  d("revenue_per_hour", "money_in", "Revenue per hour", "Ingreso por hora", "Price of jobs won ÷ hours worked on them", "Precio de los trabajos ganados ÷ horas trabajadas en ellos", "perhour", (c, b) => {
    const x = withHours(c, b); return x.hrs > 0 ? x.price / x.hrs : null; }),
  d("earn_per_hour", "net_profit", "Earn per hour", "Ganancia por hora", "Real profit of jobs won ÷ hours worked on them", "Ganancia real de los trabajos ganados ÷ horas trabajadas en ellos", "perhour", (c, b) => {
    const x = withHours(c, b); return x.hrs > 0 ? x.profit / x.hrs : null; }),
  d("mat_margin", "job_margin", "Materials margin", "Margen sobre materiales", "(Price − materials) ÷ price, jobs with receipts", "(Precio − materiales) ÷ precio, trabajos con recibos", "pct", (c, b) => {
    let p = 0, m = 0; for (const e of won(c, b)) { const k = jobCosts(c, e); if (k.mat > 0 && k.price > 0) { p += k.price; m += k.mat; } } return p ? ((p - m) / p) * 100 : null; }),
  d("profit_after_mat", "net_profit", "Profit after materials", "Ganancia después de materiales", "Price of jobs won − materials receipts", "Precio de los trabajos ganados − recibos de materiales", "money", (c, b) => {
    const w = won(c, b); if (!w.length) return null; let s = 0; for (const e of w) { const k = jobCosts(c, e); s += k.price - k.mat; } return s; }),
  d("quote_to_win_days", "close_rate", "Quote-to-win time", "Tiempo de cotizar a ganar", "Average days from sent to signed", "Días promedio de enviado a firmado", "days", (c, b) => {
    let n = 0, s = 0;
    for (const e of live(c.estimates)) {
      const sg = signedDay(e), sn = sentDay(e);
      if (!sg || !sn || !isWon(jobStatus(c, e)) || !inBounds(sg, b)) continue;
      const days = daysBetween(sn, sg); if (days < 0) continue;
      n++; s += days;
    }
    return n ? s / n : null; }, { bad: true }),
  d("top_source_rev", "leads", "Best lead source", "Mejor fuente de clientes", "Revenue of your top lead source", "Ingreso de tu mejor fuente de clientes", "money", (c, b) => {
    const m = marketingFor(c, b), notSet = new Set(["Not set", "Sin anotar"]); let best = 0;
    for (const k of Object.keys(m)) if (!notSet.has(k) && m[k].rev > best) best = m[k].rev;
    return best > 0 ? best : null; }),
];

const EXTRA_BY_ID = new Map(EXTRA_KPIS.map((k) => [k.id, k]));
const asTrade = (k: KpiDef): TradeKpiDef => k;

export const isExtraKpi = (id: string) => EXTRA_BY_ID.has(id);
/** Any KPI (library or extra) by id. */
export const anyKpiDef = (id: string): TradeKpiDef | undefined => EXTRA_BY_ID.get(id) || (kpiDef(id) ? asTrade(kpiDef(id)!) : undefined);
/** Every KPI id: the 14 of KPI_LIB first (painting order), then the extras. */
export const ALL_KPI_IDS: string[] = [...KPI_LIB.map((k) => k.id), ...EXTRA_KPIS.map((k) => k.id)];

/** "—" for no data (never NaN), otherwise the number in the KPI's format. */
export function fmtKpi(def: Pick<TradeKpiDef, "format">, v: number | null | undefined, fmtMoney: (n: number) => string): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  if (def.format === "dec") return (Math.round(v * 10) / 10).toFixed(1);
  if (def.format === "days") return (Math.round(v * 10) / 10).toFixed(1) + " d";
  if (def.format === "perhour") return fmtMoney(v) + "/h";
  return kpiFormat(def as Pick<KpiDef, "format">, v, fmtMoney);
}

export type TradeKpiResult = { id: string; period: Period; value: number | null; prev: number | null; delta: number | null; deltaIsPoints: boolean };
/** Value for the period plus the previous-period comparison (same rules as metrics.kpiValue). */
export function kpiResult(c: Ctx, id: string, period: Period | string = "ytd"): TradeKpiResult {
  if (!EXTRA_BY_ID.has(id)) { const r = kpiValue(c, id, period); return { id, period: r.period, value: r.value, prev: r.prev, delta: r.delta, deltaIsPoints: r.deltaIsPoints }; }
  const k = EXTRA_BY_ID.get(id)!, pp = periodPair(period, c.now);
  const value = k.value(c, pp[0]), prev = k.asOfToday ? null : k.value(c, pp[1]);
  let delta: number | null = null;
  if (value !== null && prev !== null && isFinite(value) && isFinite(prev)) {
    const dd = k.format === "pct" ? value - prev : prev ? ((value - prev) / Math.abs(prev)) * 100 : null;
    if (dd !== null && isFinite(dd)) delta = dd;
  }
  return { id, period: (period || "ytd") as Period, value, prev, delta, deltaIsPoints: k.format === "pct" };
}

const MONTH_EN = (ym: string, l: "en" | "es", o: Intl.DateTimeFormatOptions) => new Date(ym + "-15T12:00:00").toLocaleDateString(l === "es" ? "es-US" : "en-US", o);
/** Six months of a KPI, oldest first (no data counts as 0), like metrics.kpiSeries. */
export function kpiSeriesAny(c: Ctx, id: string, months = 6): SeriesPoint[] {
  const k = EXTRA_BY_ID.get(id);
  if (!k) return kpiSeries(c, id, months);
  const out: SeriesPoint[] = [], l = c.lang || "en", cur = todayISO(c.now).slice(0, 7);
  for (let i = months - 1; i >= 0; i--) {
    const ym = addMonthsYM(cur, -i);
    out.push({ key: ym, label: MONTH_EN(ym, l, { month: "short" }).replace(".", ""), tip: MONTH_EN(ym, l, { month: "long", year: "numeric" }), v: k.value(c, { from: ym + "-01", to: lastDayOfMonth(ym) }) || 0 });
  }
  return out;
}

/** Default cards while the company has not customized its dashboard: painting keeps KPI_DEFAULT, other trades use Trade.kpis. */
export function defaultKpiCards(trade?: string | null): { id: string; p: Period }[] {
  const t = tradeById(trade);
  if (t.id === "painting") return KPI_DEFAULT;
  const ids = t.kpis.filter((id) => EXTRA_BY_ID.has(id) || kpiDef(id));
  return (ids.length ? ids : KPI_DEFAULT.map((x) => x.id)).map((id) => ({ id, p: "ytd" as Period }));
}
/** The user's saved cards untouched; the trade's defaults while none are saved. */
export function dashCardsFor(s: Pick<Settings, "dashCards" | "trade">): { id: string; p: Period }[] {
  return s.dashCards && s.dashCards.length ? (s.dashCards as { id: string; p: Period }[]) : defaultKpiCards(s.trade);
}
/** Library order: the trade's own cards first (defaults, then extras), then every general one. Painting keeps the prototype order. */
export function libraryKpiIds(trade?: string | null): string[] {
  const t = tradeById(trade);
  if (t.id === "painting") return ALL_KPI_IDS;
  const first = [...t.kpis, ...t.kpiMore].filter((id, i, a) => a.indexOf(id) === i && anyKpiDef(id));
  return [...first, ...ALL_KPI_IDS.filter((id) => !first.includes(id))];
}
/** Ids that belong to the trade (shown under "For your trade" in the library). */
export function tradeKpiIds(trade?: string | null): string[] {
  const t = tradeById(trade);
  return t.id === "painting" ? [] : [...t.kpis, ...t.kpiMore].filter((id, i, a) => a.indexOf(id) === i && anyKpiDef(id));
}
