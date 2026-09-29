import { describe, expect, it } from "vitest";
import { blankEstimate } from "./estimate";
import { clientTotal, effective, newToken, portalApply, portalSnapshot, type Brand } from "./portal";
import { defaultSettings } from "./settings";

const s = defaultSettings();
const brand: Brand = { name: "Acme", phone: "1", email: "a@b.c", website: "", area: "", logoUrl: "", brandColor: "#EF6A2C" };
const est = () => ({
  ...blankEstimate(s, "EST-1"), clientName: "Ana Perez", doors: 10, status: "Sent" as const, crewNotes: "secret", leadSource: "Thumbtack", extraHrs: 3, actualMaterialCost: 99,
  items: [{ id: "h", desc: "Secret wording", descEs: "Secreto", qty: 2, unit: "ea", rate: 50, hidden: true }],
  upgrades: [{ id: "u1", desc: "Crown", descEs: "Corona", qty: 1, rate: 200 }],
  activity: [{ at: "x", text: "private" }], chat: [{ from: "owner" as const, text: "hi", at: "x" }],
});

describe("portalSnapshot", () => {
  it("strips owner-only data and hidden wording", () => {
    const m = portalSnapshot(est(), s, brand);
    const j = JSON.stringify(m);
    for (const w of ["secret", "Thumbtack", "Secret wording", "Secreto", "private"]) expect(j.toLowerCase()).not.toContain(w.toLowerCase());
    expect(m.e.items[0]).toMatchObject({ hidden: true, qty: 2, rate: 50 });
  });
  it("keeps the total identical to the owner's", () => {
    const e = est();
    expect(clientTotal(portalSnapshot(e, s, brand))).toBe(900); // 10×80 + hidden 2×50
  });
});

describe("option picks", () => {
  it("live total follows the client's picks", () => {
    const m = portalSnapshot(est(), s, brand);
    expect(clientTotal(m, { picks: { u1: true } })).toBe(1100);
    expect(effective(m, { picks: { u1: true } }).upgrades[0].included).toBe(true);
  });
});

describe("portalApply", () => {
  it("logs a view once and marks Sent → Viewed", () => {
    const a = portalApply(est(), { views: ["t1"] });
    expect(a.e.status).toBe("Viewed"); expect(a.e.activity!.filter((x) => /Opened/.test(x.text))).toHaveLength(1);
    const b = portalApply(a.e, { views: ["t1"] });
    expect(b.changed).toBe(false);
  });
  it("applies picks as byClient and never twice", () => {
    const a = portalApply(est(), { picks: { u1: true } });
    expect(a.e.upgrades[0]).toMatchObject({ included: true, byClient: true });
    expect(portalApply(a.e, { picks: { u1: true } }).changed).toBe(false);
  });
  it("signature accepts the estimate and stores the image", () => {
    const a = portalApply(est(), { sign: { name: "Ana", img: "data:image/png;base64,AA", at: "2026-09-29T10:00:00Z", total: 900 } });
    expect(a.e.status).toBe("Accepted"); expect(a.e.signature).toMatchObject({ name: "Ana", via: "link", date: "2026-09-29" });
    expect(portalApply(a.e, { sign: { name: "Ana", img: "data:image/png;base64,AA", at: "2026-09-29T10:00:00Z", total: 900 } }).changed).toBe(false);
  });
  it("options are frozen once signed", () => {
    const signed = portalApply(est(), { sign: { name: "Ana", img: "AA", at: "2026-09-29T10:00:00Z", total: 900 } }).e;
    expect(portalApply(signed, { sign: { name: "Ana", img: "AA", at: "2026-09-29T10:00:00Z", total: 900 }, picks: { u1: true } }).e.upgrades[0].included).toBeFalsy();
  });
  it("chat: unread counts only client messages; paid claim recorded once", () => {
    const a = portalApply(est(), { chat: [{ from: "owner", text: "hi", at: "x" }, { from: "client", text: "question?", at: "y" }], paid: { method: "Zelle", at: "z" } });
    expect(a.e.chatUnread).toBe(1); expect(a.e.payClaim).toEqual({ method: "Zelle", at: "z" });
    expect(portalApply(a.e, { chat: a.e.chat, paid: { method: "Zelle", at: "z" } }).changed).toBe(false);
  });
  it("tokens are 24 chars and unique", () => { expect(newToken()).toHaveLength(24); expect(newToken()).not.toBe(newToken()); });
});
