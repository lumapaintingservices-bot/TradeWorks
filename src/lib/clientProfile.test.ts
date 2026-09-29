import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { clientJobs, clientPhotos, clientTiles, colorsUsed, contactLine, isWon, referralLink, referralMessage, referredClients } from "./clientProfile";
import { blankEstimate } from "./estimate";
import { defaultSettings } from "./settings";
import { SERVICES } from "./services.data";
import type { EstStatus, Estimate, Invoice } from "./types";

/* ---- parity with the prototype: run its own calcEstimate / jobCosts / jobStatus on the same inputs ---- */
const proto = readFileSync(new URL("../../prototype/index.html", import.meta.url), "utf8");
function fn(name: string): string {
  const i = proto.indexOf(`function ${name}(`);
  let j = proto.indexOf("{", i), d = 0;
  for (;; j++) { if (proto[j] === "{") d++; if (proto[j] === "}" && !--d) break; }
  return proto.slice(i, j + 1);
}
const names = ["num", "r2", "findDiscount", "payPlanOn", "calcEstimate", "frameUnits", "boxUnits", "itemSqft", "otherSqft", "jobSqft", "calcMaterials", "svcById",
  "jobStatus", "invoicesFor", "jobCosts", "jobExpenses", "liveExpenses", "liveHours", "hourAmount"];
const s = defaultSettings();

function job(seed: number, status: EstStatus, clientId = "c1"): Estimate {
  const e = blankEstimate(s, "EST-" + seed);
  e.id = "e" + seed; e.clientId = clientId; e.status = status;
  e.doors = 5 + (seed % 17); e.drawers = seed % 9; e.frames = seed % 4; e.boxes = seed % 3;
  e.items = SERVICES.slice(0, seed % 4).map((sv, i) => ({ id: "i" + i, desc: sv.en, descEs: sv.es, qty: 10 + seed, unit: sv.unit, rate: sv.rate, svc: sv.id }));
  e.discountMode = seed % 3 === 0 ? "manual" : ""; e.manualType = "percent"; e.manualValue = 5;
  e.taxEnabled = seed % 2 === 0; e.taxRate = 7;
  return e;
}
const inv = (id: string, estId: string, amount: number, status: Invoice["status"], kind: Invoice["kind"] = "deposit"): Invoice =>
  ({ id, number: "INV-" + id, estId, kind, amount, date: "2026-01-01", status, paidDate: status === "Paid" ? "2026-01-02" : undefined });

describe("clientTiles", () => {
  const jobs = [job(1, "Accepted"), job(2, "Sent"), job(3, "Draft"), job(4, "Declined"), job(5, "Accepted"), job(6, "Deposit Paid"), job(7, "Paid in Full"), job(8, "Accepted")];
  const invoices = [inv("a", "e1", 500.25, "Paid"), inv("b", "e1", 100, "Unpaid", "balance"), inv("c", "e5", 99999, "Paid"), inv("d", "e2", 40, "Paid"), inv("f", "e7", 10, "Paid", "co")];

  it("matches the prototype's viewClient math (won/paid/owes) to the cent", () => {
    const ctx: Record<string, any> = { DB: { ...s, services: SERVICES, expenses: [], hours: [], estimates: [], invoices: invoices.map((v) => ({ ...v, estimateId: v.estId })) },
      UI_LANG: "en", TT: (a: string) => a, invOrder: () => 0, workerById: () => null, WON_ST: { Accepted: 1, "Deposit Paid": 1, "Paid in Full": 1 }, jobs };
    runInNewContext(names.map(fn).join("\n") + `;var won=0,paid=0,owed=0;jobs.forEach(function(e){ if(WON_ST[jobStatus(e)]){ var k=jobCosts(e); won+=k.price; paid+=k.paid; owed+=Math.max(0,k.price-k.paid);} });this.out={won:won,paid:paid,owed:owed};`, ctx);
    const t = clientTiles(jobs, invoices, s);
    expect(t.jobs).toBe(8);
    expect(t.won).toBeCloseTo(ctx.out.won, 2);
    expect(t.paid).toBeCloseTo(ctx.out.paid, 2);
    expect(t.owes).toBeCloseTo(ctx.out.owed, 2);
    expect(t.won).toBeGreaterThan(0);
  });
  it("ignores non-won jobs and never lets one job's overpayment lower what another owes", () => {
    const j = [job(1, "Accepted"), job(5, "Accepted")];
    const t = clientTiles(j, [inv("c", "e5", 99999, "Paid")], s);
    expect(t.paid).toBe(99999);
    expect(t.owes).toBeGreaterThan(0);
    expect(clientTiles([job(2, "Sent")], [], s)).toEqual({ jobs: 1, won: 0, paid: 0, owes: 0 });
  });
  it("counts a job as won once an invoice is paid even if the estimate says Sent", () => {
    const e = job(9, "Sent");
    const t = clientTiles([e], [inv("z", "e9", 10, "Paid")], s);
    expect(t.won).toBeGreaterThan(0);
    expect(t.paid).toBe(10);
  });
  it("isWon", () => { expect(isWon("Accepted")).toBe(true); expect(isWon("Sent")).toBe(false); expect(isWon("Declined")).toBe(false); });
});

