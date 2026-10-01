import { describe, expect, it } from "vitest";
import { byJob, paymentsIn, paySummary, periodSeries, timesheetDays, weekStart } from "./timesheet";
import { clockJobOptions, clockTaskOptions } from "./workerView";
import type { HourEntry, Payout, Worker } from "./types";

const w: Worker = { id: "w1", name: "Carlos", rate: 20 };
const h = (o: Partial<HourEntry>): HourEntry => ({ id: Math.random().toString(36).slice(2), workerId: "w1", date: "2026-09-30", hours: 8, rate: 20, ...o });
const hours: HourEntry[] = [
  h({ id: "a", date: "2026-09-30", hours: 4, estId: "e1", jobLabel: "EST-1 · Ana", start: "2026-09-30T12:00:00Z" }),
  h({ id: "b", date: "2026-09-30", hours: 4, estId: "e2", jobLabel: "EST-2 · Bo", start: "2026-09-30T08:00:00Z" }),
  h({ id: "c", date: "2026-09-29", hours: 8, estId: "e1" }),               // no label on the entry: from the estimate (owner)
  h({ id: "d", date: "2026-09-15", hours: 2, rate: 25 }),                    // no job; its own stamped rate
  h({ id: "e", date: "2026-08-10", hours: 5, rate: undefined as never }),    // no rate stamped: the worker's current rate
  h({ id: "x", workerId: "w2", date: "2026-09-30", hours: 9 }),               // someone else
];
const pays: Payout[] = [
  { id: "p1", workerId: "w1", date: "2026-09-20", amount: 150, method: "Zelle" },
  { id: "p2", workerId: "w1", date: "2026-08-31", amount: 100, method: "Cash" },
  { id: "p3", workerId: "w2", date: "2026-09-20", amount: 999 },
];
const sept = { from: "2026-09-01", to: "2026-09-31" };

describe("timesheet", () => {
  it("days: newest first, entries in clock order, totals per day; only this worker", () => {
    const d = timesheetDays(hours, w, sept);
    expect(d.map((x) => x.date)).toEqual(["2026-09-30", "2026-09-29", "2026-09-15"]);
    expect(d[0].entries.map((e) => e.id)).toEqual(["b", "a"]);
    expect(d[0]).toMatchObject({ hours: 8, amount: 160 });
    expect(d[2]).toMatchObject({ hours: 2, amount: 50 });
  });
  it("by job: jobs first (biggest money), then hours with no job; label from the entry or the estimate", () => {
    const j = byJob(hours, w, sept, (id) => (id === "e1" ? "EST-1 · Ana (est)" : ""));
    expect(j.map((x) => [x.estId, x.label, x.hours, x.amount])).toEqual([["e1", "EST-1 · Ana", 12, 240], ["e2", "EST-2 · Bo", 4, 80], ["", "", 2, 50]]);
    expect(byJob([hours[2]], w, sept, () => "EST-1 · Ana (est)")[0].label).toBe("EST-1 · Ana (est)");
  });
  it("weeks and months, oldest first, ending with the current one", () => {
    expect(weekStart("2026-09-30")).toBe("2026-09-28"); // Wednesday -> Monday
    const wk = periodSeries(hours, w, "week", 3, "2026-09-30");
    expect(wk.map((p) => [p.from, p.to, p.hours, p.amount])).toEqual([["2026-09-14", "2026-09-20", 2, 50], ["2026-09-21", "2026-09-27", 0, 0], ["2026-09-28", "2026-10-04", 16, 320]]);
    const mo = periodSeries(hours, w, "month", 3, "2026-09-30");
    expect(mo.map((p) => [p.key, p.hours, p.amount])).toEqual([["2026-07", 0, 0], ["2026-08", 5, 100], ["2026-09", 18, 370]]);
    expect(periodSeries([], w, "month", 2, "2026-01-15").map((p) => p.key)).toEqual(["2025-12", "2026-01"]);
  });
  it("pay: earned in the period, and all-time earned / paid / owed", () => {
    expect(paySummary(hours, pays, w, sept)).toEqual({ hours: 18, earned: 370, paid: 150, earnedAll: 470, paidAll: 250, owed: 220 });
    expect(paymentsIn(pays, "w1", { from: "", to: "" }).map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});

describe("clock-in job options", () => {
  it("jobs of my tasks for today, once each, named by the task's job label", () => {
    const tasks = [
      { date: "2026-09-30", estId: "e1", jobLabel: "EST-1 · Ana", title: "Prime" },
      { date: "2026-09-30", estId: "e1", jobLabel: "EST-1 · Ana", title: "Paint" },
      { date: "2026-09-30", estId: "e2", title: "Pick up paint" },
      { date: "2026-09-30", estId: "", title: "Shop run" },
      { date: "2026-10-01", estId: "e3", jobLabel: "EST-3", title: "x" },
    ];
    expect(clockJobOptions(tasks, "2026-09-30")).toEqual([{ estId: "e1", label: "EST-1 · Ana" }, { estId: "e2", label: "Pick up paint" }]);
  });
});

describe("clock-in tasks", () => {
  it("today's open tasks, by time then title", () => {
    const k = (id: string, date: string, time = "", done = false, title = id) => ({ id, date, time, done, title });
    const tasks = [k("late", "2026-09-30", "14:00"), k("old", "2026-09-29"), k("done", "2026-09-30", "08:00", true), k("b", "2026-09-30", "08:00"), k("a", "2026-09-30", "08:00"), k("tomorrow", "2026-10-01")];
    expect(clockTaskOptions(tasks, "2026-09-30").map((x) => x.id)).toEqual(["a", "b", "late"]);
    expect(clockTaskOptions([], "2026-09-30")).toEqual([]);
  });
});
