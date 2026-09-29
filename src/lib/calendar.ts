/* Calendar logic — port of the prototype's jobDates / jobsOn / calendarEvents / icsCalendar / gcalLink.
   Pure functions: everything they need (estimates, invoices, tasks, clients, settings) is passed in. */
import { calcEstimate, jobWhat, todayISO } from "./estimate";
import { money, num } from "./money";
import type { Client, Estimate, EstStatus, Invoice, Settings, Task } from "./types";

export type CalEvent = {
  uid: string; allDay: boolean; start: string; end: string; time?: string;
  title: string; where: string; notes: string;
};

export function addDaysISO(iso: string | undefined, days: number): string {
  const p = String(iso || todayISO()).split("-");
  const d = new Date(num(p[0]), num(p[1]) - 1, num(p[2]));
  d.setDate(d.getDate() + num(days));
  const m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
}
export function daysBetween(a: string, b: string): number {
  const pa = String(a || "").split("-"), pb = String(b || "").split("-");
  if (pa.length !== 3 || pb.length !== 3) return 0;
  return Math.round((Date.UTC(num(pb[0]), num(pb[1]) - 1, num(pb[2])) - Date.UTC(num(pa[0]), num(pa[1]) - 1, num(pa[2]))) / 86400000);
}

/** Every ISO date a job occupies: startDate .. startDate + days - 1. */
export function jobDates(e: Pick<Estimate, "startDate" | "days">): string[] {
  if (!e.startDate) return [];
  const n = Math.max(1, Math.round(num(e.days) || 1)), out: string[] = [];
  for (let i = 0; i < n; i++) out.push(addDaysISO(e.startDate, i));
  return out;
}
/** Exclusive end date (all-day DTEND). */
export const jobEndISO = (e: Pick<Estimate, "startDate" | "days">) => addDaysISO(e.startDate, Math.max(1, num(e.days) || 1));

/** Status shown on the calendar: derived from the job's invoices, else the estimate's own status. */
export function jobStatus(e: Estimate, invoices: Pick<Invoice, "estId" | "status">[]): EstStatus {
  const invs = invoices.filter((v) => v.estId === e.id);
  if (invs.length) {
    if (invs.every((v) => v.status === "Paid")) return "Paid in Full";
    if (invs.some((v) => v.status === "Paid")) return "Deposit Paid";
  }
  return e.status || "Draft";
}

/** Jobs happening on a day (declined jobs never show). */
export function jobsOn(iso: string, estimates: Estimate[], invoices: Pick<Invoice, "estId" | "status">[] = []): Estimate[] {
  return estimates.filter((e) => jobStatus(e, invoices) !== "Declined" && jobDates(e).includes(iso));
}

export const taskSort = (a: Task, b: Task) => {
  const at = a.time || "99:99", bt = b.time || "99:99";
  if (at !== bt) return at < bt ? -1 : 1;
  return String(a.title || "").localeCompare(String(b.title || ""));
};
export const tasksOn = (iso: string, tasks: Task[]) => tasks.filter((t) => t.date === iso).sort(taskSort);

export function fmtTime(hhmm?: string): string {
  if (!hhmm) return "";
  const p = String(hhmm).split(":"), h = num(p[0]), m = (p[1] || "00").slice(0, 2);
  let hh = h % 12; if (hh === 0) hh = 12;
  return `${hh}:${m} ${h >= 12 ? "PM" : "AM"}`;
}

/* ---------------- ICS ---------------- */
export const icsEsc = (s: unknown) => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

/** RFC 5545 folding: no physical line longer than 75 octets (73 including the leading space of continuations); never splits a multi-byte character. ASCII output is identical to the prototype's. */
export function icsFold(line: string): string {
  const enc = new TextEncoder(), out: string[] = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 73) { out.push(cur); cur = " " + ch; bytes = 1 + n; } else { cur += ch; bytes += n; }
  }
  out.push(cur);
  return out.join("\r\n");
}
const ymd = (iso?: string) => String(iso || "").slice(0, 10).replace(/-/g, "");
const p2 = (n: number) => String(n).padStart(2, "0");
/** date + time + 1 hour, as local YYYYMMDDTHHMM00 (floating). */
function plusHour(start: string, time: string): string {
  const d = new Date(start + "T" + time + ":00"); d.setHours(d.getHours() + 1);
  return d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + "T" + p2(d.getHours()) + p2(d.getMinutes()) + "00";
}
const dtstamp = (now: Date) => now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

