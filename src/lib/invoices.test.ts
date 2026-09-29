import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { blankEstimate, calcEstimate } from "./estimate";
import {
  asInv, changeInvoiceFor, changesToInvoice, coSignedTotal, contractTotal, createInvoices, invoiceSheetData, invOrder, makeChangeInvoice, nextChangeNumber,
  nextInvNumber, planAmounts, signChange, statusAfterPayment, syncInvoiceAmounts, type InvoiceRec,
} from "./invoices";
import { r2 } from "./money";
import { defaultSettings } from "./settings";
import { SERVICES } from "./services.data";
import type { ChangeOrder, Estimate, EstStatus } from "./types";

/* ---- parity with the prototype: run its own functions on the same inputs ---- */
const proto = readFileSync(new URL("../../prototype/index.html", import.meta.url), "utf8");
function fn(name: string): string {
  const i = proto.indexOf(`function ${name}(`);
  let j = proto.indexOf("{", i), d = 0;
  for (;; j++) { if (proto[j] === "{") d++; if (proto[j] === "}" && !--d) break; }
  return proto.slice(i, j + 1);
}
const names = ["num", "r2", "money", "findDiscount", "payPlanOn", "calcEstimate", "planAmounts", "nextInvNumber", "makeInvoice", "createInvoices", "createPlanInvoices",
  "mainInvoicesFor", "invoicesFor", "invOrder", "jobStatus", "syncInvoices", "coSignedTotal", "byId"];

type Ctx = { DB: any; createInvoices(e: any): void; jobStatus(e: any): string; syncInvoices(e: any): void; nextInvNumber(): number; toasts: string[] };
function protoCtx(s: ReturnType<typeof defaultSettings>, invoices: any[] = [], nextInv = 1001): Ctx {
  let k = 0;
  const ctx: any = {
    DB: { ...s, invoices, estimates: [], numbering: { invPrefix: "INV-", pad: 0, nextInv } }, toasts: [] as string[],
    uid: (p: string) => p + "-" + ++k, pad: (n: number) => String(n), todayISO: () => "2026-09-29", touch: () => {}, render: () => {}, save: () => {},
    T: (a: string) => a, TT: (a: string) => a, toast: (m: string) => ctx.toasts.push(m),
  };
  runInNewContext(names.map(fn).join("\n") + ";this.createInvoices=createInvoices;this.jobStatus=jobStatus;this.syncInvoices=syncInvoices;this.nextInvNumber=nextInvNumber;", ctx);
  return ctx;
}

function sample(seed: number, s = defaultSettings()): Estimate {
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const e = blankEstimate(s, "EST-" + seed);
  e.id = "e" + seed; e.status = (["Draft", "Sent", "Accepted"] as const)[Math.floor(r() * 3)];
  e.doors = Math.floor(r() * 40); e.drawers = Math.floor(r() * 20);
  e.items = SERVICES.slice(0, Math.floor(r() * 5)).map((sv, i) => ({ id: "i" + i, desc: sv.en, descEs: sv.es, qty: Math.round(r() * 900) / 3, unit: sv.unit, rate: sv.rate, svc: sv.id }));
  e.discountMode = (["", "code", "manual"] as const)[Math.floor(r() * 3)]; e.discountCode = "CASH3"; e.manualType = r() > 0.5 ? "fixed" : "percent"; e.manualValue = Math.round(r() * 200) / 7;
  e.taxEnabled = r() > 0.5; e.taxRate = 7; e.depositPct = [0, 25, 30, 33, 50, 100][Math.floor(r() * 6)];
  if (r() > 0.6) { e.payPlanOn = true; e.payPlan = [{ label: "A", labelEs: "A", pct: 33.3 }, { label: "B", labelEs: "B", pct: 33.3 }, { label: "C", labelEs: "C", pct: 33.3 }]; }
  return e;
}

