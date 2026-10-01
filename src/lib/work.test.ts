import { describe, expect, it } from "vitest";
import { assignCounts, assignLines, assignees, cleanAssign, crewLangOf, crewSnapshot, dayDate, dropFromAssign, isForWorker, setAssign, snapshotChanged } from "./crew";
import { jdKey } from "./jobday";
import type { CrewJob, Estimate, Task } from "./types";
import { allWork, checkWorkId, crewWorkItems, taskWorkItems, workNews, workOn, workToday } from "./work";

const est = (o: Partial<Estimate>): Estimate => ({
  id: "e1", number: "EST-1001", clientName: "Ana Ruiz", address: "12 Oak St", startDate: "2026-10-02", days: 2,
  scopeEn: "Day 1: Prep\n- Mask\n- Sand\nDay 2\n- Paint", scopeEs: "Día 1: Preparar\n- Tapar\n- Lijar\nDía 2\n- Pintar", crew: ["w1", "w2"],
  ...o,
} as unknown as Estimate);
const workers = [{ id: "w1", name: "Carlos" }, { id: "w2", name: "Miguel" }];
const K = { tapar: jdKey(1, "Tapar"), lijar: jdKey(1, "Lijar"), pintar: jdKey(2, "Pintar"), mask: jdKey(1, "Mask") };

describe("who does which checklist line", () => {
  const crew = ["w1", "w2"];
  it("a line nobody has is for the whole crew; an assigned line only for its people", () => {
    const a = { k1: ["w1"], k2: ["w1", "w2"], k3: ["gone"] };
    expect(isForWorker(a, "k1", crew, "w1")).toBe(true);
    expect(isForWorker(a, "k1", crew, "w2")).toBe(false);
    expect(isForWorker(a, "k2", crew, "w2")).toBe(true);
    expect(isForWorker(a, "k3", crew, "w2")).toBe(true);          // its only person left the crew: whole crew again
    expect(isForWorker(a, "k9", crew, "w2")).toBe(true);
    expect(isForWorker(a, "k9", crew, "w3")).toBe(false);          // not on the crew: nothing
    expect(isForWorker(a, "k9", crew, "")).toBe(false);
    expect(assignees({ k: ["w1", "w1", "x"] }, "k", crew)).toEqual(["w1"]);
  });
  it("set, replace, count, clean, take someone off", () => {
    let a = setAssign(undefined, ["k1", "k2"], "w1", true);
    expect(a).toEqual({ k1: ["w1"], k2: ["w1"] });
    a = setAssign(a, ["k2"], "w2", true);
    expect(a.k2).toEqual(["w1", "w2"]);
    a = setAssign(a, ["k1"], "w1", false);
    expect(a).toEqual({ k2: ["w1", "w2"] });
    expect(assignLines(a, ["k2", "k3"], ["w2", "w2"])).toEqual({ k2: ["w2"], k3: ["w2"] });
    expect(assignLines(a, ["k2"], [])).toEqual({});
    expect(assignCounts({ k1: ["w1"], k2: ["w1", "w2"], old: ["w1"] }, ["k1", "k2"], crew)).toEqual({ w1: 2, w2: 1 });
    expect(cleanAssign({ k1: ["w1", "x"], k2: ["x"], old: ["w1"] }, ["k1", "k2"], crew)).toEqual({ k1: ["w1"] });
    expect(dropFromAssign({ k1: ["w1"], k2: ["w1", "w2"] }, "w1")).toEqual({ k2: ["w2"] });
  });
  it("Day N falls on start + N - 1, never past the last day", () => {
    const j = { start: "2026-10-02", days: 2 };
    expect(dayDate(j, 1)).toBe("2026-10-02"); expect(dayDate(j, 2)).toBe("2026-10-03"); expect(dayDate(j, 5)).toBe("2026-10-03");
    expect(dayDate({ start: "", days: 2 }, 1)).toBe("");
  });
});

describe("the crew copy and the Job day tab use ONE checklist language", () => {
  it("Spanish unless the company picked English; the crew copy carries who does what", () => {
    expect(crewLangOf(undefined)).toBe("es"); expect(crewLangOf({ crewLang: "en" })).toBe("en"); expect(crewLangOf({})).toBe("es");
    const es = crewSnapshot(est({ assign: { [K.tapar]: ["w1"], [K.mask]: ["w2"], [K.pintar]: ["w9"] } }), [], workers, "es");
    expect(es.checklist.map((x) => x.text)).toEqual(["Tapar", "Lijar", "Pintar"]);
    expect(es.assign).toEqual({ [K.tapar]: ["w1"] });   // English line keys and people off the crew are dropped
    const en = crewSnapshot(est({ assign: { [K.mask]: ["w2"] } }), [], workers, "en");
    expect(en.checklist.map((x) => x.text)).toEqual(["Mask", "Sand", "Paint"]);
    expect(en.assign).toEqual({ [K.mask]: ["w2"] });
  });
  it("assigning a line rewrites the crew copy", () => {
    const a = crewSnapshot(est({}), [], workers);
    expect(snapshotChanged(a, crewSnapshot(est({ assign: { [K.lijar]: ["w2"] } }), [], workers))).toBe(true);
    expect(snapshotChanged(a, crewSnapshot(est({ assign: { other: ["w2"] } }), [], workers))).toBe(false);
  });
});

