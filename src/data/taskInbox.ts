import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useT } from "../i18n";
import { fmtTime } from "../lib/calendar";
import { fmtDate } from "../lib/format";
import { unseenTasks } from "../lib/workerView";
import { useUi } from "../store/ui";
import { useTasks } from "./hooks";

const key = (cid: string, uid: string) => `tw.seenTasks.${cid}.${uid}`;
const read = (k: string): string[] | null => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const write = (k: string, ids: string[]) => { try { localStorage.setItem(k, JSON.stringify(ids.slice(-500))); } catch { /* private mode */ } };
/** Pages where a worker sees their tasks: being there counts as having seen them. */
const TASK_PAGES = ["/calendar", "/team"];

/**
 * Workers: a toast the moment the boss assigns them a task ("📋 New task: Prep the kitchen · Thu, Oct 2 · 8:00 AM"), and
 * the number of tasks not seen yet for the Calendar badge. Seen = remembered per device; the first time nothing is
 * announced (old tasks are not news). Opening the Calendar or Team page marks them seen.
 */
export function useTaskInbox(): number {
  const t = useT();
  const { company, user, workerId } = useAuth();
  const lang = useUi((s) => s.lang), toast = useUi((s) => s.toast);
  const loc = useLocation();
  const { rows: tasks, loading } = useTasks();
  const k = company && user ? key(company.id, user.uid) : "";
  const [seen, setSeen] = useState<Set<string> | null>(null);
  const toasted = useRef(new Set<string>());

  // load what this device has seen; the very first time, everything there is now counts as seen
  useEffect(() => {
    if (!k || loading) return;
    const saved = read(k);
    if (saved) setSeen(new Set(saved));
    else { const all = tasks.map((x) => x.id); write(k, all); setSeen(new Set(all)); }
  }, [k, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const fresh = useMemo(() => (seen ? unseenTasks(tasks, seen, workerId) : []), [tasks, seen, workerId]);
  const onTaskPage = TASK_PAGES.some((p) => loc.pathname === p || loc.pathname.startsWith(p + "/"));

  useEffect(() => {
    if (!seen || !k || !fresh.length) return;
    if (onTaskPage) { // looking at them now: seen
      const next = new Set(seen); for (const x of fresh) next.add(x.id);
      write(k, [...next]); setSeen(next);
      return;
    }
    for (const x of fresh) {
      if (toasted.current.has(x.id)) continue;
      toasted.current.add(x.id);
      const when = [x.date ? fmtDate(x.date, lang) : "", x.time ? fmtTime(x.time) : ""].filter(Boolean).join(" · ");
      toast("📋 " + t("New task: ", "Nueva tarea: ") + x.title + (when ? " · " + when : ""));
    }
  }, [fresh, onTaskPage, seen, k]); // eslint-disable-line react-hooks/exhaustive-deps

  return onTaskPage ? 0 : fresh.length;
}
