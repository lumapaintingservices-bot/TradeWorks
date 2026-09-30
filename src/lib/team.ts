/** Team math — ported 1:1 from the prototype (teamBounds, hourAmount, workerStats, clock in/out, labor by job). */
import { addDaysISO, jobDates, jobStatus } from "./calendar";
import { jobHours, todayISO } from "./estimate";
import { num, r2 } from "./money";
import type { Estimate, HourEntry, Invoice, Payout, Settings, Worker } from "./types";

export type Bounds = { from: string; to: string };
export type RangeKey = "week" | "month" | "lastMonth" | "ytd" | "lastYear" | "all";
export const RANGE_KEYS: RangeKey[] = ["week", "month", "lastMonth", "ytd", "lastYear", "all"];
export const PAY_METHODS = ["Cash", "Zelle", "Check", "Transfer"] as const;

const p2 = (n: number) => String(n).padStart(2, "0");

/** Date range for the Team page. ISO strings compare correctly, so "-31" works for any month (as in the prototype). */
export function rangeBounds(kind: RangeKey, today: string = todayISO()): Bounds {
  const y = num(today.slice(0, 4)), m = num(today.slice(5, 7));
  if (kind === "week") { // Monday to Sunday
    const dow = (new Date(today + "T12:00:00").getDay() + 6) % 7, from = addDaysISO(today, -dow);
    return { from, to: addDaysISO(from, 6) };
  }
  if (kind === "month") return { from: `${y}-${p2(m)}-01`, to: `${y}-${p2(m)}-31` };
  if (kind === "lastMonth") { const ly = m === 1 ? y - 1 : y, lm = m === 1 ? 12 : m - 1; return { from: `${ly}-${p2(lm)}-01`, to: `${ly}-${p2(lm)}-31` }; }
  if (kind === "ytd") return { from: `${y}-01-01`, to: today };
  if (kind === "lastYear") return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  return { from: "", to: "" };
}

export function inBounds(d: unknown, b: Bounds): boolean {
  const s = String(d || "").slice(0, 10);
  return !b.from || (s >= b.from && s <= b.to);
}

/** Amount of an hours entry: the rate stored on the entry wins; older entries fall back to the worker's current rate. */
export function hourAmount(h: Pick<HourEntry, "hours" | "rate">, worker?: Pick<Worker, "rate"> | null): number {
  const rate = (h.rate as unknown) !== undefined && (h.rate as unknown) !== "" ? num(h.rate) : worker ? num(worker.rate) : 0;
  return r2(num(h.hours) * rate);
}

export type WorkerStats = { h: number; earned: number; paid: number; earnedAll: number; paidAll: number; owed: number };
/** Hours/earned/paid inside `b`; `owed` is all-time (everything earned minus everything paid). */
export function workerStats(w: Worker, b: Bounds, hours: HourEntry[], payouts: Payout[]): WorkerStats {
  const o: WorkerStats = { h: 0, earned: 0, paid: 0, earnedAll: 0, paidAll: 0, owed: 0 };
  hours.forEach((h) => {
    if (h.workerId !== w.id) return;
    const a = hourAmount(h, w);
    o.earnedAll += a;
    if (inBounds(h.date, b)) { o.h += num(h.hours); o.earned += a; }
  });
  payouts.forEach((p) => {
    if (p.workerId !== w.id) return;
    o.paidAll += num(p.amount);
    if (inBounds(p.date, b)) o.paid += num(p.amount);
  });
  o.owed = r2(o.earnedAll - o.paidAll);
  return o;
}

export type TeamTotals = { h: number; cost: number; paid: number; owed: number };
/** Tiles of the Team page: owed counts only workers you still owe (never negative). */
export function teamTotals(workers: Worker[], b: Bounds, hours: HourEntry[], payouts: Payout[]): TeamTotals {
  const tot: TeamTotals = { h: 0, cost: 0, paid: 0, owed: 0 };
  workers.forEach((w) => {
    const st = workerStats(w, b, hours, payouts);
    tot.h += st.h; tot.cost += st.earned; tot.paid += st.paid; tot.owed += Math.max(0, st.owed);
  });
  return tot;
}

