import type { ReactNode } from "react";
import { jobDates, tasksOn, weekSegments } from "../../lib/calendar";
import { fmtDate } from "../../lib/format";
import type { Estimate, Task } from "../../lib/types";
import { useT } from "../../i18n";

type Props = {
  days: string[]; today: string; sel: string | null; lang: "en" | "es";
  /** "YYYY-MM": days of other months are dimmed (month view). */
  month?: string;
  jobs: Estimate[]; tasks: Task[];
  /** How many bar rows and tasks a day shows before "+N more" (month view). Left out = everything (week view). */
  maxLanes?: number; maxTasks?: number;
  week?: boolean;
  jobChip(e: Estimate, start: string): ReactNode;
  taskChip(k: Task): ReactNode;
  dots(iso: string): ReactNode;
  onPick(iso: string): void;
};

/**
 * One week of the calendar: day cells in the background (click = open that day), multi-day jobs as bars that span the
 * days they take (cut ends when they go on before / after the week), then each day's tasks.
 */
export function WeekRow({ days, today, sel, lang, month, jobs, tasks, maxLanes, maxTasks, week, jobChip, taskChip, dots, onPick }: Props) {
  const t = useT();
  const { segs, lanes } = weekSegments(days, jobs.map((e) => ({ item: e, dates: jobDates(e) })));
  const shown = maxLanes === undefined ? lanes : Math.min(lanes, maxLanes);
  return (
    <div className={"cw" + (week ? " week" : "")} style={{ gridTemplateRows: `auto repeat(${shown}, auto) 1fr` }}>
      {days.map((d, i) => {
        const n = jobs.filter((e) => jobDates(e).includes(d)).length + tasksOn(d, tasks).length;
        return (
          <div key={"bg" + d} className={"cw-bg" + (month && d.slice(0, 7) !== month ? " out" : "") + (d === sel ? " sel" : "") + (d === today ? " today" : "")}
            style={{ gridColumn: i + 1, gridRow: "1 / -1" }} role="button" tabIndex={0} aria-label={fmtDate(d, lang) + (n ? ` · ${n}` : "")}
            onClick={() => onPick(d)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onPick(d); } }}>
            {dots(d)}
          </div>
        );
      })}
      {days.map((d, i) => (
        <div key={"n" + d} className="cw-n" style={{ gridColumn: i + 1, gridRow: 1 }}><span className={d === today ? "today" : ""}>{Number(d.slice(8, 10))}</span></div>
      ))}
      {segs.filter((s) => s.lane < shown).map((s) => (
        <div key={"j" + s.item.id} className={"cw-bar" + (s.cutL ? " cl" : "") + (s.cutR ? " cr" : "")} style={{ gridColumn: `${s.from + 1} / ${s.to + 2}`, gridRow: s.lane + 2 }}>
          {jobChip(s.item, days[s.from])}
        </div>
      ))}
      {days.map((d, i) => {
        const all = tasksOn(d, tasks), vis = maxTasks === undefined ? all : all.slice(0, maxTasks);
        const hidden = all.length - vis.length + segs.filter((s) => s.lane >= shown && s.from <= i && s.to >= i).length;
        if (!vis.length && !hidden) return null;
        return (
          <div key={"t" + d} className="cw-tasks" style={{ gridColumn: i + 1, gridRow: shown + 2 }}>
            {vis.map((k) => taskChip(k))}
            {hidden > 0 && <button className="cw-more" onClick={() => onPick(d)}>{t(`+${hidden} more`, `+${hidden} más`)}</button>}
          </div>
        );
      })}
    </div>
  );
}
