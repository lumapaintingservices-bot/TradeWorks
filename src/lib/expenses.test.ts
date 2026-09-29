import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  actualMaterialsFrom, addMonthsYM, allExpenseRows, bankFp, bankGuess, buildBankItems, categoryTotals, cleanVendor, detectDateOrder, detectDelimiter,
  expCatLabel, expCats, expenseTotals, inBounds, jobExpensesTotal, learnRules, parseBankDate, parseBankFile, parseCSV, parseMoney,
  rangeBounds, runRecurring, vendorsList, type BankRule, type RecurringRule,
} from "./expenses";
import type { Estimate, Expense } from "./types";

/* ---- parity with the prototype: run its own functions on the same inputs ---- */
const proto = readFileSync(new URL("../../prototype/index.html", import.meta.url), "utf8");
function fn(name: string): string {
  const i = proto.indexOf(`function ${name}(`);
  if (i < 0) throw new Error("missing prototype function " + name);
  let j = proto.indexOf("{", i), d = 0;
  for (;; j++) { if (proto[j] === "{") d++; if (proto[j] === "}" && !--d) break; }
  return proto.slice(i, j + 1);
}
const bankVars = proto.slice(proto.indexOf("var BANK_GUESS = ["), proto.indexOf("function bankGuess("));
const names = ["num", "r2", "isMarketingCat", "inBounds", "monthBounds", "cleanVendor", "parseCSV", "parseBankDate", "parseMoney", "bankFp", "bankGuess", "runRecurring", "jobExpenses"];
function protoCtx(db: Record<string, unknown>, today: string) {
  const ctx: Record<string, any> = { DB: db, todayISO: () => today, stampRec: (x: unknown) => x, TT: (a: string) => a, save() {}, uid: () => "x" };
  runInNewContext(bankVars + names.map(fn).join("\n") + ";" + names.map((n) => `this.${n}=${n};`).join(""), ctx);
  return ctx;
}
const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

