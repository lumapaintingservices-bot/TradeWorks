import { describe, expect, it } from "vitest";
import { blankEstimate } from "../../../src/lib/estimate.ts";
import { portalSnapshot } from "../../../src/lib/portal.ts";
import { defaultSettings } from "../../../src/lib/settings.ts";
import { portalSign } from "./sign.js";

const s = defaultSettings();
const brand = { name: "Luma Painting", phone: "5125550100", email: "office@luma.example", website: "", area: "", logoUrl: "", brandColor: "#EF6A2C", address: "1 Main St, Austin TX" };
const est = (o = {}) => ({
  ...blankEstimate(s, "EST-1001"), clientName: "Ana Ruiz", email: "Ana@Client.example", doors: 10, status: "Sent",
  upgrades: [{ id: "u1", desc: "Crown molding", descEs: "Moldura", qty: 1, rate: 200 }],
  changeOrders: [{ id: "co-1", n: 1, desc: "Extra wall", descEs: "Pared extra", amount: 150, status: "sent" }, { id: "co-2", n: 2, desc: "Draft", amount: 9, status: "draft" }],
  ...o,
});
const TOKEN = "AbCdEfGhJkMnPqRsTuVwXyZ2";
const IMG = "data:image/png;base64," + "A".repeat(80);
const env = { FIREBASE_SERVICE_ACCOUNT: "{}", RESEND_API_KEY: "re_test", APP_URL: "https://tradeworks-app.pages.dev" };

