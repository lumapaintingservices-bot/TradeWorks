import { describe, expect, it } from "vitest";
import { backupFileName, buildBackup, BACKUP_COLLECTIONS, isoOf, parseBackup } from "./backup";
import { blankEstimate } from "./estimate";
import { defaultSettings } from "./settings";

const co = { id: "co1", name: "LUMA Painting" };
const est = { ...blankEstimate(defaultSettings(), "EST-1001"), id: "e1", companyId: "co1", createdAt: { seconds: 1780000000, nanoseconds: 5 }, updatedAt: { seconds: 1780000100, nanoseconds: 0 } };
const sample = () => buildBackup(co, {
  clients: [{ id: "c1", name: "Ana", companyId: "co1" }],
  estimates: [est as unknown as Record<string, unknown>],
  invoices: [{ id: "i1", estId: "e1", amount: 100 }],
  expenses: [{ id: "x1", amount: 5, date: "2026-09-01" }],
  workers: [{ id: "w1", name: "Leo" }], hours: [{ id: "h1", workerId: "w1", hours: 4 }], payouts: [{ id: "p1", workerId: "w1", amount: 80 }], tasks: [{ id: "t1", title: "Call" }],
  settings: [{ id: "main", ...defaultSettings() } as unknown as Record<string, unknown>],
}, new Date("2026-09-29T12:00:00Z"));

describe("backup", () => {
  it("builds every collection, drops companyId/updatedAt and turns createdAt into text", () => {
    const b = sample();
    expect(Object.keys(b.data)).toEqual([...BACKUP_COLLECTIONS]);
    const e = b.data.estimates[0];
    expect(e.companyId).toBeUndefined(); expect(e.updatedAt).toBeUndefined();
    expect(e.createdAt).toBe(new Date(1780000000 * 1000).toISOString());
    expect(b.data.clients[0].companyId).toBeUndefined();
  });
  it("round-trips through JSON", () => {
    const r = parseBackup(JSON.stringify(sample()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.total).toBe(9); expect(r.backup.skipped).toBe(0);
    expect(r.backup.counts.estimates).toBe(1);
    expect(r.backup.records.estimates[0].number).toBe("EST-1001");
    expect(r.backup.company?.name).toBe("LUMA Painting");
  });
  it("rejects files that are not backups", () => {
    expect(parseBackup("nope").ok).toBe(false);
    expect(parseBackup("[]").ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: "Other", version: 1, data: {} })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: "TradeWorks", version: 2, data: {} })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: "TradeWorks", version: 1, data: {} })).ok).toBe(false); // nothing to restore
  });
  it("skips invalid records and keeps the good ones", () => {
    const b = JSON.parse(JSON.stringify(sample()));
    b.data.clients.push({ id: "a/b", name: "bad id" }, { name: "no id" }, { id: "c2" }, "junk", { id: "c1", name: "dup" });
    b.data.estimates.push({ id: "e2", number: 5 });
    b.data.expenses.push({ id: "x2", amount: "5", date: "2026-01-01" });
    b.data.settings.push({ id: "other", pricing: {}, production: {}, materials: {} });
    b.data.hours = "not a list";
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.counts.clients).toBe(1);
    expect(r.backup.counts.estimates).toBe(1);
    expect(r.backup.counts.expenses).toBe(1);
    expect(r.backup.counts.settings).toBe(1);
    expect(r.backup.counts.hours).toBe(0);
    expect(r.backup.skipped).toBe(5 + 1 + 1 + 1 + 1);
  });
  it("isoOf understands the timestamp shapes", () => {
    expect(isoOf("2026-09-29")).toBe("2026-09-29");
    expect(isoOf("garbage")).toBeUndefined();
    expect(isoOf({ seconds: 0 })).toBe("1970-01-01T00:00:00.000Z");
    expect(isoOf({ toDate: () => new Date(0) })).toBe("1970-01-01T00:00:00.000Z");
    expect(isoOf(42)).toBeUndefined();
  });
  it("file name", () => {
    expect(backupFileName("LUMA Painting Services", new Date(2026, 8, 5))).toBe("TradeWorks-backup-LUMA-Painting-Services-2026-09-05.json");
    expect(backupFileName("", new Date(2026, 0, 1))).toBe("TradeWorks-backup-company-2026-01-01.json");
  });
});
