import { describe, expect, it } from "vitest";
import { fmtMonth, fmtPicked, inRange, isISODate, monthGrid, shiftMonth, weekdayShort } from "./datepick";

describe("date picker helpers", () => {
  it("knows a real date", () => {
    expect(isISODate("2026-10-01")).toBe(true);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("")).toBe(false);
    expect(isISODate(undefined)).toBe(false);
  });
  it("moves months across years", () => {
    expect(shiftMonth("2026-10", 1)).toBe("2026-11");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-03", -15)).toBe("2024-12");
  });
  it("shows 6 weeks starting on the Sunday before the 1st", () => {
    const g = monthGrid("2026-10"); // Oct 1, 2026 is a Thursday
    expect(g).toHaveLength(42);
    expect(g[0]).toBe("2026-09-27");
    expect(g[4]).toBe("2026-10-01");
    expect(g[41]).toBe("2026-11-07");
    expect(monthGrid("2026-02")[0]).toBe("2026-02-01"); // Feb 1, 2026 is a Sunday
  });
  it("respects min and max", () => {
    expect(inRange("2026-10-01", "2026-10-01")).toBe(true);
    expect(inRange("2026-09-30", "2026-10-01")).toBe(false);
    expect(inRange("2026-10-02", undefined, "2026-10-01")).toBe(false);
    expect(inRange("2026-10-01")).toBe(true);
  });
  it("writes dates for people", () => {
    expect(fmtPicked("2026-10-01", "en")).toBe("Thu, Oct 1, 2026");
    expect(fmtPicked("2026-10-01", "es")).toMatch(/1.*oct.*2026/);
    expect(fmtMonth("2026-10", "en")).toBe("October 2026");
    expect(fmtMonth("2026-10", "es")).toMatch(/octubre/);
    expect(weekdayShort("en")).toEqual(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);
  });
});
