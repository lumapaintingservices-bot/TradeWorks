import { describe, expect, it } from "vitest";
import { planEmails } from "./autoEmail";
import { blankEstimate } from "./estimate";
import { followUps } from "./followups";
import { buildMessage, TPL_KEYS } from "./messages";
import { payModel } from "./paylink";
import { markRewardPaid, programOn, referralRows, rewardAmount, rewardExpense, rewardsDue, rewardText } from "./referrals";
import { defaultSettings } from "./settings";
import type { Client, Estimate, Invoice, Settings } from "./types";

const NOW = new Date(2026, 8, 29, 10, 0, 0);
const settings = (o: Partial<Settings> = {}): Settings => ({ ...defaultSettings(), referral: { on: true, amount: 50 }, ...o });
const client = (o: Partial<Client>): Client => ({ id: "x", name: "X", phone: "786", email: "x@x.com", address: "", source: "", lang: "en", note: "", createdAt: "2026-09-01", ...o });
const est = (o: Partial<Estimate>): Estimate => ({ ...blankEstimate(defaultSettings(), "EST-1"), id: "e", clientId: "x", doors: 10, date: "2026-09-01", ...o });
const inv = (o: Partial<Invoice>): Invoice => ({ id: "i", number: "INV-1", estId: "e", kind: "deposit", amount: 500, date: "2026-09-01", status: "Paid", ...o });

const ana = client({ id: "ana", name: "Ana Ruiz", lang: "es", email: "ana@x.com" });
const bo = client({ id: "bo", name: "Bo Lee", referredBy: "ana", createdAt: "2026-09-10" });
const cy = client({ id: "cy", name: "Cy Diaz", referredBy: "ana", createdAt: "2026-09-12" });
const ghost = client({ id: "gh", name: "Ghost", referredBy: "nobody" });
const eBo = est({ id: "eb", clientId: "bo", status: "Accepted" });
const eCy = est({ id: "ec", clientId: "cy", status: "Accepted" });
const paidBo = [inv({ id: "i1", estId: "eb" }), inv({ id: "i2", estId: "eb", kind: "balance" })];

describe("reward text", () => {
  it("own words win, else the amount", () => {
    expect(rewardText(settings(), false)).toBe("$50.00 off your next job");
    expect(rewardText(settings(), true)).toBe("$50.00 de descuento en su próximo trabajo");
    expect(rewardText(settings({ referral: { on: true, rewardEn: "a $25 Home Depot card", rewardEs: "" } }), true)).toBe("a $25 Home Depot card");
    expect(rewardAmount({})).toBe(50);
    expect(programOn({})).toBe(false);
  });
});

describe("referralRows", () => {
  it("status and reward per referred client", () => {
    const rows = referralRows([ana, bo, cy, ghost], [eBo, eCy], paidBo, settings());
    expect(rows.map((r) => [r.friend.id, r.status, r.reward])).toEqual([["cy", "won", "none"], ["bo", "paid", "earned"]]);
    expect(rows[1].value).toBeGreaterThan(0);
    expect(rewardsDue(rows, settings()).map((r) => r.friend.id)).toEqual(["bo"]);
    expect(rewardsDue(rows, settings({ referral: { on: false } }))).toEqual([]);
    const given = markRewardPaid(bo, 50, "2026-09-29", "Zelle", "x-ref-bo");
    expect(given.refReward).toEqual({ amount: 50, paidAt: "2026-09-29", method: "Zelle", expenseId: "x-ref-bo" });
    expect(referralRows([ana, given, cy], [eBo, eCy], paidBo, settings()).find((r) => r.friend.id === "bo")!.reward).toBe("paid");
  });
  it("the expense counts under marketing, source Referral", () => {
    expect(rewardExpense("x1", ana, bo, 50, "2026-09-29", "Zelle")).toMatchObject({ category: "ads", source: "Referral", vendor: "Ana Ruiz", amount: 50, note: "Referral reward — Bo Lee" });
  });
});

describe("follow-ups and messages", () => {
  it("a reward to give shows up for the referrer, in their language, until given", () => {
    const l = followUps({ estimates: [eBo, eCy], clients: [ana, bo, cy], settings: settings(), invoices: paidBo, now: NOW });
    const r = l.find((f) => f.kind === "reward")!;
    expect(r).toMatchObject({ clientId: "ana", friendId: "bo", friend: "Bo Lee", lang: "es", tpl: "refthanks", key: "rewardbo" });
    const off = followUps({ estimates: [eBo], clients: [ana, bo], settings: settings({ referral: { on: false } }), invoices: paidBo, now: NOW });
    expect(off.some((f) => f.kind === "reward")).toBe(false);
    const snoozed = followUps({ estimates: [eBo], clients: [{ ...ana, snooze: { rewardbo: "2026-10-01" } }, bo], settings: settings(), invoices: paidBo, now: NOW });
    expect(snoozed.some((f) => f.kind === "reward")).toBe(false);
  });
  it("thank-you message and the review P.S. with the personal link", () => {
    expect(TPL_KEYS).toContain("refthanks");
    const ctx = { settings: settings(), business: { name: "Luma", phone: "786" }, friend: "Bo Lee", refUrl: "https://app.test/request?c=co&src=referral&ref=ana" };
    const t = buildMessage("refthanks", null, "es", { ...ctx, clientName: "Ana Ruiz" });
    expect(t.subject).toBe("Gracias por recomendarnos a Bo Lee");
    expect(t.body).toContain("Su amigo(a) Bo Lee acaba de terminar");
    expect(t.body).toContain("$50.00 de descuento en su próximo trabajo");
    const rv = buildMessage("review", est({}), "en", ctx);
    expect(rv.body).toContain("P.S. Know someone who needs work done? Share your personal link: https://app.test/request?c=co&src=referral&ref=ana");
    expect(buildMessage("review", est({}), "en", { ...ctx, settings: settings({ referral: { on: false } }) }).body).not.toContain("P.S.");
  });
  it("the daily e-mail can send the thank-you, and review e-mails carry the link", () => {
    const s = settings({ autoEmail: { on: true, kinds: ["refthanks", "review"] } });
    const done = est({ id: "ea", clientId: "ana", email: "ana@x.com", status: "Accepted" });
    const p = planEmails({ estimates: [eBo, done], clients: [ana, bo], invoices: [...paidBo, inv({ id: "i3", estId: "ea" })], settings: s,
      business: { name: "Luma", phone: "786" }, origin: "https://app.test", companyId: "co", sent: new Set(), now: NOW });
    expect(p.map((x) => x.kind).sort()).toEqual(["refthanks", "review", "review"]);
    expect(p.find((x) => x.kind === "refthanks")!.to).toBe("ana@x.com");
    expect(p.find((x) => x.id === "ea:review")!.body).toContain("ref=ana");
  });
  it("paid invoice page invites to refer only when the program is on", () => {
    const v = { ...paidBo[0], status: "Paid" as const, paidDate: "2026-09-20" } as never;
    const b = { name: "Luma", phone: "", email: "", website: "", area: "", logoUrl: "", brandColor: "" };
    expect(payModel(v, eBo, settings(), b, { refUrl: "https://app.test/r" }).refer).toEqual({ url: "https://app.test/r", rewardEn: "$50.00 off your next job", rewardEs: "$50.00 de descuento en su próximo trabajo" });
    expect(payModel(v, eBo, settings({ referral: { on: false } }), b, { refUrl: "https://app.test/r" }).refer).toBeUndefined();
  });
});
