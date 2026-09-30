import { describe, expect, it } from "vitest";
import { AUTO_KINDS, autoEmailId, autoEmailOn, autoKindsOf, DEFAULT_AUTO_KINDS, planEmails, withPayLink, type PlanInput } from "./autoEmail";
import { blankEstimate } from "./estimate";
import { followUps } from "./followups";
import { buildMessage, DEFAULT_TEMPLATES, PLACEHOLDERS, TPL_KEYS } from "./messages";
import { defaultSettings } from "./settings";
import type { Client, Estimate, Invoice, Settings } from "./types";

const NOW = new Date(2026, 8, 29, 10, 0, 0); // 2026-09-29 local
const TODAY = "2026-09-29";
const settings = (o: Partial<Settings> = {}): Settings => ({ ...defaultSettings(), payZelle: "pay@luma.com", autoEmail: { on: true }, ...o });
const client = (o: Partial<Client> = {}): Client => ({ id: "c1", name: "Ana Perez", phone: "(786) 555-0101", email: "ana@x.com", address: "", source: "", lang: "es", note: "", createdAt: TODAY, ...o });
const est = (o: Partial<Estimate> = {}): Estimate => ({ ...blankEstimate(defaultSettings(), "EST-1001"), id: "e1", clientId: "c1", clientName: "Ana Perez", email: "ana@x.com", doors: 10, date: "2026-09-01", ...o });
const inv = (o: Partial<Invoice> & Record<string, unknown> = {}): Invoice => ({ id: "i1", number: "INV-1", estId: "e1", kind: "deposit", amount: 400, date: TODAY, status: "Unpaid", ...o } as Invoice);
const business = { name: "Luma", phone: "786", email: "luma@x.com", website: "" };
const input = (o: Partial<PlanInput> = {}): PlanInput => ({ estimates: [], clients: [client()], invoices: [], settings: settings(), business, origin: "https://app.test", sent: new Set(), now: NOW, ...o });

describe("new reminders in followUps", () => {
  it("job starts tomorrow", () => {
    const l = followUps({ estimates: [est({ status: "Deposit Paid", startDate: "2026-09-30" })], clients: [client()], settings: settings(), now: NOW });
    expect(l.map((f) => f.key)).toContain("tomorrow");
    expect(followUps({ estimates: [est({ status: "Accepted", startDate: "2026-10-01" })], clients: [client()], settings: settings(), now: NOW }).map((f) => f.key)).not.toContain("tomorrow");
  });
  it("overdue invoices after invoiceDueDays, but not the one the deposit / balance reminder already covers", () => {
    const e = est({ status: "Deposit Paid" });
    const invs = [inv({ id: "d", kind: "deposit", status: "Paid" }), inv({ id: "p2", kind: "progress" as Invoice["kind"], date: "2026-09-20" }), inv({ id: "co", kind: "co", date: "2026-09-25", number: "INV-9" })];
    const l = followUps({ estimates: [e], clients: [client()], settings: settings(), invoices: invs, now: NOW });
    expect(l.filter((f) => f.kind === "overdue").map((f) => f.invId)).toEqual(["p2"]); // 9 days; the co invoice is only 4 days old
    expect(followUps({ estimates: [e], clients: [client()], settings: settings({ invoiceDueDays: 3 }), invoices: invs, now: NOW }).filter((f) => f.kind === "overdue")).toHaveLength(2);
    const acc = est({ status: "Accepted" });
    const dep = followUps({ estimates: [acc], clients: [client()], settings: settings(), invoices: [inv({ date: "2026-09-01" })], now: NOW });
    expect(dep.map((f) => f.kind)).toEqual(["deposit"]);
    expect(dep[0].invId).toBe("i1");
  });
  it("an invoice the client says is paid asks to confirm instead of reminding", () => {
    const acc = est({ status: "Accepted" });
    const l = followUps({ estimates: [acc], clients: [client()], settings: settings(), invoices: [inv({ payClaim: { method: "Venmo", at: "t" } })], now: NOW });
    expect(l.map((f) => f.kind)).toEqual(["payclaim"]);
    expect(l[0].detail).toContain("Venmo");
  });
  it("e-mailed reminders stay out of the list for 3 days, then come back marked", () => {
    const e = est({ status: "Accepted" });
    const base = { estimates: [e], clients: [client()], settings: settings(), invoices: [inv()], now: NOW };
    expect(followUps({ ...base, autoSent: { "e1:deposit": "2026-09-28" } })).toHaveLength(0);
    const back = followUps({ ...base, autoSent: { "e1:deposit": "2026-09-26" } });
    expect(back[0].emailed).toBe("2026-09-26");
  });
});

