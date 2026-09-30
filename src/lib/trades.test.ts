import { describe, expect, it } from "vitest";
import { applyTypePreset, blankEstimate, calcEstimate, calcMaterials, jobEconomics, jobHours, jobTypeLabel, jobTypesOf, servicesLine, suggestTypeFor, typePreset } from "./estimate";
import { leadSummary } from "./leads";
import { defaultSettings } from "./settings";
import { SERVICES } from "./services.data";
import {
  catalogFromOwn, catalogHrs, catalogIsPristine, catalogLine, catalogOf, catalogWithPrices, cleanCatalog, isPaintingTrade, jobTypePreset, leadFormFor,
  mergeStarterItems, normalizeTrade, onboardingSettingsPatch, questionsFor, starterCatalog, TRADE_LIST, tradeById, usesCabinetTools,
} from "./trades";
import type { Settings } from "./types";

const settingsFor = (trade: string, extra: Partial<Settings> = {}): Settings => ({ ...defaultSettings(), trade, ...extra });

describe("normalizeTrade", () => {
  it("keeps painting behavior for empty, cabinets and painting; unknown text is custom", () => {
    for (const v of ["", undefined, null, "painting", "Painting", "cabinets", " cabinets "]) expect(normalizeTrade(v as string)).toBe("painting");
    for (const v of ["cleaning", "electrical", "plumbing", "handyman", "landscaping", "custom"]) expect(normalizeTrade(v)).toBe(v);
    expect(normalizeTrade("roofing")).toBe("custom");
    expect(normalizeTrade("HANDYMAN")).toBe("handyman");
  });
  it("only painting uses the cabinet tools", () => {
    expect(TRADE_LIST.filter((t) => usesCabinetTools(t.id)).map((t) => t.id)).toEqual(["painting"]);
    expect(isPaintingTrade("cabinets")).toBe(true);
    expect(isPaintingTrade("cleaning")).toBe(false);
  });
});

