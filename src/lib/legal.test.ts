import { describe, expect, it } from "vitest";
import { clientPrivacy, privacyPath } from "./legal";

describe("client privacy policy", () => {
  const biz = { name: "Luma Painting Services LLC", email: "hello@luma.example", phone: "(512) 555-0100", address: "1 Main St, Austin, TX" };
  it("same sections in English and Spanish, with the company's contact details", () => {
    const en = clientPrivacy(biz, "en"), es = clientPrivacy(biz, "es");
    expect(en.sections.map((s) => s.id)).toEqual(es.sections.map((s) => s.id));
    const contact = en.sections.find((s) => s.id === "contact")!;
    expect(contact.blocks[1].list).toEqual([biz.name, biz.address, biz.email, biz.phone]);
    expect(en.sub).toContain(biz.name);
    expect(es.title).toBe("Política de privacidad");
  });
  it("says what the app really does: signature records, Stripe, the tools it runs on, no selling", () => {
    const txt = JSON.stringify(clientPrivacy(biz, "en"));
    for (const w of ["IP address", "Stripe", "Resend", "OpenStreetMap", "Cloudflare", "Firebase", "TradeWorks", "do not sell", "electronically", "permission"]) expect(txt).toContain(w);
  });
  it("works without company details, and builds the link", () => {
    expect(clientPrivacy({}, "es").sub).toContain("Nuestra empresa");
    expect(privacyPath("co1")).toBe("/privacy/co1");
    expect(privacyPath("co1", "es")).toBe("/privacy/co1?lang=es");
  });
});
