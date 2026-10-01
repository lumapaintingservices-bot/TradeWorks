import { describe, expect, it } from "vitest";
import { chatPhotoPath, cleanText, defaultMembers, isUnread, lastOf, latestAt, meKey, msgDays, previewOf, sortChats, unreadCount } from "./teamChat";
import { matchFilter, subscriptionPlan } from "./workerView";

describe("team chat", () => {
  it("who I am", () => {
    expect(meKey("owner", "u1", null)).toBe("u:u1");
    expect(meKey("admin", "u2", "w9")).toBe("u:u2");
    expect(meKey("worker", "u3", "w1")).toBe("w:w1");
    expect(meKey("worker", "u3", "")).toBe("");
  });
  it("text and preview", () => {
    expect(cleanText("  hola \r\n\r\n\r\n\r\n\r\nya llegué  ")).toBe("hola\n\n\nya llegué");
    expect(cleanText("   ")).toBe("");
    expect(cleanText("x".repeat(2500)).length).toBe(2000);
    expect(previewOf("línea 1\n  línea 2")).toBe("línea 1 línea 2");
    expect(lastOf({ by: "w:w1", name: "Carlos", text: "a\nb", at: "2026-09-30T10:00:00Z" })).toEqual({ by: "w:w1", name: "Carlos", text: "a b", at: "2026-09-30T10:00:00Z" });
    expect(lastOf({ by: "w:w1", name: "Carlos", text: "", at: "t", photo: { url: "u", path: "p" } }).text).toBe("📷");
    expect(chatPhotoPath("c1", "e1", "w:w9", "m1")).toBe("companies/c1/jobphotos/w9/m1.jpg");
    expect(chatPhotoPath("c1", "e1", "u:u1", "m1")).toBe("companies/c1/chats/e1/m1.jpg");
  });
  it("unread: someone else's newer message", () => {
    const c = { id: "e1", last: { by: "w:w1", name: "Carlos", text: "hi", at: "2026-09-30T10:00:00Z" } };
    expect(isUnread(c, undefined, "u:u1")).toBe(true);
    expect(isUnread(c, "2026-09-30T10:00:00Z", "u:u1")).toBe(false);
    expect(isUnread(c, "2026-09-30T09:00:00Z", "u:u1")).toBe(true);
    expect(isUnread(c, undefined, "w:w1")).toBe(false); // my own
    expect(isUnread({}, undefined, "u:u1")).toBe(false);
    expect(unreadCount([c, { id: "e2" }], {}, "u:u1")).toBe(1);
  });
  it("list order: open first, newest first", () => {
    const l = sortChats([
      { jobLabel: "A", closed: true, last: { by: "", name: "", text: "", at: "2026-09-30T12:00:00Z" } },
      { jobLabel: "B", last: { by: "", name: "", text: "", at: "2026-09-29T12:00:00Z" } },
      { jobLabel: "C", last: { by: "", name: "", text: "", at: "2026-09-30T08:00:00Z" } },
      { jobLabel: "D" },
    ]);
    expect(l.map((x) => x.jobLabel)).toEqual(["C", "B", "D", "A"]);
  });
  it("default members = workers with tasks on the job", () => {
    expect(defaultMembers([{ estId: "e1", workerId: "w1" }, { estId: "e1", workerId: "w2" }, { estId: "e1", workerId: "w1" }, { estId: "e2", workerId: "w3" }, { estId: "e1", workerId: "" }], "e1")).toEqual(["w1", "w2"]);
  });
  it("messages by day, oldest first", () => {
    const g = msgDays([{ id: "b", at: "2026-09-30T15:00:00" }, { id: "a", at: "2026-09-30T09:00:00" }, { id: "c", at: "2026-09-29T20:00:00" }]);
    expect(g.map((d) => [d.day, d.msgs.map((m) => m.id)])).toEqual([["2026-09-29", ["c"]], ["2026-09-30", ["a", "b"]]]);
    expect(latestAt([{ at: "2026-09-30T09:00:00" }, { at: "2026-09-30T15:00:00" }])).toBe("2026-09-30T15:00:00");
  });
  it("a worker's chats: members array-contains their id; messages: the rules check membership", () => {
    expect(subscriptionPlan("worker", "w1", "jobchats")).toEqual({ kind: "filter", field: "members", value: "w1", op: "array-contains" });
    expect(subscriptionPlan("worker", "w1", "jobchats/e1/msgs")).toEqual({ kind: "all" });
    expect(subscriptionPlan("worker", "", "jobchats/e1/msgs")).toEqual({ kind: "none" });
    expect(matchFilter({ members: ["w1", "w2"] }, { field: "members", value: "w2", op: "array-contains" })).toBe(true);
    expect(matchFilter({ members: ["w1"] }, { field: "members", value: "w3", op: "array-contains" })).toBe(false);
    expect(matchFilter({ workerId: "w1" }, { field: "workerId", value: "w1" })).toBe(true);
  });
});