describe("createInvoices parity with the prototype", () => {
  const s = defaultSettings();
  for (let seed = 1; seed <= 60; seed++) {
    it(`estimate #${seed}`, () => {
      const e = sample(seed * 104729, s);
      const pc = protoCtx(s, [], 1500);
      const pe = JSON.parse(JSON.stringify(e));
      pc.createInvoices(pe);
      const mine = createInvoices(e, { ...s, numbering: { ...s.numbering, nextInv: 1500 } }, []);
      const theirs = pc.DB.invoices as any[];
      if (!mine.ok) { expect(theirs).toHaveLength(0); return; }
      expect(mine.invoices.map((v) => [v.number, v.kind, v.percent, v.amount, v.stage ?? null])).toEqual(theirs.map((v) => [v.number, v.kind, v.percent, v.amount, v.stage ?? null]));
      expect(mine.nextInv).toBe(pc.DB.numbering.nextInv);
      expect(mine.status ?? e.status).toBe(pe.status);
      // amounts add up to the job total to the cent
      expect(r2(mine.invoices.reduce((a, v) => a + v.amount, 0))).toBe(calcEstimate(e, s).total);
    });
  }
  it("refuses to duplicate and refuses an empty estimate", () => {
    const e = sample(3, s); e.doors = 10; e.items = []; e.drawers = 0; e.upgrades = []; e.discountMode = "";
    const a = createInvoices(e, s, []);
    expect(a.ok).toBe(true);
    if (a.ok) expect(createInvoices(e, s, a.invoices).ok).toBe(false);
    const z = blankEstimate(s, "EST-Z");
    expect(createInvoices(z, s, [])).toEqual({ ok: false, reason: "empty" });
  });
});

describe("numbering", () => {
  const s = defaultSettings();
  it("uses the settings counter but never goes below the highest used", () => {
    expect(nextInvNumber({ numbering: { nextEst: 1, nextInv: 5 } }, [])).toBe(5);
    expect(nextInvNumber({ numbering: { nextEst: 1, nextInv: 5 } }, [{ number: "INV-9" }, { number: "INV-2" }])).toBe(10);
    expect(nextInvNumber(s, [])).toBe(1001);
  });
  it("matches the prototype", () => {
    const invs = [{ number: "INV-1500" }, { number: "INV-1502" }, { number: "OTHER-7000" }];
    expect(protoCtx(s, invs.map((v) => ({ ...v })), 1200).nextInvNumber()).toBe(nextInvNumber({ numbering: { nextEst: 1, nextInv: 1200 } }, invs));
  });
  it("payment stages: last takes the rounding difference", () => {
    const a = planAmounts({ payPlan: [{ label: "", labelEs: "", pct: 33.3 }, { label: "", labelEs: "", pct: 33.3 }, { label: "", labelEs: "", pct: 33.3 }] }, 1000);
    expect(a).toEqual([333, 333, 334]);
  });
});

