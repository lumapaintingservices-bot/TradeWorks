import { describe, expect, it } from "vitest";
import { blankEstimate, calcMaterials, jobEconomics } from "./estimate";
import { jobSpend } from "./expenses";
import { defaultSettings } from "./settings";
import type { Estimate, Expense } from "./types";

const ex = (id: string, estId: string, category: string, amount: number, extra: Partial<Expense> = {}) =>
  ({ id, estId, category, amount, date: "2026-10-01", vendor: "", method: "Card", note: "", ...extra }) as Expense;

describe("jobSpend: everything spent on one job, by kind", () => {
  const rows = [
    ex("a", "e1", "materials", 80), ex("b", "e1", "materials", 15.5), ex("c", "e1", "labor", 300), ex("d", "e1", "tools", 40), ex("f", "e1", "fuel", 12.25),
    ex("g", "e2", "materials", 999), ex("h", "", "materials", 50), ex("i", "e1", "materials", 70, { deleted: true } as Partial<Expense>),
  ];
  it("splits materials, subcontractors and other; skips other jobs, unlinked and deleted rows", () => {
    expect(jobSpend(rows, "e1")).toEqual({ mat: 95.5, labor: 300, other: 52.25, total: 447.75 });
  });
  it("adds the old app's receipts on the estimate to materials", () => {
    expect(jobSpend(rows, "e1", [{ amount: 4.5 }]).mat).toBe(100);
  });
  it("an empty job id matches nothing", () => {
    expect(jobSpend(rows, "")).toEqual({ mat: 0, labor: 0, other: 0, total: 0 });
  });
});

describe("jobEconomics with the job's expenses", () => {
  const s = defaultSettings();
  const e: Estimate = { ...blankEstimate(s, "EST-1"), id: "e1", doors: 20, drawers: 8, doorRate: 80, drawerRate: 55 };
  it("a plain number still means real materials (prototype behavior)", () => {
    const a = jobEconomics(e, s, 120), b = jobEconomics(e, s, { mat: 120 });
    expect(a.mat).toBe(120); expect(a.profit).toBe(b.profit); expect(a.sub).toBe(0); expect(a.other).toBe(0);
  });
  it("no expenses: the estimated materials are used", () => {
    const x = jobEconomics(e, s, { mat: 0, labor: 0, other: 0 });
    expect(x.matReal).toBe(false); expect(x.mat).toBe(calcMaterials(e, s).totalCost); expect(x.matEst).toBe(x.mat);
  });
  it("real materials replace the estimate; subcontractors and other job expenses lower the profit", () => {
    const base = jobEconomics(e, s);
    const x = jobEconomics(e, s, { mat: 95.5, labor: 300, other: 52.25 });
    expect(x.matReal).toBe(true); expect(x.mat).toBe(95.5);
    expect(x.cost).toBe(Math.round((x.labor + 95.5 + 300 + 52.25) * 100) / 100);
    expect(x.profit).toBe(Math.round((x.revenue - x.cost) * 100) / 100);
    expect(x.profit).toBeLessThan(base.profit - 300 + (base.mat - 95.5) + 0.01);
  });
  it("materials expenses win over the typed real cost", () => {
    expect(jobEconomics({ ...e, actualMaterialCost: 500 }, s, { mat: 95.5 }).mat).toBe(95.5);
    expect(jobEconomics({ ...e, actualMaterialCost: 500 }, s, { mat: 0 }).mat).toBe(500);
  });
});
