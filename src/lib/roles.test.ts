import { describe, expect, it } from "vitest";
import {
  canAccess, canChangeRole, canInviteRole, canLinkWorker, can, decideInvite, homeFor, isEmail, navFilter, normEmail, redirectFor,
  canRemoveMember, workerScope, type MemberLite,
} from "./roles";

describe("route permissions", () => {
  const owner = "owner", admin = "admin", worker = "worker";
  it("owners and admins open everything", () => {
    for (const r of [owner, admin] as const) for (const p of ["/", "/estimates/abc", "/reports", "/settings", "/team"]) expect(canAccess(r, p)).toBe(true);
  });
  it("workers only get calendar, team and settings", () => {
    expect(canAccess(worker, "/calendar")).toBe(true);
    expect(canAccess(worker, "/team")).toBe(true);
    expect(canAccess(worker, "/settings")).toBe(true);
    expect(canAccess(worker, "/team/")).toBe(true);
    expect(canAccess(worker, "/calendar?d=2026-01-01")).toBe(true);
    for (const p of ["/", "/pipeline", "/estimates", "/estimates/x", "/invoices", "/clients", "/expenses", "/reports", "/invoices/1/doc"]) expect(canAccess(worker, p)).toBe(false);
  });
  it("no prefix confusion and no role = no access", () => {
    expect(canAccess(worker, "/teamwork")).toBe(false);
    expect(canAccess(worker, "/settings-x")).toBe(false);
    expect(canAccess(null, "/calendar")).toBe(false);
    expect(canAccess(undefined, "/")).toBe(false);
  });
  it("redirects to the role's home", () => {
    expect(homeFor("worker")).toBe("/calendar");
    expect(homeFor("owner")).toBe("/");
    expect(redirectFor("worker", "/expenses")).toBe("/calendar");
    expect(redirectFor("worker", "/team")).toBeNull();
    expect(redirectFor("admin", "/expenses")).toBeNull();
  });
  it("filters nav items", () => {
    const items = [{ to: "/" }, { to: "/calendar" }, { to: "/team" }, { to: "/reports" }, { to: "/settings" }];
    expect(navFilter("worker", items).map((i) => i.to)).toEqual(["/calendar", "/team", "/settings"]);
    expect(navFilter("owner", items)).toHaveLength(5);
  });
  it("action matrix", () => {
    expect(can("owner", "billing")).toBe(true);
    expect(can("admin", "billing")).toBe(false);
    expect(can("admin", "members.view")).toBe(true);
    expect(can("worker", "members.view")).toBe(false);
    expect(can("worker", "settings.prefs")).toBe(true);
    expect(can("worker", "settings.business")).toBe(false);
    expect(can(null, "settings.prefs")).toBe(false);
  });
});

describe("invites", () => {
  const base = { invite: { companyId: "c1", role: "worker" }, docEmail: "ana@x.com", userEmail: "Ana@X.com", emailVerified: true, memberOf: [] as string[] };
  it("normalises e-mails", () => {
    expect(normEmail("  Ana@X.COM ")).toBe("ana@x.com");
    expect(normEmail(null)).toBe("");
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
    expect(isEmail("a b@c.com")).toBe(false);
  });
  it("accepts a matching, verified invite", () => expect(decideInvite(base)).toEqual({ kind: "accept" }));
  it("no invite / someone else's invite is ignored", () => {
    expect(decideInvite({ ...base, invite: null })).toEqual({ kind: "none" });
    expect(decideInvite({ ...base, docEmail: "other@x.com" })).toEqual({ kind: "none" });
    expect(decideInvite({ ...base, userEmail: "" })).toEqual({ kind: "none" });
  });
  it("needs a verified e-mail", () => expect(decideInvite({ ...base, emailVerified: false })).toEqual({ kind: "needs-verify" }));
  it("already a member -> just clear it", () => expect(decideInvite({ ...base, memberOf: ["c1", "c2"] })).toEqual({ kind: "already-member" }));
  it("malformed invites are ignored", () => {
    expect(decideInvite({ ...base, invite: { companyId: "c1", role: "god" } })).toEqual({ kind: "invalid" });
    expect(decideInvite({ ...base, invite: { companyId: "", role: "admin" } })).toEqual({ kind: "invalid" });
  });
  it("who may invite whom", () => {
    expect(canInviteRole("owner", "admin")).toBe(true);
    expect(canInviteRole("owner", "owner")).toBe(true);
    expect(canInviteRole("admin", "worker")).toBe(true);
    expect(canInviteRole("admin", "admin")).toBe(false);
    expect(canInviteRole("worker", "worker")).toBe(false);
    expect(canInviteRole(null, "worker")).toBe(false);
  });
});

