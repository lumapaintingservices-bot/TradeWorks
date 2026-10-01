/**
 * Job crews: the workers assigned to a job (estimate.crew) and the copy of the job they may see (crewjobs/{estId}):
 * dates, address, client name, notes for the crew, the checklist and the colors. Never prices. Pure functions, no I/O.
 * The crew's checklist ticks live in crewjobs.done (who: doneBy); the owner's app mirrors them into estimate.check.
 */
import { addDaysISO, clientNameOf, jobDates } from "./calendar";
import { checklistFor } from "./jobday";
import { num } from "./money";
import type { Client, CrewItem, CrewJob, Estimate, Worker } from "./types";

/** The checklist language of the crew copy: the work order's (Spanish scope first), so keys stay stable. */
export const CREW_LANG = "es" as const;

export const jobLabelOf = (e: Estimate, clients: Client[] = [], lang: "en" | "es" = "en") => `${e.number} · ${clientNameOf(e, clients, lang)}`.slice(0, 120);

/** What the crew sees of a job (everything but the ticks). */
export function crewSnapshot(e: Estimate, clients: Client[], workers: Pick<Worker, "id" | "name">[]): Omit<CrewJob, "done" | "doneBy"> {
  const crew = (e.crew || []).filter(Boolean);
  const cl = checklistFor(e, CREW_LANG);
  const titles: Record<string, string> = {};
  for (const [d, title] of Object.entries(cl.titles)) if (title) titles[String(d)] = String(title).slice(0, 120);
  return {
    id: e.id, estId: e.id, jobLabel: jobLabelOf(e, clients),
    crew, crewNames: crew.map((id) => workers.find((w) => w.id === id)?.name || "").map((n) => n.slice(0, 80)),
    start: e.startDate || "", days: Math.max(1, Math.round(num(e.days) || 1)),
    address: String(e.address || "").slice(0, 300), client: clientNameOf(e, clients).slice(0, 120),
    note: String(e.crewNote || "").slice(0, 2000),
    checklist: cl.items.map((x): CrewItem => ({ key: x.key, day: x.day, text: String(x.text).slice(0, 300) })),
    titles,
    colors: (e.colors || []).filter((c) => c.area || c.brand || c.color || c.code).map((c) => ({ area: c.area || "", brand: c.brand || "", color: c.color || "", sheen: c.sheen || "", code: c.code || "" })),
  };
}

const PICK = ["jobLabel", "crew", "crewNames", "start", "days", "address", "client", "note", "checklist", "titles", "colors"] as const;
/** Does the crew copy need rewriting? (ticks are not compared: the crew owns them) */
export function snapshotChanged(doc: Partial<CrewJob> | undefined, snap: Omit<CrewJob, "done" | "doneBy">): boolean {
  if (!doc) return true;
  return PICK.some((k) => JSON.stringify(doc[k] ?? null) !== JSON.stringify(snap[k] ?? null));
}

/** Only real ticks of lines on the checklist: { key: ISO time }. A crew member's phone may write anything, so it is cleaned. */
export function cleanDone(done: unknown, checklist: Pick<CrewItem, "key">[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!done || typeof done !== "object") return out;
  const keys = new Set(checklist.map((x) => x.key));
  for (const [k, v] of Object.entries(done as Record<string, unknown>)) if (keys.has(k) && typeof v === "string" && v && v.length <= 40) out[k] = v;
  return out;
}
/**
 * The estimate's checklist ticks after the crew's: for every line of the crew checklist the crew copy decides (ticked or
 * not); other keys (lines in the other language, old lines) stay as they were. null when nothing changes.
 */
export function mergeDoneIntoCheck(check: Record<string, string> | undefined, cj: Pick<CrewJob, "done" | "checklist">): Record<string, string> | null {
  const cur = check || {}, done = cleanDone(cj.done, cj.checklist || []);
  const next = { ...cur };
  for (const { key } of cj.checklist || []) { if (done[key]) next[key] = done[key]; else delete next[key]; }
  const a = Object.keys(cur).sort(), b = Object.keys(next).sort();
  return a.length === b.length && a.every((k, i) => k === b[i] && cur[k] === next[k]) ? null : next;
}
/** Tick / untick one line of the crew checklist; `by` = who did it. */
export function toggleDone(cj: Pick<CrewJob, "done" | "doneBy">, key: string, on: boolean, by: string, at = new Date().toISOString()) {
  const done = { ...(cj.done || {}) }, doneBy = { ...(cj.doneBy || {}) };
  if (on) { done[key] = at; doneBy[key] = by.slice(0, 80); } else { delete done[key]; delete doneBy[key]; }
  return { done, doneBy };
}

