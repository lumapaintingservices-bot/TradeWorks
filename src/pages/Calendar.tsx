import { useWorkerOptions } from "../data/workers";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClients, useEstimates, useInvoices, useSettings, useTasks } from "../data/hooks";
import { useT } from "../i18n";
import {
  addDaysISO, clientNameOf, daysBetween, downloadICS, fmtTime, gcalLink, jobDates, jobEventData, jobsOn, jobStatus, tasksOn,
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
import { useAuth } from "../auth/AuthProvider";
import "./Calendar.css";

const stClass = (s: string) => "st-" + s.replace(/\s+/g, "").toLowerCase();

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

  const today = todayISO();
  const y = num(month.slice(0, 4)), m = num(month.slice(5, 7)) - 1;
  const startPad = new Date(y, m, 1).getDay(), dim = new Date(y, m + 1, 0).getDate();
  const title = (es ? MONTH_ES[m] : MONTH_EN[m]) + " " + y;
  const nameOf = (e: Estimate) => clientNameOf(e, clients, lang);
  const stOf = (e: Estimate) => jobStatus(e, invoices);
  const ctx = { invoices, clients, settings, lang };

  const cells = useMemo(() => {
    const out: (null | { iso: string; n: number; jobs: Estimate[]; tasks: Task[] })[] = [];
    for (let i = 0; i < startPad; i++) out.push(null);
    for (let n = 1; n <= dim; n++) {
      const iso = `${y}-${p2(m + 1)}-${p2(n)}`;
      out.push({ iso, n, jobs: jobsOn(iso, estimates, invoices), tasks: tasksOn(iso, tasks) });
    }
    while (out.length % 7) out.push(null);
    return out;
  }, [estimates, invoices, tasks, y, m, startPad, dim]);

  const week = useMemo(() => {
    const [ty, tm, td] = [num(today.slice(0, 4)), num(today.slice(5, 7)) - 1, num(today.slice(8, 10))];
    const ws = addDaysISO(today, -new Date(ty, tm, td).getDay()), seen = new Set<string>(), list: Estimate[] = [];
    for (let i = 0; i < 7; i++) jobsOn(addDaysISO(ws, i), estimates, invoices).forEach((e) => { if (!seen.has(e.id)) { seen.add(e.id); list.push(e); } });
    return { n: list.length, val: list.reduce((a, e) => a + calcEstimate(e, settings).total, 0) };
  }, [estimates, invoices, settings, today]);

  const pick = (iso: string) => setDay(iso === day ? null : iso);
  const goToday = () => { setMonth(monthKey(today)); setDay(today); };

  async function moveJob(e: Estimate, to: string) {
    if (!to || to === e.startDate) return;
    const d = daysBetween(e.startDate, to);
    await saveEst({ ...e, startDate: to });
    let moved = 0;
    if (d) for (const tk of tasks) if (tk.estId === e.id && tk.date) { await saveTask({ ...tk, date: addDaysISO(tk.date, d) }); moved++; }
    setDay(to); setMonth(monthKey(to));
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
    setDay(draft.date || today); setMonth(monthKey(draft.date || today)); setDraft(null);
    toast(t("Task saved.", "Tarea guardada."));
  }

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
          <button className="btn" aria-label={t("Previous month", "Mes anterior")} onClick={() => setMonth(shiftMonth(month, -1))}>←</button>
          <button className="btn" onClick={goToday}>{t("Today", "Hoy")}</button>
          <button className="btn" aria-label={t("Next month", "Mes siguiente")} onClick={() => setMonth(shiftMonth(month, 1))}>→</button>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h2>{title}</h2>
          <span className="cal-legend muted"><i className="lg lg-draft" />{t("Draft", "Borrador")}<i className="lg st-sent" />{t("Sent", "Enviado")}<i className="lg st-accepted" />{t("Accepted", "Aceptado")}<i className="lg st-depositpaid" />{t("Paid", "Pagado")}<i className="lg lg-task" />{t("Task", "Tarea")}</span></div>
        <div className="card-b cal-body">
          <div className="cal-dow">{(es ? DOW_ES : DOW_EN).map((d) => <div key={d}>{d}</div>)}</div>
          <div className="cal-grid">
            {cells.map((c, i) => !c ? <div key={i} className="cal-cell out" /> : (
              <div key={c.iso} className={"cal-cell" + (c.iso === today ? " today" : "") + (c.iso === day ? " sel" : "")} role="button" tabIndex={0}
                aria-label={fmtDate(c.iso, lang) + (c.jobs.length + c.tasks.length ? ` · ${c.jobs.length + c.tasks.length}` : "")}
                onClick={() => pick(c.iso)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(c.iso); } }}>
                <div className="cal-n">{c.n}</div>
                <div className="cal-chips">
                  {c.jobs.map((e) => {
                    const st = stOf(e), n = Math.max(1, Math.round(num(e.days) || 1));
                    return <button key={e.id} className={"cal-chip " + stClass(st) + (st === "Draft" ? " draft" : "")} title={`${nameOf(e)} · ${e.number} · ${st}`}
                      onClick={(ev) => { ev.stopPropagation(); nav(`/estimates/${e.id}`); }}>{nameOf(e)} <span className="d">{jobDates(e).indexOf(c.iso) + 1}/{n}</span></button>;
                  })}
                  {c.tasks.map((k) => (
                    <button key={k.id} className={"cal-task" + (k.done ? " done" : "")} title={k.title}
                      onClick={(ev) => { ev.stopPropagation(); setDraft({ ...k }); }}>
                      {k.time && <span className="tm">{fmtTime(k.time)}</span>}<span>{k.title}</span></button>
                  ))}
                </div>
                {(c.jobs.length + c.tasks.length > 0) && <div className="cal-dots" aria-hidden>
                  {c.jobs.slice(0, 4).map((e) => { const st = stOf(e); return <i key={e.id} className={"dot " + stClass(st) + (st === "Draft" ? " draft" : "")} />; })}
                  {c.tasks.slice(0, Math.max(0, 4 - c.jobs.length)).map((k) => <i key={k.id} className={"dot tk" + (k.done ? " done" : "")} />)}
                </div>}
              </div>
            ))}
          </div>
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
