import { describe, expect, it } from "vitest";
import { leadSummary, leadToClient, type Lead } from "./leads";

const details = {
  v: 2, types: ["cabinets", "interior"],
  cab: { doors: 20, drawers: 1, countMe: false, island: "yes", style: "two", current: "wood", extras: ["hardware"] },
  intr: { rooms: ["living", "bedrooms"], bedrooms: 3, bathrooms: 0, surfaces: ["walls"], size: "m" },
  tierCab: "premium", when: "asap", date: "2026-10-01", contact: "whatsapp",
};
const lead: Lead = { id: "abc123", name: "Ana", phone: "555", email: "", city: "Miami", address: "1 Main St", service: "Kitchen cabinets", message: " hello ", heard: "Google", lang: "es", at: "2026-09-01T10:00:00.000Z", details };

describe("leadSummary", () => {
  it("returns [] without details", () => { expect(leadSummary(null)).toEqual([]); });
  it("english", () => {
    const s = leadSummary(details, "en");
    expect(s[0]).toBe("20 doors, 1 drawer");
    expect(s).toContain("island"); expect(s).toContain("two-tone"); expect(s).toContain("now: stained wood"); expect(s).toContain("new handles");
    expect(s).toContain("interior: living, 3 bedrooms"); expect(s).toContain("1,500–2,500 ft²");
    expect(s).toContain("cabinet finish: Premium"); expect(s).toContain("when: ASAP (2026-10-01)"); expect(s).toContain("prefers WhatsApp");
  });
  it("spanish", () => {
    const s = leadSummary(details, "es");
    expect(s[0]).toBe("20 puertas, 1 cajón");
    expect(s).toContain("isla"); expect(s).toContain("dos tonos"); expect(s).toContain("interior: sala, 3 habitaciones");
    expect(s).toContain("cuándo: lo antes posible (2026-10-01)");
  });
  it("count-me and exterior", () => {
    expect(leadSummary({ cab: { countMe: true } }, "en")[0]).toBe("cabinets: count them for me");
    expect(leadSummary({ ext: { stories: "two", surfaces: ["stucco"] } }, "es")).toEqual(["exterior 2 pisos: estuco"]);
  });
});

describe("leadToClient", () => {
  it("deterministic id and fields", () => {
    const c = leadToClient(lead, [])!;
    expect(c.id).toBe("c-web-abc123"); expect(c.lead).toBe(true); expect(c.lang).toBe("es");
    expect(c.createdAt).toBe("2026-09-01"); expect(c.web?.id).toBe("abc123");
    expect(c.note).toBe("Kitchen cabinets — Miami — " + leadSummary(details, "en").join(" · ") + " — hello");
    expect(c.source).toBe("Website (Google)"); expect(c.referredBy).toBe("");
  });
  it("source rules", () => {
    expect(leadToClient({ ...lead, heard: "", details: null }, [])!.source).toBe("Website");
    expect(leadToClient({ ...lead, details: { src: "Thumbtack" } }, [])!.source).toBe("Thumbtack");
    expect(leadToClient({ ...lead, details: { src: "Thumbtack", ref: "c-9" } }, [])!.source).toBe("Referral");
  });
  it("referredBy only when that client exists", () => {
    const l = { ...lead, details: { ref: "c-9" } };
    expect(leadToClient(l, [])!.referredBy).toBe("");
    expect(leadToClient(l, [{ id: "c-9" }])!.referredBy).toBe("c-9");
  });
  it("does not duplicate", () => { expect(leadToClient(lead, [{ id: "c-web-abc123" }])).toBeNull(); });
});