describe("a worker's work: tasks + their checklist lines", () => {
  const job = (o: Partial<CrewJob> = {}): CrewJob => ({
    ...crewSnapshot(est({ assign: { [K.tapar]: ["w1"], [K.lijar]: ["w2"] } }), [], workers), done: {}, doneBy: {}, ...o,
  } as CrewJob);
  const task = (o: Partial<Task>): Task => ({ id: "t1", title: "Buy tape", date: "2026-10-02", workerId: "w1", ...o });

  it("my lines: mine and the whole crew's, never someone else's; dated by job day", () => {
    const mine = crewWorkItems([job()], "w1");
    expect(mine.map((x) => [x.title, x.date, !!x.crewWide])).toEqual([["Tapar", "2026-10-02", false], ["Pintar", "2026-10-03", true]]);
    expect(mine[0].id).toBe(checkWorkId("e1", K.tapar));
    expect(mine[0].id.length).toBeLessThanOrEqual(80);
    expect(crewWorkItems([job()], "w2").map((x) => x.title)).toEqual(["Lijar", "Pintar"]);
    expect(crewWorkItems([job()], "w3")).toEqual([]);
    expect(crewWorkItems([job({ done: { [K.tapar]: "2026-10-02T15:00:00Z" } })], "w1")[0].done).toBe(true);
  });
  it("tasks: only mine", () => {
    expect(taskWorkItems([task({}), task({ id: "t2", workerId: "w2" }), task({ id: "t3", workerId: "" })], "w1").map((k) => k.id)).toEqual(["t1"]);
  });
  it("clock-in choices today: today's tasks + my open lines of the job I am at (left-overs too)", () => {
    const tasks = [task({}), task({ id: "t2", date: "2026-10-03" }), task({ id: "t3", done: true })];
    expect(workToday(tasks, [job()], "w1", "2026-10-02").map((k) => k.title)).toEqual(["Buy tape", "Tapar"]);
    // day 2: day 1's line not done yet is still offered, with today's
    expect(workToday(tasks, [job()], "w1", "2026-10-03").map((k) => k.title)).toEqual(["Buy tape", "Tapar", "Pintar"]);
    expect(workToday([], [job({ done: { [K.tapar]: "x" } })], "w1", "2026-10-03").map((k) => k.title)).toEqual(["Pintar"]);
    // not on site that day, or not scheduled: no lines
    expect(workToday([], [job()], "w1", "2026-10-05")).toEqual([]);
    expect(workToday([], [job({ start: "" })], "w1", "2026-10-02")).toEqual([]);
  });
  it("one day of work for the calendar", () => {
    const all = allWork([task({})], [job()], "w1");
    expect(workOn(all, "2026-10-02").map((k) => k.title)).toEqual(["Buy tape", "Tapar"]);
    expect(workOn(all, "2026-10-03").map((k) => k.title)).toEqual(["Pintar"]);
  });
});

describe("news for the worker", () => {
  const job = (o: Partial<CrewJob> = {}): CrewJob => ({ ...crewSnapshot(est({ assign: { [K.tapar]: ["w1"] } }), [], workers), done: {}, doneBy: {}, ...o } as CrewJob);
  it("my open tasks, the jobs I am on, and the lines given to me by name (not the whole crew's)", () => {
    const n = workNews([{ id: "t1", title: "Buy tape", date: "2026-10-02", workerId: "w1" }, { id: "t2", title: "x", date: "2026-10-02", workerId: "w1", done: true }], [job()], "w1");
    expect(n.map((x) => [x.kind, x.id])).toEqual([["task", "t1"], ["job", "j:e1"], ["line", checkWorkId("e1", K.tapar)]]);
    expect(workNews([], [job()], "w2").map((x) => x.kind)).toEqual(["job"]);
    expect(workNews([], [job()], "w9")).toEqual([]);
    expect(workNews([], [job({ done: { [K.tapar]: "x" } })], "w1").map((x) => x.kind)).toEqual(["job"]);
  });
});