describe("parity with prototype: primitives", () => {
  const P = protoCtx({ bankRules: [], expenses: [] }, "2026-09-29");

  it("parseMoney (US formats)", () => {
    for (const s of ["12.30", "$1,234.56", "-45.10", "(45.10)", "45.10-", "  ", "", "abc", "$ 7", "1,234", "0", "-0.99", "USD 12.5", "(1,000.00)", "5-", "+8.25"])
      expect(parseMoney(s), s).toBe(P.parseMoney(s));
  });
  it("parseBankDate", () => {
    for (const s of ["2026-09-05", "2026-9-5", "9/5/2026", "09/05/26", "12/31/2025", "2026-09-05T10:00:00", "Sep 5, 2026", "September 5, 2026", "", "junk", "13/45/2026x"])
      expect(parseBankDate(s), s).toBe(P.parseBankDate(s));
  });
  it("cleanVendor", () => {
    for (const s of ["THE HOME DEPOT #6320", "POS DEBIT WAWA 8112 HOLLYWOOD FL", "  GOOGLE   *ADS3312 ", "CHECKCARD 0902 LOWES", "payment to Bob", "12345", "", "Sherwin-Williams", "A very long merchant name that goes on and on forever 99999"])
      expect(cleanVendor(s), s).toBe(P.cleanVendor(s));
  });
  it("bankFp", () => {
    for (const [d, s, a] of [["2026-09-05", "HOME DEPOT #12", -184.37], ["2026-09-05", "Shell Oil 57444 FL", 58.1], ["2026-01-01", "", 0.005], ["2026-01-01", "ÁÉ weird*chars & more than twenty four characters", 1234.5]] as const)
      expect(bankFp(d, s, a)).toBe(P.bankFp(d, s, a));
  });
  it("bankGuess with and without learned rules", () => {
    const rules: BankRule[] = [{ match: "la carreta", category: "other", vendor: "La Carreta" }, { match: "frank's supply", category: "materials", source: "", vendor: "Frank's" }];
    const Pr = protoCtx({ bankRules: JSON.parse(JSON.stringify(rules)), expenses: [] }, "2026-09-29");
    for (const s of ["THE HOME DEPOT #6320", "THUMBTACK*LEAD", "GOOGLE *ADS3312", "FACEBK ADS", "SHELL OIL", "NEXT INSURANCE", "VERIZON", "STAPLES", "FESTOOL USA", "LA CARRETA RESTAURANT", "Frank's Supply 22", "Nextdoor ads", "Random cafe", "", "Amazon Mktp", "instagram promo", "Meta Ads 123"]) {
      expect(bankGuess(s), s).toEqual(P.bankGuess(s) ? { ...P.bankGuess(s) } : null);
      const a = bankGuess(s, rules), b = Pr.bankGuess(s);
      expect(a, s).toEqual(b ? { ...b } : null);
    }
  });
  it("parseCSV (comma files)", () => {
    const samples = ["a,b,c\n1,2,3\n", 'a,"b,1","c ""q"""\r\n1,2,3', "﻿x,y\r\n\r\n1,2", "a,b\n1,2", 'q,"multi\nline",z\n', "", ",,\n1,,", "one\ntwo\n"];
    for (const s of samples) expect(parseCSV(s, ","), JSON.stringify(s)).toEqual(P.parseCSV(s).map((r: string[]) => [...r]));
    for (const f of ["chase-card.csv", "boa-checking.csv", "debit-credit.csv"]) expect(parseCSV(fixture(f), ",")).toEqual(P.parseCSV(fixture(f)).map((r: string[]) => [...r]));
  });
  it("monthBounds / inBounds", () => {
    for (const today of ["2026-09-29", "2026-01-05", "2026-03-31", "2024-12-31"]) {
      const Px = protoCtx({}, today);
      for (const k of ["month", "lastmonth", "year", "all", "2025"]) {
        const a = rangeBounds(k, today), b = Px.monthBounds(k);
        if (k !== "lastmonth") expect({ ...b }).toEqual(a === undefined ? {} : a);
        else expect(a.from).toBe(b.from);
        for (const d of ["2024-02-29", "2025-01-01", "2025-12-31", "2026-01-31", "2026-02-28", "2026-08-31", "2026-09-01", "2026-09-29", "2026-09-30", "2026-12-31", "2027-01-01", "2024-12-31", "2024-11-30", "2026-03-31", "2026-02-01", "2026-04-01"])
          expect(inBounds(d, a), `${today} ${k} ${d}`).toBe(Px.inBounds(d, b));
      }
    }
  });
  it("jobExpenses / actual materials", () => {
    const est = { id: "e1", expenses: [{ id: "a", amount: "10.10" }, { id: "b", amount: 5.555 }] };
    const db = { expenses: [{ id: "x1", estId: "e1", category: "materials", amount: 20.2 }, { id: "x2", estId: "e1", category: "fuel", amount: 99 }, { id: "x3", estId: "e2", category: "materials", amount: 1 }, { id: "x4", estId: "e1", category: "materials", amount: 3.333, deleted: true }], estimates: [est] };
    const Px = protoCtx(db, "2026-09-29");
    expect(jobExpensesTotal(db.expenses as unknown as Expense[], "e1", est.expenses as unknown as { amount: number }[])).toBe(Px.jobExpenses(est));
    expect(jobExpensesTotal([], "e1")).toBe(0);
    expect(actualMaterialsFrom(0, 88)).toBe(88); expect(actualMaterialsFrom(12.5, 88)).toBe(12.5);
  });
});

