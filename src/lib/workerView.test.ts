import { describe, expect, it } from "vitest";
import { hourAmount } from "./team";
import { clockEntry } from "./team";
import {
  isMyTask, matchFilter, myHoursIn, myTasks, splitTasks, subscriptionPlan, sumHours, workerClockEntry, workerHoursEntry,
} from "./workerView";
import type { HourEntry } from "./types";

describe("subscriptionPlan (what a login may subscribe to)", () => {
  it("owners and admins read every collection whole", () => {
    for (const role of ["owner", "admin"] as const) for (const col of ["estimates", "tasks", "hours", "clock", "workers", "settings"]) expect(subscriptionPlan(role, null, col)).toEqual({ kind: "all" });
  });
  it("a worker reads tasks / hours filtered by workerId", () => {
    expect(subscriptionPlan("worker", "w1", "tasks")).toEqual({ kind: "filter", field: "workerId", value: "w1" });
    expect(subscriptionPlan("worker", "w1", "hours")).toEqual({ kind: "filter", field: "workerId", value: "w1" });
  });
  it("a worker reads clock / workers only as the single doc with their id", () => {
    expect(subscriptionPlan("worker", "w1", "clock")).toEqual({ kind: "doc", id: "w1" });
    expect(subscriptionPlan("worker", "w1", "workers")).toEqual({ kind: "doc", id: "w1" });
  });
  it("a worker reads nothing else, and nothing at all while not linked", () => {
    for (const col of ["estimates", "invoices", "clients", "settings", "expenses", "members"]) expect(subscriptionPlan("worker", "w1", col)).toEqual({ kind: "none" });
    expect(subscriptionPlan("worker", "w1", "payouts")).toEqual({ kind: "filter", field: "workerId", value: "w1" }); // my payments (timesheet)
    for (const col of ["tasks", "hours", "clock", "workers"]) { expect(subscriptionPlan("worker", null, col)).toEqual({ kind: "none" }); expect(subscriptionPlan("worker", "", col)).toEqual({ kind: "none" }); }
  });
});

describe("matchFilter (demo-mode where ==)", () => {
  it("keeps everything without a filter and only equal rows with one", () => {
    const rows = [{ id: "a", workerId: "w1" }, { id: "b", workerId: "w2" }, { id: "c" }];
    expect(rows.filter((r) => matchFilter(r))).toHaveLength(3);
    expect(rows.filter((r) => matchFilter(r, { field: "workerId", value: "w1" })).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("task ownership (same test as firestore.rules)", () => {
  it("only tasks assigned to my non-empty worker id are mine", () => {
    expect(isMyTask({ workerId: "w1" }, "w1")).toBe(true);
    expect(isMyTask({ workerId: "w2" }, "w1")).toBe(false);
    expect(isMyTask({}, "w1")).toBe(false);
    expect(isMyTask({ workerId: "" }, "")).toBe(false);
    expect(isMyTask({ workerId: "w1" }, null)).toBe(false);
    expect(myTasks([{ workerId: "w1" }, { workerId: "w2" }, {}], "w1")).toHaveLength(1);
  });
  it("orders open tasks by date/time and lists done ones last (newest first)", () => {
    const ts = [
      { date: "2026-05-03", title: "c", done: false }, { date: "2026-05-01", time: "10:00", title: "b", done: false }, { date: "2026-05-01", time: "08:00", title: "a", done: false },
      { date: "2026-04-01", title: "d1", done: true }, { date: "2026-04-05", title: "d2", done: true },
    ];
    const { open, done } = splitTasks(ts);
    expect(open.map((k) => k.title)).toEqual(["a", "b", "c"]);
    expect(done.map((k) => k.title)).toEqual(["d2", "d1"]);
  });
});

describe("worker clock out / manual hours", () => {
  const at = "2026-05-04T13:00:00.000Z", out = Date.parse(at) + 2.1 * 3600000;
  it("matches the owner-side clockEntry (id, hours, date) and carries the worker's rate", () => {
    const mine = workerClockEntry({ at }, "w1", { rate: 22.5 }, "n", out);
    const owner = clockEntry({ at }, { id: "w1", name: "J", rate: 22.5 }, "n", out);
    expect(mine).toEqual(owner);
    expect(mine.hours).toBe(2);
  });
  it("omits the rate when the worker record is unavailable, so the owner's screens use the worker's current rate", () => {
    const e = workerClockEntry({ at }, "w1", null, "n", out);
    expect("rate" in e).toBe(false);
    expect(hourAmount(e as HourEntry, { rate: 20 })).toBe(40);
    expect(workerClockEntry({ at }, "w1", undefined, "n", out).rate).toBeUndefined();
  });
  it("keeps the job id of the running clock and never fills one in by itself", () => {
    expect(workerClockEntry({ at, estId: "e1" }, "w1", { rate: 1 }, "", out).estId).toBe("e1");
    expect(workerClockEntry({ at }, "w1", { rate: 1 }, "", out).estId).toBe("");
  });
  it("manual entries are for the worker only, rounded to cents of an hour, trimmed", () => {
    const e = workerHoursEntry("h1", "w1", { rate: 0 }, { date: "2026-05-04", hours: 7.256, note: "  prep " });
    expect(e).toMatchObject({ id: "h1", workerId: "w1", date: "2026-05-04", hours: 7.26, note: "prep", estId: "", rate: 0 });
    expect(workerHoursEntry("h2", "w1", null, { hours: 1 }).rate).toBeUndefined();
  });
});

describe("my hours", () => {
  const hs: HourEntry[] = [
    { id: "1", workerId: "w1", date: "2026-05-04", hours: 3, rate: 10 }, { id: "2", workerId: "w2", date: "2026-05-04", hours: 9, rate: 10 },
    { id: "3", workerId: "w1", date: "2026-04-20", hours: 2.5, rate: 10 }, { id: "4", workerId: "w1", date: "2026-05-05", hours: 1, rate: 10 },
  ];
  it("keeps only my entries inside the range, newest first", () => {
    const l = myHoursIn(hs, "w1", { from: "2026-05-01", to: "2026-05-31" });
    expect(l.map((h) => h.id)).toEqual(["4", "1"]);
    expect(sumHours(l)).toBe(4);
    expect(myHoursIn(hs, null, { from: "", to: "" })).toEqual([]);
    expect(sumHours(myHoursIn(hs, "w1", { from: "", to: "" }))).toBe(6.5);
  });
});
