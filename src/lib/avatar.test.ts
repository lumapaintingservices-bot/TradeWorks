import { describe, expect, it } from "vitest";
import { AVATAR_TONES, avatarInitials, avatarTone, groupSplit } from "./avatar";

describe("avatar initials", () => {
  it("takes the first and last word", () => {
    expect(avatarInitials("Ana María Ruiz")).toBe("AR");
    expect(avatarInitials("carlos")).toBe("C");
    expect(avatarInitials("  miguel   torres ")).toBe("MT");
    expect(avatarInitials("Álvaro Núñez")).toBe("ÁN");
  });
  it("uses the part before @ for e-mails", () => {
    expect(avatarInitials("sam.demo@example.com")).toBe("SD");
    expect(avatarInitials("luma_painting@gmail.com")).toBe("LP");
  });
  it("skips notes in parentheses and symbols", () => {
    expect(avatarInitials("Ruiz (Kitchen)")).toBe("R");
    expect(avatarInitials("— Ana")).toBe("A");
  });
  it("falls back to ?", () => {
    expect(avatarInitials("")).toBe("?");
    expect(avatarInitials(null)).toBe("?");
    expect(avatarInitials("()")).toBe("?");
  });
});

describe("avatar tone", () => {
  it("is steady and ignores case / spaces", () => {
    expect(avatarTone("Ana Ruiz")).toBe(avatarTone(" ana ruiz "));
    expect(AVATAR_TONES).toContain(avatarTone("Carlos"));
    expect(AVATAR_TONES).toContain(avatarTone(""));
  });
  it("spreads names over the colors", () => {
    const names = ["Ana", "Carlos", "Miguel", "Sam", "Luis", "Rosa", "Pedro", "Juan", "Maria", "Jose", "Elena", "Diego"];
    expect(new Set(names.map(avatarTone)).size).toBeGreaterThan(2);
  });
});

describe("avatar group", () => {
  it("shows all when they fit", () => {
    expect(groupSplit([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], more: 0 });
  });
  it("keeps the last spot for +N", () => {
    expect(groupSplit([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2], more: 3 });
    expect(groupSplit([1, 2], 0)).toEqual({ shown: [], more: 2 });
  });
});
