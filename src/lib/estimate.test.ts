import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { calcEstimate, calcMaterials, jobEconomics, jobHours, blankEstimate } from "./estimate";
import { money, num } from "./money";
import { nl2list, scopeGroups } from "./scope";
import { defaultSettings } from "./settings";
import { SERVICES } from "./services.data";
import type { Estimate } from "./types";

/* ---- parity with the prototype: run its own functions on the same inputs ---- */
const proto = readFileSync(new URL("../../prototype/index.html", import.meta.url), "utf8");
function fn(name: string): string {
  const i = proto.indexOf(`function ${name}(`);
  let j = proto.indexOf("{", i), d = 0;
  for (;; j++) { if (proto[j] === "{") d++; if (proto[j] === "}" && !--d) break; }
  return proto.slice(i, j + 1);
}
const names = ["num", "r2", "money", "findDiscount", "payPlanOn", "calcEstimate", "frameUnits", "boxUnits", "itemSqft", "otherSqft", "jobSqft", "calcMaterials", "svcById",
  "prodP", "jobHours", "laborModeFor", "crewCost", "coSignedTotal", "jobEconomics", "actualMaterials", "jobExpenses"];
function protoCtx(s: ReturnType<typeof defaultSettings>) {
  const ctx: Record<string, any> = { DB: { ...s, services: SERVICES, expenses: [], estimates: [] }, UI_LANG: "en", TT: (a: string) => a, v4Defaults: () => ({ production: s.production }) };
  runInNewContext(names.map(fn).join("\n") + ";this.calcEstimate=calcEstimate;this.calcMaterials=calcMaterials;this.jobEconomics=jobEconomics;this.jobHours=jobHours;this.money=money;", ctx);
  return ctx;
}

function sample(seed: number, s = defaultSettings()): Estimate {
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const e = blankEstimate(s, "EST-1");
  e.doors = Math.floor(r() * 40); e.drawers = Math.floor(r() * 20); e.frames = Math.floor(r() * 10); e.boxes = Math.floor(r() * 10);
  e.frameMode = (["included", "separate", "none"] as const)[Math.floor(r() * 3)]; e.boxMode = (["included", "separate", "none"] as const)[Math.floor(r() * 3)];
  e.items = SERVICES.slice(0, Math.floor(r() * 6)).map((sv, i) => ({ id: "i" + i, desc: sv.en, descEs: sv.es, qty: Math.round(r() * 900) / 3, unit: sv.unit, rate: sv.rate, svc: sv.id }));
  e.upgrades = [{ id: "u1", desc: "Extra", descEs: "", qty: 1, rate: 123.45, included: r() > 0.5 }, { id: "u2", desc: "Opt", descEs: "", qty: 2, rate: 77.7 }];
  e.discountMode = (["", "code", "manual"] as const)[Math.floor(r() * 3)]; e.discountCode = "CASH3";
  e.manualType = r() > 0.5 ? "fixed" : "percent"; e.manualValue = Math.round(r() * 200) / 7;
  e.taxEnabled = r() > 0.5; e.taxRate = 7; e.depositPct = 30 + Math.floor(r() * 30);
  e.matBuyer = (["me", "paint", "client"] as const)[Math.floor(r() * 3)]; e.extraHrs = Math.round(r() * 8);
  e.showMaterials = r() > 0.5; e.materialsMode = r() > 0.5 ? "added" : "included"; e.materialsList = [{ id: "m", desc: "x", descEs: "", qty: 3, unit: "gal", rate: 41.3 }];
  return e;
}

describe("parity with prototype", () => {
  const s = defaultSettings();
  const ctx = protoCtx(s);
  for (let seed = 1; seed <= 60; seed++) {
    it(`estimate #${seed}`, () => {
      const e = sample(seed * 7919);
      const a = calcEstimate(e, s), b = ctx.calcEstimate(JSON.parse(JSON.stringify(e)));
      for (const k of ["workSubtotal", "subtotal", "discAmt", "afterDisc", "taxAmt", "total", "deposit", "balance", "materialsTotal", "optionalTotal"] as const) expect(a[k], k).toBe(b[k]);
      const m = calcMaterials(e, s), pm = ctx.calcMaterials(JSON.parse(JSON.stringify(e)));
      for (const k of ["sqft", "buyPrimer", "buyPaint", "primerCost", "paintCost", "wallSqft", "buyWall", "wallCost", "sundries", "totalCost"] as const) expect(m[k], k).toBe(pm[k]);
      for (const mode of ["solo", "crew"] as const) for (const payBy of ["hour", "piece"] as const) {
        const s2 = { ...s, production: { ...s.production, laborMode: mode, payBy } };
        const c2 = protoCtx(s2);
        const x = jobEconomics(e, s2), px = c2.jobEconomics(JSON.parse(JSON.stringify(e)));
        expect(x.h.total).toBe(px.h.total);
        for (const k of ["labor", "mat", "revenue", "cost", "profit", "suggested"] as const) expect(x[k], k).toBe(px[k]);
        expect(x.margin).toBeCloseTo(px.margin, 9);
      }
    });
  }
});

describe("known values", () => {
  const s = defaultSettings();
  it("prices doors and drawers, cash discount, tax, deposit", () => {
    const e = { ...blankEstimate(s, "EST-1"), doors: 20, drawers: 10, discountMode: "code" as const, discountCode: "cash3", taxEnabled: true, taxRate: 7, depositPct: 50 };
    const t = calcEstimate(e, s);
    expect(t.subtotal).toBe(2150);           // 20×80 + 10×55
    expect(t.discAmt).toBe(64.5);            // 3%
    expect(t.taxAmt).toBe(145.99);           // 7% of 2085.50
    expect(t.total).toBe(2231.49);
    expect(t.deposit).toBe(1115.74);
    expect(t.balance).toBe(1115.75);
  });
  it("discount never exceeds subtotal", () => {
    const e = { ...blankEstimate(s, "x"), doors: 1, discountMode: "manual" as const, manualType: "fixed" as const, manualValue: 999 };
    expect(calcEstimate(e, s).total).toBe(0);
  });
  it("payment plan sets the deposit from step one", () => {
    const e = { ...blankEstimate(s, "x"), doors: 10, payPlanOn: true, payPlan: [{ label: "a", labelEs: "a", pct: 40 }, { label: "b", labelEs: "b", pct: 60 }] };
    expect(calcEstimate(e, s).deposit).toBe(320);
  });
  it("client buys paint: costs zero, gallons stay", () => {
    const e = { ...blankEstimate(s, "x"), doors: 20, drawers: 10, matBuyer: "paint" as const };
    const m = calcMaterials(e, s);
    expect(m.paintCost).toBe(0); expect(m.buyPaint).toBeGreaterThan(0); expect(m.sundries).toBeGreaterThan(0);
  });
  it("hours include set-up", () => {
    const e = { ...blankEstimate(s, "x"), doors: 20, drawers: 10 };
    expect(jobHours(e, s).total).toBe(20 * 1.25 + 10 * 0.5 + 6);
  });
});

describe("helpers", () => {
  it("money formats like the prototype", () => { expect(money(1234.5)).toBe("$1,234.50"); expect(money(-3)).toBe("-$3.00"); expect(num("x")).toBe(0); });
  it("scope text → day groups", () => {
    const g = scopeGroups(nl2list("Day 1 — Prep\n• Mask everything. Sand all doors.\nDay 2 — Spray\nSpray two coats."));
    expect(g.map((x) => [x.day, x.title, x.items.length])).toEqual([["1", "Prep", 2], ["2", "Spray", 1]]);
  });
});