export function icsEvent(ev: CalEvent, now: Date = new Date()): string {
  const L = ["BEGIN:VEVENT", "UID:" + ev.uid, "DTSTAMP:" + dtstamp(now)];
  if (ev.allDay) { L.push("DTSTART;VALUE=DATE:" + ymd(ev.start)); L.push("DTEND;VALUE=DATE:" + ymd(ev.end)); }
  else {
    const hm = String(ev.time).replace(":", "").padEnd(4, "0").slice(0, 4);
    L.push("DTSTART:" + ymd(ev.start) + "T" + hm + "00"); L.push("DTEND:" + plusHour(ev.start, String(ev.time)));
  }
  L.push("SUMMARY:" + icsEsc(ev.title));
  if (ev.where) L.push("LOCATION:" + icsEsc(ev.where));
  if (ev.notes) L.push("DESCRIPTION:" + icsEsc(ev.notes));
  L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(ev.title), "TRIGGER:" + (ev.allDay ? "-PT16H" : "-PT60M"), "END:VALARM", "END:VEVENT");
  return L.map(icsFold).join("\r\n");
}
export function icsCalendar(events: CalEvent[], name?: string, now: Date = new Date()): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TradeWorks//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + icsEsc(name || "TradeWorks"), "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"].join("\r\n") +
    (events.length ? "\r\n" + events.map((e) => icsEvent(e, now)).join("\r\n") : "") + "\r\nEND:VCALENDAR\r\n";
}

export type CalCtx = {
  estimates: Estimate[]; invoices?: Pick<Invoice, "estId" | "status">[]; tasks: Task[]; clients?: Client[];
  settings: Settings; lang?: "en" | "es"; workers?: { id: string; name: string }[]; today?: string;
};
export function clientNameOf(e: Estimate, clients: Client[] = [], lang: "en" | "es" = "en"): string {
  const c = e.clientId ? clients.find((x) => x.id === e.clientId) : undefined;
  return (c && c.name) || e.clientName || (lang === "es" ? "Cliente sin nombre" : "Unnamed client");
}
export function jobEventData(e: Estimate, ctx: Pick<CalCtx, "invoices" | "clients" | "settings" | "lang">): CalEvent {
  const lang = ctx.lang || "en", total = calcEstimate(e, ctx.settings).total;
  return {
    uid: "job-" + e.id + "@tradeworks", allDay: true, start: e.startDate, end: jobEndISO(e),
    title: clientNameOf(e, ctx.clients, lang) + " — " + jobWhat(e, lang), where: e.address || "",
    notes: [e.number + " · " + jobStatus(e, ctx.invoices || []) + " · " + money(total), e.phone ? "Tel: " + e.phone : "", e.email || ""].filter(Boolean).join("\n"),
  };
}
export function taskEventData(t: Task, ctx: Pick<CalCtx, "estimates" | "clients" | "workers" | "lang">): CalEvent {
  const lang = ctx.lang || "en";
  const e = t.estId ? ctx.estimates.find((x) => x.id === t.estId) : undefined;
  const w = t.workerId ? (ctx.workers || []).find((x) => x.id === t.workerId) : undefined;
  return {
    uid: "task-" + t.id + "@tradeworks", allDay: !t.time, start: t.date, time: t.time || "", end: t.time ? "" : addDaysISO(t.date, 1),
    title: (t.title || (lang === "es" ? "Tarea" : "Task")) + (w ? " (" + w.name + ")" : ""), where: e ? e.address || "" : "",
    notes: [t.note || "", e ? e.number + " · " + clientNameOf(e, ctx.clients, lang) : ""].filter(Boolean).join("\n"),
  };
}
/** Everything the live feed publishes: jobs (all-day, alarm 8 PM the day before) and open tasks (timed, alarm -60 min). */
export function calendarEvents(ctx: CalCtx): CalEvent[] {
  const out: CalEvent[] = [], from = addDaysISO(ctx.today || todayISO(), -60), inv = ctx.invoices || [];
  ctx.estimates.forEach((e) => {
    if (!e.startDate || jobStatus(e, inv) === "Declined" || jobEndISO(e) < from) return;
    out.push(jobEventData(e, ctx));
  });
  ctx.tasks.forEach((t) => { if (t.done || !t.date || t.date < from) return; out.push(taskEventData(t, ctx)); });
  return out;
}
export function gcalLink(ev: CalEvent): string {
  const dates = ev.allDay ? ymd(ev.start) + "/" + ymd(ev.end) : ymd(ev.start) + "T" + String(ev.time).replace(":", "") + "00/" + plusHour(ev.start, String(ev.time));
  return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(ev.title) + "&dates=" + dates +
    "&details=" + encodeURIComponent(ev.notes || "") + "&location=" + encodeURIComponent(ev.where || "");
}
export function downloadICS(ev: CalEvent, name = "TradeWorks"): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([icsCalendar([ev], name)], { type: "text/calendar;charset=utf-8" }));
  a.download = (String(ev.title).replace(/[^\p{L}\p{N}_\- ]+/gu, "").slice(0, 40).trim() || "event") + ".ics";
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
