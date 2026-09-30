import { describe, expect, it } from "vitest";
import { blankEstimate } from "./estimate";
import { ALL_KPI_IDS, EXTRA_KPIS, anyKpiDef, dashCardsFor, defaultKpiCards, fmtKpi, kpiResult, kpiSeriesAny, libraryKpiIds, tradeKpiIds } from "./kpis";
import { KPI_DEFAULT, kpiValue, type Ctx, type Period } from "./metrics";
import { money } from "./money";
import { defaultSettings } from "./settings";
import { TRADE_LIST } from "./trades";
import type { Client, Estimate, Expense, HourEntry, Invoice } from "./types";

const settings = defaultSettings();
const est = (id: string, over: Partial<Estimate> = {}): Estimate => ({ ...blankEstimate(settings, "EST-" + id), id, date: "2026-09-02", status: "Accepted", doors: 10, doorRate: 100, clientId: "c1", ...over } as Estimate);
const inv = (id: string, estId: string, amount: number, over: Partial<Invoice> = {}): Invoice => ({ id, number: id, estId, kind: "deposit", amount, date: "2026-09-01", status: "Unpaid", ...over });
const sig = (date: string) => ({ name: "x", img: "", date, via: "link", at: "" });
const NOW = new Date(2026, 8, 29, 12);
const ctx = (over: Partial<Ctx> = {}): Ctx => ({
  estimates: [], invoices: [], expenses: [], payouts: [], hours: [], workers: [{ id: "w1", name: "Ana", rate: 20 }],
  clients: [{ id: "c1", name: "Ana Ruiz" } as Client, { id: "c2", name: "Ben Carter" } as Client], settings, now: NOW, ...over,
});
const exp = (id: string, estId: string, amount: number): Expense => ({ id, date: "2026-09-03", vendor: "HD", amount, category: "materials", estId });
const hrs = (id: string, estId: string, hours: number): HourEntry => ({ id, workerId: "w1", date: "2026-09-04", hours, rate: 20, estId });

/** 3 won jobs (1000 / 2000 / 500), one open estimate; c1 has two won jobs, c2 one. */
const full = (): Ctx => ctx({
  estimates: [
    est("e1", { sentAt: "2026-09-02", signature: sig("2026-09-05"), leadSource: "Google" }),
    est("e2", { date: "2026-08-10", doors: 20, sentAt: "2026-08-01T10:00:00.000Z", signature: sig("2026-08-11"), leadSource: "Referral" }),
    est("e3", { date: "2026-07-01", doors: 5, clientId: "c2" }),
    est("e4", { status: "Sent", date: "2026-09-10" }),
  ],
  invoices: [inv("i1", "e1", 400, { status: "Paid", paidDate: "2026-09-06" })],
  expenses: [exp("x1", "e1", 100), exp("x2", "e2", 400)],
  hours: [hrs("h1", "e1", 10), hrs("h2", "e2", 5)],
});
const ytd = { from: "2026-01-01", to: "2026-09-29" };
const val = (c: Ctx, id: string, b = ytd) => anyKpiDef(id)!.value(c, b);

