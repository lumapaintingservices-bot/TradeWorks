import { describe, expect, it } from "vitest";
import { blankEstimate } from "../../../src/lib/estimate";
import { defaultSettings } from "../../../src/lib/settings";
import { fromHeader, runAll, type Db, type Doc, type Mail } from "./run";
import { resendSender } from "./index";

const NOW = new Date(2026, 8, 29, 10, 0, 0);
const env = { APP_URL: "https://app.test/", MAIL_FROM_ADDRESS: "avisos@luma.test" };

/** In-memory Firestore with the same calls the worker uses. */
function memDb(seed: Record<string, Record<string, any>>) {
  const docs = new Map<string, Record<string, any>>(Object.entries(seed).map(([k, v]) => [k, structuredClone(v)]));
  const db: Db & { docs: typeof docs } = {
    docs,
    async list(path) { const pre = path + "/"; return [...docs].filter(([k]) => k.startsWith(pre) && !k.slice(pre.length).includes("/")).map(([k, v]) => ({ id: k.slice(pre.length), data: structuredClone(v) }) as Doc); },
    async get(path) { const v = docs.get(path); return v ? { id: path.split("/").pop()!, data: structuredClone(v) } : null; },
    async create(path, data) { if (docs.has(path)) return false; docs.set(path, structuredClone(data)); return true; },
    async set(path, data) { docs.set(path, { ...(docs.get(path) || {}), ...structuredClone(data) }); },
    async patch(path, data) { if (!docs.has(path)) throw new Error("missing " + path); docs.set(path, { ...docs.get(path)!, ...structuredClone(data) }); },
  };
  return db;
}

const est = { ...blankEstimate(defaultSettings(), "EST-1001"), id: "e1", clientId: "c1", clientName: "Ana Perez", email: "ana@x.com", doors: 10, date: "2026-09-01", status: "Accepted", docLang: "es" };
const seed = () => ({
  "companies/A": { name: "Luma \"Paint\" <x>", email: "luma@x.com", phone: "786" },
  "companies/A/settings/main": { payZelle: "pay@luma.com", autoEmail: { on: true } },
  "companies/A/estimates/e1": est,
  "companies/A/clients/c1": { name: "Ana Perez", email: "ana@x.com", lang: "es", createdAt: "2026-09-01" },
  "companies/A/invoices/i1": { number: "INV-1", estId: "e1", kind: "deposit", amount: 400, date: "2026-09-29", status: "Unpaid" },
  "companies/B": { name: "Off Co" },
  "companies/B/settings/main": { autoEmail: { on: false } },
  "companies/B/estimates/e1": est,
  "companies/B/invoices/i1": { number: "INV-1", estId: "e1", kind: "deposit", amount: 400, date: "2026-09-29", status: "Unpaid" },
});

describe("reminders worker run", () => {
  it("sends each reminder once, logs it, creates the missing payment link, skips companies that are off", async () => {
    const db = memDb(seed()), sent: Mail[] = [];
    const r = await runAll(db, async (m) => { sent.push(m); }, env, { now: NOW });
    expect(r.find((x) => x.company === "B")?.skipped).toBe("off");
    expect(sent).toHaveLength(1);
    const m = sent[0];
    expect(m.to).toBe("ana@x.com");
    expect(m.replyTo).toBe("luma@x.com");
    expect(m.from).toBe("\"Luma Paint x\" <avisos@luma.test>");
    expect(m.subject).toContain("EST-1001");
    // payment link created, stored on the invoice and used in the Spanish text
    const token = db.docs.get("companies/A/invoices/i1")!.pay.token;
    expect(token).toMatch(/^[A-Za-z0-9]{24}$/);
    expect(db.docs.get(`paylink/${token}`)!.owner).toBe("A");
    expect(JSON.parse(db.docs.get(`paylink/${token}`)!.data).inv.amount).toBe(400);
    expect(m.text).toContain(`Puede pagar aquí: https://app.test/pay/${token}`);
    expect(db.docs.get("companies/A/autoemails/e1:deposit")).toMatchObject({ status: "sent", to: "ana@x.com", item: "e1:deposit" });
    // next day: nothing new
    const again: Mail[] = [];
    await runAll(db, async (x) => { again.push(x); }, env, { now: NOW });
    expect(again).toHaveLength(0);
  });
  it("dry run sends and writes nothing", async () => {
    const db = memDb(seed()), sent: Mail[] = [];
    const r = await runAll(db, async (m) => { sent.push(m); }, env, { now: NOW, dry: true, only: "A" });
    expect(r).toHaveLength(1);
    expect(r[0].emails).toEqual([expect.objectContaining({ to: "ana@x.com", status: "dry-run" })]);
    expect(sent).toHaveLength(0);
    expect([...db.docs.keys()].some((k) => k.includes("autoemails") || k.startsWith("paylink/"))).toBe(false);
  });
  it("a failed send is logged as failed and never retried automatically", async () => {
    const db = memDb(seed());
    const r = await runAll(db, async () => { throw new Error("Resend 422"); }, env, { now: NOW, only: "A" });
    expect(r[0].failed).toBe(1);
    expect(db.docs.get("companies/A/autoemails/e1:deposit")).toMatchObject({ status: "failed", error: "Resend 422" });
    const sent: Mail[] = [];
    await runAll(db, async (m) => { sent.push(m); }, env, { now: NOW, only: "A" });
    expect(sent).toHaveLength(0);
  });
  it("one broken company never stops the others", async () => {
    const db = memDb(seed());
    const orig = db.get.bind(db);
    db.get = async (p) => { if (p === "companies/B/settings/main") throw new Error("boom"); return orig(p); };
    const r = await runAll(db, async () => {}, env, { now: NOW });
    expect(r.find((x) => x.company === "B")?.skipped).toBe("error");
    expect(r.find((x) => x.company === "A")?.sent).toBe(1);
  });
  it("expired plans are skipped only when billing is enforced", async () => {
    const s = seed();
    s["companies/A"] = { ...s["companies/A"], plan: "trial", trialEndsAt: "2026-01-01T00:00:00Z" } as never;
    const db = memDb(s);
    const r = await runAll(db, async () => {}, { ...env, ENFORCE_BILLING: "1" }, { now: NOW, only: "A" });
    expect(r[0].skipped).toBe("plan expired");
    const r2 = await runAll(memDb(s), async () => {}, env, { now: NOW, only: "A" });
    expect(r2[0].sent).toBe(1);
  });
});

describe("helpers", () => {
  it("from header never breaks", () => { expect(fromHeader("A\r\nBcc: x", "a@b.c")).toBe("\"ABcc: x\" <a@b.c>"); });
  it("Resend request", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
    await resendSender("re_key", fake)({ from: "\"L\" <a@b.c>", to: "x@y.z", replyTo: "r@y.z", subject: "S", text: "T" });
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer re_key");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ from: "\"L\" <a@b.c>", to: ["x@y.z"], subject: "S", text: "T", reply_to: "r@y.z" });
    const bad = (async () => new Response("nope", { status: 422 })) as unknown as typeof fetch;
    await expect(resendSender("k", bad)({ from: "a", to: "b", subject: "s", text: "t" })).rejects.toThrow("Resend 422");
  });
});