describe("trade definitions", () => {
  const others = TRADE_LIST.filter((t) => t.id !== "painting");
  it("has the seven trades, each with EN and ES labels", () => {
    expect(TRADE_LIST.map((t) => t.id)).toEqual(["painting", "cleaning", "electrical", "plumbing", "handyman", "landscaping", "custom"]);
    for (const t of TRADE_LIST) { expect(t.en).toBeTruthy(); expect(t.es).toBeTruthy(); expect(t.depositPct).toBeGreaterThanOrEqual(0); expect(t.depositPct).toBeLessThanOrEqual(100); expect(t.kpis.length).toBeGreaterThan(0); }
  });
  it("every catalog item is bilingual, has a unique id and a sane rate and hours", () => {
    const seen = new Set<string>();
    for (const t of others) for (const c of t.catalog) {
      expect(seen.has(c.id), c.id).toBe(false); seen.add(c.id);
      expect(c.en && c.es && c.unit && c.unitEs, c.id).toBeTruthy();
      expect(c.rate).toBeGreaterThanOrEqual(0);
      if (c.hrs !== undefined) expect(c.hrs).toBeGreaterThanOrEqual(0);
    }
  });
  it("price questions point at real catalog items (and painting at door / drawer)", () => {
    for (const t of others) for (const q of t.prices) { expect("item" in q.target && t.catalog.some((c) => c.id === (q.target as { item: string }).item), `${t.id}.${q.id}`).toBe(true); expect(q.en && q.es).toBeTruthy(); }
    expect(tradeById("painting").prices.map((q) => q.id)).toEqual(["door", "drawer"]);
    expect(tradeById("custom").prices).toEqual([]);
    expect(tradeById("custom").catalog).toEqual([]);
  });
  it("asks the prices the owner described", () => {
    const ids = (t: string) => tradeById(t).prices.map((q) => q.id);
    expect(ids("cleaning")).toEqual(["hour", "room", "sqft"]);
    expect(ids("electrical")).toEqual(["call", "hour"]);
    expect(ids("plumbing")).toEqual(["call", "hour"]);
    expect(ids("handyman")).toEqual(["hour", "min"]);
    expect(ids("landscaping")).toEqual(["visit", "sqft", "hour"]);
  });
  it("job type ids are unique across trades and have EN + ES texts", () => {
    const seen = new Set<string>();
    for (const t of others) for (const j of t.jobTypes) {
      expect(seen.has(j.id), j.id).toBe(false); seen.add(j.id);
      expect(j.en && j.es && j.hint[0] && j.hint[1]).toBeTruthy();
      const p = jobTypePreset(j.id)!;
      expect(p.scopeEn && p.scopeEs && p.termsEn && p.termsEs, j.id).toBeTruthy();
      expect(p.scopeEn.split("\n").length).toBe(p.scopeEs.split("\n").length);
      expect(p.termsEn.split("\n").length).toBe(p.termsEs.split("\n").length);
      expect(p.days).toBeGreaterThanOrEqual(1);
    }
  });
  it("scope and terms are trade-appropriate, not painting", () => {
    const text = (t: string) => JSON.stringify([tradeById(t).scope, tradeById(t).terms]).toLowerCase();
    for (const t of others) { expect(text(t.id)).not.toMatch(/paint|spray/); }
    expect(text("cleaning")).toContain("supplies");
    expect(text("electrical")).toMatch(/licensed/); expect(text("electrical")).toMatch(/permit/); expect(text("electrical")).toMatch(/warranty/);
    expect(text("plumbing")).toMatch(/licensed/);
    expect(text("handyman")).toMatch(/2-hour minimum/);
    expect(text("landscaping")).toMatch(/recurring/); expect(text("landscaping")).toMatch(/one-time/);
  });
  it("request forms: services map to job types, questions are bilingual, painting has no template form", () => {
    expect(leadFormFor("painting")).toBeNull();
    for (const t of others) {
      const l = leadFormFor(t.id)!;
      expect(l.services.length).toBeGreaterThanOrEqual(3);
      expect(l.services.length).toBeLessThanOrEqual(5); // the request stores at most 5 services
      for (const s of l.services) { expect(t.jobTypes.some((j) => j.id === s.job), `${t.id}.${s.id}`).toBe(true); expect(s.en && s.es && s.subEn && s.subEs).toBeTruthy(); }
      for (const q of l.questions) {
        expect(q.en && q.es).toBeTruthy();
        if (q.kind === "one" || q.kind === "multi") { expect(q.options!.length).toBeGreaterThan(1); for (const o of q.options!) expect(o.en && o.es).toBeTruthy(); }
        for (const o of q.only || []) expect(l.services.some((s) => s.id === o), `${t.id}.${q.id}.only`).toBe(true);
      }
    }
    expect(questionsFor("electrical", ["elec-ev"]).map((q) => q.id)).toEqual(["property", "details"]);
    expect(questionsFor("electrical", ["elec-repair"]).map((q) => q.id)).toEqual(["property", "safety", "details"]);
    expect(questionsFor("painting", ["x"])).toEqual([]);
  });
});

