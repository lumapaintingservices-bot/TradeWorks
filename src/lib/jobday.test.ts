import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { blankEstimate, jobHours } from "./estimate";
import { addShowcase, checklistFor, crewDays, jdKey, newJobTask, progress, removeShowcase, setChecked, shoppingText, SHOWCASE_MAX, showcaseCaption, whatsappShareUrl, workOrderRows, workSchedule } from "./jobday";
import { defaultSettings } from "./settings";
import { SERVICES } from "./services.data";
import type { Estimate } from "./types";

/* ---- parity with the prototype: run its own functions on the same inputs ---- */
const proto = readFileSync(new URL("../../prototype/index.html", import.meta.url), "utf8");
function fn(name: string): string {
  const i = proto.indexOf(`function ${name}(`);
  if (i < 0) throw new Error("missing " + name);
  const j = proto.indexOf("\n}", i); // top-level functions of the prototype close at column 0
  return proto.slice(i, j + 2);
}
const vr = (name: string) => { const m = new RegExp(`^var ${name} = .*;$`, "m").exec(proto); if (!m) throw new Error("missing var " + name); return m[0]; };
const names = ["num", "r2", "svcById", "itemSqft", "otherSqft", "frameUnits", "boxUnits", "jobSqft", "calcMaterials", "nlSentences", "nl2list", "isScopeHead", "scopeGroups",
  "jobTypeOf", "byId", "nameOf", "jdKey", "checklistFor", "shoppingText"];
function protoCtx(s: ReturnType<typeof defaultSettings>, lang: "en" | "es") {
  const ctx: Record<string, any> = {
    DB: { ...s, services: SERVICES, clients: [], expenses: [], estimates: [] }, UI_LANG: lang,
    TT: (a: string, b: string) => (lang === "es" ? b : a), T: (a: string) => (lang === "es" && a === "Unnamed client" ? "Cliente sin nombre" : a), // the prototype translates through its dictionary
  };
  runInNewContext([vr("NL_ABBR"), fn("nlNextOk"), vr("SCOPE_DAY_RE"), ...names.map(fn)].join("\n") + ";this.checklistFor=checklistFor;this.shoppingText=shoppingText;this.jdKey=jdKey;", ctx);
  return ctx;
}

const SCOPES = [
  "",
  "Day 1 — Setup & Removal\n• We protect your floors and remove all doors. Label everything.\nDay 2 — Prep\nFull sanding with HEPA extraction.\nFill and caulk seams.\nDay 3: Priming\nZinsser B-I-N primer.",
  "SURFACE PREP\nScrape and sand. Patch holes.\nPAINTING:\nTwo coats on all walls.\nCut in the trim.\nA loose line with no heading? Sure.",
  "Día 1 — Preparar\nProteger pisos y muebles.\nDía 2 — Pintar\nDos manos de pintura.\nDía 5 — Revisión\nRevisar con el cliente.",
  "Just one line about the work.\nAnother line here.",
];

function sample(seed: number): Estimate {
  const s = defaultSettings();
  let x = seed;
  const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const e = blankEstimate(s, "EST-" + seed);
  e.clientName = r() > 0.3 ? "Ana Pérez" : "";
  e.jobType = (["cabinets", "interior", "exterior", "other"] as const)[Math.floor(r() * 4)];
  e.doors = Math.floor(r() * 40); e.drawers = Math.floor(r() * 20); e.frames = Math.floor(r() * 10); e.boxes = Math.floor(r() * 10);
  e.frameMode = (["included", "separate", "none"] as const)[Math.floor(r() * 3)]; e.boxMode = (["included", "separate", "none"] as const)[Math.floor(r() * 3)];
  e.items = SERVICES.slice(0, Math.floor(r() * 6)).map((sv, i) => ({ id: "i" + i, desc: sv.en, descEs: sv.es, qty: Math.round(r() * 900) / 3, unit: sv.unit, rate: sv.rate, svc: sv.id }));
  e.matBuyer = (["me", "paint", "client"] as const)[Math.floor(r() * 3)];
  e.days = Math.floor(r() * 7);
  e.scopeEn = SCOPES[Math.floor(r() * SCOPES.length)]; e.scopeEs = SCOPES[Math.floor(r() * SCOPES.length)];
  e.jobTasks = r() > 0.5 ? [{ id: "jt-1", day: 2, text: "Check humidity" }, { id: "jt-2", day: "9", text: "Return the key" }] : [];
  e.colors = r() > 0.5 ? [{ area: "Cabinets", brand: "SW", color: "Alabaster", sheen: "satin", code: "SW 7008" }, { area: "", brand: "", color: "", sheen: "", code: "" }, { area: "Walls", brand: "", color: "Gray", sheen: "", code: "" }] : [];
  return e;
}
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe("parity with prototype", () => {
  const s = defaultSettings();
  for (const lang of ["en", "es"] as const) {
    const ctx = protoCtx(s, lang);
    it(`jdKey (${lang})`, () => {
      for (const t of ["", "a", "We protect your floors.", "Año nuevo — ñandú 🎨", "x".repeat(300)]) for (const d of [1, "2", 12]) expect(jdKey(d, t)).toBe(ctx.jdKey(d, t));
    });
    for (let seed = 1; seed <= 50; seed++) {
      it(`checklist + shopping list #${seed} (${lang})`, () => {
        const e = sample(seed * 104729);
        const a = checklistFor(e, lang), b = ctx.checklistFor(clone(e));
        expect(a.items.map((x) => ({ ...x }))).toEqual(b.items.map((x: any) => ({ ...x })));
        expect(a.days).toBe(b.days);
        expect({ ...a.titles }).toEqual({ ...b.titles });
        expect(shoppingText(e, s, lang)).toBe(ctx.shoppingText(clone(e)));
      });
    }
  }
});

