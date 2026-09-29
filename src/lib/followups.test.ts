import { describe, expect, it } from "vitest";
import { addDaysISO, archivedLeads, dayOf, daysBetween, followUps, jobStatus, leadClients, openedText, snoozeDate, todayISO } from "./followups";
import { blankEstimate } from "./estimate";
import { defaultSettings } from "./settings";
import type { Client, Estimate, Invoice } from "./types";

const NOW = new Date(2026, 8, 29, 10, 0, 0); // 2026-09-29 local
const TODAY = "2026-09-29";
const s = defaultSettings();
const client = (o: Partial<Client> = {}): Client => ({ id: "c1", name: "Ana Perez", phone: "(786) 555-0101", email: "a@x.com", address: "", source: "", lang: "es", note: "", createdAt: TODAY, ...o });
const est = (o: Partial<Estimate> = {}): Estimate => ({ ...blankEstimate(s, "EST-1001"), id: "e1", clientId: "c1", clientName: "Ana Perez", doors: 10, date: "2026-09-01", ...o });
const inv = (o: Partial<Invoice> = {}): Invoice => ({ id: "i1", number: "INV-1", estId: "e1", kind: "deposit", amount: 400, date: TODAY, status: "Unpaid", ...o });
const run = (estimates: Estimate[], clients: Client[] = [client()], invoices: Invoice[] = [], settings = s) => followUps({ estimates, clients, settings, invoices, now: NOW });
const keys = (l: { key: string }[]) => l.map((x) => x.key);

describe("date helpers", () => {
  it("todayISO / addDaysISO / daysBetween", () => {
    expect(todayISO(NOW)).toBe(TODAY);
    expect(addDaysISO("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-09-01", TODAY)).toBe(28);
    expect(daysBetween("", TODAY)).toBe(0);
    expect(snoozeDate(NOW)).toBe("2026-10-02");
  });
  it("dayOf handles strings and Firestore-like timestamps", () => {
    expect(dayOf("2026-09-03T10:00:00.000Z")).toBe("2026-09-03");
    expect(dayOf({ toDate: () => NOW })).toBe(TODAY);
    expect(dayOf(undefined)).toBe("");
  });
});

describe("openedText", () => {
  it("wording", () => {
    expect(openedText(1, "Sep 3")).toBe("opened once on Sep 3");
    expect(openedText(2, "Sep 3")).toBe("opened twice, last Sep 3");
    expect(openedText(5, "")).toBe("opened 5 times");
    expect(openedText(1, "", "es", true)).toBe("Lo abrió una vez");
    expect(openedText(3, "3 sep", "es")).toBe("lo abrió 3 veces, la última 3 sep");
  });
});

describe("leads", () => {
  it("leadClients / archivedLeads follow the prototype", () => {
    const cs = [client(), client({ id: "c2" }), client({ id: "c3", archived: true }), client({ id: "c4", archived: true })];
    const es = [est({ clientId: "c2" }), est({ id: "e2", clientId: "c4" })];
    expect(leadClients(cs, es).map((c) => c.id)).toEqual(["c1"]);
    expect(archivedLeads(cs, es).map((c) => c.id)).toEqual(["c3"]);
  });
  it("a lead waits >= 1 day, snooze hides it", () => {
    expect(run([], [client()])).toHaveLength(0);
    const l = run([], [client({ createdAt: "2026-09-26" })]);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ key: "lead", kind: "lead", clientId: "c1", sort: 3, tpl: "lead", lang: "es" });
    expect(l[0].detail).toBe("3 days, no estimate yet");
    const sn = { ...client({ createdAt: "2026-09-26" }), snooze: { lead: "2026-09-30" } } as Client;
    expect(run([], [sn])).toHaveLength(0);
    const old = { ...client({ createdAt: "2026-09-26" }), snooze: { lead: TODAY } } as Client; // until today = expired
    expect(run([], [old])).toHaveLength(1);
  });
  it("a client with an estimate is not a lead", () => {
    expect(run([est({ status: "Draft" })], [client({ createdAt: "2026-09-01" })])).toHaveLength(0);
  });
});