describe("catalog", () => {
  it("painting's catalog is the built-in services with the contractor's overrides, and does not change money", () => {
    const base = starterCatalog("painting");
    expect(base.map((c) => c.id)).toEqual(SERVICES.map((x) => x.id));
    expect(base.every((c, i) => c.rate === SERVICES[i].rate)).toBe(true);
    const s = settingsFor("painting", { serviceRates: { walls: 2.5, base: -1 } });
    const cat = catalogOf(s);
    expect(cat.find((c) => c.id === "walls")!.rate).toBe(2.5);
    expect(cat.find((c) => c.id === "base")!.rate).toBe(SERVICES.find((x) => x.id === "base")!.rate); // a negative override is ignored
  });
  it("an untouched non-painting company gets the trade's starter list; a saved catalog wins", () => {
    expect(catalogOf(settingsFor("cleaning")).map((c) => c.id)).toEqual(tradeById("cleaning").catalog.map((c) => c.id));
    expect(catalogOf(settingsFor("custom"))).toEqual([]);
    const own = [{ id: "x", en: "Mine", es: "Mío", unit: "ea", unitEs: "c/u", rate: 10 }];
    expect(catalogOf(settingsFor("cleaning", { catalog: own }))).toBe(own);
  });
  it("starterCatalog returns copies (editing one does not change the template)", () => {
    const a = starterCatalog("cleaning"); a[0].rate = 999;
    expect(starterCatalog("cleaning")[0].rate).not.toBe(999);
  });
  it("catalogWithPrices applies typed prices, keeps starter rates for empty / bad answers", () => {
    const c = catalogWithPrices("cleaning", { hour: "60", room: "", sqft: "abc" });
    const rate = (id: string) => c.find((x) => x.id === id)!.rate;
    expect(rate("clean-hour")).toBe(60);
    expect(rate("clean-room")).toBe(35);
    expect(rate("clean-sqft")).toBe(0.15);
    expect(catalogWithPrices("cleaning", { hour: "-5" }).find((x) => x.id === "clean-hour")!.rate).toBe(50);
    expect(catalogWithPrices("handyman", { hour: "80", min: "160" }).filter((x) => ["hand-hour", "hand-min"].includes(x.id)).map((x) => x.rate)).toEqual([80, 160]);
  });
  it("catalogFromOwn builds rows from name / unit / price and drops unnamed ones", () => {
    const c = catalogFromOwn([{ name: "Roof wash", unit: "sq ft", price: "0.4" }, { name: "  ", unit: "job", price: "10" }, { name: "Roof wash", unit: "", price: "" }]);
    expect(c.map((x) => [x.en, x.es, x.unit, x.rate])).toEqual([["Roof wash", "Roof wash", "sq ft", 0.4], ["Roof wash", "Roof wash", "job", 0]]);
    expect(new Set(c.map((x) => x.id)).size).toBe(2);
  });
  it("cleanCatalog trims, fills the other language, dedupes ids, drops unnamed rows and bad numbers", () => {
    const out = cleanCatalog([
      { id: "a", en: "  Deep  clean ", es: "", unit: "job", unitEs: "", rate: 12.34567, hrs: 2 },
      { id: "a", en: "", es: "Solo español", unit: "", unitEs: "hr", rate: -3, hrs: -1 },
      { id: "b", en: "", es: "", unit: "ea", unitEs: "c/u", rate: 5 },
    ]);
    expect(out.length).toBe(2);
    expect(out[0]).toMatchObject({ id: "a", en: "Deep clean", es: "Deep clean", unit: "job", unitEs: "job", rate: 12.3457, hrs: 2 });
    expect(out[1].id).not.toBe("a");
    expect(out[1]).toMatchObject({ en: "Solo español", es: "Solo español", unit: "hr", rate: 0 });
    expect("hrs" in out[1]).toBe(false);
  });
  it("pristine detection and 'add starter items' never overwrite the company's own edits", () => {
    expect(catalogIsPristine(undefined, "cleaning")).toBe(true);
    expect(catalogIsPristine(starterCatalog("cleaning"), "cleaning")).toBe(true);
    const edited = starterCatalog("cleaning"); edited[0].rate = 61;
    expect(catalogIsPristine(edited, "cleaning")).toBe(false);
    expect(catalogIsPristine(starterCatalog("painting"), "painting")).toBe(true);
    const mine = [{ id: "clean-hour", en: "My hour", es: "Mi hora", unit: "hr", unitEs: "hora", rate: 77 }];
    const r = mergeStarterItems(mine, "cleaning");
    expect(r.catalog[0]).toEqual(mine[0]);                                         // the edited row is untouched
    expect(r.catalog.length).toBe(tradeById("cleaning").catalog.length);           // the missing starter items were appended
    expect(r.added).toBe(tradeById("cleaning").catalog.length - 1);
    expect(mergeStarterItems(r.catalog, "cleaning").added).toBe(0);
    expect(mergeStarterItems(mine, "custom").added).toBe(0);
  });
  it("catalogLine: painting services start at qty 0 as before, other services at 1; the line keeps the service id", () => {
    const walls = starterCatalog("painting").find((c) => c.id === "walls")!;
    expect(catalogLine(walls, "i1")).toEqual({ id: "i1", desc: walls.en, descEs: walls.es, qty: 0, unit: walls.unit, rate: walls.rate, svc: "walls" });
    const call = starterCatalog("electrical").find((c) => c.id === "elec-call")!;
    expect(catalogLine(call, "i2")).toMatchObject({ qty: 1, rate: 95, unit: "ea", svc: "elec-call" });
  });
  it("catalogHrs reads the hours per unit", () => {
    expect(catalogHrs(settingsFor("plumbing"), "plum-hour")).toBe(1);
    expect(catalogHrs(settingsFor("plumbing"), "nope")).toBe(0);
    expect(catalogHrs(settingsFor("painting"), "walls")).toBe(0); // painting hours stay in production.svcHrs
  });
});

