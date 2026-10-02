/** Team math — ported 1:1 from the prototype (teamBounds, hourAmount, workerStats, clock in/out, labor by job). */
import { addDaysISO, jobDates, jobStatus } from "./calendar";
import { jobHours, todayISO } from "./estimate";
import { num, r2 } from "./money";
import type { TradeId } from "./trades";
import type { Estimate, HourEdit, HourEntry, Invoice, Payout, Settings, Worker } from "./types";

/** Quick picks for a worker's role on the Team page, by the company's trade ([English, Spanish]). Any text is fine too. */
const ROLE_PICKS: Record<TradeId, [string, string][]> = {
  painting: [["Painter", "Pintor"], ["Helper", "Ayudante"], ["Sprayer", "Sprayador"], ["Prep & sanding", "Preparación y lijado"], ["Crew lead", "Jefe de cuadrilla"]],
  cleaning: [["Cleaner", "Limpieza"], ["Helper", "Ayudante"], ["Team lead", "Líder de equipo"]],
  electrical: [["Electrician", "Electricista"], ["Apprentice", "Aprendiz"], ["Helper", "Ayudante"]],
  plumbing: [["Plumber", "Plomero"], ["Apprentice", "Aprendiz"], ["Helper", "Ayudante"]],
  handyman: [["Handyman", "Handyman"], ["Helper", "Ayudante"], ["Crew lead", "Jefe de cuadrilla"]],
  landscaping: [["Landscaper", "Jardinero"], ["Helper", "Ayudante"], ["Crew lead", "Jefe de cuadrilla"]],
  custom: [["Technician", "Técnico"], ["Helper", "Ayudante"], ["Crew lead", "Jefe de cuadrilla"]],
};
export const rolePicks = (trade: TradeId, lang: "en" | "es"): string[] => (ROLE_PICKS[trade] || ROLE_PICKS.custom).map(([en, es]) => (lang === "es" ? es : en));

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

/* ---------- overtime (US federal wage-hour law): hours past 40 in a week are paid 1.5x ---------- */
export const OT_WEEK_HOURS = 40;
/** Monday of the week of `iso` (the Team page's and timesheet's Monday-Sunday week is the workweek). */
export const workweekOf = (iso: string) => { const d = String(iso || "").slice(0, 10); return addDaysISO(d, -((new Date(d + "T12:00:00").getDay() + 6) % 7)); };
/** Does this worker get overtime? Yes unless switched off on their record (a contractor, or exempt). */
export const getsOvertime = (w: Pick<Worker, "overtime"> | null | undefined) => !!w && w.overtime !== false;
export type OtWeek = { workerId: string; week: string; hours: number; ot: number; extra: number };
/**
 * The overtime extra of every entry. Straight time is already paid at each entry's rate, so the extra for a week is
 * 0.5 x the week's regular rate (straight pay / hours, which averages different rates) x the hours past 40, spread over that
 * week's entries by their hours (so each job carries its share). -> { byEntry: entry id -> $, weeks }
 */
export function overtime(hours: HourEntry[], workers: Pick<Worker, "id" | "rate" | "overtime">[]): { byEntry: Map<string, number>; weeks: OtWeek[] } {
  const byEntry = new Map<string, number>(), weeks: OtWeek[] = [];
  const groups = new Map<string, HourEntry[]>();
  for (const h of hours) {
    if (h.deleted || !h.workerId || !String(h.date || "")) continue;
    const k = h.workerId + "|" + workweekOf(h.date);
    (groups.get(k) || groups.set(k, []).get(k)!).push(h);
  }
  for (const [k, list] of groups) {
    const [workerId, week] = k.split("|");
    const w = workers.find((x) => x.id === workerId);
    if (!getsOvertime(w)) continue;
    const total = list.reduce((a, h) => a + num(h.hours), 0);
    if (total <= OT_WEEK_HOURS + 1e-9) continue;
    const straight = list.reduce((a, h) => a + hourAmount(h, w), 0);
    const ot = total - OT_WEEK_HOURS, extra = r2(0.5 * (straight / total) * ot);
    weeks.push({ workerId, week, hours: total, ot, extra });
    let given = 0;
    list.forEach((h, i) => {
      const share = i === list.length - 1 ? r2(extra - given) : r2(extra * num(h.hours) / total);
      given = r2(given + share);
      if (share) byEntry.set(h.id, share);
    });
  }
  return { byEntry, weeks: weeks.sort((a, b) => b.week.localeCompare(a.week)) };
}
/** What an entry pays: straight time at its rate plus its share of the week's overtime extra. */
export const entryPay = (h: Pick<HourEntry, "id" | "hours" | "rate">, worker: Pick<Worker, "rate"> | null | undefined, extra?: Map<string, number>) =>
  r2(hourAmount(h, worker) + (extra?.get(h.id) || 0));