describe("payment -> estimate status", () => {
  const s = defaultSettings();
  const base = () => { const e = sample(11, s); e.doors = 20; e.drawers = 0; e.items = []; e.upgrades = []; e.discountMode = ""; e.payPlanOn = false; e.depositPct = 50; e.status = "Accepted"; e.changeOrders = []; return e; };
  const make = (e: Estimate) => { const r = createInvoices(e, s, []); if (!r.ok) throw new Error("x"); return r.invoices; };
  const pay = (invs: InvoiceRec[], i: number, paid = true) => invs.map((v, k) => (k === i ? { ...v, status: (paid ? "Paid" : "Unpaid") as InvoiceRec["status"] } : v));

  it("Accepted -> Deposit Paid -> Paid in Full and back", () => {
    const e = base(), invs = make(e);
    expect(invs.map((v) => v.kind)).toEqual(["deposit", "balance"]);
    expect(statusAfterPayment(e, invs)).toBeNull();
    const d = pay(invs, 0);
    expect(statusAfterPayment(e, d)).toBe("Deposit Paid");
    const all = pay(d, 1);
    expect(statusAfterPayment({ ...e, status: "Deposit Paid" }, all)).toBe("Paid in Full");
    expect(statusAfterPayment({ ...e, status: "Paid in Full" }, pay(all, 1, false))).toBe("Deposit Paid");
    expect(statusAfterPayment({ ...e, status: "Deposit Paid" }, pay(d, 0, false))).toBe("Accepted");
  });
  it("a signed change order must be paid too for Paid in Full", () => {
    const e = base(); const invs = make(e);
    e.changeOrders = [{ id: "co1", n: 1, desc: "Extra", amount: 200, hours: 2, status: "signed" }];
    const paidMain = invs.map((v) => ({ ...v, status: "Paid" as const }));
    expect(statusAfterPayment(e, paidMain)).toBe("Deposit Paid");
    const co = makeChangeInvoice(e, e.changeOrders[0], 1999);
    expect(statusAfterPayment(e, [...paidMain, co])).toBe("Deposit Paid");
    expect(statusAfterPayment(e, [...paidMain, { ...co, status: "Paid" }])).toBe("Paid in Full");
  });
  it("never touches Declined, and nothing when there are no main invoices", () => {
    const e = base(); const invs = make(e);
    expect(statusAfterPayment({ ...e, status: "Declined" }, pay(invs, 0))).toBeNull();
    expect(statusAfterPayment(e, [])).toBeNull();
  });
  it("matches the prototype's jobStatus when there are no change orders", () => {
    const e = base(), invs = make(e);
    for (const combo of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const cur = invs.map((v, i) => ({ ...v, status: combo[i] ? ("Paid" as const) : ("Unpaid" as const) }));
      const pinv = cur.map((v) => ({ ...v, estimateId: v.estId, status: v.status === "Paid" ? "Paid" : "Draft" }));
      const pc = protoCtx(s, pinv);
      const want = pc.jobStatus({ id: e.id, status: "Accepted" });
      const got = statusAfterPayment(e, cur) ?? "Accepted";
      expect(got as EstStatus).toBe(want);
    }
  });
  it("stage invoices: deposit stage paid -> Deposit Paid, all -> Paid in Full", () => {
    const e = base(); e.payPlanOn = true; e.payPlan = [{ label: "A", labelEs: "A", pct: 50 }, { label: "B", labelEs: "B", pct: 40 }, { label: "C", labelEs: "C", pct: 10 }];
    const invs = make(e);
    expect(invs.map((v) => v.kind)).toEqual(["progress", "progress", "progress"]);
    expect(statusAfterPayment(e, pay(invs, 0))).toBe("Deposit Paid");
    expect(statusAfterPayment(e, invs.map((v) => ({ ...v, status: "Paid" as const })))).toBe("Paid in Full");
  });
});

describe("change orders", () => {
  const s = defaultSettings();
  const e0 = () => { const e = sample(21, s); e.doors = 10; e.drawers = 0; e.items = []; e.upgrades = []; e.discountMode = ""; e.taxEnabled = false; return e; };
  const co = (o: Partial<ChangeOrder> = {}): ChangeOrder => ({ id: "c1", n: 1, desc: "Add pantry", descEs: "Despensa", amount: 150.555, hours: 3, status: "draft", ...o });
  it("coSignedTotal counts only signed ones (matches prototype)", () => {
    const e = e0(); e.changeOrders = [co({ status: "signed" }), co({ id: "c2", n: 2, amount: 99.99, status: "sent" }), co({ id: "c3", n: 3, amount: 10.1, status: "signed" })];
    const pc = protoCtx(s);
    expect(coSignedTotal(e)).toBe((pc as any).coSignedTotal(JSON.parse(JSON.stringify(e))));
    expect(contractTotal(e, s)).toBe(r2(calcEstimate(e, s).total + coSignedTotal(e)));
  });
  it("signing marks it signed once and produces one invoice with a stable id", () => {
    const e = e0(); e.changeOrders = [co()];
    const signed = signChange(e, e.changeOrders[0], "Ana Perez", { img: "data:x" });
    expect(signed[0]).toMatchObject({ status: "signed", signedName: "Ana Perez", sigImg: "data:x" });
    const again = signChange({ ...e, changeOrders: signed }, signed[0], "Other");
    expect(again[0].signedName).toBe("Ana Perez");
    const e2 = { ...e, changeOrders: signed };
    expect(changesToInvoice(e2, [])).toHaveLength(1);
    const inv = makeChangeInvoice(e2, signed[0], 1010);
    expect(inv).toMatchObject({ id: "i-co-c1", kind: "co", coId: "c1", coN: 1, amount: 150.56, number: "INV-1010" });
    expect(changesToInvoice(e2, [inv])).toHaveLength(0);
    expect(changeInvoiceFor([inv], signed[0])?.id).toBe("i-co-c1");
  });
  it("numbers the next change order", () => { const e = e0(); expect(nextChangeNumber(e)).toBe(1); e.changeOrders = [co({ n: 4 })]; expect(nextChangeNumber(e)).toBe(5); });
  it("orders invoices: deposit, stages, balance, then change orders", () => {
    const mk = (kind: InvoiceRec["kind"], extra: Partial<InvoiceRec> = {}) => ({ kind, ...extra }) as InvoiceRec;
    const list = [mk("co", { coN: 2 }), mk("balance"), mk("co", { coN: 1 }), mk("deposit")].sort((a, b) => invOrder(a) - invOrder(b));
    expect(list.map((v) => v.kind + (v.coN || ""))).toEqual(["deposit", "balance", "co1", "co2"]);
  });
});