describe("trade KPIs: formulas", () => {
  it("jobs_won / avg_ticket / to_collect", () => {
    const c = full();
    expect(val(c, "jobs_won")).toBe(3);
    expect(val(c, "avg_ticket")).toBeCloseTo(3500 / 3, 8);
    expect(val(c, "to_collect")).toBe(600 + 2000 + 500);
  });
  it("jobs per week / month use the days of the period (at least one week / month)", () => {
    const c = full(), sep = { from: "2026-09-01", to: "2026-09-29" };
    expect(val(c, "jobs_per_week", sep)).toBeCloseTo(1 / (29 / 7), 8);
    expect(val(c, "jobs_per_month", sep)).toBe(1);
    expect(val(c, "jobs_per_month", ytd)).toBeCloseTo(3 / (272 / 30.44), 8);
  });
  it("repeat_share: clients with 2+ won jobs over clients with a won job in the period", () => {
    const c = full();
    expect(val(c, "repeat_share")).toBe(50);
    expect(val(c, "repeat_share", { from: "2026-09-01", to: "2026-09-29" })).toBe(100);   // c1 only, and c1 has 2 won jobs up to today
    expect(val(c, "repeat_share", { from: "2026-08-01", to: "2026-08-31" })).toBe(0);     // c1 had only one won job up to Aug 31 (the Sep job is after the period end)
  });
  it("hours and per-hour KPIs only use jobs that have hours", () => {
    const c = full();
    expect(val(c, "hours_logged")).toBe(15);
    expect(val(c, "revenue_per_hour")).toBeCloseTo(3000 / 15, 8);                          // e3 has no hours: left out
    expect(val(c, "earn_per_hour")).toBeCloseTo((700 + 1500) / 15, 8);                    // 1000-100-200 and 2000-400-100
  });
  it("materials margin and profit after materials", () => {
    const c = full();
    expect(val(c, "mat_margin")).toBeCloseTo((2500 / 3000) * 100, 8);                     // only jobs with receipts
    expect(val(c, "profit_after_mat")).toBe(3500 - 500);
  });
  it("quote_to_win_days: sent (sentAt, else estimate date) to signature, by signing date", () => {
    const c = full();
    expect(val(c, "quote_to_win_days")).toBe(6.5);                                         // 3 and 10 days
    expect(val(c, "quote_to_win_days", { from: "2026-09-01", to: "2026-09-29" })).toBe(3);
    expect(val(ctx({ estimates: [est("z", { signature: sig("2026-09-01"), sentAt: "2026-09-09" })] }), "quote_to_win_days")).toBeNull(); // signed before sent: ignored
  });
  it("top_source_rev: best lead source, 'Not set' ignored", () => {
    expect(val(full(), "top_source_rev")).toBe(2000);
    expect(val(ctx({ estimates: [est("n")] }), "top_source_rev")).toBeNull();
  });
  it("empty data: null or 0, never NaN, formatted as a dash", () => {
    const c = ctx();
    for (const k of EXTRA_KPIS) {
      const v = k.value(c, ytd);
      expect(v === null || (typeof v === "number" && isFinite(v)), k.id).toBe(true);
      if (v === null) expect(fmtKpi(k, v, money)).toBe("—");
    }
    for (const id of ["repeat_share", "revenue_per_hour", "earn_per_hour", "mat_margin", "quote_to_win_days", "top_source_rev", "hours_logged", "avg_ticket", "profit_after_mat"]) expect(val(c, id), id).toBeNull();
    expect(val(c, "jobs_won")).toBe(0);
    expect(val(c, "to_collect")).toBe(0);
  });
  it("no NaN anywhere for any KPI and period, with and without data", () => {
    for (const c of [ctx(), full()]) for (const id of ALL_KPI_IDS) for (const p of ["month", "lastmonth", "ytd", "lastyear"] as Period[]) {
      const r = kpiResult(c, id, p), d = anyKpiDef(id)!;
      for (const v of [r.value, r.prev, r.delta]) expect(v === null || isFinite(v as number), id + p).toBe(true);
      expect(fmtKpi(d, r.value, money)).not.toMatch(/NaN|Infinity/);
      for (const s of kpiSeriesAny(c, id)) expect(isFinite(s.v)).toBe(true);
    }
  });
});