describe("checklistFor", () => {
  const s = defaultSettings();
  const base = () => ({ ...blankEstimate(s, "EST-1"), days: 3 });
  it("builds days from the scope headings", () => {
    const cl = checklistFor({ ...base(), scopeEn: "Day 1 — Prep\nMask everything.\nDay 2 — Spray\nSpray two coats." }, "en");
    expect(cl.items.map((x) => [x.day, x.text])).toEqual([[1, "Mask everything."], [2, "Spray two coats."]]);
    expect(cl.titles).toEqual({ 1: "Prep", 2: "Spray" });
    expect(cl.days).toBe(3);
    expect(cl.items[0].key).toBe(jdKey(1, "Mask everything."));
  });
  it("uses the Spanish scope in Spanish and falls back to the other language", () => {
    const e = { ...base(), scopeEn: "Day 1 — Prep\nMask.", scopeEs: "" };
    expect(checklistFor(e, "es").items[0].text).toBe("Mask.");
    expect(checklistFor({ ...e, scopeEs: "Día 1 — Preparar\nTapar." }, "es").items[0].text).toBe("Tapar.");
  });
  it("falls back to a default list when there is no scope", () => {
    const cab = checklistFor({ ...base(), scopeEn: "", scopeEs: "" }, "en");
    expect(cab.items).toHaveLength(12); expect(cab.days).toBe(5);
    const paint = checklistFor({ ...base(), jobType: "interior", days: 2, scopeEn: "", scopeEs: "" }, "es");
    expect(paint.items.map((x) => x.day)).toEqual([1, 1, 2, 2]); // day 3 lines don't fit a 2-day job
    expect(paint.items[0].text).toBe("Proteger y preparar");
  });
  it("adds custom tasks per day, keyed c_<id>, and extends the days", () => {
    const cl = checklistFor({ ...base(), scopeEn: "Day 1\nMask.", jobTasks: [{ id: "a", day: 2, text: "Buy tape" }, { id: "b", day: "7", text: "Return key" }] }, "en");
    expect(cl.items.filter((x) => x.custom).map((x) => [x.key, x.day])).toEqual([["c_a", 2], ["c_b", 7]]);
    expect(cl.days).toBe(7);
  });
});

describe("progress and ticking", () => {
  const s = defaultSettings();
  const e = { ...blankEstimate(s, "EST-1"), days: 2, scopeEn: "Day 1 — A\nOne.\nTwo.\nDay 2 — B\nThree.\nFour." };
  it("counts only ticked lines that exist", () => {
    const cl = checklistFor(e, "en");
    expect(progress(cl, {})).toEqual({ done: 0, total: 4, pct: 0 });
    const c = setChecked(setChecked({}, cl.items[0].key, true, "2026-09-29T10:00:00Z"), "gone_key", true);
    expect(progress(cl, c)).toEqual({ done: 1, total: 4, pct: 25 });
    expect(c[cl.items[0].key]).toBe("2026-09-29T10:00:00Z");
    expect(progress(cl, setChecked(c, cl.items[0].key, false)).done).toBe(0);
  });
  it("setChecked never mutates its input; empty checklist is 0%", () => {
    const a = { k: "x" }; setChecked(a, "k", false); expect(a).toEqual({ k: "x" });
    expect(progress({ items: [], days: 1, titles: {} }, undefined).pct).toBe(0);
  });
  it("newJobTask trims text and defaults the day", () => {
    expect(newJobTask("3", "  Buy tape ", "jt1")).toEqual({ id: "jt1", day: 3, text: "Buy tape" });
    expect(newJobTask("x", "t", "jt2").day).toBe(1);
  });
});