describe("onboarding settings patch", () => {
  const s = defaultSettings();
  it("painting: door / drawer / deposit go to pricing; skipping writes nothing", () => {
    const p = onboardingSettingsPatch(s, { trade: "painting", skip: false, answers: { door: "95", drawer: "" }, own: [], depositPct: "40" });
    expect(p.pricing).toMatchObject({ doorRate: 95, drawerRate: s.pricing.drawerRate, depositPct: 40 });
    expect(p.catalog).toBeUndefined();
    expect(onboardingSettingsPatch(s, { trade: "cabinets", skip: true, answers: { door: "95" }, own: [], depositPct: "40" })).toEqual({});
  });
  it("cleaning: prices land on the starter catalog; skip keeps the starter list", () => {
    const p = onboardingSettingsPatch(s, { trade: "cleaning", skip: false, answers: { hour: "55", room: "40" }, own: [], depositPct: "20" });
    expect(p.trade).toBe("cleaning");
    expect(p.catalog!.find((c) => c.id === "clean-hour")!.rate).toBe(55);
    expect(p.catalog!.find((c) => c.id === "clean-room")!.rate).toBe(40);
    expect(p.pricing!.depositPct).toBe(20);
    expect(p.pricing!.doorRate).toBe(s.pricing.doorRate);
    const k = onboardingSettingsPatch(s, { trade: "cleaning", skip: true, answers: { hour: "55" }, own: [], depositPct: "20" });
    expect(k.catalog!.find((c) => c.id === "clean-hour")!.rate).toBe(50);
    expect(k.pricing).toBeUndefined();
  });
  it("custom: the person's own services; an empty deposit falls back to the trade default and 150% is capped", () => {
    const p = onboardingSettingsPatch(s, { trade: "gardening", skip: false, answers: {}, own: [{ name: "Pool clean", unit: "visit", price: "80" }], depositPct: "" });
    expect(p.trade).toBe("custom");
    expect(p.catalog).toEqual([{ id: "own-pool-clean", en: "Pool clean", es: "Pool clean", unit: "visit", unitEs: "visit", rate: 80 }]);
    expect(p.pricing!.depositPct).toBe(tradeById("custom").depositPct);
    expect(onboardingSettingsPatch(s, { trade: "custom", skip: false, answers: {}, own: [], depositPct: "150" }).pricing!.depositPct).toBe(100);
    expect(onboardingSettingsPatch(s, { trade: "custom", skip: true, answers: {}, own: [{ name: "x", unit: "", price: 1 }], depositPct: "50" })).toEqual({ trade: "custom" });
  });
});

