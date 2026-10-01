import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { blankEstimate } from "./estimate";
import {
  clockElapsed, clockEntry, clockFor, clockHHMM, clockHours, clockTimes, hourAmount, hoursText, inBounds, jobLabor, jobOnSite, laborByJob, rangeBounds, teamTotals, workerStats, clockMinutes, hoursOf, hoursSplit, rolePicks,
} from "./team";
import { defaultSettings } from "./settings";
import { SERVICES } from "./services.data";
import type { Estimate, HourEntry, Payout, Worker } from "./types";

/* ---- parity with the prototype: run its own functions on the same inputs ---- */
const proto = readFileSync(new URL("../../prototype/index.html", import.meta.url), "utf8");
function fn(name: string): string {
  const i = proto.indexOf(`function ${name}(`);
  let j = proto.indexOf("{", i), d = 0;
  for (;; j++) { if (proto[j] === "{") d++; if (proto[j] === "}" && !--d) break; }
  return proto.slice(i, j + 1);
}
const names = ["num", "r2", "addDaysISO", "rangeBounds", "teamBounds", "inBounds", "workerById", "liveHours", "livePays", "hourAmount", "workerStats", "prodP", "jobHours", "jobDates"];
function protoCtx(today: string, db: Record<string, unknown>) {
  const ctx: Record<string, any> = { DB: db, UI_LANG: "en", TT: (a: string) => a, todayISO: () => today, v4Defaults: () => ({ production: defaultSettings().production }) };
  runInNewContext(names.map(fn).join("\n") + ";" + names.map((n) => `this.${n}=${n};`).join(""), ctx);
  return ctx;
}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function sample(seed: number) {
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const workers: Worker[] = [
    { id: "w1", name: "Ana", rate: 22.5, active: true }, { id: "w2", name: "Beto", rate: 18.75 }, { id: "w3", name: "Chuy", rate: 31.33, active: false },
  ];
  const day = () => `2026-${String(1 + Math.floor(r() * 9)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`;
  const hours: HourEntry[] = [];
  for (let i = 0; i < 40; i++) {
    const h: any = { id: "h" + i, workerId: workers[Math.floor(r() * 3)].id, date: day(), hours: Math.round(r() * 40) / 4 + 0.25, estId: r() > 0.5 ? "e1" : "" };
    const k = r();
    if (k < 0.6) h.rate = Math.round(r() * 4000) / 100; else if (k < 0.8) h.rate = ""; // else: no rate stored (older entry)
    hours.push(h);
  }
  const payouts: Payout[] = [];
  for (let i = 0; i < 12; i++) payouts.push({ id: "p" + i, workerId: workers[Math.floor(r() * 3)].id, date: day(), amount: Math.round(r() * 90000) / 100, method: "Cash" });
  return { workers, hours, payouts };
}

describe("parity with prototype", () => {
  const todays = ["2026-09-29", "2026-01-02", "2026-03-01", "2026-12-31"];
  for (let seed = 1; seed <= 25; seed++) {
    it(`worker stats #${seed}`, () => {
      const { workers, hours, payouts } = sample(seed * 104729);
      const today = todays[seed % todays.length];
      const ctx = protoCtx(today, { workers: clone(workers), hours: clone(hours), payouts: clone(payouts) });
      for (const k of ["week", "month", "all"] as const) {
        const b = rangeBounds(k, today), pb = ctx.teamBounds(k);
        expect(b, k).toEqual(pb);
        for (const w of workers) {
          const a = workerStats(w, b, hours, payouts), p = ctx.workerStats(clone(w), pb);
          for (const f of ["h", "earned", "paid", "earnedAll", "paidAll", "owed"] as const) expect(a[f], `${k} ${w.id} ${f}`).toBe(p[f]);
        }
      }
      for (const h of hours) expect(hourAmount(h, workers.find((w) => w.id === h.workerId))).toBe(ctx.hourAmount(clone(h)));
      // "last year" is the prototype's "year" seen one year later
      const ny = String(+today.slice(0, 4) + 1) + today.slice(4);
      expect(rangeBounds("lastYear", ny)).toEqual(ctx.rangeBounds("year"));
    });
  }

  it("labor by job matches the prototype's per-job loop and planned hours", () => {
    const s = defaultSettings();
    const { workers, hours, payouts } = sample(777);
    const e = { ...blankEstimate(s, "EST-9"), id: "e1", doors: 22, drawers: 8, extraHrs: 3, items: [{ id: "i", desc: "Wall", descEs: "", qty: 400, unit: "sqft", rate: 2, svc: SERVICES[0].id }] } as Estimate;
    const ctx = protoCtx("2026-09-29", { workers: clone(workers), hours: clone(hours), payouts: clone(payouts), production: s.production, services: SERVICES });
    let eh = 0, ec = 0;
    ctx.liveHours().forEach((h: any) => { if (h.estId === "e1") { eh += ctx.num(h.hours); ec += ctx.hourAmount(h); } });
    const plan = ctx.jobHours(clone(e)).total;
    const rows = laborByJob(hours, [e], s, workers);
    expect(rows).toHaveLength(1);
    expect(rows[0].h).toBe(eh); expect(rows[0].cost).toBe(ec); expect(rows[0].plan).toBe(plan);
    expect(rows[0].diff).toBe(plan ? eh - plan : 0);
    expect(jobLabor(hours, "e1", workers)).toEqual({ h: eh, cost: ec });
    expect(payouts.length).toBeGreaterThan(0);
  });
});

