import { describe, expect, it } from "vitest";
import { cleanDiscounts, cleanSources, counter, firstBadNumber, formSupplies, linesOf, moveItem, rateOverrides, stable, textOf } from "./settingsForm";
import { serviceRate } from "./estimate";
import { defaultSettings } from "./settings";
import { SERVICES } from "./services.data";
import type { Discount } from "./types";

describe("stable", () => {
  it("ignores key order and undefined", () => {
    expect(stable({ b: 1, a: { d: 2, c: [1, { z: 1, y: 2 }] }, u: undefined })).toBe(stable({ a: { c: [1, { y: 2, z: 1 }], d: 2 }, b: 1 }));
    expect(stable({ a: 1 })).not.toBe(stable({ a: 2 }));
  });
});
describe("firstBadNumber", () => {
  it("finds negatives and NaN deep inside", () => {
    expect(firstBadNumber({ a: 1, b: { c: [0, 2, -1] } })).toBe("b.c[2]");
    expect(firstBadNumber({ a: NaN })).toBe("a");
    expect(firstBadNumber(defaultSettings())).toBeNull();
  });
});
describe("lists", () => {
  it("lines and moving", () => {
    expect(linesOf(" a \n\n b\n")).toEqual(["a", "b"]);
    expect(textOf(["a", "b"])).toBe("a\nb");
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
  it("cleans lead sources", () => {
    expect(cleanSources([" Google ", "google", "", "Thumb  tack", "Other"])).toEqual(["Google", "Thumb tack", "Other"]);
  });
  it("counter is a whole number >= 1", () => {
    expect(counter(1001.4)).toBe(1001);
    expect(counter(0)).toBe(1);
    expect(counter(NaN)).toBe(1);
  });
  it("supplies for the form", () => {
    expect(formSupplies([{ name: "a", cost: 1, basis: "job" }, { name: "b", cost: 2, qty: 3, basis: "door" }])).toEqual([{ name: "a", cost: 1, basis: "item", qty: 1 }, { name: "b", cost: 2, qty: 3, basis: "door" }]);
  });
});
describe("cleanDiscounts", () => {
  const d = (o: Partial<Discount>): Discount => ({ code: "X", type: "percent", value: 3, label: "", labelEs: "", ...o });
  it("upper-cases and keeps valid codes", () => {
    const r = cleanDiscounts([d({ code: " cash3 ", label: " Cash " })]);
    expect(r).toEqual({ ok: true, list: [{ code: "CASH3", type: "percent", value: 3, label: "Cash", labelEs: "", active: true }] });
  });
  it("rejects blank, repeated, negative and >100%", () => {
    expect(cleanDiscounts([d({ code: " " })]).ok).toBe(false);
    expect(cleanDiscounts([d({ code: "a" }), d({ code: "A" })]).ok).toBe(false);
    expect(cleanDiscounts([d({ value: -1 })]).ok).toBe(false);
    expect(cleanDiscounts([d({ value: 101 })]).ok).toBe(false);
    expect(cleanDiscounts([d({ type: "fixed", value: 500 })]).ok).toBe(true);
  });
});
describe("service rate overrides", () => {
  const sv = SERVICES[0];
  it("stores only what differs and serviceRate prefers the override", () => {
    const o = rateOverrides(SERVICES, { [sv.id]: sv.rate, [SERVICES[1].id]: SERVICES[1].rate + 1 });
    expect(o).toEqual({ [SERVICES[1].id]: SERVICES[1].rate + 1 });
    const s = { ...defaultSettings(), serviceRates: o };
    expect(serviceRate(s, SERVICES[1])).toBe(SERVICES[1].rate + 1);
    expect(serviceRate(s, sv)).toBe(sv.rate);
    expect(serviceRate({ serviceRates: { [sv.id]: -5 } }, sv)).toBe(sv.rate);
    expect(serviceRate({}, sv)).toBe(sv.rate);
  });
});