/** Logged hours and labor cost of one job (all time). */
export function jobLabor(hours: HourEntry[], estId: string, workers: Worker[]): { h: number; cost: number } {
  const o = { h: 0, cost: 0 };
  hours.forEach((h) => { if (h.estId === estId) { o.h += num(h.hours); o.cost += hourAmount(h, workers.find((w) => w.id === h.workerId)); } });
  return o;
}

export type LaborRow = { estId: string; h: number; cost: number; plan: number; diff: number };
/** Labor by job: logged hours vs the hours the estimate planned (diff is 0 when nothing was planned). */
export function laborByJob(hours: HourEntry[], estimates: Estimate[], settings: Settings, workers: Worker[]): LaborRow[] {
  const byJob: Record<string, { h: number; cost: number }> = {};
  hours.forEach((h) => {
    if (!h.estId) return;
    const j = byJob[h.estId] = byJob[h.estId] || { h: 0, cost: 0 };
    j.h += num(h.hours); j.cost += hourAmount(h, workers.find((w) => w.id === h.workerId));
  });
  const out: LaborRow[] = [];
  Object.keys(byJob).forEach((id) => {
    const e = estimates.find((x) => x.id === id);
    if (!e) return;
    let plan = 0; try { plan = jobHours(e, settings).total; } catch { /* no plan */ }
    out.push({ estId: id, h: byJob[id].h, cost: byJob[id].cost, plan, diff: plan ? byJob[id].h - plan : 0 });
  });
  return out;
}

/** The job scheduled today (startDate .. startDate + days - 1); declined jobs are skipped. */
export function jobOnSite(estimates: Estimate[], today: string = todayISO(), invoices: Pick<Invoice, "estId" | "status">[] = []): Estimate | undefined {
  return estimates.find((e) => e.startDate && jobStatus(e, invoices) !== "Declined" && jobDates(e).includes(today));
}

/** Clock out: elapsed time rounded to the nearest 0.25 h, never less than 0.25 h. */
export function clockHours(atISO: string, nowMs: number = Date.now()): number {
  return Math.max(0.25, Math.round((nowMs - Date.parse(atISO)) / 3600000 * 4) / 4);
}
/** "2h 05m" style elapsed text for the running timer chip. */
export function clockElapsed(atISO: string, nowMs: number = Date.now()): { h: number; m: number } {
  const mins = Math.max(0, Math.round((nowMs - Date.parse(atISO)) / 60000));
  return { h: Math.floor(mins / 60), m: mins % 60 };
}
/** Local calendar day of the clock-in (the prototype used the UTC day, which is tomorrow for an evening shift in the US). */
const localDay = (atISO: string) => { const d = new Date(atISO); return isNaN(d.getTime()) ? String(atISO).slice(0, 10) : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
/** The hours entry a clock-out creates. The id is derived from worker + clock-in time, so two devices clocking out the same shift write the same record. */
export function clockEntry(clock: { at: string; estId?: string }, worker: Worker, note: string, nowMs: number = Date.now()): HourEntry {
  return {
    id: `h-clk-${worker.id}-${Date.parse(clock.at) || 0}`, workerId: worker.id, date: localDay(clock.at),
    hours: clockHours(clock.at, nowMs), estId: clock.estId || "", note, rate: num(worker.rate),
    start: clock.at, end: new Date(nowMs).toISOString(),
  };
}

/** "8:02 AM – 4:15 PM" for an entry made by the time clock ("" for manual hours). */
export function clockTimes(h: Pick<HourEntry, "start" | "end">, lang: "en" | "es"): string {
  const f = (iso?: string) => { const d = new Date(String(iso || "")); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString(lang === "es" ? "es" : "en", { hour: "numeric", minute: "2-digit" }); };
  const a = f(h.start), b = f(h.end);
  return a && b ? `${a} – ${b}` : a || b;
}