describe("shoppingText", () => {
  const s = defaultSettings();
  it("lists gallons to buy (whole gallons), supplies, colors and who buys", () => {
    const e = { ...blankEstimate(s, "EST-7"), clientName: "Ana", doors: 20, drawers: 10, matBuyer: "paint" as const, colors: [{ area: "Cabinets", brand: "SW", color: "Alabaster", sheen: "", code: "SW 7008" }] };
    const txt = shoppingText(e, s, "en").split("\n");
    expect(txt[0]).toBe("Shopping list — EST-7 · Ana");
    expect(txt.some((l) => /^• Primer: \d+ gal$/.test(l))).toBe(true);
    expect(txt.some((l) => /^• Cabinet paint: \d+ gal$/.test(l))).toBe(true);
    expect(txt).toContain("🎨 Cabinets · SW · Alabaster · SW 7008");
    expect(txt[txt.length - 1]).toBe("(the client buys paint & primer)");
    expect(shoppingText(e, s, "es").split("\n")[0]).toBe("Lista de compras — EST-7 · Ana");
  });
  it("skips empty color rows and unnamed clients get a label", () => {
    const e = { ...blankEstimate(s, "EST-8"), colors: [{ area: "x", brand: "", color: "", sheen: "", code: "" }] };
    expect(shoppingText(e, s, "es")).toBe("Lista de compras — EST-8 · Cliente sin nombre");
  });
  it("builds a WhatsApp link", () => { expect(whatsappShareUrl("a b\nc")).toBe("https://wa.me/?text=a%20b%0Ac"); });
});

describe("showcase (Our recent work)", () => {
  it("adds newest first, skips duplicates and caps at the max", () => {
    let list = addShowcase([], [{ id: "a", url: "u", caption: "A" }]);
    list = addShowcase(list, [{ id: "a", url: "u", caption: "again" }, { id: "b", url: "u2", caption: "B" }]);
    expect(list.map((x) => x.id)).toEqual(["b", "a"]);
    const many = addShowcase(list, Array.from({ length: 12 }, (_, i) => ({ id: "n" + i, url: "u", caption: "" })));
    expect(many).toHaveLength(SHOWCASE_MAX);
    expect(many[0].id).toBe("n11");
    expect(removeShowcase(list, "a").map((x) => x.id)).toEqual(["b"]);
  });
  it("ignores photos with no url", () => { expect(addShowcase([], [{ id: "x", url: "", caption: "" }])).toEqual([]); });
  it("captions like the prototype: caption or job type + city", () => {
    const s = defaultSettings();
    const e = { ...blankEstimate(s, "x"), address: "12 Oak St, Fresno, CA 93720" };
    expect(showcaseCaption(e, { id: "p", kind: "after", caption: "" }, "Kitchen cabinets")).toBe("Kitchen cabinets · Fresno");
    expect(showcaseCaption(e, { id: "p", kind: "after", caption: "White shaker" }, "Kitchen cabinets")).toBe("White shaker · Fresno");
    expect(showcaseCaption({ ...e, address: "" }, { id: "p", kind: "after", caption: "" }, "Painting")).toBe("Painting");
  });
});

describe("work order", () => {
  const s = defaultSettings();
  it("hours add up to the estimate's job hours", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const e = sample(seed * 7919);
      e.upgrades = [{ id: "u", desc: "Crown", descEs: "Corona", qty: 1, rate: 10, included: true }];
      e.changeOrders = [{ id: "c", n: 1, desc: "Extra", amount: 50, hours: 2.5, status: "signed" }, { id: "d", n: 2, amount: 5, hours: 9, status: "draft" }];
      e.extraHrs = 3;
      const w = workOrderRows(e, s, "en");
      expect(Math.round(w.total * 10) / 10).toBeCloseTo(jobHours(e, s).total, 5);
    }
  });
  it("describes the frames and boxes modes and prints no money", () => {
    const e = { ...blankEstimate(s, "x"), doors: 5, drawers: 2, frameMode: "none" as const, boxMode: "separate" as const, boxes: 3, upgrades: [{ id: "u", desc: "Crown", descEs: "Corona", qty: 1, rate: 500, included: true }] };
    const w = workOrderRows(e, s, "es");
    const j = JSON.stringify(w);
    expect(j).toContain("Marcos: NO se pintan"); expect(j).toContain("Mejora: Corona");
    expect(j).not.toContain("500");
    expect(w.rows.find((r) => r.what === "Cajas")?.qty).toBe("3");
  });
  it("schedule and crew days", () => {
    const e = { ...blankEstimate(s, "x"), startDate: "2026-09-29", days: 5 };
    expect(workSchedule(e)).toEqual({ start: "2026-09-29", end: "2026-10-03" });
    expect(workSchedule({ ...e, startDate: "" })).toEqual({ start: "", end: "" });
    expect(crewDays(20, { ...s, production: { ...s.production, crewSize: 2, hoursPerDay: 8 } })).toBe(1.5);
  });
});
