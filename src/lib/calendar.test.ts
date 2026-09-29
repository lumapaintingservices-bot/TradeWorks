import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { addDaysISO, calendarEvents, gcalLink, icsCalendar, icsEsc, icsEvent, icsFold, jobDates, jobEndISO, jobsOn, jobStatus, fmtTime, type CalEvent } from "./calendar";
import { blankEstimate } from "./estimate";
import { defaultSettings } from "./settings";
import type { Estimate, Task } from "./types";

const NOW = new Date("2026-03-01T12:34:56Z");
const s = defaultSettings();
const job = (id: string, startDate: string, days: number, o: Partial<Estimate> = {}): Estimate =>
  ({ ...blankEstimate(s, "EST-" + id), id, startDate, days, clientName: "Ana Pérez", address: "12 Oak St, Miami; FL", phone: "555-1234", doors: 10, drawers: 4, ...o });

describe("jobDates / jobsOn", () => {
  it("spans startDate..startDate+days-1, across month ends", () => {
    expect(jobDates(job("a", "2026-01-30", 4))).toEqual(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
    expect(jobDates(job("a", "", 4))).toEqual([]);
    expect(jobDates(job("a", "2026-05-05", 0))).toEqual(["2026-05-05"]);
    expect(jobDates(job("a", "2026-05-05", 2.4))).toEqual(["2026-05-05", "2026-05-06"]);
    expect(jobEndISO(job("a", "2026-02-27", 3))).toBe("2026-03-02");
  });
  it("jobsOn skips declined jobs and uses invoices for status", () => {
    const a = job("a", "2026-03-10", 3), b = job("b", "2026-03-11", 1, { status: "Declined" });
    expect(jobsOn("2026-03-11", [a, b]).map((e) => e.id)).toEqual(["a"]);
    expect(jobsOn("2026-03-13", [a, b])).toEqual([]);
    expect(jobStatus(a, [{ estId: "a", status: "Paid" }, { estId: "a", status: "Unpaid" }])).toBe("Deposit Paid");
    expect(jobStatus(a, [{ estId: "a", status: "Paid" }])).toBe("Paid in Full");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(fmtTime("13:05")).toBe("1:05 PM");
    expect(fmtTime("00:00")).toBe("12:00 AM");
  });
});

describe("ICS", () => {
  it("escapes backslash, comma, semicolon and newline", () => {
    expect(icsEsc("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    expect(icsEsc(null)).toBe("");
    // a lone CR or CRLF in user text must not start a new ICS line (property injection)
    expect(icsEsc("a\r\nATTENDEE:x")).toBe("a\\nATTENDEE:x");
    expect(icsEsc("a\rb")).toBe("a\\nb");
  });
  it("folds long lines at <=75 octets and never splits a character", () => {
    const line = "DESCRIPTION:" + "x".repeat(200);
    const f = icsFold(line);
    f.split("\r\n").forEach((l) => expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75));
    expect(f.replace(/\r\n /g, "")).toBe(line);
    const acc = "SUMMARY:" + "ñ—é".repeat(60);
    const g = icsFold(acc);
    g.split("\r\n").forEach((l) => expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75));
    expect(g.replace(/\r\n /g, "")).toBe(acc);
  });
  it("multi-day job = all-day event, exclusive DTEND, 8 PM alarm the day before", () => {
    const ev: CalEvent = { uid: "job-a@tradeworks", allDay: true, start: "2026-03-10", end: "2026-03-13", title: "Ana, Pérez", where: "12 Oak; St", notes: "l1\nl2" };
    const x = icsEvent(ev, NOW).split("\r\n");
    expect(x).toContain("UID:job-a@tradeworks");
    expect(x).toContain("DTSTAMP:20260301T123456Z");
    expect(x).toContain("DTSTART;VALUE=DATE:20260310");
    expect(x).toContain("DTEND;VALUE=DATE:20260313");
    expect(x).toContain("SUMMARY:Ana\\, Pérez");
    expect(x).toContain("LOCATION:12 Oak\\; St");
    expect(x).toContain("DESCRIPTION:l1\\nl2");
    expect(x).toContain("TRIGGER:-PT16H");
  });
  it("timed task = floating 1h event with -60 min alarm", () => {
    const ev: CalEvent = { uid: "task-t@tradeworks", allDay: false, start: "2026-03-10", time: "23:30", end: "", title: "Buy paint", where: "", notes: "" };
    const x = icsEvent(ev, NOW).split("\r\n");
    expect(x).toContain("DTSTART:20260310T233000");
    expect(x).toContain("DTEND:20260311T003000");
    expect(x).toContain("TRIGGER:-PT60M");
    expect(x.some((l) => l.startsWith("LOCATION"))).toBe(false);
  });
  it("calendar wrapper uses CRLF and ends with END:VCALENDAR", () => {
    const c = icsCalendar([], "Luma, Painting", NOW);
    expect(c.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(c).toContain("X-WR-CALNAME:Luma\\, Painting");
    expect(c.endsWith("\r\nEND:VCALENDAR\r\n")).toBe(true);
    expect(c).not.toContain("\n\n");
  });
});

describe("calendarEvents", () => {
  const today = "2026-03-01";
  const tasks: Task[] = [
    { id: "t1", title: "Call, client", date: "2026-03-02", time: "09:00" },
    { id: "t2", title: "Done one", date: "2026-03-02", done: true },
    { id: "t3", title: "Ancient", date: "2025-01-01" },
    { id: "t4", title: "All day", date: "2026-03-03", estId: "a", note: "n" },
  ];
  const ests = [job("a", "2026-03-10", 2), job("old", "2025-01-01", 2), job("dec", "2026-03-10", 2, { status: "Declined" }), job("none", "", 2)];
  const evs = calendarEvents({ estimates: ests, tasks, settings: s, today });
  it("includes current jobs and open recent tasks only", () => {
    expect(evs.map((e) => e.uid)).toEqual(["job-a@tradeworks", "task-t1@tradeworks", "task-t4@tradeworks"]);
  });
  it("job and task event fields", () => {
    expect(evs[0]).toMatchObject({ allDay: true, start: "2026-03-10", end: "2026-03-12", where: "12 Oak St, Miami; FL", title: "Ana Pérez — 10 doors, 4 drawers" });
    expect(evs[0].notes.split("\n")[0]).toMatch(/^EST-a · Draft · \$/);
    expect(evs[1]).toMatchObject({ allDay: false, time: "09:00", end: "" });
    expect(evs[2]).toMatchObject({ allDay: true, end: "2026-03-04", where: "12 Oak St, Miami; FL", notes: "n\nEST-a · Ana Pérez" });
  });
});

describe("gcalLink", () => {
  it("all-day and timed parameters", () => {
    const u = new URL(gcalLink({ uid: "x", allDay: true, start: "2026-03-10", end: "2026-03-13", title: "A & B", where: "St, 1", notes: "x\ny" }));
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("text")).toBe("A & B");
    expect(u.searchParams.get("dates")).toBe("20260310/20260313");
    expect(u.searchParams.get("details")).toBe("x\ny");
    expect(u.searchParams.get("location")).toBe("St, 1");
    const t = new URL(gcalLink({ uid: "x", allDay: false, start: "2026-03-10", time: "08:15", end: "", title: "T", where: "", notes: "" }));
    expect(t.searchParams.get("dates")).toBe("20260310T081500/20260310T091500");
  });
});

/* ---- parity with the prototype: run its own functions on the same inputs ---- */
const proto = readFileSync(new URL("../../prototype/index.html", import.meta.url), "utf8");
function fn(name: string): string {
  const i = proto.indexOf(`function ${name}(`);
  let j = proto.indexOf("{", i), d = 0;
  for (;; j++) { if (proto[j] === "{") d++; if (proto[j] === "}" && !--d) break; }
  return proto.slice(i, j + 1);
}
describe("parity with the prototype", () => {
  const ctx: Record<string, any> = { DB: { estimates: [] } };
  runInNewContext(["num", "todayISO", "addDaysISO", "jobDates", "icsEsc", "icsFold", "ymd", "icsEvent", "gcalLink"].map(fn).join("\n") +
    ";this.jobDates=jobDates;this.icsEsc=icsEsc;this.icsFold=icsFold;this.icsEvent=icsEvent;this.gcalLink=gcalLink;this.addDaysISO=addDaysISO;", ctx);
  it("jobDates / addDaysISO", () => {
    for (const [st, n] of [["2026-02-26", 5], ["2025-12-30", 3], ["2026-03-01", 0], ["2026-03-01", 1.6]] as const)
      expect(jobDates({ startDate: st, days: n })).toEqual(ctx.jobDates({ startDate: st, days: n }));
  });
  it("icsEsc / icsFold on ASCII", () => {
    for (const x of ["plain", "a,b;c\\d\ne", "y".repeat(73), "y".repeat(74), "z".repeat(400), "DESCRIPTION:" + "Tel: 555, ".repeat(30)]) {
      expect(icsEsc(x)).toBe(ctx.icsEsc(x));
      expect(icsFold(x)).toBe(ctx.icsFold(x));
    }
  });
  it("all-day VEVENT (minus DTSTAMP) and gcal link", () => {
    const ev: CalEvent = { uid: "job-q@tradeworks", allDay: true, start: "2026-03-10", end: "2026-03-13", title: "Client — 10 doors, 4 drawers", where: "12 Oak St, Miami; FL", notes: "EST-1 · Draft · $1,000.00\nTel: 555\nx@y.com" };
    const strip = (x: string) => x.replace(/DTSTAMP:[^\r]+\r\n/, "");
    expect(strip(icsEvent(ev, NOW))).toBe(strip(ctx.icsEvent(ev)));
    expect(gcalLink(ev)).toBe(ctx.gcalLink(ev));
  });
});
