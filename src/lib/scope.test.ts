import { describe, expect, it } from "vitest";
import { joinBrokenLines, nl2list } from "./scope";

describe("a line break in the middle of a sentence does not make a new bullet", () => {
  const owner = [
    "Interior Painting Areas included primary bedroom, two additional bedrooms ,two bathrooms, all walk-in closets, hallway, living room",
    "dining area, kitchen and laundry room .",
    "All areas are on a standard 8 ft ceiling height.",
    "Clean cut lines at ceilings, trim and door frames, Cleanup and removal of all debris and masking at the end of",
    "each day and at the end of the project.",
    "Final walkthrough with you to confirm everything is complete.",
  ].join("\n");
  it("joins the owner's broken lines", () => {
    expect(nl2list(owner)).toEqual([
      "Interior Painting Areas included primary bedroom, two additional bedrooms ,two bathrooms, all walk-in closets, hallway, living room dining area, kitchen and laundry room.",
      "All areas are on a standard 8 ft ceiling height.",
      "Clean cut lines at ceilings, trim and door frames, Cleanup and removal of all debris and masking at the end of each day and at the end of the project.",
      "Final walkthrough with you to confirm everything is complete.",
    ]);
  });
  it("keeps separate lines that end a sentence, have their own bullet mark or follow a heading", () => {
    expect(joinBrokenLines("Sand all doors.\nspray two coats")).toEqual(["Sand all doors.", "spray two coats"]);
    expect(joinBrokenLines("Sand all doors\n- spray two coats")).toEqual(["Sand all doors", "spray two coats"]);
    expect(joinBrokenLines("Day 1 — Prep\nmask everything\nSand")).toEqual(["Day 1 — Prep", "mask everything", "Sand"]);
  });
  it("leaves alone someone who writes every bullet in lowercase", () => {
    expect(joinBrokenLines("mask everything\nsand doors\nspray")).toEqual(["mask everything", "sand doors", "spray"]);
  });
});
