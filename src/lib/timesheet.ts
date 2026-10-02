/**
 * Timesheet: one worker's hours by day, money by job and by week / month, and what was paid. Pure functions, no I/O.
 * Used by the worker's own page (/timesheet) and by the owner's view of a worker (/team/:workerId/timesheet).
 * Money = hours x the rate stamped on each entry (else the worker's current rate), plus each entry's share of its week's
 * overtime (team.overtime), exactly like the Team page. Entries the owner deleted never count.
 */
import { addDaysISO } from "./calendar";
import { num, r2 } from "./money";
import { entryPay, inBounds, overtime, type Bounds } from "./team";
import type { HourEntry, Payout, Worker } from "./types";

export type DayRow = { date: string; entries: HourEntry[]; hours: number; amount: number };
export type JobRow = { key: string; estId: string; label: string; hours: number; amount: number };
export type PeriodPoint = { key: string; from: string; to: string; hours: number; amount: number };

type W = Pick<Worker, "id" | "rate" | "overtime">;
const mine = (hours: HourEntry[], workerId: string) => hours.filter((h) => h.workerId === workerId && !h.deleted);
/** Each entry's overtime share for this worker. */
const extraOf = (hours: HourEntry[], worker: W) => overtime(mine(hours, worker.id), [worker]).byEntry;
// clock order; entries logged by hand (no time) after the clocked ones
const sortEntries = (a: HourEntry, b: HourEntry) => String(a.start || "~").localeCompare(String(b.start || "~")) || String(a.id).localeCompare(String(b.id));

/** Every day with hours in the bounds, newest first, each with its entries (in clock order), total hours and money. */
export function timesheetDays(hours: HourEntry[], worker: W, b: Bounds): DayRow[] {
  const by = new Map<string, HourEntry[]>(), extra = extraOf(hours, worker);
  for (const h of mine(hours, worker.id)) {
    const d = String(h.date || "").slice(0, 10);
    if (!d || !inBounds(d, b)) continue;
    (by.get(d) || by.set(d, []).get(d)!).push(h);
  }
  return [...by.entries()].sort((x, y) => y[0].localeCompare(x[0])).map(([date, list]) => {
    const entries = list.slice().sort(sortEntries);
    return { date, entries, hours: r2(entries.reduce((a, h) => a + num(h.hours), 0)), amount: r2(entries.reduce((a, h) => a + entryPay(h, worker, extra), 0)) };
  });
}

/**
 * Money per job in the bounds, biggest first. The label comes from the entry (jobLabel, saved when the job was picked), then
 * from `labelOf` (the owner's app can name any estimate), else a short fallback. Hours with no job are grouped as "".
 */
export function byJob(hours: HourEntry[], worker: W, b: Bounds, labelOf: (estId: string) => string = () => ""): JobRow[] {
  const by = new Map<string, JobRow>(), extra = extraOf(hours, worker);
  for (const h of mine(hours, worker.id)) {
    if (!inBounds(h.date, b)) continue;
    const estId = h.estId || "";
    const row = by.get(estId) || { key: estId || "none", estId, label: "", hours: 0, amount: 0 };
    row.hours += num(h.hours); row.amount += entryPay(h, worker, extra);
    if (!row.label) row.label = String(h.jobLabel || "").trim() || (estId ? labelOf(estId) : "");
    by.set(estId, row);
  }
  return [...by.values()].map((r) => ({ ...r, hours: r2(r.hours), amount: r2(r.amount) }))
    .sort((a, b2) => (a.estId ? 0 : 1) - (b2.estId ? 0 : 1) || b2.amount - a.amount || a.label.localeCompare(b2.label));
}

const p2 = (n: number) => String(n).padStart(2, "0");
/** Monday of the week of `iso`. */
export const weekStart = (iso: string) => addDaysISO(iso, -((new Date(iso + "T12:00:00").getDay() + 6) % 7));

/** The last `count` weeks (Mon-Sun) or months ending with the current one, oldest first, with hours and money in each. */
export function periodSeries(hours: HourEntry[], worker: W, mode: "week" | "month", count: number, today: string): PeriodPoint[] {
  const pts: PeriodPoint[] = [], extra = extraOf(hours, worker);
  if (mode === "week") {
    const w0 = weekStart(today);
    for (let i = count - 1; i >= 0; i--) { const from = addDaysISO(w0, -7 * i); pts.push({ key: from, from, to: addDaysISO(from, 6), hours: 0, amount: 0 }); }
  } else {
    let y = num(today.slice(0, 4)), m = num(today.slice(5, 7));
    const list: [number, number][] = [];
    for (let i = 0; i < count; i++) { list.unshift([y, m]); m--; if (m === 0) { m = 12; y--; } }
    for (const [yy, mm] of list) pts.push({ key: `${yy}-${p2(mm)}`, from: `${yy}-${p2(mm)}-01`, to: `${yy}-${p2(mm)}-31`, hours: 0, amount: 0 });
  }
  for (const h of mine(hours, worker.id)) {
    const d = String(h.date || "").slice(0, 10);
    const p = pts.find((x) => d >= x.from && d <= x.to);
    if (p) { p.hours += num(h.hours); p.amount += entryPay(h, worker, extra); }
  }
  return pts.map((p) => ({ ...p, hours: r2(p.hours), amount: r2(p.amount) }));
}

/** Earned in the bounds, and all time: earned, paid, still owed. */
export function paySummary(hours: HourEntry[], payouts: Payout[], worker: W, b: Bounds) {
  let earned = 0, h = 0, earnedAll = 0, paid = 0, paidAll = 0;
  const extra = extraOf(hours, worker);
  for (const e of mine(hours, worker.id)) { const a = entryPay(e, worker, extra); earnedAll += a; if (inBounds(e.date, b)) { earned += a; h += num(e.hours); } }
  for (const p of payouts) { if (p.workerId !== worker.id) continue; paidAll += num(p.amount); if (inBounds(p.date, b)) paid += num(p.amount); }
  return { hours: r2(h), earned: r2(earned), paid: r2(paid), earnedAll: r2(earnedAll), paidAll: r2(paidAll), owed: r2(earnedAll - paidAll) };
}

/** The worker's payments in the bounds, newest first. */
export const paymentsIn = (payouts: Payout[], workerId: string, b: Bounds): Payout[] =>
  payouts.filter((p) => p.workerId === workerId && inBounds(p.date, b)).sort((a, b2) => String(b2.date).localeCompare(String(a.date)));