describe("parity with prototype: runRecurring", () => {
  const rules: RecurringRule[] = [
    { id: "rc1", vendor: "Next Insurance", amount: 89, category: "insurance", method: "Card", day: 10, from: "2026-05", active: true },
    { id: "rc2", vendor: "Google Ads", amount: 150, category: "ads", source: "Google", method: "Card", day: 31, from: "2026-08", active: true },
    { id: "rc3", vendor: "Paused", amount: 10, category: "other", day: 1, from: "2026-01", active: false },
    { id: "rc4", vendor: "Zero", amount: 0, category: "other", day: 1, from: "2026-01", active: true },
    { id: "rc5", vendor: "No from", amount: 12.34, category: "software", day: 0, active: true },
    { id: "rc6", vendor: "Future day", amount: 7, category: "office", day: 28, from: "2026-07", active: true },
  ];
  const existing = [{ id: "rec-rc1-2026-06" }, { id: "rec-rc6-2026-09" }, { id: "unrelated" }];
  for (const today of ["2026-09-29", "2026-09-10", "2026-09-09", "2026-10-01", "2027-02-28"]) {
    it("same expenses as the prototype on " + today, () => {
      const db = { recurring: JSON.parse(JSON.stringify(rules)), expenses: JSON.parse(JSON.stringify(existing)) };
      protoCtx(db, today).runRecurring();
      const theirs = (db.expenses as any[]).slice(existing.length).map((x) => ({ ...x }));
      const mine = runRecurring(rules, existing, today);
      expect(mine).toEqual(theirs);
    });
  }
  it("is idempotent: a second run over its own output makes nothing", () => {
    const first = runRecurring(rules, existing, "2026-09-29");
    expect(first.length).toBeGreaterThan(0);
    expect(runRecurring(rules, [...existing, ...first], "2026-09-29")).toEqual([]);
  });
  it("uses deterministic ids so two devices agree", () => {
    const a = runRecurring(rules, [], "2026-09-29").map((x) => x.id), b = runRecurring(rules, [], "2026-09-29").map((x) => x.id);
    expect(a).toEqual(b);
    expect(a).toContain("rec-rc1-2026-05"); expect(a).toContain("rec-rc1-2026-09"); expect(a).toContain("rec-rc2-2026-08");
    expect(new Set(a).size).toBe(a.length);
  });
  it("backfills missed months but is capped, honours skip and pause", () => {
    const old: RecurringRule = { id: "old", vendor: "Old", amount: 5, category: "other", day: 3, from: "2019-01", active: true };
    const made = runRecurring([old], [], "2026-09-29");
    expect(made.length).toBe(24);
    expect(made[0].date).toBe("2024-10-03");
    expect(made[made.length - 1].date).toBe("2026-09-03");
    const skipped = runRecurring([{ ...old, from: "2026-07", skip: ["2026-08"] }], [], "2026-09-29").map((x) => x.id);
    expect(skipped).toEqual(["rec-old-2026-07", "rec-old-2026-09"]);
    expect(runRecurring([{ ...old, active: false }], [], "2026-09-29")).toEqual([]);
    expect(runRecurring(undefined, [], "2026-09-29")).toEqual([]);
  });
  it("addMonthsYM crosses years", () => { expect(addMonthsYM("2026-01", -1)).toBe("2025-12"); expect(addMonthsYM("2026-11", 3)).toBe("2027-02"); expect(addMonthsYM("2026-09", -23)).toBe("2024-10"); });
});

