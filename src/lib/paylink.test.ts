import { describe, expect, it } from "vitest";
import { blankEstimate } from "./estimate";
import { createInvoices, type InvoiceRec } from "./invoices";
import { cleanHandle, cleanPaypal, payApply, payHandleLines, payLinkMessage, payMethodCopy, payMethodUrl, payModel, payOptionsOf } from "./paylink";
import { defaultSettings } from "./settings";

const brand = { name: "Luma", phone: "555", email: "a@b.co", website: "", area: "", logoUrl: "", brandColor: "#EF6A2C" };
function job() {
  const s = defaultSettings();
  s.payZelle = "pay@luma.com"; s.payZelleName = "Luma LLC"; s.payNote = "Thanks!";
  const e = blankEstimate(s, "EST-1001");
  e.id = "e1"; e.clientName = "Ana Diaz"; e.address = "1 Main St"; e.doors = 10; e.drawers = 4; e.docLang = "es";
  const r = createInvoices(e, s, []);
  if (!r.ok) throw new Error("no invoices");
  return { s, e, invs: r.invoices };
}

describe("payment methods", () => {
  it("cleans handles people type", () => {
    expect(cleanHandle(" @luma-paint ")).toBe("luma-paint");
    expect(cleanHandle("$$Luma")).toBe("Luma");
    expect(cleanHandle("<script>")).toBe("script");
    expect(cleanPaypal("https://www.paypal.me/LumaPaint/25")).toBe("LumaPaint");
    expect(cleanPaypal("luma")).toBe("luma");
  });
  it("follows the payment-method chips, plus the app handles that are filled in", () => {
    const s = defaultSettings();
    s.payMethods = [];
    expect(payOptionsOf(s)).toEqual([]);
    // chips never chosen = all four (like the documents); Zelle needs an address to be listed
    s.payMethods = undefined;
    expect(payOptionsOf(s).map((m) => m.kind)).toEqual(["check", "card", "cash"]);
    s.payZelle = "555-1234"; s.payMethods = ["zelle", "check"];
    s.payHandles = { venmo: "@luma", cashapp: "", paypal: "paypal.me/luma", checkTo: "Luma LLC" };
    expect(payOptionsOf(s).map((m) => m.kind)).toEqual(["zelle", "venmo", "paypal", "check"]);
    expect(payOptionsOf(s).find((m) => m.kind === "check")!.to).toBe("Luma LLC");
    s.payMethods = ["cash"]; // Zelle turned off: the address alone does not list it
    expect(payOptionsOf(s).map((m) => m.kind)).toEqual(["venmo", "paypal", "cash"]);
  });
  it("prints the handles for documents", () => {
    expect(payHandleLines({ payHandles: { venmo: "luma", checkTo: "Luma LLC" } }, false)).toEqual(["Venmo: @luma", "Checks payable to: Luma LLC"]);
    expect(payHandleLines({}, true)).toEqual([]);
  });
  it("builds app links with the amount", () => {
    expect(payMethodUrl({ kind: "cashapp", to: "luma" }, 1250, "x")).toBe("https://cash.app/$luma/1250.00");
    expect(payMethodUrl({ kind: "paypal", to: "luma" }, 99.999, "x")).toBe("https://paypal.me/luma/100.00USD");
    expect(payMethodUrl({ kind: "venmo", to: "luma" }, 10, "INV-1 & co")).toContain("recipients=luma&amount=10.00&note=INV-1%20%26%20co");
    expect(payMethodUrl({ kind: "zelle", to: "a@b.co" }, 10, "")).toBeNull();
    expect(payMethodCopy({ kind: "venmo", to: "luma" })).toBe("@luma");
    expect(payMethodCopy({ kind: "cash", to: "" })).toBeNull();
  });
});

describe("payModel", () => {
  it("carries the invoice as printed, in both languages, and nothing private", () => {
    const { s, e, invs } = job();
    e.crewNotes = "gate code 1234"; e.notes = "";
    const m = payModel(invs[0], e, s, brand);
    expect(m.inv.amount).toBe(invs[0].amount);
    expect(m.inv.paid).toBe(false);
    expect(m.lang).toBe("es");
    expect(m.sheet.en.dueNow).toBe(invs[0].amount);
    expect(m.sheet.es.title).toBe("Factura de depósito");
    expect(m.methods[0]).toEqual({ kind: "zelle", to: "pay@luma.com", name: "Luma LLC" });
    expect(JSON.stringify(m)).not.toContain("gate code");
  });
  it("shows paid once the owner marks it paid", () => {
    const { s, e, invs } = job();
    const m = payModel({ ...invs[0], status: "Paid", paidDate: "2026-09-30" }, e, s, brand);
    expect(m.inv.paid).toBe(true);
    expect(m.inv.paidDate).toBe("2026-09-30");
  });
});

describe("payApply", () => {
  const v = { id: "i1", number: "INV-1001", estId: "e1", kind: "deposit", amount: 500, date: "2026-09-30", status: "Unpaid" } as InvoiceRec;
  it("does nothing when nothing happened", () => {
    expect(payApply(v, undefined)).toBeNull();
    expect(payApply({ ...v, payViews: 2 }, { views: ["a", "b"] })).toBeNull();
  });
  it("counts views", () => { expect(payApply(v, { views: ["a"] })).toEqual({ payViews: 1 }); });
  it("records a claim once, clipped", () => {
    const p = payApply(v, { paid: { method: "Venmo".repeat(20), at: "2026-09-30T10:00:00Z", note: "x".repeat(900) } })!;
    expect(p.payClaim!.method.length).toBe(40);
    expect(p.payClaim!.note!.length).toBe(300);
    expect(p.payClaimSeen).toBe("2026-09-30T10:00:00Z");
    expect(payApply({ ...v, ...p }, { paid: { method: "Venmo", at: "2026-09-30T10:00:00Z" } })).toBeNull();
  });
  it("a claim on a paid invoice is only marked seen", () => {
    const p = payApply({ ...v, status: "Paid" }, { paid: { method: "Zelle", at: "t1" } });
    expect(p).toEqual({ payClaimSeen: "t1" });
  });
  it("a second claim (new time) shows up again", () => {
    const p = payApply({ ...v, payClaimSeen: "t1" }, { paid: { method: "Zelle", at: "t2" } });
    expect(p!.payClaim!.at).toBe("t2");
  });
});

it("payLinkMessage speaks the client's language", () => {
  const v = { number: "INV-1001", kind: "balance", amount: 1200, clientName: "Ana Diaz" } as InvoiceRec;
  expect(payLinkMessage(v, "https://x/pay/t", "Luma", "es")).toContain("Hola Ana, aquí está su factura INV-1001 (saldo) por $1,200.00");
  expect(payLinkMessage(v, "https://x/pay/t", "Luma", "en")).toContain("https://x/pay/t");
});