describe("catalog -> estimate totals", () => {
  it("a cleaning estimate built from the catalog adds up (lines, discount, tax, deposit)", () => {
    const s = settingsFor("cleaning", { catalog: catalogWithPrices("cleaning", { hour: "60" }) });
    const e = blankEstimate(s, "EST-1");
    expect(e.jobType).toBe("clean-std");
    const cat = catalogOf(s);
    const hour = catalogLine(cat.find((c) => c.id === "clean-hour")!, "a"), deep = catalogLine(cat.find((c) => c.id === "clean-deep")!, "b");
    e.items = [{ ...hour, qty: 3.5 }, { ...deep }];
    const t = calcEstimate(e, s);
    expect(t.workSubtotal).toBe(3.5 * 60 + 120);
    e.taxEnabled = true; e.taxRate = 10; e.depositPct = 20; e.discountMode = "manual"; e.manualType = "percent"; e.manualValue = 10;
    const u = calcEstimate(e, s);
    expect(u.subtotal).toBe(330);
    expect(u.discAmt).toBe(33);
    expect(u.taxAmt).toBe(29.7);
    expect(u.total).toBe(326.7);
    expect(u.deposit).toBe(65.34);
    expect(u.balance).toBe(261.36);
  });
  it("hidden-flag lines still count (they are only hidden from the client) and hours come from the catalog", () => {
    const s = settingsFor("electrical");
    const cat = catalogOf(s);
    const e = blankEstimate(s, "EST-2");
    e.items = [{ ...catalogLine(cat.find((c) => c.id === "elec-call")!, "a") }, { ...catalogLine(cat.find((c) => c.id === "elec-outlet")!, "b"), qty: 4, hidden: true }];
    expect(calcEstimate(e, s).workSubtotal).toBe(95 + 4 * 125);
    const h = jobHours(e, s);
    expect(h.total).toBe(1 * 1 + 4 * 0.75);
  });
  it("Costs & profit: no paint calculator for other trades; earn per hour uses the catalog hours; suggested price works", () => {
    const s = settingsFor("plumbing");
    const cat = catalogOf(s);
    const e = blankEstimate(s, "EST-3");
    e.items = [{ ...catalogLine(cat.find((c) => c.id === "plum-toilet")!, "a"), qty: 2 }]; // 2 x $325, 2 h each
    e.actualMaterialCost = 100;
    const m = calcMaterials(e, s);
    expect(m.totalCost).toBe(0);
    expect(m.supplyLines).toEqual([]);
    const x = jobEconomics(e, s);
    expect(x.h.total).toBe(4);
    expect(x.mat).toBe(100);
    expect(x.revenue).toBe(650);
    expect(x.profit).toBe(550);
    expect(x.perHour).toBe(137.5);
    expect(x.suggested).toBe(Math.round(100 + 4 * s.production.targetHourly));
  });
  it("a sq ft line of a non-painting trade never turns into paint gallons", () => {
    const s = settingsFor("cleaning");
    const e = blankEstimate(s, "EST-4");
    e.items = [{ ...catalogLine(catalogOf(s).find((c) => c.id === "clean-sqft")!, "a"), qty: 2000 }];
    expect(calcEstimate(e, s).total).toBe(300);
    expect(calcMaterials(e, s).totalCost).toBe(0);
    // the same line in a painting company is still counted as wall area, exactly as before
    const p = { ...s, trade: "painting" };
    expect(calcMaterials(e, p).wallSqft).toBe(2000);
  });
  it("painting is untouched: same lines, same totals, cabinet defaults", () => {
    const s = settingsFor("painting");
    const e = blankEstimate(s, "EST-5");
    expect(e.jobType).toBe("cabinets");
    e.doors = 10; e.drawers = 2;
    const walls = catalogLine(catalogOf(s).find((c) => c.id === "walls")!, "w");
    expect(walls.qty).toBe(0);
    e.items = [{ ...walls, qty: 100 }];
    expect(calcEstimate(e, s).workSubtotal).toBe(10 * s.pricing.doorRate + 2 * s.pricing.drawerRate + 100 * 1.85);
    expect(calcMaterials(e, s).totalCost).toBeGreaterThan(0);
    expect(jobHours(e, s).total).toBeGreaterThan(0);
    // a trade left unset (older companies) behaves as painting
    const legacy = defaultSettings();
    expect(legacy.trade).toBeUndefined();
    expect(calcMaterials(e, legacy).totalCost).toBe(calcMaterials(e, s).totalCost);
  });
});

