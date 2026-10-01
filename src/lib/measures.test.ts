import { describe, expect, it } from "vitest";
import { DEFAULT_MEASURES, measureIds, measureLines, measuresFor, measuresTotal, setMeasureQty, setMeasureRate } from "./measures";
import { starterCatalog, TRADE_LIST } from "./trades";
import { JOB_TYPES } from "./estimate";
import type { CatalogItem, Item } from "./types";

const walls: CatalogItem = { id: "walls", en: "Interior painting — walls", es: "Pintura interior — paredes", unit: "sq ft", unitEs: "pie²", rate: 1.85 };

describe("which measurements a job type has", () => {
  it("uses the defaults until the company chooses", () => {
    expect(measureIds({}, "interior")).toEqual(DEFAULT_MEASURES.interior);
    expect(measureIds({ measures: { interior: ["walls"] } }, "interior")).toEqual(["walls"]);
    expect(measureIds({ measures: { interior: [] } }, "interior")).toEqual([]);
    expect(measureIds({}, "unknown-type")).toEqual([]);
  });
  it("resolves to the company's services with its prices, skipping missing ones", () => {
    const s = { trade: "painting", serviceRates: { walls: 2 }, measures: { interior: ["walls", "gone", "ceiling"] } };
    const m = measuresFor(s, "interior");
    expect(m.map((c) => c.id)).toEqual(["walls", "ceiling"]);
    expect(m[0].rate).toBe(2);
  });
  it("every default points at a starter service of its trade", () => {
    for (const t of TRADE_LIST) {
      const ids = new Set(starterCatalog(t.id).map((c) => c.id));
      const types = t.id === "painting" ? JOB_TYPES.map((j) => j.id) : t.jobTypes.map((j) => j.id);
      for (const jt of types) for (const id of DEFAULT_MEASURES[jt] || []) expect(ids.has(id), `${t.id}/${jt}/${id}`).toBe(true);
    }
  });
});

describe("measurement lines on an estimate", () => {
  const other: Item = { id: "x", desc: "Other", descEs: "Otro", qty: 1, unit: "job", rate: 50 };
  it("adds a line the first time, then changes it", () => {
    let items = setMeasureQty([other], walls, 400, "it-1");
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ id: "it-1", svc: "walls", qty: 400, rate: 1.85, unit: "sq ft" });
    items = setMeasureQty(items, walls, 450, "it-2");
    expect(items).toHaveLength(2);
    expect(items[1].qty).toBe(450);
  });
  it("0 or empty takes the line off (a $0 line never prints)", () => {
    const items = setMeasureQty([other], walls, 400, "it-1");
    expect(setMeasureQty(items, walls, 0, "z")).toEqual([other]);
    expect(setMeasureQty([other], walls, 0, "z")).toEqual([other]);
  });
  it("price changes only on this estimate's line", () => {
    const items = setMeasureRate(setMeasureQty([], walls, 100, "a"), "walls", 2.25);
    expect(items[0].rate).toBe(2.25);
    expect(setMeasureRate([other], "walls", 3)).toEqual([other]);
    expect(setMeasureRate(items, "walls", -1)[0].rate).toBe(0);
  });
  it("finds the line of each measurement and adds them up", () => {
    const items = [other, { ...other, id: "w", svc: "walls", qty: 100, rate: 2 }, { ...other, id: "w2", svc: "walls", qty: 5, rate: 2 }];
    const m = measureLines(items, ["walls", "ceiling"]);
    expect(m.get("walls")?.id).toBe("w");
    expect(m.has("ceiling")).toBe(false);
    expect(measuresTotal(m)).toBe(200);
  });
});
