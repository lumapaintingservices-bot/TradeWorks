import { describe, expect, it } from "vitest";
import { depositAtSignOf, depositPayFor, needsDepositLink } from "./deposit";
import { blankEstimate } from "./estimate";
import type { InvoiceRec } from "./invoices";
import { defaultSettings } from "./settings";
import type { Estimate, Settings } from "./types";

const s0 = defaultSettings();
const est = (o: Partial<Estimate> = {}): Estimate => ({ ...blankEstimate(s0, "EST-1001"), id: "e1", items: [{ id: "i1", desc: "Paint", qty: 1, rate: 1000, unit: "" }], depositPct: 30, ...o } as Estimate);
const inv = (o: Partial<InvoiceRec>): InvoiceRec => ({ id: "v1", number: "INV-1", estId: "e1", kind: "deposit", percent: 30, amount: 300, date: "2026-10-01", status: "Unpaid", ...o } as InvoiceRec);
const sig = (at: string) => ({ name: "Ana", img: "x", date: at.slice(0, 10), via: "link", at });

describe("deposit at signing", () => {
  it("off by default; the estimate's own choice wins over the company default", () => {
    expect(depositAtSignOf({}, {})).toBe(false);
    expect(depositAtSignOf({}, { depositAtSign: true })).toBe(true);
    expect(depositAtSignOf({ depositAtSign: false }, { depositAtSign: true })).toBe(false);
    expect(depositAtSignOf({ depositAtSign: true }, {})).toBe(true);
    expect(depositAtSignOf({ depositAtSign: null }, { depositAtSign: true })).toBe(true);
  });
  it("what the client link shows: nothing when off; the first invoice (amount, link, paid) when on", () => {
    const e = est({ depositAtSign: true });
    expect(depositPayFor(est(), s0, [])).toBeNull();
    const planned = depositPayFor(e, s0, [])!;
    expect(planned.token).toBe("");
    expect(planned.paid).toBe(false);
    expect(planned.amount).toBeGreaterThan(0);
    expect(depositPayFor(e, s0, [inv({ pay: { token: "T1" } })])).toEqual({ amount: 300, token: "T1", paid: false });
    expect(depositPayFor(e, s0, [inv({ status: "Paid", pay: { token: "T1" } })])!.paid).toBe(true);
  });
  it("needs a link: signed + on + first invoice missing or without a link (and not paid)", () => {
    const signed = est({ depositAtSign: true, signature: sig("2026-10-01T15:00:00Z") });
    expect(needsDepositLink(est({ signature: sig("2026-10-01T15:00:00Z") }), s0, [])).toBe(false); // off
    expect(needsDepositLink(est({ depositAtSign: true }), s0, [])).toBe(false);                    // not signed
    expect(needsDepositLink(signed, s0, [])).toBe(true);
    expect(needsDepositLink(signed, s0, [inv({})])).toBe(true);
    expect(needsDepositLink(signed, s0, [inv({ pay: { token: "T" } })])).toBe(false);
    expect(needsDepositLink(signed, s0, [inv({ status: "Paid" })])).toBe(false);
  });
  it("the company default does not bill jobs signed before it was switched on", () => {
    const s: Settings = { ...s0, depositAtSign: true, depositAtSignSince: "2026-10-05T12:00:00Z" };
    expect(needsDepositLink(est({ signature: sig("2026-10-01T15:00:00Z") }), s, [])).toBe(false);
    expect(needsDepositLink(est({ signature: sig("2026-10-06T15:00:00Z") }), s, [])).toBe(true);
    // ticked on the estimate itself: always
    expect(needsDepositLink(est({ depositAtSign: true, signature: sig("2026-10-01T15:00:00Z") }), s, [])).toBe(true);
  });
});