describe("estimate rules", () => {
  it("chat unread comes first", () => {
    const e = est({ status: "Sent", sentAt: "2026-09-20", chatUnread: 1, chat: [{ from: "client", text: "Can you do Monday?", at: "x" }] });
    const l = run([e]);
    expect(l[0]).toMatchObject({ key: "chat", open: true, sort: 999, detail: "Can you do Monday?" });
  });
  it("no link + sent >= followUpDays => 'follow'; limit comes from settings", () => {
    const e = est({ status: "Sent", sentAt: "2026-09-25" }); // 4 days
    expect(run([e])).toHaveLength(0);
    expect(keys(run([e], [client()], [], { ...s, followUpDays: 4 }))).toEqual(["follow"]);
    const e5 = est({ status: "Sent", sentAt: "2026-09-24" });
    const r = run([e5]);
    expect(keys(r)).toEqual(["follow"]);
    expect(r[0]).toMatchObject({ tpl: "follow", sort: 5, who: "Ana Perez", number: "EST-1001" });
    expect(r[0].detail).toMatch(/^sent 5 days ago, \$/);
  });
  it("link never opened after 2 days => noview; opened => viewed (also when status is Viewed)", () => {
    const e = est({ status: "Sent", sentAt: "2026-09-27", portal: { token: "T" } });
    expect(keys(run([e]))).toEqual(["noview"]);
    expect(keys(run([{ ...e, sentAt: "2026-09-28" }]))).toEqual([]);
    const v = est({ status: "Viewed", sentAt: "2026-09-25", portal: { token: "T" }, portalViews: ["2026-09-26T15:00:00Z", "2026-09-27T15:00:00Z"] });
    const r = run([v]);
    expect(r[0]).toMatchObject({ key: "viewed", sort: 4 + 5, tpl: "viewed" });
    expect(r[0].detail).toMatch(/^opened twice, last /);
  });
  it("signed estimates are not chased", () => {
    const e = est({ status: "Sent", sentAt: "2026-09-01", signature: { name: "A", img: "", date: "", via: "", at: "" } });
    expect(run([e])).toHaveLength(0);
  });
  it("Accepted => collect deposit unless the deposit invoice is paid; payclaim jumps to the top", () => {
    const e = est({ status: "Accepted", startDate: "2026-10-05" });
    const r = run([e]);
    expect(r[0]).toMatchObject({ key: "deposit", sort: 50, tpl: "deposit" });
    expect(r[0].detail).toContain("starts");
    const withInv = run([e], [client()], [inv({ amount: 321 })]);
    expect(withInv[0].detail.startsWith("$321.00")).toBe(true);
    const claim = run([{ ...e, payClaim: { method: "Zelle", at: "x" } }]);
    expect(keys(claim)).toEqual(["payclaim", "deposit"]);
    expect(claim[0]).toMatchObject({ open: true, sort: 900 });
  });
  it("unsigned change orders", () => {
    const e = est({ status: "Deposit Paid", changeOrders: [{ id: "co1", n: 1, desc: "Add pantry", amount: 250, status: "sent" }, { id: "co2", n: 2, amount: 0, status: "sent" }, { id: "co3", n: 3, amount: 90, status: "signed" }] });
    const r = run([e]);
    expect(keys(r)).toEqual(["coco1"]);
    expect(r[0]).toMatchObject({ kind: "co", coId: "co1", sort: 60, title: "Change #1 waiting for signature" });
    expect(r[0].detail).toBe("Add pantry, $250.00");
    expect(run([{ ...e, snooze: { coco1: "2026-10-01" } }])).toHaveLength(0);
  });
  it("balance: Deposit Paid (by invoices) and the job has ended", () => {
    const e = est({ status: "Accepted", startDate: "2026-09-20", days: 5 }); // ended 09-24
    const invs = [inv({ status: "Paid", amount: 500 }), inv({ id: "i2", kind: "balance", amount: 700, number: "INV-2" })];
    const r = run([e], [client()], invs);
    expect(r[0]).toMatchObject({ key: "balance", sort: 55, tpl: "balance" });
    expect(r[0].detail.startsWith("$700.00 · job ended")).toBe(true);
    expect(run([{ ...e, startDate: "2026-09-27" }], [client()], invs)).toHaveLength(0); // still working
  });
  it("review when Paid in Full, warranty >= 330 days after the job and after the review", () => {
    const paid = [inv({ status: "Paid" }), inv({ id: "i2", kind: "balance", status: "Paid" })];
    const e = est({ status: "Paid in Full", startDate: "2026-09-01", days: 2 });
    expect(jobStatus(e, paid)).toBe("Paid in Full");
    const r = run([e], [client()], paid);
    expect(r[0]).toMatchObject({ key: "review", sort: 1, tpl: "review" });
    expect(run([{ ...e, reviewAsked: true }], [client()], paid)).toHaveLength(0);
    const old = { ...e, startDate: "2025-09-01", reviewAsked: true }; // ended 2025-09-02 => 392 days
    expect(run([old], [client()], paid)[0]).toMatchObject({ key: "warranty", sort: 2, tpl: "warranty" });
    expect(run([{ ...old, startDate: "2025-12-01" }], [client()], paid)).toHaveLength(0); // ~302 days: too early
    expect(run([{ ...old, warrantyChecked: true }], [client()], paid)).toHaveLength(0);
    expect(run([{ ...e, snooze: { review: "2026-10-01" } }], [client()], paid)).toHaveLength(0);
  });
  it("sorts by urgency and gives English/Spanish text", () => {
    const es = [est({ status: "Sent", sentAt: "2026-09-10", id: "e1" }), est({ id: "e2", status: "Accepted", number: "EST-2" }), est({ id: "e3", chatUnread: 2, number: "EST-3" })];
    expect(keys(run(es))).toEqual(["chat", "deposit", "follow"]);
    const r = followUps({ estimates: es, clients: [client()], settings: s, now: NOW, lang: "es" });
    expect(r[1].title).toBe("Cobrar el depósito");
  });
});