describe("role changes", () => {
  const m = (uid: string, role: MemberLite["role"]): MemberLite => ({ uid, role });
  const members = [m("o1", "owner"), m("o2", "owner"), m("a1", "admin"), m("w1", "worker")];
  const solo = [m("o1", "owner"), m("w1", "worker")];

  it("owner promotes and demotes freely", () => {
    expect(canChangeRole({ actor: m("o1", "owner"), members, targetUid: "w1", newRole: "admin" })).toEqual({ ok: true });
    expect(canChangeRole({ actor: m("o1", "owner"), members, targetUid: "a1", newRole: "worker" })).toEqual({ ok: true });
    expect(canChangeRole({ actor: m("o1", "owner"), members, targetUid: "w1", newRole: "owner" })).toEqual({ ok: true });
  });
  it("the last owner cannot be demoted, even by themselves", () => {
    expect(canChangeRole({ actor: m("o1", "owner"), members: solo, targetUid: "o1", newRole: "admin" })).toEqual({ ok: false, reason: "last-owner" });
    // with two owners one may step down
    expect(canChangeRole({ actor: m("o2", "owner"), members, targetUid: "o2", newRole: "admin" })).toEqual({ ok: true });
  });
  it("the company creator (primary owner) is untouchable", () => {
    expect(canChangeRole({ actor: m("o2", "owner"), members, targetUid: "o1", newRole: "admin", primaryOwnerUid: "o1" })).toEqual({ ok: false, reason: "primary-owner" });
  });
  it("admins and workers cannot change roles; no-ops are refused", () => {
    expect(canChangeRole({ actor: m("a1", "admin"), members, targetUid: "w1", newRole: "admin" })).toEqual({ ok: false, reason: "admin-workers-only" });
    expect(canChangeRole({ actor: m("a1", "admin"), members, targetUid: "a1", newRole: "owner" })).toEqual({ ok: false, reason: "admin-workers-only" });
    expect(canChangeRole({ actor: m("w1", "worker"), members, targetUid: "w1", newRole: "admin" })).toEqual({ ok: false, reason: "not-allowed" });
    expect(canChangeRole({ actor: m("o1", "owner"), members, targetUid: "w1", newRole: "worker" })).toEqual({ ok: false, reason: "same-role" });
    expect(canChangeRole({ actor: m("o1", "owner"), members, targetUid: "zz", newRole: "worker" })).toEqual({ ok: false, reason: "not-a-member" });
  });
  it("removing members", () => {
    expect(canRemoveMember({ actor: m("o1", "owner"), members, targetUid: "a1" })).toEqual({ ok: true });
    expect(canRemoveMember({ actor: m("o1", "owner"), members, targetUid: "o2" })).toEqual({ ok: true });
    expect(canRemoveMember({ actor: m("o1", "owner"), members: solo, targetUid: "o1" })).toEqual({ ok: false, reason: "last-owner" });
    expect(canRemoveMember({ actor: m("o2", "owner"), members, targetUid: "o1", primaryOwnerUid: "o1" })).toEqual({ ok: false, reason: "primary-owner" });
    expect(canRemoveMember({ actor: m("a1", "admin"), members, targetUid: "w1" })).toEqual({ ok: true });
    expect(canRemoveMember({ actor: m("a1", "admin"), members, targetUid: "o2" })).toEqual({ ok: false, reason: "admin-workers-only" });
    expect(canRemoveMember({ actor: m("a1", "admin"), members, targetUid: "a1" })).toEqual({ ok: true }); // leaving
    expect(canRemoveMember({ actor: m("w1", "worker"), members, targetUid: "a1" })).toEqual({ ok: false, reason: "not-allowed" });
    expect(canRemoveMember({ actor: m("w1", "worker"), members, targetUid: "w1" })).toEqual({ ok: true }); // leaving
  });
  it("linking a worker record", () => {
    expect(canLinkWorker("admin", "worker")).toBe(true);
    expect(canLinkWorker("owner", "admin")).toBe(false);
    expect(canLinkWorker("worker", "worker")).toBe(false);
  });
});

describe("worker data scope", () => {
  it("matches the security rules", () => {
    expect(workerScope("tasks")).toEqual({ field: "workerId" });
    expect(workerScope("hours")).toEqual({ field: "workerId" });
    expect(workerScope("clock")).toEqual({ docId: true });
    expect(workerScope("workers")).toEqual({ docId: true });
    expect(workerScope("expenses")).toBeNull();
    expect(workerScope("estimates")).toBeNull();
  });
});
