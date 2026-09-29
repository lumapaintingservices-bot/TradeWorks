import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { blankEstimate, calcEstimate } from "./estimate";
import { buildMessage, DEFAULT_SUBJECTS, DEFAULT_TEMPLATES, digitsOnly, fillTemplate, mailUrl, smsUrl, templateText, TPL_KEYS, waNumber, waUrl, type MsgCtx } from "./messages";
import { defaultSettings } from "./settings";
import { money } from "./money";
import type { Estimate } from "./types";

const s = defaultSettings();
const business = { name: "LUMA Painting Services", phone: "(786) 909-3458", email: "l@x.com", website: "luma.com" };
const ctx = (over: Partial<MsgCtx> = {}): MsgCtx => ({ settings: s, business, origin: "https://app.test", ...over });
const est = (o: Partial<Estimate> = {}): Estimate => ({ ...blankEstimate(s, "EST-1001"), clientName: "Ana Perez", doors: 20, drawers: 5, date: "2026-09-01", startDate: "2026-10-05", ...o });

/* ---- parity with the prototype: run its fillTemplate / waNumber on the same inputs ---- */
const proto = readFileSync(new URL("../../prototype/index.html", import.meta.url), "utf8");
function fn(name: string): string {
  const i = proto.indexOf(`function ${name}(`);
  let j = proto.indexOf("{", i), d = 0;
  for (;; j++) { if (proto[j] === "{") d++; if (proto[j] === "}" && !--d) break; }
  return proto.slice(i, j + 1);
}

describe("fillTemplate", () => {
  const e = est({ depositPct: 40, discountMode: "manual", manualType: "fixed", manualValue: 100 });
  const t = calcEstimate(e, s);
  it("replaces every placeholder", () => {
    const out = fillTemplate("{client}|{number}|{total}|{deposit}|{balance}|{start}|{business}|{phone}|{email}|{website}|{first}|{valid}", e, "en", ctx());
    expect(out).toBe(["Ana Perez", "EST-1001", money(t.total), money(t.deposit), money(t.balance), "Oct 5, 2026", business.name, business.phone, business.email, business.website, "Ana", "Oct 1, 2026"].join("|"));
  });
  it("renders dates in the client's language", () => {
    expect(fillTemplate("{start}", e, "es", ctx())).toBe("5 oct 2026");
  });
  it("works without an estimate (lead)", () => {
    expect(fillTemplate("Hi {first} ({client}) {total}|", null, "en", ctx({ clientName: "Luis Gomez" }))).toBe("Hi Luis (Luis Gomez) |");
  });
  it("matches the prototype's fillTemplate on the same estimate", () => {
    const names = ["num", "r2", "money", "fmtDate", "addDaysISO", "todayISO", "findDiscount", "payPlanOn", "calcEstimate", "frameUnits", "boxUnits", "itemSqft", "otherSqft", "jobSqft", "calcMaterials", "svcById", "prodP", "jobHours", "laborModeFor", "crewCost", "coSignedTotal", "jobEconomics", "actualMaterials", "jobExpenses", "fillTemplate"];
    const c: Record<string, any> = { DB: { ...s, business: { name: business.name, phone: business.phone, email: business.email, website: business.website }, services: [], expenses: [], estimates: [] }, UI_LANG: "en", TT: (a: string) => a, MON_EN: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], MON_ES: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"], v4Defaults: () => ({ production: s.production }) };
    runInNewContext(names.map(fn).join("\n") + ";this.fillTemplate=fillTemplate;", c);
    const txt = "{client}\n{number} {total} {deposit} {balance} {valid} {start} {business} {phone} {email} {website}";
    for (const lang of ["en", "es"] as const) expect(fillTemplate(txt, e, lang, ctx())).toBe(c.fillTemplate(txt, e, lang));
  });
});

