import { describe, expect, it } from "vitest";
import { blankEstimate, calcMaterials, realFactorOf } from "./estimate";
import { materialsLearning } from "./materialsLearn";
import { defaultSettings } from "./settings";
import type { Estimate, Expense } from "./types";

const s = defaultSettings();
const job = (id: string, doors: number, extra: Partial<Estimate> = {}): Estimate => ({ ...blankEstimate(s, "EST-" + id), id, number: "EST-" + id, doors, drawers: 10, ...extra });
const ex = (estId: string, amount: number, category = "materials") => ({ id: "x" + estId + amount, estId, category, amount, date: "2026-10-01" }) as Expense;

describe("charge only what the job uses", () => {
  const e = job("1", 12);
  it("off: whole quarts, like the prototype", () => {
    const m = calcMaterials(e, s);
    expect(m.paintCost).toBe(m.buyPaint * s.materials.paintCostPerGal);
  });
  it("on: exact gallons for the cost, the shopping list still rounds up", () => {
    const on = { ...s, materials: { ...s.materials, chargeUsed: true } };
    const a = calcMaterials(e, s), b = calcMaterials(e, on);
    expect(b.buyPaint).toBe(a.buyPaint);
    expect(b.paintCost).toBeCloseTo(b.paintGal * s.materials.paintCostPerGal, 0);
    expect(b.totalCost).toBeLessThan(a.totalCost);
  });
});

describe("learned factor", () => {
  it("multiplies the total; nonsense values are ignored", () => {
    const e = job("1", 12);
    const base = calcMaterials(e, s).totalCost;
    const half = calcMaterials(e, { ...s, materials: { ...s.materials, realFactor: 0.5 } });
    expect(half.baseCost).toBe(base); expect(half.factor).toBe(0.5); expect(half.totalCost).toBe(Math.round(base * 50) / 100);
    expect(realFactorOf({ realFactor: 0 })).toBe(1); expect(realFactorOf({ realFactor: 50 })).toBe(1); expect(realFactorOf({})).toBe(1);
  });
  it("learns total real / total estimated over jobs with a known real cost", () => {
    const a = job("1", 12), b = job("2", 20, { actualMaterialCost: 100 }), c = job("3", 8), skip = job("4", 30, { matBuyer: "client", actualMaterialCost: 50 });
    const ests = [a, b, c, skip];
    const exps = [ex("1", 153), ex("1", 40, "labor")];
    const L = materialsLearning(ests, exps, { ...s, materials: { ...s.materials, realFactor: 0.4 } }); // an older factor is not used for learning
    expect(L.n).toBe(2); // c has no real cost, skip: the client bought them
    const estA = calcMaterials(a, s).baseCost, estB = calcMaterials(b, s).baseCost;
    expect(L.real).toBe(253); expect(L.est).toBe(Math.round((estA + estB) * 100) / 100);
    expect(L.factor).toBe(Math.round((253 / (estA + estB)) * 100) / 100);
  });
  it("no jobs: factor 1", () => {
    expect(materialsLearning([job("1", 12)], [], s)).toMatchObject({ n: 0, factor: 1 });
  });
});