describe("ranges, totals and rows", () => {
  it("Last year, custom and all", () => {
    expect(rangeBounds("lastyear", "2026-09-29")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(rangeBounds("lastmonth", "2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(rangeBounds("lastmonth", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(rangeBounds("ytd", "2026-09-29")).toEqual({ from: "2026-01-01", to: "2026-09-29" });
    expect(rangeBounds("custom", "2026-09-29", { from: "2026-02-01", to: "2026-02-10" })).toEqual({ from: "2026-02-01", to: "2026-02-10" });
    expect(inBounds("2026-02-05", rangeBounds("custom", "2026-09-29", { from: "2026-02-01", to: "" }))).toBe(true);
    expect(inBounds("1999-01-01", rangeBounds("all", "2026-09-29"))).toBe(true);
  });
  const mk = (id: string, date: string, category: string, amount: number, extra: Partial<Expense> = {}): Expense => ({ id, date, vendor: id, category, amount, ...extra });
  const ledger = [mk("a", "2026-09-02", "materials", 100.1), mk("b", "2026-09-03", "leads", 42), mk("c", "2026-09-04", "ads", 120), mk("d", "2026-09-05", "fuel", 58.1), mk("e", "2026-08-05", "materials", 999), mk("f", "2026-09-06", "insurance", 89)];
  const est = { id: "E1", date: "2026-09-07", expenses: [{ id: "q", amount: 10.5, desc: "paint tape", date: "2026-09-08" }] } as unknown as Estimate;
  it("tiles: spent includes team payouts", () => {
    const rows = allExpenseRows(ledger, [est]);
    const tot = expenseTotals(rows, [{ date: "2026-09-10", amount: 300 }, { date: "2026-08-10", amount: 50 }], rangeBounds("month", "2026-09-29"));
    expect(tot).toEqual({ spent: 719.7, ledger: 419.7, team: 300, materials: 110.6, marketing: 162, other: 147.1 });
  });
  it("category totals add the team category", () => {
    const c = categoryTotals(allExpenseRows(ledger), [{ date: "2026-09-10", amount: 300 }], rangeBounds("month", "2026-09-29"));
    expect(c.cats).toEqual({ materials: 100.1, leads: 42, ads: 120, fuel: 58.1, insurance: 89, team: 300 });
    expect(c.total).toBe(709.2);
  });
  it("legacy job receipts appear as materials rows", () => {
    const r = allExpenseRows([], [est]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "job-q", cat: "materials", estId: "E1", legacy: true, date: "2026-09-08", vendor: "paint tape" });
    expect(jobExpensesTotal(ledger, "E1", [{ amount: 10.5 }])).toBe(10.5);
    expect(jobExpensesTotal([mk("z", "2026-09-01", "materials", 20.2, { estId: "E1" }), mk("y", "2026-09-01", "fuel", 5, { estId: "E1" })], "E1", [{ amount: 10.1 }])).toBe(30.3);
  });
  it("vendors are distinct, newest first; custom categories", () => {
    expect(vendorsList([mk("Home Depot", "2026-01-01", "materials", 1), mk("home depot", "2026-02-01", "materials", 1), mk("Shell", "2026-03-01", "fuel", 1)])).toEqual(["Shell", "home depot"]);
    expect(expCats(["Permits", { id: "x", name: "Dumpsters" }, "Permits", "other"]).filter((c) => c.custom).map((c) => c.id)).toEqual(["Permits", "x"]);
    expect(expCatLabel("Permits", true, ["Permits"])).toBe("Permits");
    expect(expCatLabel("materials", true)).toBe("Materiales");
    expect(expCatLabel("team", false)).toBe("Team payments");
    expect(expCatLabel("unknown", false)).toBe("Other");
  });
});

describe("bank CSV: extra behaviour", () => {
  it("parseMoney reads decimal commas, US numbers unchanged", () => {
    expect(parseMoney("1.234,56")).toBe(1234.56); expect(parseMoney("-89,90")).toBe(-89.9); expect(parseMoney("12,50")).toBe(12.5);
    expect(parseMoney("1,234")).toBe(1234); expect(parseMoney("1,234.50")).toBe(1234.5); expect(parseMoney("(1.234,56)")).toBe(-1234.56);
  });
  it("dates: day-first when a value proves it", () => {
    expect(detectDateOrder(["15/09/2026", "01/02/2026"])).toBe("dmy"); expect(detectDateOrder(["09/15/2026"])).toBe("mdy"); expect(detectDateOrder(["01/02/2026"])).toBe("mdy");
    expect(parseBankDate("15/09/2026", "dmy")).toBe("2026-09-15"); expect(parseBankDate("03/04/26", "dmy")).toBe("2026-04-03");
  });
  it("delimiter detection", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(","); expect(detectDelimiter("a;b;c\n1,5;2,5;3")).toBe(";"); expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter('a,b\n"x;y;z",2')).toBe(",");
    expect(parseCSV("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("bank CSV fixtures (two or more layouts)", () => {
  const rules: BankRule[] = [];
  it("Chase-style card: negative charges, amount column, quotes and doubled quotes", () => {
    const f = parseBankFile(fixture("chase-card.csv"))!;
    expect(f.head[f.map.date]).toBe("Transaction Date"); expect(f.head[f.map.desc]).toBe("Description"); expect(f.head[f.map.amount]).toBe("Amount");
    expect(f.map.debit).toBe(-1); expect(f.sign).toBe("neg"); expect(f.dateOrder).toBe("mdy");
    const items = buildBankItems(f, rules, []);
    expect(items.map((x) => [x.date, x.vendor, x.amount, x.cat, x.src])).toEqual([
      ["2026-09-02", "THE HOME DEPOT", 184.37, "materials", ""],
      ["2026-09-03", "THUMBTACK*LEAD", 42, "leads", "Thumbtack"],
      ["2026-09-04", "SHELL OIL", 58.1, "fuel", ""],
      ["2026-09-05", "SHERWIN-WILLIAMS", 312.55, "materials", ""],
      ["2026-09-08", "GOOGLE *ADS", 120, "ads", "Google"],
      ["2026-09-09", "LA CARRETA RESTAURANT, MIAMI", 36.2, "other", ""],
      ["2026-09-15", "NEXT INSURANCE \"GL\"", 89, "insurance", ""],
    ]); // the $500 payment is skipped (positive on a negative-charges file)
    expect(items.every((x) => x.on && !x.dup)).toBe(true);
    expect(items.filter((x) => x.guessed)).toHaveLength(6);
  });
  it("Bank of America-style checking: summary lines on top, thousands separators, parentheses", () => {
    const f = parseBankFile(fixture("boa-checking.csv"))!;
    expect(f.head).toEqual(["Date", "Description", "Amount", "Running Bal."]);
    expect(f.sign).toBe("neg");
    const items = buildBankItems(f, rules, []);
    expect(items.map((x) => [x.date, x.vendor, x.amount, x.cat])).toEqual([
      ["2026-09-02", "HOME DEPOT", 184.37, "materials"],
      ["2026-09-06", "WAWA", 45.1, "fuel"],
      ["2026-09-10", "NEXT INSURANCE PMT", 89, "insurance"],
      ["2026-09-20", "EQUIPMENT PURCHASE, TITAN X", 1064.25, "tools"],
    ]);
  });
  it("debit/credit columns: only the debit column becomes expenses, sign is ignored", () => {
    const f = parseBankFile(fixture("debit-credit.csv"))!;
    expect(f.head[f.map.debit]).toBe("Debit"); expect(f.head[f.map.credit]).toBe("Credit"); expect(f.map.amount).toBe(-1);
    const items = buildBankItems(f, rules, []);
    expect(items.map((x) => [x.date, x.vendor, x.amount, x.cat])).toEqual([
      ["2026-09-02", "LOWES", 210.4, "materials"],
      ["2026-09-07", "VERIZON WIRELESS PAYMENTS", 132.19, "software"],
      ["2026-09-09", "STAPLES", 27.85, "office"],
      ["2026-09-11", "CHECK", 600, "other"],
    ]);
  });
  it("Spanish export: semicolons, BOM, day-first dates, decimal commas", () => {
    const f = parseBankFile(fixture("es-semicolon.csv"))!;
    expect(f.head).toEqual(["Fecha", "Concepto", "Importe", "Saldo"]);
    expect(f.dateOrder).toBe("dmy"); expect(f.sign).toBe("neg");
    const items = buildBankItems(f, rules, []);
    expect(items.map((x) => [x.date, x.amount, x.cat])).toEqual([
      ["2026-09-15", 1234.56, "materials"], ["2026-09-16", 89.9, "insurance"], ["2026-09-18", 150, "ads"], ["2026-09-30", 12.5, "other"],
    ]);
  });
  it("tab separated with positive charges (Amex-style): sign detected as positive", () => {
    const f = parseBankFile(fixture("amex-tab.tsv"))!;
    expect(f.head[f.map.desc]).toBe("Merchant"); expect(f.sign).toBe("pos");
    const items = buildBankItems(f, rules, []);
    expect(items.map((x) => [x.date, x.vendor, x.amount, x.cat])).toEqual([["2026-09-02", "Sherwin-Williams", 312.55, "materials"], ["2026-09-04", "Shell Oil", 58.1, "fuel"]]);
  });
  it("flipping the sign / rows without a date or amount", () => {
    const f = parseBankFile(fixture("chase-card.csv"))!;
    const pos = buildBankItems({ ...f, sign: "pos" }, rules, []);
    expect(pos.map((x) => x.amount)).toEqual([500]);
    expect(parseBankFile("just one line")).toBeNull();
    expect(buildBankItems({ rows: [["", "x", "5"], ["2026-01-01", "y", ""]], map: { date: 0, desc: 1, amount: 2, debit: -1, credit: -1 }, sign: "pos", dateOrder: "mdy" }, [], [])).toEqual([]);
  });
  it("duplicates: same fingerprint or same date+amount start unchecked", () => {
    const f = parseBankFile(fixture("chase-card.csv"))!;
    const first = buildBankItems(f, rules, []);
    const have: Expense[] = [
      { id: "1", date: first[0].date, vendor: "x", amount: first[0].amount, category: "materials", bankFp: first[0].fp },
      { id: "2", date: "2026-09-04", vendor: "typed by hand", amount: 58.1, category: "fuel" },
    ];
    const again = buildBankItems(f, rules, have);
    expect(again.map((x) => [x.dup, x.on])).toEqual([[true, false], [false, true], [true, false], [false, true], [false, true], [false, true], [false, true]]);
  });
  it("learned rules win over built-ins and are remembered for the next import", () => {
    const f = parseBankFile(fixture("chase-card.csv"))!;
    const items = buildBankItems(f, [], []);
    const carreta = items.find((x) => /CARRETA/.test(x.desc))!;
    carreta.cat = "labor"; carreta.changed = true; carreta.vendor = "La Carreta";
    const home = items[0]; home.cat = "tools"; home.changed = true; // owner overrides a guess
    const learned = learnRules(items, []);
    expect(learned.map((r) => r.match).sort()).toEqual(["the home depot", "la carreta restaurant, miami"].sort());
    // untouched guesses are not learned
    expect(learnRules(buildBankItems(f, [], []), [])).toEqual([{ match: "la carreta restaurant, miami", category: "other", source: "", vendor: "LA CARRETA RESTAURANT, MIAMI" }]);
    const next = buildBankItems(f, learned, []);
    expect(next[0].cat).toBe("tools");
    expect(next.find((x) => /CARRETA/.test(x.desc))).toMatchObject({ cat: "labor", vendor: "La Carreta", guessed: true });
    // updating an existing rule keeps a single row
    home.cat = "materials";
    expect(learnRules([home], learned).filter((r) => r.match === "the home depot")).toEqual([{ match: "the home depot", category: "materials", source: "", vendor: "THE HOME DEPOT" }]);
  });
});
