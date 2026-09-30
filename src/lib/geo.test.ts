import { describe, expect, it } from "vitest";
import { blankEstimate } from "./estimate";
import { distMi, fmtMi, geoQuery, isLoc, mapJobs, needsGeo, shouldPing, siteOf, toLoc, whereIs, type Loc, type Site } from "./geo";
import { defaultSettings } from "./settings";
import type { Estimate } from "./types";

const at = "2026-09-30T14:00:00.000Z";
const loc = (lat: number, lng: number, acc = 10): Loc => ({ lat, lng, acc, at });
// Miami: a job and two worker positions
const job: Site = { id: "e1", label: "Ana Ruiz", address: "1 Main St, Miami FL", lat: 25.7617, lng: -80.1918 };
const far: Site = { id: "e2", label: "Bo Lee", address: "2 Ocean Dr, Miami Beach FL", lat: 25.7907, lng: -80.13 };
const est = (o: Partial<Estimate>): Estimate => ({ ...blankEstimate(defaultSettings(), "EST-1"), id: "e", address: "1 Main St", status: "Accepted", startDate: "2026-09-30", days: 1, ...o });

describe("distances", () => {
  it("haversine in miles and short text", () => {
    expect(distMi(job, far)).toBeGreaterThan(3.5);
    expect(distMi(job, far)).toBeLessThan(4.5);
    expect(distMi(job, job)).toBe(0);
    expect(fmtMi(0.02)).toBe("110 ft");
    expect(fmtMi(0.44)).toBe("0.4 mi");
    expect(fmtMi(23.6)).toBe("24 mi");
  });
  it("positions are rounded and checked", () => {
    expect(toLoc({ latitude: 25.761712345, longitude: -80.191812345, accuracy: 12.7 }, at)).toEqual({ lat: 25.76171, lng: -80.19181, acc: 13, at });
    expect(isLoc(loc(25, -80))).toBe(true);
    expect(isLoc({ lat: 95, lng: 0 })).toBe(false);
    expect(isLoc(null)).toBe(false);
  });
});

describe("whereIs", () => {
  it("on site within a quarter mile, else how far from the nearest job", () => {
    expect(whereIs(loc(25.7625, -80.192), [job, far])).toMatchObject({ kind: "on", site: { id: "e1" } });
    const w = whereIs(loc(25.79, -80.14), [job, far]);
    expect(w).toMatchObject({ kind: "away", site: { id: "e2" } });
    expect(w.kind !== "none" && w.mi).toBeGreaterThan(0.25);
  });
  it("a poor GPS reading widens the circle a little (capped)", () => {
    const p = { lat: 25.7617 + 0.0058, lng: -80.1918 }; // ~0.4 mi north
    expect(whereIs({ ...p, acc: 10, at }, [job]).kind).toBe("away");
    expect(whereIs({ ...p, acc: 500, at }, [job]).kind).toBe("on");
    expect(whereIs({ lat: 25.7617 + 0.03, lng: -80.1918, acc: 99999, at }, [job]).kind).toBe("away");
  });
  it("no position or no job sites", () => {
    expect(whereIs(undefined, [job])).toEqual({ kind: "none" });
    expect(whereIs(loc(25, -80), [])).toEqual({ kind: "none" });
  });
});

describe("pinging while clocked in", () => {
  it("first time, then every 5 minutes", () => {
    const now = Date.parse(at);
    expect(shouldPing(undefined, now)).toBe(true);
    expect(shouldPing(loc(25, -80), now + 4 * 60_000)).toBe(false);
    expect(shouldPing(loc(25, -80), now + 5 * 60_000)).toBe(true);
    expect(shouldPing({ ...loc(25, -80), at: "garbage" }, now)).toBe(true);
  });
});

describe("job sites", () => {
  it("jobs within 3 days with an address, not declined", () => {
    const list = [
      est({ id: "a" }),
      est({ id: "b", startDate: "2026-10-02" }),
      est({ id: "c", startDate: "2026-10-10" }),
      est({ id: "d", address: " " }),
      est({ id: "e", status: "Declined" }),
      est({ id: "f", startDate: "" }),
      est({ id: "g", startDate: "2026-09-25", days: 4 }), // 25-28: ends 2 days ago
    ];
    expect(mapJobs(list, [], "2026-09-30").map((e) => e.id)).toEqual(["a", "b", "g"]);
  });
  it("an address is looked up once; a new address is looked up again", () => {
    const e = est({ address: "1  Main St ", geo: undefined });
    expect(geoQuery(e)).toBe("1 Main St");
    expect(needsGeo(e)).toBe(true);
    const found = { ...e, geo: { q: "1 Main St", lat: 25.76, lng: -80.19 } };
    expect(needsGeo(found)).toBe(false);
    expect(siteOf(found, "Ana")).toEqual({ id: "e", label: "Ana", address: "1 Main St", lat: 25.76, lng: -80.19 });
    const notFound = { ...e, geo: { q: "1 Main St" } };
    expect(needsGeo(notFound)).toBe(false);
    expect(siteOf(notFound, "Ana")).toBeNull();
    expect(needsGeo({ ...found, address: "9 Other Rd" })).toBe(true);
    expect(siteOf({ ...found, address: "9 Other Rd" }, "Ana")).toBeNull();
  });
});
