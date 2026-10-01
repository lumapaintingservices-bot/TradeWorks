import { describe, expect, it } from "vitest";
import { fromHeader, inviteEmail, isEmail, MAX_SENDS, normEmail, sendBlock } from "./inviteMail.js";

const base = { to: "sam@example.com", companyName: "Luma Painting", inviterName: "Miguel Torres", role: "worker", appUrl: "https://tradeworks-app.pages.dev" };

describe("invitation e-mail", () => {
  it("says who invites to what, with a sign-up link that keeps the e-mail", () => {
    const m = inviteEmail({ ...base, lang: "en" });
    expect(m.subject).toBe("Miguel Torres invited you to Luma Painting on TradeWorks");
    expect(m.text).toContain("https://tradeworks-app.pages.dev/signup?email=sam%40example.com");
    expect(m.html).toContain("Create my account");
    expect(m.html).toContain("as a worker");
  });
  it("speaks Spanish when the inviter does", () => {
    const m = inviteEmail({ ...base, lang: "es", role: "owner" });
    expect(m.subject).toBe("Miguel Torres te invitó a Luma Painting en TradeWorks");
    expect(m.html).toContain("Crear mi cuenta");
    expect(m.text).toContain("como dueño");
  });
  it("escapes names and only shows https logos", () => {
    const m = inviteEmail({ ...base, lang: "en", companyName: `<script>alert(1)</script>`, logoUrl: "javascript:alert(1)" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("javascript:");
    expect(inviteEmail({ ...base, lang: "en", logoUrl: "https://firebasestorage.googleapis.com/x.png" }).html).toContain('<img src="https://firebasestorage.googleapis.com/x.png"');
    expect(inviteEmail({ ...base, lang: "en", logoUrl: "data:image/png;base64,AAA" }).html).not.toContain("<img");
  });
  it("falls back to the company when the inviter has no name", () => {
    expect(inviteEmail({ ...base, inviterName: "", lang: "en" }).subject).toBe("Luma Painting invited you to Luma Painting on TradeWorks");
  });
});

describe("sending rules", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  it("one a minute, five in all", () => {
    expect(sendBlock({}, now)).toBeNull();
    expect(sendBlock({ emailedAt: "2026-10-01T11:59:30Z", emailCount: 1 }, now)).toBe("too-soon");
    expect(sendBlock({ emailedAt: "2026-10-01T11:58:00Z", emailCount: 1 }, now)).toBeNull();
    expect(sendBlock({ emailedAt: "2026-10-01T10:00:00Z", emailCount: MAX_SENDS }, now)).toBe("too-many");
  });
  it("checks addresses and headers", () => {
    expect(isEmail("sam@example.com")).toBe(true);
    expect(isEmail("nope")).toBe(false);
    expect(normEmail("  Sam@Example.COM ")).toBe("sam@example.com");
    expect(fromHeader('Luma "Paint" <x>\r\nBcc: a@b.c', "invites@x.com")).toBe('"Luma Paint xBcc: a@b.c" <invites@x.com>');
  });
});