describe("clientJobs", () => {
  it("filters by client and sorts newest first", () => {
    const a = { ...job(1, "Sent"), date: "2026-01-05" }, b = { ...job(2, "Sent"), date: "2026-03-01" }, c = { ...job(3, "Sent", "other"), date: "2026-04-01" };
    expect(clientJobs([a, b, c], "c1").map((e) => e.id)).toEqual(["e2", "e1"]);
  });
});

describe("referral", () => {
  it("builds the personal link", () => {
    expect(referralLink("https://app.example.com", "co1", "c-abc")).toBe("https://app.example.com/request?c=co1&src=referral&ref=c-abc");
    expect(referralLink("https://app.example.com/", "co 1", "c/1")).toBe("https://app.example.com/request?c=co%201&src=referral&ref=c%2F1");
  });
  it("message is bilingual and ends with the link", () => {
    expect(referralMessage("L", "en")).toBe("Thank you again for trusting us! If a friend needs work done, this is your personal link: L");
    expect(referralMessage("L", "es")).toMatch(/^¡Gracias otra vez.*: L$/);
  });
  it("lists referred clients, without archived ones", () => {
    const cs = [{ id: "1", name: "B", referredBy: "x" }, { id: "2", name: "A", referredBy: "x" }, { id: "3", name: "C", referredBy: "y" }, { id: "4", name: "D", referredBy: "x", archived: true }];
    expect(referredClients(cs, "x").map((c) => c.id)).toEqual(["2", "1"]);
    expect(referredClients(cs, "none")).toEqual([]);
  });
});

describe("colors and photos", () => {
  it("colors used skips empty rows and joins the parts", () => {
    const e = { ...job(1, "Sent"), colors: [{ area: "Cabinets", brand: "SW", color: "Pure White", sheen: "", code: "SW 7005" }, { area: "Walls", brand: "", color: "", sheen: "satin", code: "" }] };
    expect(colorsUsed([e])).toEqual([{ estId: "e1", number: "EST-1", text: "Cabinets · SW · Pure White · SW 7005" }]);
  });
  it("photos keep only those with an image", () => {
    const e = { ...job(1, "Sent"), photos: [{ id: "p1", kind: "before", caption: "", url: "data:x" }, { id: "p2", kind: "after", caption: "" }] };
    expect(clientPhotos([e]).map((p) => p.id)).toEqual(["p1"]);
  });
  it("contact line", () => { expect(contactLine({ phone: "1", email: "", address: "x" })).toBe("1 · x"); });
});
