import { useWorkerOptions } from "../data/workers";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClients, useEstimates, useInvoices, useSettings, useTasks } from "../data/hooks";
import { useT } from "../i18n";
import {
  addDaysISO, clientNameOf, daysBetween, downloadICS, fmtTime, gcalLink, jobDates, jobEventData, jobsOn, jobStatus, monthWeeks, tasksOn,
  weekDays, weekStartISO,
} from "../lib/calendar";
import { calcEstimate, jobWhat, todayISO, uid } from "../lib/estimate";
import { fmtDate } from "../lib/format";
import { money, num } from "../lib/money";
import type { Estimate, Task } from "../lib/types";
import { useUi } from "../store/ui";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { StatusBadge } from "../ui/StatusBadge";
import { DOW_EN, DOW_ES, MONTH_EN, MONTH_ES, monthKey, p2, shiftMonth } from "./calendar/dates";
import { WorkerCalendar } from "./calendar/WorkerCalendar";
import { WeekRow } from "./calendar/WeekRow";
import { useAuth } from "../auth/AuthProvider";
import "./Calendar.css";

const stClass = (s: string) => "st-" + s.replace(/\s+/g, "").toLowerCase();
const LS_VIEW = "tw.calView";
const readView = (): "month" | "week" => { try { return localStorage.getItem(LS_VIEW) === "week" ? "week" : "month"; } catch { return "month"; } };

/**
 * Calendar. Owners / admins get the full page (OwnerCalendar). A worker gets WorkerCalendar (only their own tasks), a
 * separate component tree, so a worker never mounts hooks for estimates, invoices, clients or settings.
 */
export default function Calendar() {
  const { role } = useAuth();
  return role === "worker" ? <WorkerCalendar /> : <OwnerCalendar />;
}

