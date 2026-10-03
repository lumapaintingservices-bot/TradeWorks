import { describe, expect, it } from "vitest";
import { blankEstimate, calcMaterials, jobEconomics } from "./estimate";
import { jobLedger } from "./jobLedger";
import { defaultSettings } from "./settings";
import type { Estimate, Expense, HourEntry, Worker } from "./types";

const s = defaultSettings();
const e: Estimate = { ...blankEstimate(s, "EST-1"), id: "e1", doors: 12, drawers: 10, doorRate: 150, drawerRate: 50 };
const ex = (id: string, category: string, amount: number, estId = "e1", date = "2026-10-01") => ({ id, estId, category, amount, date, vendor: id }) as Expense;
const workers = [{ id: "w1", name: "Carlos", rate: 20, overtime: true }, { id: "w2", name: "Ana", rate: 25 }] as Worker[];
const hr = (id: string, workerId: string, date: string, hours: number, estId = "e1") => ({ id, workerId, date, hours, estId }) as unknown as HourEntry;

describe("jobLedger", () => {
  const exps = [ex("a", "materials", 100), ex("b", "materials", 53, "e1", "2026-10-03"), ex("c", "labor", 300), ex("d", "tools", 40), ex("e", "fuel", 12.5),
    ex("f", "materials", 999, "e2"), { ...ex("g", "materials", 70), deleted: true } as Expense];
  const hours = [hr("h1", "w1", "2026-09-28", 8), hr("h2", "w2", "2026-09-29", 4),
    // Carlos: 36 h on another job the same week -> 4 h overtime this week, 2/44 of it falls on h1's share
    hr("h3", "w1", "2026-09-29", 36, "e2")];
  const L = jobLedger(e, s, exps, hours, workers);
  it("lists only this job's live expenses, newest first", () => {
    expect(L.expenses.map((x) => x.id)).toEqual(["b", "a", "c", "d", "e"]);
  });
  it("budget vs actual by kind", () => {
    const cat = (id: string) => L.cats.find((c) => c.id === id)!;
    expect(cat("materials")).toEqual({ id: "materials", est: calcMaterials(e, s).totalCost, real: 153 });
    expect(cat("labor").real).toBe(300); expect(cat("tools").real).toBe(40); expect(cat("fuel").real).toBe(12.5);
    expect(L.cats.map((c) => c.id)).toEqual(["materials", "team", "labor", "tools", "fuel"]);
  });
  it("team hours with pay and the job's share of the week's overtime", () => {
    expect(L.team.map((r) => r.id)).toEqual(["h2", "h1"]);
    const h1 = L.team.find((r) => r.id === "h1")!;
    expect(h1.worker).toBe("Carlos"); expect(h1.pay).toBeGreaterThan(160); expect(h1.ot).toBeGreaterThan(0);
    expect(L.team.find((r) => r.id === "h2")!.pay).toBe(100);
    expect(L.teamHours).toBe(12);
  });
  it("profit so far = price − everything recorded", () => {
    expect(L.price).toBe(jobEconomics(e, s).revenue);
    expect(L.spent).toBe(Math.round(L.cats.reduce((a, c) => a + c.real, 0) * 100) / 100);
    expect(L.profit).toBe(Math.round((L.price - L.spent) * 100) / 100);
  });
  it("solo jobs have no team-labor budget", () => {
    expect(L.cats.find((c) => c.id === "team")!.est).toBeNull();
    expect(jobLedger({ ...e, laborMode: "crew" }, s, [], [], []).cats.find((c) => c.id === "team")!.est).toBeGreaterThan(0);
  });
  it("an unsaved job (no id) matches nothing", () => {
    const z = jobLedger({ ...e, id: "" }, s, [ex("x", "materials", 5, "")], [hr("hz", "w1", "2026-10-01", 3, "")], workers);
    expect(z.expenses).toEqual([]); expect(z.team).toEqual([]); expect(z.spent).toBe(0);
  });
});
