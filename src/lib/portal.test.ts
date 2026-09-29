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

describe("change orders on the client link", () => {
  const withCo = () => ({
    ...est(), signature: { name: "Ana", img: "AA", date: "2026-09-01", via: "link", at: "x" }, status: "Accepted" as const,
    changeOrders: [
      { id: "co1", n: 1, desc: "Add pantry", descEs: "Despensa", amount: 250, hours: 4, status: "sent", sigImg: "SECRETIMG" },
      { id: "co2", n: 2, desc: "Draft only", descEs: "Solo borrador", amount: 99, hours: 1, status: "draft" },
      { id: "co3", n: 3, desc: "Done", descEs: "Hecho", amount: 40, hours: 1, status: "signed", signedName: "Ana", signedAt: "2026-09-10", sigImg: "SECRETIMG" },
    ],
  });
  const sig = { name: "Ana Perez", img: "data:image/png;base64,BB", at: "2026-09-29T10:00:00Z" };

  it("snapshot lists sent/signed change orders without images or drafts", () => {
    const m = portalSnapshot(withCo(), s, brand);
    expect(m.e.changeOrders.map((c) => c.id)).toEqual(["co1", "co3"]);
    expect(m.e.changeOrders[0]).toEqual({ id: "co1", n: 1, desc: "Add pantry", descEs: "Despensa", amount: 250, status: "sent", signedName: "", signedAt: "" });
    expect(m.e.changeOrders[1]).toMatchObject({ signedName: "Ana", signedAt: "2026-09-10" });
    const j = JSON.stringify(m);
    expect(j).not.toContain("SECRETIMG"); expect(j).not.toContain("Draft only");
  });
  it("client approval signs the change order once, logs it and reports news", () => {
    const a = portalApply(withCo(), { coSign: { co1: sig } });
    const co = a.e.changeOrders.find((c) => c.id === "co1")!;
    expect(co).toMatchObject({ status: "signed", signedName: "Ana Perez", signedAt: "2026-09-29", sigImg: sig.img, via: "link" });
    expect(a.changed).toBe(true); expect(a.news).toMatch(/change order #1/);
    expect(a.e.activity!.filter((x) => /Change order #1 approved/.test(x.text))).toHaveLength(1);
    expect(a.e.portalSeen!.co!.co1).toBe(1);
    const b = portalApply(a.e, { coSign: { co1: sig } });
    expect(b.changed).toBe(false);
    // even if the owner reopens it, the same approval is never applied twice
    const reopened = { ...a.e, changeOrders: a.e.changeOrders.map((c) => (c.id === "co1" ? { ...c, status: "sent" } : c)) };
    expect(portalApply(reopened, { coSign: { co1: sig } }).changed).toBe(false);
  });
  it("ignores drafts, unknown ids and empty signatures; keeps an owner signature", () => {
    const a = portalApply(withCo(), { chat: withCo().chat, coSign: { co2: sig, nope: sig, co1: { name: "x", img: "", at: "" } } });
    expect(a.changed).toBe(false);
    expect(a.e.changeOrders.find((c) => c.id === "co2")!.status).toBe("draft");
    const b = portalApply(withCo(), { coSign: { co3: { ...sig, name: "Someone else" } } });
    expect(b.e.changeOrders.find((c) => c.id === "co3")).toMatchObject({ signedName: "Ana", signedAt: "2026-09-10" });
    expect(b.e.activity!.some((x) => /approved from the link/.test(x.text))).toBe(false);
  });
  it("works alongside older portalSeen records without co", () => {
    const e = withCo(); e.portalSeen = { views: 0, picks: "{}", sign: true };
    expect(portalApply(e, { coSign: { co1: sig } }).e.changeOrders[0].status).toBe("signed");
  });
});