function OwnerCalendar() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const es = lang === "es";
  const toast = useUi((s) => s.toast);
  const nav = useNavigate();
  const { rows: estimates, save: saveEst } = useEstimates();
  const { rows: tasks, save: saveTask, remove: removeTask } = useTasks();
  const { rows: invoices } = useInvoices();
  const { rows: clients } = useClients();
  const { settings } = useSettings();
  const workers = useWorkerOptions();
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [day, setDay] = useState<string | null>(null);
  const [draft, setDraft] = useState<(Task & { isNew?: boolean }) | null>(null);
  const [view, setViewS] = useState<"month" | "week">(readView);
  const setView = (v: "month" | "week") => { setViewS(v); try { localStorage.setItem(LS_VIEW, v); } catch { /* private mode */ } };
  const [wk, setWk] = useState(() => weekStartISO(todayISO()));
  const [show, setShow] = useState<"all" | "jobs" | "tasks">("all");
  const [who, setWho] = useState("");

  const today = todayISO();
  const y = num(month.slice(0, 4)), m = num(month.slice(5, 7)) - 1;
  const MON = es ? MONTH_ES : MONTH_EN;
  const wEnd = addDaysISO(wk, 6);
  const title = view === "month" ? MON[m] + " " + y
    : wk.slice(0, 7) === wEnd.slice(0, 7) ? `${MON[num(wk.slice(5, 7)) - 1]} ${num(wk.slice(8))} – ${num(wEnd.slice(8))}, ${wEnd.slice(0, 4)}`
    : `${MON[num(wk.slice(5, 7)) - 1].slice(0, 3)} ${num(wk.slice(8))} – ${MON[num(wEnd.slice(5, 7)) - 1].slice(0, 3)} ${num(wEnd.slice(8))}, ${wEnd.slice(0, 4)}`;
  const nameOf = (e: Estimate) => clientNameOf(e, clients, lang);
  // little avatars in the month grid: who does a task, who is on a job's crew
  const workerOf = (id?: string) => (id ? workers.find((w) => w.id === id) : undefined);
  const ini = (name: string) => (name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "?").toUpperCase();
  const taskClient = (k: Task) => { const est = k.estId ? estimates.find((x) => x.id === k.estId) : undefined; return est ? nameOf(est) : String(k.jobLabel || "").split(" · ").slice(1).join(" · "); };
  const stOf = (e: Estimate) => jobStatus(e, invoices);
  const ctx = { invoices, clients, settings, lang };

  const weeks = useMemo(() => (view === "month" ? monthWeeks(month) : [weekDays(wk)]), [view, month, wk]);
  // what the grid shows: no declined jobs; "Show" and "Person" filters (a person = jobs they are on the crew of, their tasks)
  const shownJobs = useMemo(() => show === "tasks" ? [] : estimates.filter((e) => e.startDate && stOf(e) !== "Declined" && (!who || (e.crew || []).includes(who))),
    [estimates, invoices, show, who]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownTasks = useMemo(() => show === "jobs" ? [] : tasks.filter((k) => !who || k.workerId === who), [tasks, show, who]);

  const week = useMemo(() => {
    const [ty, tm, td] = [num(today.slice(0, 4)), num(today.slice(5, 7)) - 1, num(today.slice(8, 10))];
    const ws = addDaysISO(today, -new Date(ty, tm, td).getDay()), seen = new Set<string>(), list: Estimate[] = [];
    for (let i = 0; i < 7; i++) jobsOn(addDaysISO(ws, i), estimates, invoices).forEach((e) => { if (!seen.has(e.id)) { seen.add(e.id); list.push(e); } });
    return { n: list.length, val: list.reduce((a, e) => a + calcEstimate(e, settings).total, 0) };
  }, [estimates, invoices, settings, today]);

  const pick = (iso: string) => setDay(iso === day ? null : iso);
  const goToday = () => { setMonth(monthKey(today)); setWk(weekStartISO(today)); setDay(today); };
  const step = (dir: -1 | 1) => { if (view === "month") setMonth(shiftMonth(month, dir)); else setWk(addDaysISO(wk, dir * 7)); };
  const switchView = (v: "month" | "week") => {
    // keep looking at the same time: month -> the week of the picked day / today / the 1st; week -> its month
    if (v === "week") setWk(weekStartISO(day && monthKey(day) === month ? day : monthKey(today) === month ? today : month + "-01"));
    else setMonth(monthKey(day && weekDays(wk).includes(day) ? day : addDaysISO(wk, 3)));
    setView(v);
  };

  async function moveJob(e: Estimate, to: string) {
    if (!to || to === e.startDate) return;
    const d = daysBetween(e.startDate, to);
    await saveEst({ ...e, startDate: to });
    let moved = 0;
    if (d) for (const tk of tasks) if (tk.estId === e.id && tk.date) { await saveTask({ ...tk, date: addDaysISO(tk.date, d) }); moved++; }
    setDay(to); setMonth(monthKey(to)); setWk(weekStartISO(to));
    toast(t(`${e.number} moved to ${fmtDate(to, "en")}.`, `${e.number} movido al ${fmtDate(to, "es")}.`) + (moved ? " " + t(`${moved} task(s) moved with the job.`, `${moved} tarea(s) se movieron con el trabajo.`) : ""));
  }
  async function takeOff(e: Estimate) {
    if (!confirm(t(`Take ${e.number} off the calendar? The job stays saved; it only loses its dates.`, `¿Quitar ${e.number} del calendario? El trabajo sigue guardado; solo pierde sus fechas.`))) return;
    await saveEst({ ...e, startDate: "" });
    toast(t(`${e.number} is off the calendar now.`, `${e.number} ya no está en el calendario.`));
  }
  const newTask = (iso?: string | null) => setDraft({ id: uid("task"), title: "", date: iso || day || today, time: "", note: "", estId: "", workerId: "", done: false, isNew: true });
  async function submitTask() {
    if (!draft) return;
    if (!draft.title.trim()) { toast(t("Write what the task is.", "Escribe qué es la tarea.")); return; }
    const { isNew: _n, ...rec } = draft;
    const est = rec.estId ? estimates.find((x) => x.id === rec.estId) : undefined; // the job's name travels with the task (workers can't read estimates)
    await saveTask({ ...rec, title: draft.title.trim(), date: draft.date || today, jobLabel: est ? `${est.number} · ${nameOf(est)}` : "" });
    setDay(draft.date || today); setMonth(monthKey(draft.date || today)); setWk(weekStartISO(draft.date || today)); setDraft(null);
    toast(t("Task saved.", "Tarea guardada."));
  }

  /** A job: bar across its days (month / week grid) or a chip (phone week list). */
  const jobChip = (e: Estimate, start?: string) => {
    const st = stOf(e), n = Math.max(1, Math.round(num(e.days) || 1));
    const crew = (e.crew || []).map((id) => workerOf(id)?.name || "").filter(Boolean);
    const dayNo = start ? jobDates(e).indexOf(start) + 1 : 0;
    return (
      <button className={"cal-chip " + stClass(st) + (st === "Draft" ? " draft" : "")} title={`${nameOf(e)} · ${e.number} · ${st}${n > 1 ? " · " + n + (es ? " días" : " days") : ""}${crew.length ? " · 👷 " + crew.join(", ") : ""}`}
        onClick={(ev) => { ev.stopPropagation(); nav(`/estimates/${e.id}`); }}>
        <span className="nm">{nameOf(e)}</span>
        {n > 1 && <span className="d">{dayNo > 1 ? `${dayNo}/${n}` : es ? `${n} días` : `${n} days`}</span>}
        {crew.length > 0 && <span className="cal-avs">{crew.slice(0, 3).map((nm, j) => <i key={j}>{ini(nm)}</i>)}{crew.length > 3 && <i>+{crew.length - 3}</i>}</span>}
      </button>
    );
  };
  const taskChip = (k: Task) => {
    const w = workerOf(k.workerId), cl = taskClient(k);
    return (
      <button key={k.id} className={"cal-task" + (k.done ? " done" : "")} title={[k.title, w ? "👷 " + w.name : "", cl].filter(Boolean).join(" · ")}
        onClick={(ev) => { ev.stopPropagation(); setDraft({ ...k }); }}>
        <span className="l1">{w && <i className="cal-av">{ini(w.name)}</i>}{k.time && <span className="tm">{fmtTime(k.time)}</span>}<span className="tt">{k.title}</span></span>
        {(cl || w) && <span className="l2">{[w?.name.split(" ")[0], cl].filter(Boolean).join(" · ")}</span>}</button>);
  };
  /** Phone month view: little coloured dots instead of bars. */
  const dots = (iso: string) => {
    const js = shownJobs.filter((e) => jobDates(e).includes(iso)), ts = tasksOn(iso, shownTasks);
    if (!js.length && !ts.length) return null;
    return <div className="cal-dots" aria-hidden>
      {js.slice(0, 4).map((e) => { const st = stOf(e); return <i key={e.id} className={"dot " + stClass(st) + (st === "Draft" ? " draft" : "")} />; })}
      {ts.slice(0, Math.max(0, 4 - js.length)).map((k) => <i key={k.id} className={"dot tk" + (k.done ? " done" : "")} />)}
    </div>;
  };

  const dayJobs = day ? jobsOn(day, estimates, invoices) : [];
  const dayTasks = day ? tasksOn(day, tasks) : [];
  const recent = useMemo(() => estimates.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 60), [estimates]);

  return (
    <div className="page cal">
      <div className="page-h">
        <div><h1>{t("Calendar", "Calendario")}</h1>
          <p>{t(`${week.n} jobs this week · ${money(week.val)} scheduled`, `${week.n} trabajos esta semana · ${money(week.val)} programados`)}</p></div>
        <div className="cal-actions">
          <button className="btn pri" onClick={() => newTask()}><Icon name="plus" />{t("New task", "Nueva tarea")}</button>
        </div>
      </div>

      <div className="card cal-card">
        <div className="cal-bar">
          <div className="cal-nav">
            <button className="btn sm icon-only" aria-label={view === "month" ? t("Previous month", "Mes anterior") : t("Previous week", "Semana anterior")} onClick={() => step(-1)}>‹</button>
            <button className="btn sm" onClick={goToday}>{t("Today", "Hoy")}</button>
            <button className="btn sm icon-only" aria-label={view === "month" ? t("Next month", "Mes siguiente") : t("Next week", "Semana siguiente")} onClick={() => step(1)}>›</button>
            <h2>{title}</h2>
          </div>
          <div className="cal-tools">
            <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label={t("Show", "Mostrar")}>
              <option value="all">{t("Jobs and tasks", "Trabajos y tareas")}</option>
              <option value="jobs">{t("Only jobs", "Solo trabajos")}</option>
              <option value="tasks">{t("Only tasks", "Solo tareas")}</option>
            </select>
            {workers.length > 0 && <select value={who} onChange={(e) => setWho(e.target.value)} aria-label={t("Person", "Persona")}>
              <option value="">{t("Everyone", "Todos")}</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>}
            <div className="seg cal-view">
              <button className={view === "month" ? "on" : ""} onClick={() => switchView("month")}>{t("Month", "Mes")}</button>
              <button className={view === "week" ? "on" : ""} onClick={() => switchView("week")}>{t("Week", "Semana")}</button>
            </div>
          </div>
        </div>
        <div className={"cal-body" + (view === "week" ? " is-week" : "")}>
          <div className="cal-dow">{weeks[0].map((d, i) => <div key={d} className={view === "week" && d === today ? "today" : ""}>{(es ? DOW_ES : DOW_EN)[i]}</div>)}</div>
          <div className={"cal-weeks" + (view === "week" ? " only-desk" : "")}>
            {weeks.map((days) => (
              <WeekRow key={days[0]} days={days} today={today} sel={day} lang={lang} month={view === "month" ? month : undefined}
                jobs={shownJobs} tasks={shownTasks} maxLanes={view === "month" ? 3 : undefined} maxTasks={view === "month" ? 2 : undefined} week={view === "week"}
                jobChip={jobChip} taskChip={taskChip} dots={dots} onPick={pick} />
            ))}
          </div>
          {view === "week" && <div className="cal-agenda only-phone">{weeks[0].map((d) => {
            const js = shownJobs.filter((e) => jobDates(e).includes(d)), ts = tasksOn(d, shownTasks);
            return (
              <div key={d} className={"cal-ag-day" + (d === today ? " today" : "") + (d === day ? " sel" : "")}>
                <button className="cal-ag-h" onClick={() => pick(d)}><b>{(es ? DOW_ES : DOW_EN)[new Date(d + "T12:00:00").getDay()]} {num(d.slice(8))}</b>
                  <span className="muted">{js.length + ts.length ? t(`${js.length + ts.length} item(s)`, `${js.length + ts.length} cosa(s)`) : t("Free", "Libre")}</span></button>
                {js.map((e) => <div key={e.id}>{jobChip(e)}</div>)}
                {ts.map((k) => taskChip(k))}
              </div>);
          })}</div>}
          <div className="cal-legend muted"><i className="lg lg-draft" />{t("Draft", "Borrador")}<i className="lg st-sent" />{t("Sent", "Enviado")}<i className="lg st-accepted" />{t("Accepted", "Aceptado")}<i className="lg st-depositpaid" />{t("Paid", "Pagado")}<i className="lg lg-task" />{t("Task", "Tarea")}</div>
        </div>
      </div>

      {day && (
        <div className="card cal-day">
          <div className="card-h"><h2>{fmtDate(day, lang)}</h2>
            <div className="cal-actions">
              <button className="btn pri sm" onClick={() => newTask(day)}><Icon name="plus" size={16} />{t("New task", "Nueva tarea")}</button>
              <button className="btn sm" onClick={() => setDay(null)}>{t("Close", "Cerrar")}</button>
            </div></div>
          <div className="card-b">
            <div className="cal-sub">{t("Jobs on this day", "Trabajos de este día")}</div>
            {dayJobs.length === 0 && <div className="muted cal-empty">{t("Nothing scheduled for this day.", "No hay nada programado para este día.")}</div>}
            {dayJobs.map((e) => {
              const ev = jobEventData(e, ctx);
              return (
                <div key={e.id} className="cal-job">
                  <span className={"bar " + stClass(stOf(e))} />
                  <div className="info">
                    <div className="nm"><b>{nameOf(e)}</b> <StatusBadge status={stOf(e)} /></div>
                    <div className="muted sm">{e.number}{e.address ? " · " + e.address : ""} · {jobWhat(e, lang)}</div>
                    <div className="muted sm">👷 {e.crew?.length ? e.crew.map((id) => workers.find((w) => w.id === id)?.name || "?").join(", ")
                      : <button className="linkish" onClick={() => nav(`/estimates/${e.id}?tab=jobday`)}>{t("No crew yet — assign", "Sin equipo — asignar")}</button>}</div>
                  </div>
                  <b className="tot">{money(calcEstimate(e, settings).total)}</b>
                  <div className="acts">
                    <label className="mv"><span className="muted">{t("Move to…", "Mover a…")}</span>
                      <input type="date" value={e.startDate || ""} onChange={(x) => moveJob(e, x.target.value)} /></label>
                    <button className="btn sm" onClick={() => takeOff(e)}>{t("Take off", "Quitar")}</button>
                    <button className="btn sm" onClick={() => window.open(gcalLink(ev), "_blank", "noopener")}>+ Google</button>
                    <button className="btn sm" onClick={() => downloadICS(ev)}>+ Outlook/Apple</button>
                    <button className="btn sm" onClick={() => nav(`/estimates/${e.id}`)}>{t("Open", "Abrir")}</button>
                  </div>
                </div>
              );
            })}
            <hr className="cal-hr" />
            <div className="cal-sub">{t("Tasks", "Tareas")}</div>
            {dayTasks.length === 0 && <div className="muted cal-empty">{t("No tasks for this day.", "No hay tareas para este día.")}</div>}
            {dayTasks.map((k) => {
              const job = k.estId ? estimates.find((e) => e.id === k.estId) : undefined;
              const w = k.workerId ? workers.find((x) => x.id === k.workerId) : undefined;
              return (
                <div key={k.id} className="cal-trow">
                  <button className={"chk" + (k.done ? " on" : "")} aria-label={k.done ? t("Mark not done", "Marcar como no hecha") : t("Mark done", "Marcar como hecha")}
                    onClick={() => saveTask({ ...k, done: !k.done })}>✓</button>
                  <div className="info">
                    <div className={"tt" + (k.done ? " done" : "")}>{k.time && <span className="tm">{fmtTime(k.time)}</span>}{k.title}</div>
                    {k.note && <div className="muted sm pre">{k.note}</div>}
                    {(job || w) && <div className="muted sm">{[job && `${job.number} · ${nameOf(job)}`, w?.name].filter(Boolean).join(" · ")}</div>}
                  </div>
                  <button className="btn sm" onClick={() => setDraft({ ...k })}>{t("Edit", "Editar")}</button>
                  <button className="btn sm danger" onClick={() => { if (confirm(t("Delete this task?", "¿Eliminar esta tarea?"))) { removeTask(k.id); toast(t("Task deleted.", "Tarea eliminada.")); } }}>{t("Delete", "Eliminar")}</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {draft && (
        <Modal title={draft.isNew ? t("New task", "Nueva tarea") : t("Edit task", "Editar tarea")} onClose={() => setDraft(null)}>
          <label className="f">{t("What do you need to do?", "¿Qué necesitas hacer?")}
            <input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={t("Buy paint, call the client, pick up materials…", "Comprar pintura, llamar al cliente, recoger materiales…")} /></label>
          <div className="grid2">
            <label className="f">{t("Date", "Fecha")}<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
            <label className="f">{t("Time (optional)", "Hora (opcional)")}<input type="time" value={draft.time || ""} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></label>
          </div>
          <label className="f">{t("Note (optional)", "Nota (opcional)")}<textarea rows={3} value={draft.note || ""} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>
          <label className="f">{t("Link to a job (optional)", "Vincular a un trabajo (opcional)")}
            <select value={draft.estId || ""} onChange={(e) => setDraft({ ...draft, estId: e.target.value })}>
              <option value="">{t("Not linked to a job", "Sin trabajo vinculado")}</option>
              {recent.map((e) => <option key={e.id} value={e.id}>{e.number} · {nameOf(e)}</option>)}
            </select></label>
          {workers.length > 0 && (
            <label className="f">{t("Assign to", "Asignar a")}
              <select value={draft.workerId || ""} onChange={(e) => setDraft({ ...draft, workerId: e.target.value })}>
                <option value="">{t("Me", "Yo")}</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></label>
          )}
          <div className="cal-actions" style={{ marginTop: 6 }}>
            <button className="btn pri" onClick={submitTask}>{t("Save task", "Guardar tarea")}</button>
            {!draft.isNew && <button className="btn danger" onClick={() => { if (confirm(t("Delete this task?", "¿Eliminar esta tarea?"))) { removeTask(draft.id); setDraft(null); toast(t("Task deleted.", "Tarea eliminada.")); } }}>{t("Delete task", "Eliminar tarea")}</button>}
          </div>
        </Modal>
      )}
    </div>
  );
}
