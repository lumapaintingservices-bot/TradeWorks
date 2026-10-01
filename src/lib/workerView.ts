/**
 * Worker-role data helpers (pure: no React, no Firebase). They mirror firestore.rules, which are NOT filters:
 * a worker's app must issue exactly the queries the rules allow (see roles.ts workerScope()).
 */
import { todayISO } from "./estimate";
import { num, r2 } from "./money";
import { workerScope, type Role } from "./roles";
import { clockCarry, clockHours, inBounds, type Bounds, type ClockTask } from "./team";
import type { HourEntry, Task, Worker } from "./types";

/** How useCollection() must read a collection for a given login. */
export type SubPlan =
  | { kind: "all" }                                   // owner / admin: the whole collection
  | { kind: "filter"; field: string; value: string; op?: "array-contains" }  // worker: where(field == workerId) (or array-contains)
  | { kind: "doc"; id: string }                       // worker: only the doc whose id is their workerId
  | { kind: "none" };                                 // worker: not allowed (or not linked yet) -> [] and no subscription

export function subscriptionPlan(role: Role | null | undefined, workerId: string | null | undefined, col: string): SubPlan {
  if (role !== "worker") return { kind: "all" };
  const scope = workerScope(col);
  if (!scope || !workerId) return { kind: "none" };
  if ("member" in scope) return { kind: "all" }; // a chat's messages: the rules check I am in that chat
  return "field" in scope ? { kind: "filter", field: scope.field, value: workerId, ...(scope.op ? { op: scope.op } : {}) } : { kind: "doc", id: workerId };
}

/** Equality filter used by the demo (localStorage) path, same meaning as Firestore where(field,'==',value). */
export const matchFilter = (row: Record<string, unknown>, f?: { field: string; value: unknown; op?: string }): boolean =>
  !f || (f.op === "array-contains" ? Array.isArray(row[f.field]) && (row[f.field] as unknown[]).includes(f.value) : row[f.field] === f.value);

/** Task ownership exactly as the rules check it: the task is assigned to my (non-empty) worker id. */
export const isMyTask = (task: Pick<Task, "workerId">, workerId: string | null | undefined): boolean => !!workerId && (task.workerId || "") === workerId;
export const myTasks = <T extends Pick<Task, "workerId">>(tasks: T[], workerId: string | null | undefined): T[] => tasks.filter((k) => isMyTask(k, workerId));

/**
 * Tasks a worker can clock in to: their tasks for today that are not done yet, by time then title.
 * The time clock always runs for ONE task (owner rule): no task for today = no clock-in.
 */
export function clockTaskOptions<T extends Pick<Task, "id" | "date" | "done" | "time" | "title">>(tasks: T[], today: string): T[] {
  return sortTasks(tasks.filter((k) => String(k.date || "").slice(0, 10) === today && !k.done));
}

/** Jobs a worker can clock in to today: the jobs of their tasks for that day (one entry per job), named by the task's jobLabel. */
export function clockJobOptions(tasks: Pick<Task, "date" | "estId" | "jobLabel" | "title">[], today: string): { estId: string; label: string }[] {
  const out: { estId: string; label: string }[] = [];
  for (const k of tasks) {
    if (String(k.date || "").slice(0, 10) !== today || !k.estId || out.some((o) => o.estId === k.estId)) continue;
    out.push({ estId: k.estId, label: String(k.jobLabel || k.title || "").slice(0, 120) || k.estId });
  }
  return out;
}

/** Task list order: date, then time, then title. */
export const sortTasks = <T extends Pick<Task, "date" | "time" | "title">>(tasks: T[]): T[] =>
  tasks.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.time || "").localeCompare(String(b.time || "")) || String(a.title || "").localeCompare(String(b.title || "")));

/**
 * The hours entry a WORKER's clock-out creates. Same id / hours / date as team.clockEntry (two devices write the same record).
 * The pay rate comes from the worker's own record (readable by them); when that record is not available yet the `rate` field
 * is OMITTED so the owner's screens fall back to the worker's current rate (team.hourAmount) instead of showing $0.
 */
export function workerClockEntry(clock: ClockTask, workerId: string, worker: Pick<Worker, "rate"> | null | undefined, note: string, nowMs: number = Date.now()): Omit<HourEntry, "rate"> & { rate?: number } {
  const d = new Date(clock.at);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const date = isNaN(d.getTime()) ? String(clock.at).slice(0, 10) : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const e: Omit<HourEntry, "rate"> & { rate?: number } = {
    id: `h-clk-${workerId}-${Date.parse(clock.at) || 0}`, workerId, date, hours: clockHours(clock.at, nowMs), estId: clock.estId || "", note: clock.taskTitle || note,
    start: clock.at, end: new Date(nowMs).toISOString(), ...clockCarry(clock),
  };
  if (worker && (worker.rate as unknown) !== undefined && (worker.rate as unknown) !== "") e.rate = num(worker.rate);
  return e;
}

/** A manual hours entry logged by the worker (rate rule as above). */
export function workerHoursEntry(id: string, workerId: string, worker: Pick<Worker, "rate"> | null | undefined, f: { date?: string; hours: number; note?: string }): Omit<HourEntry, "rate"> & { rate?: number } {
  const e: Omit<HourEntry, "rate"> & { rate?: number } = { id, workerId, date: f.date || todayISO(), hours: r2(num(f.hours)), estId: "", note: (f.note || "").trim() };
  if (worker && (worker.rate as unknown) !== undefined && (worker.rate as unknown) !== "") e.rate = num(worker.rate);
  return e;
}

/** Only my own entries, inside the range, newest first (the snapshot is already filtered; this is a second safety net). */
export function myHoursIn(hours: HourEntry[], workerId: string | null | undefined, b: Bounds): HourEntry[] {
  return hours.filter((h) => !!workerId && h.workerId === workerId && inBounds(h.date, b)).sort((x, y) => String(y.date).localeCompare(String(x.date)));
}
export const sumHours = (hours: Pick<HourEntry, "hours">[]): number => hours.reduce((a, h) => a + num(h.hours), 0);

/** Open tasks first (by date), then done ones (newest first), for the worker's list. */
export function splitTasks<T extends Pick<Task, "date" | "time" | "title" | "done">>(tasks: T[]): { open: T[]; done: T[] } {
  const s = sortTasks(tasks);
  return { open: s.filter((k) => !k.done), done: s.filter((k) => k.done).reverse() };
}

/**
 * A worker's new-task notices (src/data/taskInbox.ts): their open tasks they have not seen yet on this device.
 * `seen` = task ids already shown; done tasks never count.
 */
export function unseenTasks<T extends Pick<Task, "id" | "done" | "workerId">>(tasks: T[], seen: Set<string>, workerId: string | null | undefined): T[] {
  return tasks.filter((k) => isMyTask(k, workerId) && !k.done && !seen.has(k.id));
}