describe("known values", () => {
  const w: Worker = { id: "w", name: "Ana", rate: 20 };
  it("entry rate wins over the worker's current rate; missing rate falls back", () => {
    expect(hourAmount({ hours: 8, rate: 25 }, w)).toBe(200);
    expect(hourAmount({ hours: 8, rate: "" as unknown as number }, w)).toBe(160);
    expect(hourAmount({ hours: 8 } as HourEntry, w)).toBe(160);
    expect(hourAmount({ hours: 8 } as HourEntry, null)).toBe(0);
    expect(hourAmount({ hours: 1.1, rate: 10.05 }, w)).toBe(11.06);
  });
  it("owed is all-time, whatever the range", () => {
    const hours: HourEntry[] = [
      { id: "1", workerId: "w", date: "2026-08-30", hours: 10, rate: 20 }, { id: "2", workerId: "w", date: "2026-09-05", hours: 5, rate: 22 },
      { id: "3", workerId: "x", date: "2026-09-05", hours: 5, rate: 99 },
    ];
    const pays: Payout[] = [{ id: "p", workerId: "w", date: "2026-08-31", amount: 150 }];
    const st = workerStats(w, rangeBounds("month", "2026-09-10"), hours, pays);
    expect(st).toMatchObject({ h: 5, earned: 110, paid: 0, earnedAll: 310, paidAll: 150, owed: 160 });
    expect(workerStats(w, rangeBounds("all"), hours, pays)).toMatchObject({ h: 15, earned: 310, paid: 150, owed: 160 });
  });
  it("totals: owed never counts negative (overpaid) workers", () => {
    const ws: Worker[] = [w, { id: "v", name: "Vic", rate: 10 }];
    const hours: HourEntry[] = [{ id: "1", workerId: "w", date: "2026-09-01", hours: 10, rate: 20 }, { id: "2", workerId: "v", date: "2026-09-01", hours: 1, rate: 10 }];
    const pays: Payout[] = [{ id: "p", workerId: "v", date: "2026-09-02", amount: 50 }];
    expect(teamTotals(ws, rangeBounds("all"), hours, pays)).toEqual({ h: 11, cost: 210, paid: 50, owed: 200 });
  });
  it("range bounds", () => {
    expect(rangeBounds("week", "2026-09-29")).toEqual({ from: "2026-09-28", to: "2026-10-04" }); // Tuesday
    expect(rangeBounds("week", "2026-09-27")).toEqual({ from: "2026-09-21", to: "2026-09-27" }); // Sunday
    expect(rangeBounds("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-31" });
    expect(rangeBounds("lastMonth", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(rangeBounds("lastMonth", "2026-09-29")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(rangeBounds("ytd", "2026-09-29")).toEqual({ from: "2026-01-01", to: "2026-09-29" });
    expect(rangeBounds("lastYear", "2026-09-29")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(rangeBounds("all")).toEqual({ from: "", to: "" });
    expect(inBounds("2026-09-29T10:00:00Z", rangeBounds("month", "2026-09-01"))).toBe(true);
    expect(inBounds("2026-10-01", rangeBounds("month", "2026-09-01"))).toBe(false);
    expect(inBounds(undefined, rangeBounds("all"))).toBe(true);
  });
});

describe("clock in / out", () => {
  const at = "2026-09-29T15:00:00.000Z", ms = Date.parse(at);
  it("counts exactly the minutes on the clock: no quarter hours, no 15 min minimum (owner rule)", () => {
    const m = (min: number) => clockHours(at, ms + min * 60000);
    expect(m(4)).toBe(4 / 60); expect(hoursText(m(4))).toBe("4 min");
    expect(m(0)).toBe(0); expect(m(60)).toBe(1); expect(m(97)).toBe(97 / 60); expect(hoursText(m(8 * 60 + 52))).toBe("8 h 52 min");
    expect(clockMinutes(at, ms + 4 * 60000 + 29000)).toBe(4); expect(clockMinutes(at, ms + 4 * 60000 + 31000)).toBe(5);   // to the nearest minute
    expect(clockMinutes(at, ms - 60000)).toBe(0); expect(clockMinutes("bad", ms)).toBe(0);
    // 10 workers x 4 minutes: paid 40 minutes, not 2 h 30 min
    expect(hourAmount({ hours: m(4) * 10, rate: 30 })).toBe(20);
  });
  it("hours typed as hours + minutes", () => {
    expect(hoursOf(7, 45)).toBe(7.75); expect(hoursOf(0, 4)).toBe(4 / 60); expect(hoursOf(-1, 0)).toBe(0);
    expect(hoursSplit(7.75)).toEqual({ h: 7, m: 45 }); expect(hoursSplit(4 / 60)).toEqual({ h: 0, m: 4 }); expect(hoursSplit(0)).toEqual({ h: 0, m: 0 });
  });
  it("elapsed text", () => { expect(clockElapsed(at, ms + 125 * 60000)).toEqual({ h: 2, m: 5 }); expect(clockElapsed(at, ms - 5000)).toEqual({ h: 0, m: 0 }); });
  it("shows hours as hours and minutes", () => {
    expect(clockHHMM({ h: 2, m: 5 })).toBe("02:05");
    expect(clockHHMM({ h: 12, m: 40 })).toBe("12:40");
    expect(hoursText(7.5)).toBe("7 h 30 min");
    expect(hoursText(8.75)).toBe("8 h 45 min");
    expect(hoursText(0.25)).toBe("15 min");
    expect(hoursText(2)).toBe("2 h");
    expect(hoursText(1 + 5 / 60)).toBe("1 h 05 min");
    expect(hoursText(0)).toBe("0 min");
    expect(hoursText(-1)).toBe("0 min");
  });
  it("a clock-in is for one task and carries its job; the hours entry keeps the task", () => {
    const c = clockFor({ id: "t1", title: "Prep the kitchen", estId: "e5", jobLabel: "EST-1005 · Ana" }, at);
    expect(c).toEqual({ at, estId: "e5", taskId: "t1", taskTitle: "Prep the kitchen", jobLabel: "EST-1005 · Ana" });
    expect(clockFor({ id: "t2", title: "Errand" }, at)).toEqual({ at, estId: "", taskId: "t2", taskTitle: "Errand" });
    const en = clockEntry(c, { id: "w9", name: "Ana", rate: 20 }, "Clock in/out", ms + 2 * 3600000);
    expect(en).toMatchObject({ taskId: "t1", taskTitle: "Prep the kitchen", note: "Prep the kitchen", estId: "e5", jobLabel: "EST-1005 · Ana", hours: 2 });
  });
  it("creates the hours entry with the worker's rate and the clocked job", () => {
    const w: Worker = { id: "w9", name: "Ana", rate: 21.5 };
    const en = clockEntry({ at, estId: "e5" }, w, "Clock in/out", ms + 3 * 3600000);
    expect(en).toMatchObject({ workerId: "w9", hours: 3, rate: 21.5, estId: "e5", note: "Clock in/out" });
    expect(en.id).toBe(`h-clk-w9-${ms}`);
    expect(clockEntry({ at }, w, "x", ms + 3600000).estId).toBe("");
    expect(en).toMatchObject({ start: at, end: new Date(ms + 3 * 3600000).toISOString() });
  });
  it("shows the clock-in and clock-out times", () => {
    const tt = clockTimes({ start: "2026-05-04T13:02:00", end: "2026-05-04T21:15:00" }, "en");
    expect(tt).toMatch(/1:02\s?PM – 9:15\s?PM/);
    expect(clockTimes({}, "en")).toBe("");
    expect(clockTimes({ start: "bad" }, "en")).toBe("");
  });
  it("assigns the job scheduled today, else none", () => {
    const s = defaultSettings();
    const mk = (id: string, startDate: string, days: number, status: Estimate["status"] = "Accepted") => ({ ...blankEstimate(s, id), id, startDate, days, status }) as Estimate;
    const list = [mk("a", "2026-09-20", 3), mk("b", "2026-09-28", 3), mk("c", "", 2), mk("d", "2026-09-29", 1, "Declined")];
    expect(jobOnSite(list, "2026-09-29")?.id).toBe("b");   // Sep 28-30
    expect(jobOnSite(list, "2026-09-30")?.id).toBe("b");
    expect(jobOnSite(list, "2026-10-01")).toBeUndefined();
    expect(jobOnSite(list, "2026-09-19")).toBeUndefined();
    expect(jobOnSite([list[3]], "2026-09-29")).toBeUndefined();
  });
});

describe("role quick picks", () => {
  it("by trade and language", () => {
    expect(rolePicks("painting", "en")).toContain("Sprayer");
    expect(rolePicks("painting", "es")).toContain("Pintor");
    expect(rolePicks("plumbing", "en")[0]).toBe("Plumber");
  });
});
