/**
 * A worker's work in one list: the tasks assigned to them (tasks collection) and the lines of their jobs' checklists that are
 * theirs (crewjobs: assigned to them, or to nobody in particular = the whole crew). Used by the time clock (the clock always
 * runs for ONE of these), the worker's Team page and calendar, the new-work notices and the owner's Team page. Pure, no I/O.
 */
import { cleanDone, dayDate, isForWorker, assignees, onSite } from "./crew";
import { myTasks, sortTasks } from "./workerView";
import type { CrewJob, Task } from "./types";

export type WorkItem = {
  /** The task id, or checkWorkId() for a checklist line (it is also the clock's taskId). */
  id: string;
  kind: "task" | "check";
  title: string;
  /** The day it is for ("" = the job has no dates yet). */
  date: string;
  time?: string;
  note?: string;
  estId: string;
  jobLabel: string;
  done: boolean;
  /** Checklist line: its key and "Day N" of the job. */
  key?: string;
  day?: number;
  /** A line nobody in particular has: everyone on the crew sees it. */
  crewWide?: boolean;
};

/** Id of a checklist line as a piece of work (the time clock stores it as taskId, at most 80 characters). */
export const checkWorkId = (estId: string, key: string) => ("c:" + estId + ":" + key).slice(0, 80);

/** My checklist lines on every job I am on the crew of, in checklist order. */
export function crewWorkItems(jobs: CrewJob[], workerId: string): WorkItem[] {
  const out: WorkItem[] = [];
  if (!workerId) return out;
  for (const j of jobs) {
    const crew = j.crew || [];
    if (!crew.includes(workerId)) continue;
    const done = cleanDone(j.done, j.checklist || []);
    for (const x of j.checklist || []) {
      if (!isForWorker(j.assign, x.key, crew, workerId)) continue;
      out.push({
        id: checkWorkId(j.estId || j.id, x.key), kind: "check", title: x.text, date: dayDate(j, x.day), estId: j.estId || j.id, jobLabel: j.jobLabel || "",
        done: !!done[x.key], key: x.key, day: x.day, ...(assignees(j.assign, x.key, crew).length ? {} : { crewWide: true }),
      });
    }
  }
  return out;
}

/** My tasks as work items. */
export function taskWorkItems(tasks: Task[], workerId: string): WorkItem[] {
  return sortTasks(myTasks(tasks, workerId)).map((k) => ({
    id: k.id, kind: "task" as const, title: k.title, date: String(k.date || "").slice(0, 10), ...(k.time ? { time: k.time } : {}), ...(k.note ? { note: k.note } : {}),
    estId: k.estId || "", jobLabel: k.jobLabel || "", done: !!k.done,
  }));
}

/** Everything that is mine: tasks first (by date and time), then checklist lines. */
export const allWork = (tasks: Task[], jobs: CrewJob[], workerId: string): WorkItem[] => [...taskWorkItems(tasks, workerId), ...crewWorkItems(jobs, workerId)];

/**
 * What I can clock in to today (not done yet): my tasks for today, and my lines of the jobs I am on site at today
 * (today's day, plus lines left over from earlier days of the same job). Tasks with a time first, then by job.
 */
export function workToday(tasks: Task[], jobs: CrewJob[], workerId: string, today: string): WorkItem[] {
  const onToday = new Set(jobs.filter((j) => onSite(j, today)).map((j) => j.estId || j.id));
  const t = taskWorkItems(tasks, workerId).filter((k) => k.date === today && !k.done);
  const c = crewWorkItems(jobs, workerId).filter((k) => !k.done && onToday.has(k.estId) && k.date && k.date <= today);
  return [...t, ...c];
}

/** One day's work (calendar), done ones included. */
export const workOn = (items: WorkItem[], day: string): WorkItem[] => items.filter((k) => k.date === day);

/** Something new for the worker to hear about: a task, a line given to them by name, or a job they were put on. */
export type WorkNews = { id: string; kind: "task" | "line" | "job"; title: string; date: string; time?: string; jobLabel?: string };
/**
 * Everything that would be news (src/data/taskInbox.ts announces the ones this device has not seen): my open tasks, the open
 * lines given to me by name (not the whole crew's: being put on the job is the news for those), and the jobs I am on.
 */
export function workNews(tasks: Task[], jobs: CrewJob[], workerId: string): WorkNews[] {
  if (!workerId) return [];
  const out: WorkNews[] = taskWorkItems(tasks, workerId).filter((k) => !k.done).map((k) => ({ id: k.id, kind: "task" as const, title: k.title, date: k.date, ...(k.time ? { time: k.time } : {}) }));
  for (const j of jobs) if ((j.crew || []).includes(workerId)) out.push({ id: "j:" + (j.estId || j.id), kind: "job", title: j.jobLabel || "", date: j.start || "" });
  for (const k of crewWorkItems(jobs, workerId)) if (!k.done && !k.crewWide) out.push({ id: k.id, kind: "line", title: k.title, date: k.date, jobLabel: k.jobLabel });
  return out;
}