/** Days the crew is on site: start .. start + days - 1 ("" start = not scheduled yet). */
export const crewDates = (cj: Pick<CrewJob, "start" | "days">) => jobDates({ startDate: cj.start, days: cj.days });
export const crewEnd = (cj: Pick<CrewJob, "start" | "days">) => (cj.start ? addDaysISO(cj.start, Math.max(1, num(cj.days) || 1) - 1) : "");
export const onSite = (cj: Pick<CrewJob, "start" | "days">, day: string) => !!cj.start && day >= cj.start && day <= crewEnd(cj);
/** Which day of the job a date is (1-based), 0 when off site. */
export const jobDayNo = (cj: Pick<CrewJob, "start" | "days">, day: string) => (onSite(cj, day) ? crewDates(cj).indexOf(day) + 1 : 0);

/** A worker's jobs split for the "My jobs" page: today, coming up (soonest first), not scheduled, recent (last 14 days). */
export function myJobsSplit<T extends Pick<CrewJob, "start" | "days" | "crew">>(jobs: T[], workerId: string, today: string) {
  const mine = jobs.filter((j) => (j.crew || []).includes(workerId));
  const by = (a: T, b: T) => String(a.start).localeCompare(String(b.start));
  return {
    today: mine.filter((j) => onSite(j, today)).sort(by),
    upcoming: mine.filter((j) => j.start && j.start > today).sort(by),
    unscheduled: mine.filter((j) => !j.start),
    recent: mine.filter((j) => j.start && crewEnd(j) < today && crewEnd(j) >= addDaysISO(today, -14)).sort(by).reverse(),
  };
}

/** Jobs to offer at clock-in (on site today) or for photos (on site within -14..+7 days), soonest to today first. */
export function crewJobOptions(jobs: Pick<CrewJob, "estId" | "jobLabel" | "start" | "days" | "crew">[], workerId: string, today: string, range: "today" | "near" = "today"): { estId: string; label: string }[] {
  const from = range === "today" ? today : addDaysISO(today, -14), to = range === "today" ? today : addDaysISO(today, 7);
  return jobs.filter((j) => (j.crew || []).includes(workerId) && j.start && crewEnd(j) >= from && j.start <= to)
    .sort((a, b) => Number(!onSite(a, today)) - Number(!onSite(b, today)) || String(a.start).localeCompare(String(b.start)))
    .map((j) => ({ estId: j.estId, label: j.jobLabel }));
}

/** Other jobs a worker is already on during these dates (to warn before double-booking). */
export function crewConflicts(e: Pick<Estimate, "id" | "startDate" | "days">, crew: string[], others: Pick<Estimate, "id" | "number" | "startDate" | "days" | "crew" | "status">[]) {
  const mine = new Set(jobDates(e));
  if (!mine.size) return [];
  const out: { workerId: string; estId: string; number: string; days: string[] }[] = [];
  for (const o of others) {
    if (o.id === e.id || !o.crew?.length || o.status === "Declined") continue;
    const overlap = jobDates(o).filter((d) => mine.has(d));
    if (!overlap.length) continue;
    for (const w of crew) if (o.crew.includes(w)) out.push({ workerId: w, estId: o.id, number: o.number, days: overlap });
  }
  return out;
}

/** Directions to an address in Google Maps (opens the Maps app on phones). */
export const mapsUrl = (address: string) => "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(address.trim());

/** Merge two option lists (first wins), one entry per job. */
export function mergeJobOptions(...lists: { estId: string; label: string }[][]): { estId: string; label: string }[] {
  const out: { estId: string; label: string }[] = [];
  for (const l of lists) for (const o of l) if (o.estId && !out.some((x) => x.estId === o.estId)) out.push(o);
  return out;
}
