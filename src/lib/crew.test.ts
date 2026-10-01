import { describe, expect, it } from "vitest";
import { cleanDone, crewConflicts, crewEnd, crewJobOptions, crewSnapshot, jobDayNo, mapsUrl, mergeDoneIntoCheck, mergeJobOptions, myJobsSplit, onSite, snapshotChanged, toggleDone } from "./crew";
import { jdKey } from "./jobday";
import type { CrewJob, Estimate } from "./types";

const est = (o: Partial<Estimate>): Estimate => ({
  id: "e1", number: "EST-1001", clientName: "Ana Ruiz", address: "12 Oak St, Austin", startDate: "2026-10-02", days: 3,
  scopeEn: "Day 1: Prep\n- Mask\n- Sand", scopeEs: "Día 1: Preparar\n- Tapar\n- Lijar\nDía 2\n- Pintar", crew: ["w1", "w2"], crewNote: "Gate code 1234",
  colors: [{ area: "Cabinets", brand: "SW", color: "Alabaster", sheen: "Satin", code: "7008" }, { area: "", brand: "", color: "", sheen: "", code: "" }],
  ...o,
} as unknown as Estimate);
const workers = [{ id: "w1", name: "Carlos" }, { id: "w2", name: "Miguel" }];
const cj = (o: Partial<CrewJob>): CrewJob => ({ id: "e1", estId: "e1", jobLabel: "EST-1001 · Ana", crew: ["w1"], crewNames: ["Carlos"], start: "2026-10-02", days: 3, address: "", client: "", note: "", checklist: [], titles: {}, colors: [], ...o });

describe("crew copy of a job", () => {
  it("snapshot: dates, address, notes, Spanish checklist, filled colors; no prices", () => {
    const s = crewSnapshot(est({}), [], workers);
    expect(s).toMatchObject({ id: "e1", jobLabel: "EST-1001 · Ana Ruiz", crew: ["w1", "w2"], crewNames: ["Carlos", "Miguel"], start: "2026-10-02", days: 3, address: "12 Oak St, Austin", client: "Ana Ruiz", note: "Gate code 1234" });
    expect(s.checklist.map((x) => [x.day, x.text])).toEqual([[1, "Tapar"], [1, "Lijar"], [2, "Pintar"]]);
    expect(s.checklist[0].key).toBe(jdKey(1, "Tapar"));
    expect(s.titles["1"]).toBe("Preparar");
    expect(s.colors).toHaveLength(1);
    expect(JSON.stringify(s)).not.toMatch(/price|total|rate/i);
  });
  it("rewrite only when what the crew sees changed (ticks are theirs)", () => {
    const s = crewSnapshot(est({}), [], workers);
    expect(snapshotChanged(undefined, s)).toBe(true);
    expect(snapshotChanged({ ...s, done: { a: "x" } }, s)).toBe(false);
    expect(snapshotChanged(s, crewSnapshot(est({ crewNote: "New note" }), [], workers))).toBe(true);
    expect(snapshotChanged(s, crewSnapshot(est({ crew: ["w1"] }), [], workers))).toBe(true);
  });
});

describe("crew checklist ticks", () => {
  const checklist = [{ key: "k1", day: 1, text: "a" }, { key: "k2", day: 1, text: "b" }];
  it("clean: only lines on the list, short strings", () => {
    expect(cleanDone({ k1: "2026-10-02T10:00:00Z", zz: "x", k2: 5 }, checklist)).toEqual({ k1: "2026-10-02T10:00:00Z" });
    expect(cleanDone(null, checklist)).toEqual({});
  });
  it("mirror into the estimate: crew decides its lines, other keys stay", () => {
    expect(mergeDoneIntoCheck({ k2: "old", other: "keep" }, { checklist, done: { k1: "t1" } })).toEqual({ k1: "t1", other: "keep" });
    expect(mergeDoneIntoCheck({ k1: "t1", other: "keep" }, { checklist, done: { k1: "t1" } })).toBeNull();
    expect(mergeDoneIntoCheck(undefined, { checklist, done: {} })).toBeNull();
  });
  it("toggle keeps who did it", () => {
    const a = toggleDone({}, "k1", true, "Carlos", "t1");
    expect(a).toEqual({ done: { k1: "t1" }, doneBy: { k1: "Carlos" } });
    expect(toggleDone(a, "k1", false, "Carlos")).toEqual({ done: {}, doneBy: {} });
  });
});

describe("schedule", () => {
  it("on site, day number, end", () => {
    const j = cj({});
    expect(crewEnd(j)).toBe("2026-10-04");
    expect([onSite(j, "2026-10-01"), onSite(j, "2026-10-02"), onSite(j, "2026-10-04"), onSite(j, "2026-10-05")]).toEqual([false, true, true, false]);
    expect(jobDayNo(j, "2026-10-03")).toBe(2);
    expect(onSite(cj({ start: "" }), "2026-10-02")).toBe(false);
  });
  it("my jobs: today, upcoming, unscheduled, recent; only mine", () => {
    const jobs = [cj({ id: "a", start: "2026-10-01" }), cj({ id: "b", start: "2026-10-10" }), cj({ id: "c", start: "" }), cj({ id: "d", start: "2026-09-25", days: 1 }), cj({ id: "e", start: "2026-10-02", crew: ["w9"] }), cj({ id: "f", start: "2026-08-01", days: 1 })];
    const s = myJobsSplit(jobs, "w1", "2026-10-02");
    expect([s.today, s.upcoming, s.unscheduled, s.recent].map((l) => l.map((j) => j.id))).toEqual([["a"], ["b"], ["c"], ["d"]]);
  });
  it("clock-in / photo options", () => {
    const jobs = [cj({ estId: "a", jobLabel: "A", start: "2026-10-01" }), cj({ estId: "b", jobLabel: "B", start: "2026-10-05" }), cj({ estId: "c", jobLabel: "C", start: "2026-10-02", crew: ["w9"] })];
    expect(crewJobOptions(jobs, "w1", "2026-10-02")).toEqual([{ estId: "a", label: "A" }]);
    expect(crewJobOptions(jobs, "w1", "2026-10-02", "near").map((o) => o.estId)).toEqual(["a", "b"]);
    expect(mergeJobOptions([{ estId: "a", label: "A" }], [{ estId: "a", label: "x" }, { estId: "z", label: "Z" }])).toEqual([{ estId: "a", label: "A" }, { estId: "z", label: "Z" }]);
  });
  it("double-booking warning", () => {
    const e = { id: "e1", startDate: "2026-10-02", days: 3 };
    const others = [
      { id: "e2", number: "EST-2", startDate: "2026-10-04", days: 2, crew: ["w1", "w3"], status: "Accepted" },
      { id: "e3", number: "EST-3", startDate: "2026-10-03", days: 1, crew: ["w2"], status: "Declined" },
      { id: "e4", number: "EST-4", startDate: "2026-10-09", days: 1, crew: ["w1"], status: "Accepted" },
    ] as Parameters<typeof crewConflicts>[2];
    expect(crewConflicts(e, ["w1", "w2"], others)).toEqual([{ workerId: "w1", estId: "e2", number: "EST-2", days: ["2026-10-04"] }]);
    expect(crewConflicts({ id: "e1", startDate: "", days: 3 }, ["w1"], others)).toEqual([]);
  });
  it("directions link", () => {
    expect(mapsUrl(" 12 Oak St, Austin ")).toBe("https://www.google.com/maps/dir/?api=1&destination=12%20Oak%20St%2C%20Austin");
  });
});
