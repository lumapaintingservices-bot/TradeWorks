import { describe, expect, it } from "vitest";
import { isTrustedRedirect, mailtoHref, safeImgSrc, safeUrl } from "./safeUrl";

describe("safeUrl", () => {
  it("keeps normal web links and adds https to bare domains", () => {
    expect(safeUrl("https://lumapainting.com/work?x=1")).toBe("https://lumapainting.com/work?x=1");
    expect(safeUrl("http://example.org")).toBe("http://example.org/");
    expect(safeUrl("www.lumapainting.com")).toBe("https://www.lumapainting.com/");
    expect(safeUrl("  instagram.com/luma.paint  ")).toBe("https://instagram.com/luma.paint");
    expect(safeUrl("//example.com/a")).toBe("https://example.com/a");
    expect(safeUrl("localhost:3000/x")).toBe("https://localhost:3000/x");
  });
  it("blocks script-capable and unknown schemes, however they are disguised", () => {
    for (const bad of [
      "javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\nscript:alert(1)", "java\tscript:alert(1)", "\u0000javascript:alert(1)",
      "jav&#x61;script:alert(1)", "data:text/html,<script>alert(1)</script>", "data:text/html;base64,PHNjcmlwdD4=", "vbscript:msgbox(1)", "file:///etc/passwd",
      "blob:https://x.com/1", "ftp://example.com", "\\\\evil.com", "/relative/path", "javascript://%0aalert(1)", "​javascript:alert(1)",
    ]) expect(safeUrl(bad), bad).toBe("");
  });
  it("mailto / tel only when asked for", () => {
    expect(safeUrl("mailto:a@b.com")).toBe("");
    expect(safeUrl("tel:+15551234567")).toBe("");
    expect(safeUrl("mailto:a@b.com", { contact: true })).toBe("mailto:a@b.com");
    expect(safeUrl("tel:+15551234567", { contact: true })).toBe("tel:+15551234567");
    expect(safeUrl("javascript:alert(1)", { contact: true })).toBe("");
  });
  it("rejects empty, junk and huge input", () => {
    for (const v of ["", "   ", null, undefined, "http://", "not a url", "x".repeat(2100)]) expect(safeUrl(v), String(v)).toBe("");
  });
});

describe("safeImgSrc", () => {
  it("allows https links, blob and base64 raster images only", () => {
    expect(safeImgSrc("https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media&token=1")).toContain("firebasestorage.googleapis.com");
    expect(safeImgSrc("data:image/jpeg;base64,/9j/4AAQSkZJRg==")).toBe("data:image/jpeg;base64,/9j/4AAQSkZJRg==");
    expect(safeImgSrc("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(safeImgSrc("blob:http://localhost:5300/abc")).toContain("blob:");
  });
  it("refuses svg, html, javascript and empty values", () => {
    for (const bad of ["data:image/svg+xml;base64,PHN2Zz4=", "data:image/svg+xml,<svg onload=alert(1)>", "data:text/html,<b>", "javascript:alert(1)", "", null, "ftp://x.com/a.jpg", "data:image/jpeg;base64,AAA\"onerror=\"alert(1)"])
      expect(safeImgSrc(bad), String(bad)).toBe("");
  });
});

describe("mailtoHref", () => {
  it("encodes the address and refuses anything that is not one address", () => {
    expect(mailtoHref("ana@x.com")).toBe("mailto:ana%40x.com");
    expect(mailtoHref("ana@x.com", "subject=Hi")).toBe("mailto:ana%40x.com?subject=Hi");
    for (const bad of ["ana@x.com?bcc=evil@y.com", "a@b.com,c@d.com", "javascript:alert(1)", "", "no-at-sign", "a b@c.com"]) expect(mailtoHref(bad), bad).toBe("");
  });
});

describe("isTrustedRedirect", () => {
  const app = "https://app.tradeworks.example";
  it("accepts Stripe hosts and the app itself", () => {
    expect(isTrustedRedirect("https://checkout.stripe.com/c/pay/cs_test_1", app)).toBe(true);
    expect(isTrustedRedirect("https://billing.stripe.com/p/session/x", app)).toBe(true);
    expect(isTrustedRedirect(app + "/settings?section=billing", app)).toBe(true);
  });
  it("rejects look-alikes, plain http, javascript and other hosts", () => {
    for (const bad of ["https://checkout.stripe.com.evil.com/x", "https://evilstripe.com/x", "https://stripe.com.evil.io", "http://checkout.stripe.com/x", "javascript:alert(1)", "https://evil.com/?u=https://checkout.stripe.com", "//evil.com", "", "not a url"])
      expect(isTrustedRedirect(bad, app), bad).toBe(false);
  });
});