describe("templates", () => {
  it("every key has EN and ES text and subject", () => {
    for (const k of TPL_KEYS) {
      expect(DEFAULT_TEMPLATES[k].en.length).toBeGreaterThan(20);
      expect(DEFAULT_TEMPLATES[k].es.length).toBeGreaterThan(20);
      expect(DEFAULT_SUBJECTS[k].en && DEFAULT_SUBJECTS[k].es).toBeTruthy();
    }
  });
  it("the prototype's default bodies are ported verbatim", () => {
    for (const [k, id] of [["follow", "follow"], ["deposit", "deposit"], ["balance", "balance"], ["review", "review"], ["send", "send"], ["warranty", "warranty"]] as const) {
      const i = proto.indexOf(`id:"${id}"`);
      expect(i).toBeGreaterThan(0);
      const blk = proto.slice(i, i + 2500);
      const grab = (f: string) => { const m = new RegExp(`${f}:"((?:[^"\\\\]|\\\\.)*)"`).exec(blk); return m ? JSON.parse(`"${m[1]}"`) : ""; };
      expect(DEFAULT_TEMPLATES[k].en).toBe(grab("body"));
      expect(DEFAULT_TEMPLATES[k].es).toBe(grab("bodyEs"));
    }
  });
  it("overrides win per language, blank falls back to the default", () => {
    const o = { review: { en: "Custom {client}", es: "  " } };
    expect(templateText(o, "review", "en")).toBe("Custom {client}");
    expect(templateText(o, "review", "es")).toBe(DEFAULT_TEMPLATES.review.es);
    expect(templateText(undefined, "deposit", "en")).toBe(DEFAULT_TEMPLATES.deposit.en);
  });
  it("buildMessage: review adds the review URL once, noview/viewed add the client link", () => {
    const e = est({ portal: { token: "TOK123" } });
    const c = ctx({ settings: { ...s, reviewUrl: "https://g.page/r/abc" } });
    const r = buildMessage("review", e, "en", c);
    expect(r.body.endsWith("\n\nhttps://g.page/r/abc")).toBe(true);
    const custom = buildMessage("review", e, "en", ctx({ settings: { ...s, reviewUrl: "https://g.page/r/abc", messageTemplates: { review: { en: "Review: https://g.page/r/abc", es: "" } } } }));
    expect(custom.body.match(/g\.page/g)).toHaveLength(1);
    expect(buildMessage("noview", e, "es", c).body.endsWith("\n\nhttps://app.test/p/TOK123")).toBe(true);
    expect(buildMessage("viewed", e, "en", c).body).toContain("https://app.test/p/TOK123");
    expect(buildMessage("follow", e, "en", c).body).not.toContain("/p/TOK123");
    expect(buildMessage("deposit", e, "en", c).subject).toBe("Deposit for EST-1001 — starting Oct 5, 2026");
  });
  it("lead greeting uses the first name", () => {
    const r = buildMessage("lead", null, "es", ctx({ clientName: "Luis Gomez" }));
    expect(r.body.startsWith("Hola Luis, le escribe LUMA Painting Services.")).toBe(true);
    expect(r.body.endsWith("(786) 909-3458")).toBe(true);
  });
});

describe("deep links", () => {
  it("waNumber matches the prototype (10 digits get a leading 1)", () => {
    const c: Record<string, any> = {};
    runInNewContext([fn("digitsOnly"), fn("waNumber")].join("\n") + ";this.waNumber=waNumber;", c);
    for (const p of ["(786) 909-3458", "+52 55 1234 5678", "17869093458", "", "abc"]) expect(waNumber(p)).toBe(c.waNumber(p));
    expect(digitsOnly("(786) 909-3458")).toBe("7869093458");
    expect(waNumber("(786) 909-3458")).toBe("17869093458");
  });
  it("builds wa / sms / mail URLs", () => {
    expect(waUrl("(786) 909-3458", "Hola & ñ\nx")).toBe("https://wa.me/17869093458?text=Hola%20%26%20%C3%B1%0Ax");
    expect(waUrl("7869093458")).toBe("https://wa.me/17869093458");
    expect(smsUrl("(786) 909-3458", "Hi there")).toBe("sms:7869093458?&body=Hi%20there");
    expect(mailUrl("a@b.com", "Sub ject", "Body & more")).toBe("mailto:a%40b.com?subject=Sub%20ject&body=Body%20%26%20more");
  });
});

describe("coMessage", () => {
  it("matches the prototype wording, with and without a client link", async () => {
    const { coMessage } = await import("./messages");
    const co = { n: 2, desc: "Add pantry", descEs: "Agregar despensa", amount: 250 };
    const w = coMessage(est({ portal: { token: "TK" } }), co, "en", ctx());
    expect(w).toBe("Hi Ana, here is change order #2 (Add pantry) for $250.00. You can review and sign it here: https://app.test/p/TK\n\nLUMA Painting Services\n(786) 909-3458");
    expect(coMessage(est(), co, "es", ctx())).toBe("Hola Ana, le dejo el cambio #2 (Agregar despensa) por $250.00. Si está de acuerdo, respóndame este mensaje para confirmarlo.\n\nLUMA Painting Services\n(786) 909-3458");
  });
});