function fakeDb(portal, { changeOnce = false } = {}) {
  const docs = { [`portal/${TOKEN}`]: portal }, writes = [];
  let version = 1, bumped = false;
  const set = (obj, dotted, v) => { const ks = dotted.split("."); let o = obj; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] = o[ks[i]] || {}; o[ks[ks.length - 1]] = v; };
  return {
    docs, writes, projectId: "p",
    async get(path) { const d = docs[path]; return d ? { id: path.split("/").pop(), data: JSON.parse(JSON.stringify(d)), updateTime: "v" + version } : null; },
    async create(path, data) { if (docs[path]) return false; docs[path] = data; writes.push(["create", path]); return true; },
    async update(path, fields, { updateTime } = {}) {
      if (changeOnce && !bumped) { bumped = true; version++; } // somebody else wrote the link between our read and our write
      if (updateTime && updateTime !== "v" + version) return false;
      for (const [k, v] of Object.entries(fields)) set(docs[path], k, v);
      version++; writes.push(["update", path, Object.keys(fields)]); return true;
    },
    async remove(path) { delete docs[path]; writes.push(["remove", path]); },
    async patch(path, data) { Object.assign(docs[path], data); writes.push(["patch", path]); },
  };
}
const portalDoc = (e = est(), client = {}) => ({ owner: "c1", estId: e.id, number: e.number, data: JSON.stringify(portalSnapshot(e, s, brand)), client });
const req = (body, headers = {}) => new Request("https://tradeworks-app.pages.dev/api/portal/sign", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7", "User-Agent": "Mozilla/5.0 (iPhone)", ...headers }, body: JSON.stringify({ token: TOKEN, ...body }) });
const run = async (body, { db = fakeDb(portalDoc()), now = Date.parse("2026-10-01T19:22:00Z"), envOver = env } = {}) => {
  const sent = [];
  const res = await portalSign({ request: req(body), env: envOver }, { db, now: () => now, sendMail: async (m) => { sent.push(m); } }).catch((e) => e);
  return { res, sent, db, out: res.status === 200 ? await res.json() : null };
};

describe("POST /api/portal/sign (the estimate)", () => {
  it("signs with the server's time, keeps the exact copy (IP, device, fingerprint) and e-mails it to the client", async () => {
    const { res, out, db, sent } = await run({ kind: "est", name: "  Ana   Ruiz ", img: IMG, total: 1000, picks: { u1: true, zz: true }, lang: "es", tz: "America/Chicago" });
    expect(res.status).toBe(200);
    expect(out).toMatchObject({ ok: true, at: "2026-10-01T19:22:00.000Z", copy: "est-1790882520000", emailed: true });
    const p = db.docs[`portal/${TOKEN}`];
    expect(p.client.sign).toEqual({ name: "Ana Ruiz", img: IMG, at: "2026-10-01T19:22:00.000Z", server: true, copy: out.copy, total: 1000 });
    expect(p.client.picks).toEqual({ u1: true });                         // only options the client may pick
    const copy = db.docs[`portal/${TOKEN}/signed/${out.copy}`];
    expect(copy).toMatchObject({ kind: "est", name: "Ana Ruiz", amount: 1000, ip: "203.0.113.7", ua: "Mozilla/5.0 (iPhone)", tz: "America/Chicago", number: "EST-1001", owner: "c1", emailedTo: "ana@client.example" });
    expect(copy.data).toBe(p.data);                                     // the document exactly as it was published
    expect(copy.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sent[0]).toMatchObject({ to: "ana@client.example", from: '"Luma Painting" <documents@lumapaintingservices.com>', replyTo: "office@luma.example" });
    expect(sent[0].subject).toBe("Su presupuesto firmado EST-1001 — Luma Painting");
    expect(sent[0].html).toContain(`/p/${TOKEN}/signed/${out.copy}`);
    expect(sent[0].text).toContain("Moldura");
    expect(sent[0].text).toContain("1 Main St, Austin TX");
    expect(sent[0].text).toMatch(/1 de octubre de 2026.*2:22/);         // the signer's time zone (Chicago: 2:22 PM)
  });
  it("can never be signed twice, or after the owner signed", async () => {
    const db = fakeDb(portalDoc(est(), { sign: { name: "X", img: IMG, at: "t", total: 800 } }));
    expect((await run({ kind: "est", name: "Ana", img: IMG, total: 800 }, { db })).res.status).toBe(409);
    const owner = fakeDb(portalDoc(est({ signature: { name: "Ana", img: "", date: "2026-10-01", via: "app", at: "" } })));
    expect((await run({ kind: "est", name: "Ana", img: IMG, total: 800 }, { db: owner })).res.status).toBe(409);
  });
  it("refuses a total that is not what the estimate says with those picks", async () => {
    const { res, db } = await run({ kind: "est", name: "Ana", img: IMG, total: 1, picks: {} });
    expect(res.status).toBe(409);
    expect(db.docs[`portal/${TOKEN}`].client.sign).toBeUndefined();
  });
  it("needs a name, a real drawing and a real link", async () => {
    expect((await run({ kind: "est", name: " ", img: IMG, total: 800 })).res.status).toBe(400);
    expect((await run({ kind: "est", name: "Ana", img: "data:image/svg+xml;base64,AAAA", total: 800 })).res.status).toBe(400);
    expect((await run({ kind: "est", name: "Ana", img: IMG, total: 800, token: "../x" })).res.status).toBe(400);
    expect((await run({ kind: "est", name: "Ana", img: IMG, total: 800 }, { db: fakeDb(null) })).res.status).toBe(404);
  });
  it("if the link changed between reading and writing, it looks again (and leaves no stray copy)", async () => {
    const db = fakeDb(portalDoc(), { changeOnce: true });
    const { res, out } = await run({ kind: "est", name: "Ana", img: IMG, total: 800 }, { db });
    expect(res.status).toBe(200);
    expect(db.writes.filter((w) => w[0] === "remove")).toHaveLength(1);
    expect(Object.keys(db.docs).filter((k) => k.includes("/signed/"))).toEqual([`portal/${TOKEN}/signed/${out.copy}`]);
  });
  it("still signs when e-mail is not set up or the estimate has no e-mail", async () => {
    const a = await run({ kind: "est", name: "Ana", img: IMG, total: 800 }, { envOver: { FIREBASE_SERVICE_ACCOUNT: "{}" } });
    expect(a.out).toMatchObject({ ok: true, emailed: false });
    expect(a.sent).toHaveLength(0);
    const b = await run({ kind: "est", name: "Ana", img: IMG, total: 800 }, { db: fakeDb(portalDoc(est({ email: "" }))) });
    expect(b.out).toMatchObject({ ok: true, emailed: false });
  });
  it("is off until the server key is set", async () => {
    expect((await run({ kind: "est", name: "Ana", img: IMG, total: 800 }, { envOver: {} })).res.status).toBe(503);
  });
});

describe("POST /api/portal/sign (a change order)", () => {
  it("signs an open change order once, with its amount", async () => {
    const { res, out, db, sent } = await run({ kind: "co", coId: "co-1", name: "Ana Ruiz", img: IMG, lang: "en" });
    expect(res.status).toBe(200);
    expect(out.copy).toBe("co-co-1-1790882520000");
    expect(db.docs[`portal/${TOKEN}`].client.coSign["co-1"]).toMatchObject({ name: "Ana Ruiz", server: true, copy: out.copy });
    expect(db.docs[`portal/${TOKEN}/signed/${out.copy}`]).toMatchObject({ kind: "co", coId: "co-1", coN: 1, amount: 150 });
    expect(sent[0].subject).toBe("Your signed change order #1 (EST-1001) — Luma Painting");
    expect((await run({ kind: "co", coId: "co-1", name: "Ana", img: IMG }, { db })).res.status).toBe(409);
  });
  it("drafts and unknown change orders cannot be signed", async () => {
    expect((await run({ kind: "co", coId: "co-2", name: "Ana", img: IMG })).res.status).toBe(409);
    expect((await run({ kind: "co", coId: "nope", name: "Ana", img: IMG })).res.status).toBe(409);
  });
});
