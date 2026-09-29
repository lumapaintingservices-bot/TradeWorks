import { describe, expect, it } from "vitest";
import { parseBackup } from "./backup";
import { isLegacyBackup } from "./legacyImport";

const old = {
  version: 1, business: { name: "LUMA", website: "lumapaintingservices.com" },
  pricing: { doorRate: 95 }, payment: { detail: "Zelle: 786" }, numbering: { estPrefix: "EST-2026-", nextEst: 7 },
  clients: [{ id: "c1", name: "Ana", photos: [{ id: "p" }] }, { id: "c2", name: "Gone", deleted: true }],
  estimates: [{ id: "e1", number: "EST-2026-006", items: [], photos: [{ id: "p" }], portal: { token: "t" }, clientId: "c1" }],
  invoices: [{ id: "i1", number: "INV-2026-001", estId: "e1", amount: 500, kind: "deposit", status: "Paid" }],
  expenses: [{ id: "x1", date: "2026-01-02", amount: 12, receiptId: "r" }],
  photoData: { p: "data:image/png;base64,AAAA" },
};

describe("legacy LUMA backup import", () => {
  it("is detected only for the old shape", () => {
    expect(isLegacyBackup(old)).toBe(true);
    expect(isLegacyBackup({ app: "TradeWorks", data: {} })).toBe(false);
  });
  it("converts records, drops deleted and photo/link references", () => {
    const r = parseBackup(JSON.stringify(old));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b = r.backup;
    expect(b.legacy).toBe(true);
    expect(b.counts.clients).toBe(1);
    expect(b.records.clients[0].photos).toBeUndefined();
    expect(b.records.estimates[0].number).toBe("EST-2026-006");
    expect(b.records.estimates[0].photos).toEqual([{ id: "p", kind: "", caption: "" }]);
    expect(b.records.estimates[0].portal).toBeUndefined();
    expect(b.records.invoices[0].amount).toBe(500);
    expect(b.records.expenses[0].receiptId).toBeUndefined();
  });
  it("keeps photos and receipts that have image data, with the images map", () => {
    const withPhotos = { ...old, estimates: [{ ...old.estimates[0], photos: [{ id: "p", kind: "before", caption: "x" }, { id: "missing" }] }], expenses: [{ ...old.expenses[0], receiptId: "p" }] };
    const r = parseBackup(JSON.stringify(withPhotos));
    if (!r.ok) throw new Error("x");
    expect(r.backup.records.estimates[0].photos).toEqual([{ id: "p", kind: "before", caption: "x" }]);
    expect(r.backup.records.expenses[0].receiptId).toBe("p");
    expect(r.backup.images?.p).toMatch(/^data:image\/png/);
  });
  it("brings prices over on top of defaults", () => {
    const r = parseBackup(JSON.stringify(old));
    if (!r.ok) throw new Error("x");
    const s = r.backup.records.settings[0] as Record<string, any>;
    expect(s.pricing.doorRate).toBe(95);
    expect(s.pricing.drawerRate).toBe(55);
    expect(s.payNote).toBe("Zelle: 786");
    expect(s.websiteUrl).toBe("https://lumapaintingservices.com");
    expect(s.numbering.nextEst).toBe(1001);
  });
});
