import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useT } from "../i18n";
import { fmtTime } from "../lib/calendar";
import { fmtDate } from "../lib/format";
import { workNews } from "../lib/work";
import { useUi } from "../store/ui";
import { useCrewJobs, useTasks } from "./hooks";

// "seenWork" (not the older "seenTasks"): job lines and jobs count too, so this device starts a fresh list (nothing old is announced)
const key = (cid: string, uid: string) => `tw.seenWork.${cid}.${uid}`;
const read = (k: string): string[] | null => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const write = (k: string, ids: string[]) => { try { localStorage.setItem(k, JSON.stringify(ids.slice(-800))); } catch { /* private mode */ } };
/** Pages where a worker sees their work: being there counts as having seen it (My jobs shows jobs and their lines, not tasks). */
const TASK_PAGES = ["/calendar", "/team"];
const JOB_PAGES = ["/jobs"];
const onPage = (path: string, pages: string[]) => pages.some((p) => path === p || path.startsWith(p + "/"));

/**
 * Workers: a toast the moment the boss gives them work — a task ("📋 New task: Prep the kitchen · Thu, Oct 2 · 8:00 AM"), a line
 * of a job's checklist given to them by name, or a job they were put on ("👷 New job: EST-1001 · Ana Ruiz") — and how many are
 * not seen yet, for the Calendar badge. Seen = remembered per device; the first time nothing is announced (old work is not
 * news). Opening Calendar or Team marks them seen (My jobs: the jobs and their lines).
 */
export function useTaskInbox(): number {
  const t = useT();
  const { company, user, workerId } = useAuth();
  const lang = useUi((s) => s.lang), toast = useUi((s) => s.toast);
  const loc = useLocation();
  const { rows: tasks, loading } = useTasks();
  const { rows: jobs, loading: loadingJobs } = useCrewJobs();
  const k = company && user ? key(company.id, user.uid) : "";
  const [seen, setSeen] = useState<Set<string> | null>(null);
  const toasted = useRef(new Set<string>());
  const news = useMemo(() => workNews(tasks, jobs, workerId || ""), [tasks, jobs, workerId]);

  // load what this device has seen; the very first time, everything there is now counts as seen
  useEffect(() => {
    if (!k || loading || loadingJobs) return;
    const saved = read(k);
    if (saved) setSeen(new Set(saved));
    else { const all = news.map((x) => x.id); write(k, all); setSeen(new Set(all)); }
  }, [k, loading, loadingJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const fresh = useMemo(() => (seen ? news.filter((x) => !seen.has(x.id)) : []), [news, seen]);
  const onTaskPage = onPage(loc.pathname, TASK_PAGES), onJobPage = onPage(loc.pathname, JOB_PAGES);
  const here = (x: { kind: string }) => onTaskPage || (onJobPage && x.kind !== "task");

  useEffect(() => {
    if (!seen || !k || !fresh.length) return;
    const looking = fresh.filter(here);
    if (looking.length) { // looking at them now: seen
      const next = new Set(seen); for (const x of looking) next.add(x.id);
      write(k, [...next]); setSeen(next);
    }
    const todo = fresh.filter((x) => !here(x) && !toasted.current.has(x.id));
    if (!todo.length) return;
    for (const x of todo) toasted.current.add(x.id);
    if (todo.length > 3) { toast("📋 " + t(`You have ${todo.length} new tasks`, `Tienes ${todo.length} tareas nuevas`)); return; }
    for (const x of todo) {
      const when = [x.date ? fmtDate(x.date, lang) : "", x.time ? fmtTime(x.time) : ""].filter(Boolean).join(" · ");
      if (x.kind === "job") toast("👷 " + t("New job: ", "Trabajo nuevo: ") + x.title + (x.date ? " · " + t("starts ", "empieza ") + fmtDate(x.date, lang) : ""));
      else toast("📋 " + t("New task: ", "Nueva tarea: ") + x.title + (x.jobLabel ? " · " + x.jobLabel.split(" · ")[0] : "") + (when ? " · " + when : ""));
    }
  }, [fresh, onTaskPage, onJobPage, seen, k]); // eslint-disable-line react-hooks/exhaustive-deps

  return fresh.filter((x) => !here(x)).length;
}