describe("trade KPIs: formatting, results, series", () => {
  it("fmtKpi", () => {
    expect(fmtKpi({ format: "dec" }, 2.345, money)).toBe("2.3");
    expect(fmtKpi({ format: "days" }, 6.5, money)).toBe("6.5 d");
    expect(fmtKpi({ format: "perhour" }, 45, money)).toBe("$45.00/h");
    expect(fmtKpi({ format: "pct" }, 50, money)).toBe("50.0%");
    expect(fmtKpi({ format: "count" }, 3, money)).toBe("3");
    expect(fmtKpi({ format: "money" }, NaN, money)).toBe("—");
    expect(fmtKpi({ format: "dec" }, null, money)).toBe("—");
  });
  it("kpiResult: extras compare with the previous period, library ids match metrics.kpiValue", () => {
    const c = full();
    expect(kpiResult(c, "jobs_won", "month")).toMatchObject({ value: 1, prev: 1, delta: 0 });
    expect(kpiResult(c, "repeat_share", "ytd")).toMatchObject({ value: 50, prev: null, deltaIsPoints: true, delta: null });
    expect(kpiResult(c, "to_collect", "ytd")).toMatchObject({ value: 3100, prev: null, delta: null });
    const old = kpiValue(c, "sales_won", "ytd");
    expect(kpiResult(c, "sales_won", "ytd")).toMatchObject({ value: old.value, prev: old.prev, delta: old.delta });
    expect(kpiResult(c, "nope", "ytd").value).toBeNull();
  });
  it("kpiSeriesAny: 6 months oldest first", () => {
    const s = kpiSeriesAny(full(), "jobs_won");
    expect(s.map((x) => x.key)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(s.map((x) => x.v)).toEqual([0, 0, 0, 1, 1, 1]);
  });
});

describe("trade KPIs: which cards each trade shows", () => {
  it("every id in Trade.kpis / kpiMore is a real KPI, with bilingual text", () => {
    for (const t of TRADE_LIST) {
      expect(t.kpis.length, t.id).toBeGreaterThan(0);
      for (const id of [...t.kpis, ...t.kpiMore]) { const d = anyKpiDef(id); expect(d, t.id + ":" + id).toBeTruthy(); expect(d!.en && d!.es && d!.subEn && d!.subEs).toBeTruthy(); }
      expect(new Set([...t.kpis, ...t.kpiMore]).size, t.id + " duplicates").toBe(t.kpis.length + t.kpiMore.length);
    }
    expect(ALL_KPI_IDS).toHaveLength(new Set(ALL_KPI_IDS).size);
  });
  it("painting keeps the current defaults and library order exactly", () => {
    expect(defaultKpiCards("painting")).toEqual(KPI_DEFAULT);
    expect(defaultKpiCards("")).toEqual(KPI_DEFAULT);
    expect(defaultKpiCards("cabinets")).toEqual(KPI_DEFAULT);
    expect(libraryKpiIds("painting").slice(0, 14)).toEqual(["job_margin", "net_profit", "sales_won", "backlog", "money_in", "money_out", "close_rate", "avg_job", "leads", "cpl", "unpaid", "labor", "mat_pct", "jobs_done"]);
    expect(tradeKpiIds("painting")).toEqual([]);
  });
  it("defaults by trade", () => {
    const ids = (t: string) => defaultKpiCards(t).map((c) => c.id);
    expect(ids("cleaning")).toEqual(expect.arrayContaining(["repeat_share", "revenue_per_hour", "jobs_per_week"]));
    expect(ids("landscaping")).toEqual(expect.arrayContaining(["repeat_share", "revenue_per_hour", "jobs_per_month"]));
    for (const t of ["electrical", "plumbing"]) expect(ids(t)).toEqual(expect.arrayContaining(["jobs_won", "avg_ticket", "mat_margin", "quote_to_win_days"]));
    expect(ids("handyman")).toEqual(expect.arrayContaining(["jobs_won", "avg_ticket", "hours_logged", "earn_per_hour"]));
    expect(ids("custom")).toEqual(expect.arrayContaining(["sales_won", "to_collect", "avg_ticket", "close_rate", "profit_after_mat", "earn_per_hour"]));
    expect(ids("something odd")).toEqual(ids("custom"));                                   // unknown text = custom
    expect(defaultKpiCards("cleaning").every((c) => c.p === "ytd")).toBe(true);
  });
  it("saved dashCards are never touched; unset or empty falls back to the trade", () => {
    const saved = [{ id: "money_in", p: "month" as Period }];
    expect(dashCardsFor({ trade: "cleaning", dashCards: saved })).toBe(saved);
    expect(dashCardsFor({ trade: "cleaning", dashCards: [] })).toEqual(defaultKpiCards("cleaning"));
    expect(dashCardsFor({ trade: "cleaning" })).toEqual(defaultKpiCards("cleaning"));
    expect(dashCardsFor({ trade: "painting" })).toEqual(KPI_DEFAULT);
  });
  it("library lists the trade's cards first, then the general ones, each id once", () => {
    for (const t of TRADE_LIST.filter((x) => x.id !== "painting")) {
      const lib = libraryKpiIds(t.id), own = tradeKpiIds(t.id);
      expect(lib.slice(0, own.length)).toEqual(own);
      expect(lib).toHaveLength(ALL_KPI_IDS.length);
      expect(new Set(lib).size).toBe(lib.length);
    }
  });
});