describe("job types follow the trade", () => {
  it("painting keeps its four job types; other trades get their own", () => {
    expect(jobTypesOf("painting").map((j) => j.id)).toEqual(["cabinets", "interior", "exterior", "other"]);
    expect(jobTypesOf("cabinets").map((j) => j.id)).toEqual(["cabinets", "interior", "exterior", "other"]);
    expect(jobTypesOf("cleaning").map((j) => j.id)).toEqual(["clean-std", "clean-deep", "clean-move", "clean-other"]);
    expect(jobTypesOf("custom").map((j) => j.id)).toEqual(["custom-job"]);
    expect(jobTypeLabel("clean-deep")).toBe("Deep cleaning");
    expect(jobTypeLabel("clean-deep", true)).toBe("Limpieza profunda");
    expect(jobTypeLabel("nonsense")).toBe("Kitchen cabinets"); // unchanged fallback
  });
  it("a new estimate takes the trade's standard scope, terms, spec and days; the company's edits win", () => {
    const s = settingsFor("cleaning");
    const e = applyTypePreset(blankEstimate(s, "EST-6"), s, "clean-deep");
    expect(e.jobType).toBe("clean-deep");
    expect(e.scopeEn).toContain("Baseboards");
    expect(e.scopeEs).toContain("Zócalos");
    expect(e.termsEn).toContain("24 hours");
    expect(e.spec).toContain("Deep cleaning");
    expect(e.scopeEn).not.toMatch(/cabinet|paint/i);
    expect(servicesLine(e, s, "en")).toMatch(/Deep cleaning/);
    const edited = { ...s, typePresets: { "clean-deep": { ...typePreset(s, "clean-deep"), days: 3, termsEn: "My terms", termsEs: "Mis términos" } } };
    const f = applyTypePreset(blankEstimate(edited, "EST-7"), edited, "clean-deep");
    expect(f.days).toBe(3);
    expect(f.termsEn).toBe("My terms");
  });
  it("painting presets are unchanged", () => {
    const s = settingsFor("painting");
    expect(typePreset(s, "interior").scopeEn).toContain("OUR INTERIOR PAINTING PROCESS");
    expect(typePreset(s, "cabinets").scopeEn).toBe(s.scope.en.join("\n"));
    // an estimate of another trade opened in a painting company falls back to that trade's texts instead of "other"
    expect(typePreset(s, "clean-std").scopeEn).toContain("What's included");
  });
  it("a request from the trade's form suggests the matching job type", () => {
    const c = { id: "c", name: "A", phone: "", email: "", address: "", source: "", lang: "en" as const, note: "", web: { details: { types: ["elec-ev"] } } };
    expect(suggestTypeFor(c, "electrical")).toBe("elec-panel");
    expect(suggestTypeFor({ ...c, web: { details: { types: ["cabinets"] } } }, "painting")).toBe("cabinets");
    expect(suggestTypeFor({ ...c, web: { details: { types: ["cabinets"] } } }, "electrical")).toBe("");
  });
});

describe("lead summary for trade forms", () => {
  it("shows the services and the answers in both languages", () => {
    const d = { v: 2, trade: "electrical", types: ["elec-repair"], answers: { property: "house", safety: "yes", details: "Outlets dead in the kitchen" }, when: "asap", contact: "call" };
    const en = leadSummary(d, "en"), es = leadSummary(d, "es");
    expect(en).toContain("Repair / troubleshooting");
    expect(en).toContain("House");
    expect(en).toContain("Yes — please call me first");
    expect(en).toContain("Outlets dead in the kitchen");
    expect(en).toContain("when: ASAP");
    expect(es).toContain("Reparación / diagnóstico");
    expect(es).toContain("Casa");
    expect(leadSummary({ v: 2, trade: "cleaning", types: ["clean-std"], answers: { baths: 2, extras: ["oven", "windows"] } }, "en")).toEqual(expect.arrayContaining(["How many bathrooms?: 2", "Inside oven, Interior windows"]));
  });
});
