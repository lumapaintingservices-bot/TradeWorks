import { describe, expect, it } from "vitest";
import { formatPhone, phoneOnType } from "./phone";

describe("phone formatting", () => {
  it("formats US numbers progressively", () => {
    expect(formatPhone("555")).toBe("555");
    expect(formatPhone("5550")).toBe("(555) 0");
    expect(formatPhone("555010")).toBe("(555) 010");
    expect(formatPhone("5550102")).toBe("(555) 010-2");
    expect(formatPhone("5550102030")).toBe("(555) 010-2030");
    expect(formatPhone("555.010.2030")).toBe("(555) 010-2030");
  });
  it("drops a leading US country code", () => {
    expect(formatPhone("+1 555 010 2030")).toBe("(555) 010-2030");
    expect(formatPhone("15550102030")).toBe("(555) 010-2030");
  });
  it("leaves other numbers alone", () => {
    expect(formatPhone("+52 55 1234 5678")).toBe("+52 55 1234 5678");
    expect(formatPhone("555-0102 ext 4")).toBe("555-0102 ext 4");
    expect(formatPhone("123456789012")).toBe("123456789012");
    expect(formatPhone("  ")).toBe("");
  });
  it("formats only while typing at the end", () => {
    expect(phoneOnType("(555) 010-203", "(555) 010-2030", true)).toBe("(555) 010-2030");
    expect(phoneOnType("(555) 0", "(555) 01", true)).toBe("(555) 01");
    expect(phoneOnType("(555) 010-2030", "(555) 010-203", true)).toBe("(555) 010-203"); // backspace: as typed
    expect(phoneOnType("(555) 010-", "(555) 010", true)).toBe("(555) 010");             // deleting the dash works
    expect(phoneOnType("(555) 010-2030", "(555) 0109-2030", false)).toBe("(555) 0109-2030"); // edit in the middle
  });
});
