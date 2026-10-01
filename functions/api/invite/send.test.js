import { describe, expect, it } from "vitest";
import { sendInvite } from "./send.js";

const env = { FIREBASE_SERVICE_ACCOUNT: "{}", RESEND_API_KEY: "re_test", APP_URL: "https://tradeworks-app.pages.dev" };
const req = (body, auth = "Bearer tok") => new Request("https://tradeworks-app.pages.dev/api/invite/send", { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });

function fakeDb(docs) {
  const patches = [];
  return { projectId: "p", patches, async get(path) { return docs[path] ? { id: path.split("/").pop(), data: docs[path] } : null; }, async patch(path, data) { patches.push([path, data]); docs[path] = { ...docs[path], ...data }; } };
}
const baseDocs = () => ({
  "invites/sam@example.com": { companyId: "c1", companyName: "Luma", role: "worker", invitedBy: "own", invitedByName: "Miguel" },
  "invites/boss@example.com": { companyId: "c1", companyName: "Luma", role: "admin", invitedBy: "own" },
  "companies/c1": { name: "Luma Painting", email: "office@luma.example", logoUrl: "https://firebasestorage.googleapis.com/logo.png" },
  "companies/c1/members/own": { role: "owner" },
  "companies/c1/members/wrk": { role: "worker" },
});
const run = async (body, { docs = baseDocs(), uid = "own", now = Date.parse("2026-10-01T12:00:00Z") } = {}) => {
  const sent = [], db = fakeDb(docs);
  const res = await sendInvite({ request: req(body), env }, { db, claims: { sub: uid, email: "miguel@luma.example", name: "Miguel" }, sendMail: async (m) => { sent.push(m); }, now: () => now }).catch((e) => e);
  return { res, sent, db };
};

describe("POST /api/invite/send", () => {
  it("an owner e-mails a worker invitation, in their language, and it is logged", async () => {
    const { res, sent, db } = await run({ email: "Sam@Example.com", lang: "es" });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "sam@example.com", from: '"Luma Painting" <invites@lumapaintingservices.com>', replyTo: "miguel@luma.example" });
    expect(sent[0].subject).toBe("Miguel te invitó a Luma Painting en TradeWorks");
    expect(db.patches[0]).toEqual(["invites/sam@example.com", { emailedAt: "2026-10-01T12:00:00.000Z", emailCount: 1 }]);
  });
  it("a worker cannot send invitations", async () => {
    const { res, sent } = await run({ email: "sam@example.com" }, { uid: "wrk" });
    expect(res.status).toBe(403);
    expect(sent).toHaveLength(0);
  });
  it("someone outside the company cannot either", async () => {
    expect((await run({ email: "sam@example.com" }, { uid: "stranger" })).res.status).toBe(403);
  });
  it("an admin invitation needs the platform admin", async () => {
    expect((await run({ email: "boss@example.com" })).res.status).toBe(403);
    const docs = { ...baseDocs(), "admins/own": { note: "x" } };
    expect((await run({ email: "boss@example.com" }, { docs })).res.status).toBe(200);
  });
  it("no invitation, a bad address or too soon again are refused", async () => {
    expect((await run({ email: "nobody@example.com" })).res.status).toBe(404);
    expect((await run({ email: "not-an-email" })).res.status).toBe(400);
    const docs = baseDocs(); docs["invites/sam@example.com"].emailedAt = "2026-10-01T11:59:40Z"; docs["invites/sam@example.com"].emailCount = 1;
    expect((await run({ email: "sam@example.com" }, { docs })).res.status).toBe(429);
  });
  it("is off until Resend is configured", async () => {
    const res = await sendInvite({ request: req({ email: "sam@example.com" }), env: { FIREBASE_SERVICE_ACCOUNT: "{}" } }).catch((e) => e);
    expect(res.status).toBe(503);
  });
});
