import { describe, expect, it } from "vitest";
import { LOC_CONSENT_V, locAllowed, locAnswered, locExpired } from "./geo";
import { editHistory, entryPay, getsOvertime, overtime, restoreEntry, softDelete, withEdit, workerStats, workweekOf } from "./team";
import { paySummary, periodSeries } from "./timesheet";
import type { HourEntry, Worker } from "./types";

const W = (o: Partial<Worker> = {}): Worker => ({ id: "w1", name: "Carlos", rate: 20, ...o });
let n = 0;
const H = (date: string, hours: number, o: Partial<HourEntry> = {}): HourEntry => ({ id: "h" + ++n, workerId: "w1", date, hours, rate: 20, ...o });
// Mon 2026-09-28 .. Sun 2026-10-04
const DAYS = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
const week = (hs: number[], o: Partial<HourEntry> = {}) => hs.map((h, i) => H(DAYS[i], h, o));

describe("overtime: 1.5x past 40 h in a Monday-Sunday week", () => {
  it("the workweek starts on Monday", () => {
    expect(workweekOf("2026-09-28")).toBe("2026-09-28"); // Monday
    expect(workweekOf("2026-10-04")).toBe("2026-09-28"); // Sunday
    expect(workweekOf("2026-10-05")).toBe("2026-10-05");
  });
  it("45 h at $20: 5 h past 40 pay $10 more each = $50 on top of $900", () => {
    const hs = week([9, 9, 9, 9, 9]);
    const { byEntry, weeks } = overtime(hs, [W()]);
    expect(weeks).toEqual([{ workerId: "w1", week: "2026-09-28", hours: 45, ot: 5, extra: 50 }]);
    expect([...byEntry.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(50, 6); // spread over the week's entries, adds up to the cent
    expect(hs.reduce((a, h) => a + entryPay(h, W(), byEntry), 0)).toBeCloseTo(950, 6);
  });
  it("exactly 40 h, or two weeks of 30 h: no overtime", () => {
    expect(overtime(week([8, 8, 8, 8, 8]), [W()]).weeks).toEqual([]);
    expect(overtime([...week([10, 10, 10]), H("2026-10-05", 10), H("2026-10-06", 10), H("2026-10-07", 10)], [W()]).weeks).toEqual([]);
  });
  it("different rates in one week: the regular rate is the average (straight pay / hours)", () => {
    const hs = [H("2026-09-28", 20, { rate: 20 }), H("2026-09-29", 30, { rate: 30 })]; // 50 h, $1,300 straight -> $26/h regular
    const { weeks, byEntry } = overtime(hs, [W()]);
    expect(weeks[0].extra).toBe(130); // 0.5 x 26 x 10
    expect(byEntry.get(hs[0].id)! + byEntry.get(hs[1].id)!).toBeCloseTo(130, 6);
  });
  it("not for a contractor (switched off), not for deleted entries; the worker's current rate when the entry has none", () => {
    expect(getsOvertime(W())).toBe(true); expect(getsOvertime(W({ overtime: false }))).toBe(false); expect(getsOvertime(undefined)).toBe(false);
    expect(overtime(week([9, 9, 9, 9, 9]), [W({ overtime: false })]).weeks).toEqual([]);
    expect(overtime([...week([9, 9, 9, 9]), H("2026-10-02", 9, { deleted: true })], [W()]).weeks).toEqual([]);
    const noRate = week([10, 10, 10, 10, 10]).map((h) => { const { rate: _r, ...x } = h; return x as HourEntry; });
    expect(overtime(noRate, [W({ rate: 30 })]).weeks[0].extra).toBe(150); // 0.5 x 30 x 10
  });
  it("Team page, timesheet and pay summary all add it; owed includes it", () => {
    const hs = week([9, 9, 9, 9, 9]);
    const st = workerStats(W(), { from: "", to: "" }, hs, [{ id: "p", workerId: "w1", date: "2026-10-05", amount: 900 }]);
    expect(st).toMatchObject({ h: 45, earned: 950, owed: 50, ot: 5, otPay: 50 });
    expect(paySummary(hs, [], W(), { from: "", to: "" }).earned).toBe(950);
    expect(periodSeries(hs, W(), "week", 2, "2026-10-01").map((p) => p.amount)).toEqual([0, 950]);
  });
});

describe("hours the owner changes or deletes keep a record", () => {
  const base = H("2026-09-28", 8, { note: "Prep", estId: "e1" });
  it("an edit keeps the old values; nothing changed = no history", () => {
    const a = withEdit(base, { ...base, hours: 7.5, note: "Prep + sand" }, "Miguel", "2026-09-29T10:00:00Z");
    expect(a.edits).toEqual([{ at: "2026-09-29T10:00:00Z", by: "Miguel", what: "edit", before: { hours: 8, note: "Prep" } }]);
    expect(withEdit(base, { ...base }, "Miguel").edits).toBeUndefined();
    const b = withEdit(a, { ...a, hours: 7 }, "Miguel", "2026-09-30T10:00:00Z");
    const hist = editHistory(b);
    expect(hist.map((x) => x.changes.map((c) => [c.field, c.from, c.to]))).toEqual([[["hours", 8, 7.5], ["note", "Prep", "Prep + sand"]], [["hours", 7.5, 7]]]);
  });
  it("delete marks it (who / when) instead of erasing it; restore takes the mark off; both stay in the history", () => {
    const d = softDelete(base, "Miguel", "2026-09-29T10:00:00Z");
    expect(d).toMatchObject({ deleted: true, deletedAt: "2026-09-29T10:00:00Z", deletedBy: "Miguel" });
    const r = restoreEntry(d, "Miguel", "2026-09-29T11:00:00Z");
    expect(r.deleted).toBeUndefined(); expect(r.deletedBy).toBeUndefined();
    expect(editHistory(r).map((x) => x.what)).toEqual(["delete", "restore"]);
    // a deleted entry never counts
    expect(workerStats(W(), { from: "", to: "" }, [d], []).earned).toBe(0);
  });
});

describe("the worker's location: only with their yes, deleted after 90 days", () => {
  const yes = { locConsent: { on: true, at: "2026-10-01T12:00:00Z", v: LOC_CONSENT_V } };
  it("saved only when the owner turned it on and the worker said yes to this notice", () => {
    expect(locAllowed(true, yes)).toBe(true);
    expect(locAllowed(false, yes)).toBe(false);
    expect(locAllowed(true, { locConsent: { ...yes.locConsent, on: false } })).toBe(false);
    expect(locAllowed(true, {})).toBe(false);
    expect(locAllowed(true, { locConsent: { ...yes.locConsent, v: "loc-old" } })).toBe(false); // a new notice asks again
    expect(locAnswered({ locConsent: { ...yes.locConsent, on: false } })).toBe(true);
  });
  it("positions older than 90 days are due for removal", () => {
    const loc = { lat: 30, lng: -97, acc: 5, at: "x" };
    const hs = [H("2026-06-01", 8, { inLoc: loc }), H("2026-07-03", 8, { outLoc: loc }), H("2026-07-02", 8), H("2026-09-30", 8, { inLoc: loc })];
    expect(locExpired(hs, "2026-10-01").map((h) => h.date)).toEqual(["2026-06-01"]);
  });
});