describe("syncInvoiceAmounts", () => {
  const s = defaultSettings();
  it("updates unpaid deposit/balance, leaves paid ones", () => {
    const e = sample(31, s); e.doors = 10; e.drawers = 0; e.items = []; e.upgrades = []; e.discountMode = ""; e.taxEnabled = false; e.depositPct = 50; e.payPlanOn = false;
    const r = createInvoices(e, s, []); if (!r.ok) throw new Error("x");
    const invs: InvoiceRec[] = [{ ...r.invoices[0], status: "Paid" }, r.invoices[1]];
    const e2 = { ...e, doors: 20 };
    const ch = syncInvoiceAmounts(e2, s, invs);
    expect(ch).toHaveLength(1);
    expect(ch[0].kind).toBe("balance");
    expect(ch[0].amount).toBe(calcEstimate(e2, s).balance);
    // same as prototype's syncInvoices for the unpaid balance
    const pc = protoCtx(s, invs.map((v) => ({ ...v, estimateId: v.estId, status: v.status === "Paid" ? "Paid" : "Draft" })));
    pc.syncInvoices(JSON.parse(JSON.stringify(e2)));
    expect((pc.DB.invoices as any[])[1].amount).toBe(ch[0].amount);
  });
});

describe("invoiceSheetData", () => {
  const s = defaultSettings();
  it("balance invoice shows job total, less deposit, due now; both languages", () => {
    const e = sample(41, s); e.doors = 10; e.drawers = 0; e.items = []; e.upgrades = []; e.discountMode = ""; e.taxEnabled = false; e.depositPct = 50; e.payPlanOn = false;
    const r = createInvoices(e, s, []); if (!r.ok) throw new Error("x");
    const bal = r.invoices[1];
    const en = invoiceSheetData(bal, e, s, "en"), es = invoiceSheetData(bal, e, s, "es");
    expect(en.title).toBe("Balance invoice"); expect(es.title).toBe("Factura de saldo");
    expect(en.totals.map((t) => t.label)).toEqual(["Subtotal", "Job total", "Less deposit (50%)", "Due now"]);
    expect(en.totals[en.totals.length - 1].amount).toBe(400);
    expect(en.lines[0].amount).toBe(800);
    expect(asInv(bal as never).kind).toBe("balance");
  });
  it("change-order invoice", () => {
    const e = sample(42, s); e.changeOrders = [{ id: "c1", n: 1, desc: "Pantry", descEs: "Despensa", amount: 120, hours: 1, status: "signed", signedName: "Ana", signedAt: "2026-09-29" }];
    const inv = makeChangeInvoice(e, e.changeOrders[0], 1);
    const d = invoiceSheetData(inv, e, s, "es");
    expect(d).toMatchObject({ kind: "co", coDesc: "Despensa", dueNow: 120, coApproved: { name: "Ana" } });
    expect(d.title).toBe("Orden de cambio #1");
  });
});