export type WorkerStats = { h: number; earned: number; paid: number; earnedAll: number; paidAll: number; owed: number; ot: number; otPay: number };
/** Hours/earned/paid inside `b` (overtime included); `owed` is all-time (everything earned minus everything paid). */
export function workerStats(w: Worker, b: Bounds, hours: HourEntry[], payouts: Payout[]): WorkerStats {
  const o: WorkerStats = { h: 0, earned: 0, paid: 0, earnedAll: 0, paidAll: 0, owed: 0, ot: 0, otPay: 0 };
  const mine = hours.filter((h) => h.workerId === w.id && !h.deleted);
  const { byEntry, weeks } = overtime(mine, [w]);
  mine.forEach((h) => {
    const a = entryPay(h, w, byEntry);
    o.earnedAll += a;
    if (inBounds(h.date, b)) { o.h += num(h.hours); o.earned += a; o.otPay += byEntry.get(h.id) || 0; }
  });
  for (const wk of weeks) if (!b.from || (wk.week <= b.to && addDaysISO(wk.week, 6) >= b.from)) o.ot += wk.ot;
  o.otPay = r2(o.otPay);
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

/** Logged hours and labor cost of one job (all time; with `extra`, overtime shares included). */
export function jobLabor(hours: HourEntry[], estId: string, workers: Worker[], extra?: Map<string, number>): { h: number; cost: number } {
  const o = { h: 0, cost: 0 };
  hours.forEach((h) => { if (h.estId === estId && !h.deleted) { o.h += num(h.hours); o.cost += entryPay(h, workers.find((w) => w.id === h.workerId), extra); } });
  return o;
}

export type LaborRow = { estId: string; h: number; cost: number; plan: number; diff: number };
/** Labor by job: logged hours vs the hours the estimate planned (diff is 0 when nothing was planned). */
export function laborByJob(hours: HourEntry[], estimates: Estimate[], settings: Settings, workers: Worker[], extra?: Map<string, number>): LaborRow[] {
  const byJob: Record<string, { h: number; cost: number }> = {};
  hours.forEach((h) => {
    if (!h.estId || h.deleted) return;
    const j = byJob[h.estId] = byJob[h.estId] || { h: 0, cost: 0 };
    j.h += num(h.hours); j.cost += entryPay(h, workers.find((w) => w.id === h.workerId), extra);
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

/** Whole minutes on the clock (to the nearest minute; 0 for a bad time). */
export function clockMinutes(atISO: string, nowMs: number = Date.now()): number {
  const ms = nowMs - Date.parse(atISO);
  return isNaN(ms) ? 0 : Math.max(0, Math.round(ms / 60000));
}
/** Clock out: exactly the time on the clock, to the minute (owner rule: no rounding to quarter hours, no 15 min minimum). */
export const clockHours = (atISO: string, nowMs: number = Date.now()): number => clockMinutes(atISO, nowMs) / 60;
/** Hours typed as hours + minutes (manual entries), kept to the minute. */
export const hoursOf = (h: number, m: number): number => Math.max(0, Math.round(num(h) * 60 + num(m))) / 60;
/** Hours split into whole hours and minutes, for the hours + minutes inputs. */
export function hoursSplit(n: number): { h: number; m: number } {
  const mins = Math.max(0, Math.round(num(n) * 60));
  return { h: Math.floor(mins / 60), m: mins % 60 };
}
/* ---------- changes to saved hours (the owner fixes them; the worker sees what changed) ---------- */
export const HOUR_EDITS_MAX = 20;
const EDIT_FIELDS = ["hours", "date", "rate", "estId", "note", "workerId"] as const;
/** The fields an edit changed, with their old values ({} = nothing that matters changed). */
export function hourChanges(before: HourEntry, after: HourEntry): HourEdit["before"] {
  const out: Record<string, unknown> = {};
  for (const k of EDIT_FIELDS) {
    const a = before[k], b = after[k];
    const same = k === "hours" || k === "rate" ? Math.abs(num(a) - num(b)) < 1e-9 : String(a ?? "") === String(b ?? "");
    if (!same) out[k] = a ?? "";
  }
  return out as HourEdit["before"];
}
/** The entry after the owner saved a change: the old values go on its history (only when something changed). */
export function withEdit(before: HourEntry, after: HourEntry, by: string, at = new Date().toISOString()): HourEntry {
  const ch = hourChanges(before, after);
  if (!ch || !Object.keys(ch).length) return after;
  return { ...after, edits: [...(before.edits || []), { at, by: by.slice(0, 80), what: "edit" as const, before: ch }].slice(-HOUR_EDITS_MAX) };
}
export type HourChange = { field: (typeof EDIT_FIELDS)[number]; from: unknown; to: unknown };
/** The history of an entry, oldest first, each change as from -> to (the "to" is the next change's old value, or today's). */
export function editHistory(h: HourEntry): { at: string; by: string; what: HourEdit["what"]; changes: HourChange[] }[] {
  const list = h.edits || [];
  return list.map((ed, i) => ({
    at: ed.at, by: ed.by, what: ed.what,
    changes: Object.keys(ed.before || {}).filter((k): k is HourChange["field"] => (EDIT_FIELDS as readonly string[]).includes(k)).map((field) => {
      const later = list.slice(i + 1).find((x) => x.before && field in x.before);
      return { field, from: (ed.before as Record<string, unknown>)[field], to: later ? (later.before as Record<string, unknown>)[field] : h[field] };
    }),
  }));
}

/** Removing an entry keeps it, marked deleted (who / when), so the record stays; restoring takes the mark off. */
export function softDelete(h: HourEntry, by: string, at = new Date().toISOString()): HourEntry {
  return { ...h, deleted: true, deletedAt: at, deletedBy: by.slice(0, 80), edits: [...(h.edits || []), { at, by: by.slice(0, 80), what: "delete" as const }].slice(-HOUR_EDITS_MAX) };
}
export function restoreEntry(h: HourEntry, by: string, at = new Date().toISOString()): HourEntry {
  const { deleted: _d, deletedAt: _a, deletedBy: _b, ...rest } = h;
  return { ...rest, edits: [...(h.edits || []), { at, by: by.slice(0, 80), what: "restore" as const }].slice(-HOUR_EDITS_MAX) };
}

/** Hours as hours and minutes: 7.5 -> "7 h 30 min", 0.25 -> "15 min", 2 -> "2 h", 0 -> "0 min". */
export function hoursText(n: number): string {
  const mins = Math.max(0, Math.round(num(n) * 60)), h = Math.floor(mins / 60), m = mins % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")} min` : `${h} h`;
}
/** The running clock as "02:05" (hours:minutes). */
export const clockHHMM = (el: { h: number; m: number }) => `${String(el.h).padStart(2, "0")}:${String(el.m).padStart(2, "0")}`;
/** Elapsed hours and minutes of the running clock. */
export function clockElapsed(atISO: string, nowMs: number = Date.now()): { h: number; m: number } {
  const mins = Math.max(0, Math.round((nowMs - Date.parse(atISO)) / 60000));
  return { h: Math.floor(mins / 60), m: mins % 60 };
}
/** Local calendar day of the clock-in (the prototype used the UTC day, which is tomorrow for an evening shift in the US). */
const localDay = (atISO: string) => { const d = new Date(atISO); return isNaN(d.getTime()) ? String(atISO).slice(0, 10) : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
/** The hours entry a clock-out creates. The id is derived from worker + clock-in time, so two devices clocking out the same shift write the same record. */
export function clockEntry(clock: ClockTask, worker: Worker, note: string, nowMs: number = Date.now()): HourEntry {
  return {
    id: `h-clk-${worker.id}-${Date.parse(clock.at) || 0}`, workerId: worker.id, date: localDay(clock.at),
    hours: clockHours(clock.at, nowMs), estId: clock.estId || "", note: clock.taskTitle || note, rate: num(worker.rate),
    start: clock.at, end: new Date(nowMs).toISOString(), ...clockCarry(clock),
  };
}
/** What a clock-in carries into the hours entry: the job name and the task. */
export type ClockTask = { at: string; estId?: string; jobLabel?: string; taskId?: string; taskTitle?: string };
export const clockCarry = (c: ClockTask) => ({
  ...(c.jobLabel ? { jobLabel: c.jobLabel } : {}), ...(c.taskId ? { taskId: c.taskId } : {}), ...(c.taskTitle ? { taskTitle: c.taskTitle } : {}),
});
/** A clock-in for one task: the task's job comes with it (workers can't read estimates, so the job name travels too). */
export function clockFor(task: { id: string; title: string; estId?: string; jobLabel?: string }, atISO: string): ClockTask {
  return {
    at: atISO, estId: task.estId || "", taskId: task.id, taskTitle: String(task.title || "").slice(0, 120),
    ...(task.jobLabel ? { jobLabel: String(task.jobLabel).slice(0, 120) } : {}),
  };
}

/** "8:02 AM – 4:15 PM" for an entry made by the time clock ("" for manual hours). */
export function clockTimes(h: Pick<HourEntry, "start" | "end">, lang: "en" | "es"): string {
  const f = (iso?: string) => { const d = new Date(String(iso || "")); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString(lang === "es" ? "es" : "en", { hour: "numeric", minute: "2-digit" }); };
  const a = f(h.start), b = f(h.end);
  return a && b ? `${a} – ${b}` : a || b;
}