describe("messages", () => {
  it("new templates exist in both languages and use the new placeholders", () => {
    expect(TPL_KEYS).toContain("tomorrow");
    expect(TPL_KEYS).toContain("overdue");
    expect(PLACEHOLDERS).toEqual(expect.arrayContaining(["{invoice}", "{amount}", "{paylink}", "{howtopay}"]));
    expect(DEFAULT_TEMPLATES.overdue.es).toContain("{howtopay}");
  });
  it("money reminders carry the invoice, the ways to pay and the payment link once", () => {
    const s = settings({ payHandles: { venmo: "@luma" } });
    const ctx = { settings: s, business, invoice: { number: "INV-7", amount: 250 }, payUrl: "https://app.test/pay/T" };
    const m = buildMessage("overdue", est(), "en", ctx);
    expect(m.subject).toBe("Invoice INV-7 — $250.00 open");
    expect(m.body).toContain("invoice INV-7 for $250.00");
    expect(m.body).toContain("- Zelle: pay@luma.com\n- Venmo: @luma");
    expect(m.body.endsWith("You can pay here: https://app.test/pay/T")).toBe(true);
    const custom = buildMessage("deposit", est(), "es", { ...ctx, settings: { ...s, messageTemplates: { deposit: { en: "", es: "Pague aquí {paylink}" } } } });
    expect(custom.body.match(/pay\/T/g)).toHaveLength(1);
    expect(buildMessage("review", est(), "en", ctx).body).not.toContain("/pay/T");
  });
});

describe("automatic e-mail plan", () => {
  it("settings: off by default; default kinds are the money and schedule ones", () => {
    expect(autoEmailOn(defaultSettings())).toBe(false);
    expect(autoKindsOf({})).toEqual(DEFAULT_AUTO_KINDS);
    expect(autoKindsOf({ autoEmail: { kinds: ["review", "nope", "lead"] } })).toEqual(["review"]);
    expect(autoEmailOn({ autoEmail: { on: true, kinds: [] } })).toBe(false);
    expect(AUTO_KINDS).not.toContain("lead");
  });
  it("plans the chosen reminders for clients with an e-mail, never the same one twice", () => {
    const e1 = est({ status: "Accepted" }), e2 = est({ id: "e2", clientId: "c2", number: "EST-1002", status: "Accepted", email: "" }), e3 = est({ id: "e3", number: "EST-1003", status: "Sent", portal: { token: "TOK" }, portalViews: [], sentAt: "2026-09-20" });
    const invs = [inv(), inv({ id: "i2", estId: "e2" })];
    const p = planEmails(input({ estimates: [e1, e2, e3], invoices: invs, clients: [client(), client({ id: "c2", email: "" })] }));
    expect(p.map((x) => x.id)).toEqual(["e1:deposit"]); // e2 has no e-mail; "noview" (e3) is not a default kind
    expect(p[0].to).toBe("ana@x.com");
    expect(p[0].lang).toBe("en");
    expect(p[0].needsPayLink).toBe(true);
    expect(p[0].body).toContain("Sent by Luma with TradeWorks");
    expect(planEmails(input({ estimates: [e1, e2, e3], invoices: invs, sent: new Set([autoEmailId("e1:deposit")]) }))).toHaveLength(0);
    const all = planEmails(input({ estimates: [e1, e3], invoices: invs, settings: settings({ autoEmail: { on: true, kinds: ["noview"] } }) }));
    expect(all.map((x) => x.id)).toEqual(["e3:noview"]);
    expect(all[0].body).toContain("https://app.test/p/TOK");
    expect(planEmails(input({ estimates: [e1], invoices: invs, settings: settings({ autoEmail: { on: false } }) }))).toHaveLength(0);
  });
  it("snoozed reminders (the owner already wrote) are not e-mailed", () => {
    const e = est({ status: "Accepted", snooze: { deposit: "2026-10-01" } });
    expect(planEmails(input({ estimates: [e], invoices: [inv()] }))).toHaveLength(0);
  });
  it("uses the invoice's payment link, or rebuilds the text once one is created", () => {
    const e = est({ status: "Accepted", docLang: "es" });
    const withLink = planEmails(input({ estimates: [e], invoices: [inv({ pay: { token: "PT" } })] }));
    expect(withLink[0].needsPayLink).toBe(false);
    expect(withLink[0].body).toContain("Puede pagar aquí: https://app.test/pay/PT");
    const inp = input({ estimates: [e], invoices: [inv()] });
    const p = planEmails(inp)[0];
    expect(p.body).not.toContain("/pay/");
    const q = withPayLink(p, inp, "NEW");
    expect(q.body).toContain("https://app.test/pay/NEW");
    expect(q.needsPayLink).toBe(false);
  });
});
