import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useTasks } from "../../data/hooks";
import { useT } from "../../i18n";
import { fmtTime, tasksOn } from "../../lib/calendar";
import { todayISO } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import { num } from "../../lib/money";
import { isMyTask, myTasks } from "../../lib/workerView";
import { useUi } from "../../store/ui";
import { EmptyState } from "../../ui/EmptyState";
import { Modal } from "../../ui/Modal";
import { DOW_EN, DOW_ES, MONTH_EN, MONTH_ES, monthKey, p2, shiftMonth } from "./dates";
import "../Calendar.css";

/**
 * The calendar for role "worker": only the tasks assigned to them, month grid + day list, tick done.
 * It mounts only the tasks hook (already filtered to workerId == mine); no estimates, invoices, clients or settings,
 * no "New task", no move / take off. The rules allow a worker to change nothing on a task except `done`.
 */
export function WorkerCalendar() {
  const t = useT();
  const { workerId } = useAuth();
  return (
    <div className="page cal">
      <div className="page-h"><div><h1>{t("Calendar", "Calendario")}</h1><p>{t("The tasks assigned to you.", "Las tareas que te asignaron.")}</p></div></div>
      {!workerId ? (
        <div className="card"><EmptyState icon="calendar" title={t("Ask your boss to link your worker record to your account", "Pídele a tu jefe que vincule tu registro de trabajador a tu cuenta")}
          text={t("Once it is linked, the tasks assigned to you show up here.", "Cuando esté vinculado, aquí verás las tareas que te asignen.")} /></div>
      ) : <WorkerCalendarBody workerId={workerId} />}
    </div>
  );
}

function WorkerCalendarBody({ workerId }: { workerId: string }) {
  const t = useT();
  const lang = useUi((s) => s.lang), toast = useUi((s) => s.toast);
  const es = lang === "es";
  const { rows, patch } = useTasks();
  const tasks = useMemo(() => myTasks(rows, workerId), [rows, workerId]);
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [day, setDay] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const today = todayISO();
  const y = num(month.slice(0, 4)), m = num(month.slice(5, 7)) - 1;
  const startPad = new Date(y, m, 1).getDay(), dim = new Date(y, m + 1, 0).getDate();
  const title = (es ? MONTH_ES[m] : MONTH_EN[m]) + " " + y;

  const cells = useMemo(() => {
    const out: (null | { iso: string; n: number; tasks: typeof tasks })[] = [];
    for (let i = 0; i < startPad; i++) out.push(null);
    for (let n = 1; n <= dim; n++) { const iso = `${y}-${p2(m + 1)}-${p2(n)}`; out.push({ iso, n, tasks: tasksOn(iso, tasks) }); }
    while (out.length % 7) out.push(null);
    return out;
  }, [tasks, y, m, startPad, dim]);

  const openTasks = tasks.filter((k) => !k.done).length;
  const dayTasks = day ? tasksOn(day, tasks) : [];
  const open = openId ? tasks.find((k) => k.id === openId) : undefined;
  const pick = (iso: string) => setDay(iso === day ? null : iso);
  const goToday = () => { setMonth(monthKey(today)); setDay(today); };

  async function tick(id: string) {
    const k = tasks.find((x) => x.id === id);
    if (!k || !isMyTask(k, workerId) || busy) return;
    setBusy(true);
    try { await patch(id, { done: !k.done }); }
    catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Intenta otra vez.")); }
    finally { setBusy(false); }
  }

  const taskRow = (k: (typeof tasks)[number]) => (
    <div key={k.id} className="cal-trow">
      <button className={"chk" + (k.done ? " on" : "")} disabled={busy} aria-label={k.done ? t("Mark not done", "Marcar como no hecha") : t("Mark done", "Marcar como hecha")} onClick={() => tick(k.id)}>✓</button>
      <div className="info">
        <div className={"tt" + (k.done ? " done" : "")}>{k.time && <span className="tm">{fmtTime(k.time)}</span>}{k.title}</div>
        {k.note && <div className="muted sm pre">{k.note}</div>}
      </div>
    </div>
  );

  return (
    <>
      <div className="cal-actions" style={{ marginBottom: 12 }}>
        <span className="muted" style={{ marginRight: "auto" }}>{t(`${openTasks} open task(s)`, `${openTasks} tarea(s) abiertas`)}</span>
        <button className="btn" aria-label={t("Previous month", "Mes anterior")} onClick={() => setMonth(shiftMonth(month, -1))}>←</button>
        <button className="btn" onClick={goToday}>{t("Today", "Hoy")}</button>
        <button className="btn" aria-label={t("Next month", "Mes siguiente")} onClick={() => setMonth(shiftMonth(month, 1))}>→</button>
      </div>

      <div className="card">
        <div className="card-h"><h2>{title}</h2></div>
        <div className="card-b cal-body">
          <div className="cal-dow">{(es ? DOW_ES : DOW_EN).map((d) => <div key={d}>{d}</div>)}</div>
          <div className="cal-grid">
            {cells.map((c, i) => !c ? <div key={i} className="cal-cell out" /> : (
              <div key={c.iso} className={"cal-cell" + (c.iso === today ? " today" : "") + (c.iso === day ? " sel" : "")} role="button" tabIndex={0}
                aria-label={fmtDate(c.iso, lang) + (c.tasks.length ? ` · ${c.tasks.length}` : "")}
                onClick={() => pick(c.iso)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(c.iso); } }}>
                <div className="cal-n">{c.n}</div>
                <div className="cal-chips">
                  {c.tasks.map((k) => (
                    <button key={k.id} className={"cal-task" + (k.done ? " done" : "")} title={k.title} onClick={(ev) => { ev.stopPropagation(); setOpenId(k.id); }}>
                      {k.time && <span className="tm">{fmtTime(k.time)}</span>}<span>{k.title}</span></button>
                  ))}
                </div>
                {c.tasks.length > 0 && <div className="cal-dots" aria-hidden>
                  {c.tasks.slice(0, 4).map((k) => <i key={k.id} className={"dot tk" + (k.done ? " done" : "")} />)}
                </div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {day && (
        <div className="card cal-day">
          <div className="card-h"><h2>{fmtDate(day, lang)}</h2>
            <div className="cal-actions"><button className="btn sm" onClick={() => setDay(null)}>{t("Close", "Cerrar")}</button></div></div>
          <div className="card-b">
            {dayTasks.length === 0 && <div className="muted cal-empty">{t("No tasks for this day.", "No hay tareas para este día.")}</div>}
            {dayTasks.map(taskRow)}
          </div>
        </div>
      )}

      {open && (
        <Modal title={open.title} onClose={() => setOpenId(null)}>
          <p className="muted">{fmtDate(open.date, lang)}{open.time ? " · " + fmtTime(open.time) : ""}</p>
          {open.note && <p className="pre">{open.note}</p>}
          <div className="cal-actions" style={{ marginTop: 6 }}>
            <button className={"btn" + (open.done ? "" : " pri")} disabled={busy} onClick={() => tick(open.id)}>{open.done ? t("Mark not done", "Marcar como no hecha") : t("Mark done", "Marcar como hecha")}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
