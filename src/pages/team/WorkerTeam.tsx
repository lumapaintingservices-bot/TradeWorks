import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useClock, useCrewJobs, useHours, useTasks, useWorkers } from "../../data/hooks";
import { crewJobOptions } from "../../lib/crew";
import { fmtTime } from "../../lib/calendar";
import { useT } from "../../i18n";
import { todayISO, uid } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import { getLocation, LOC_CONSENT_V, LOC_KEEP_DAYS, locAllowed, locAnswered } from "../../lib/geo";
import { HourHistory } from "./HourHistory";
import { num } from "../../lib/money";
import { RANGE_KEYS, clockElapsed, clockFor, clockHHMM, clockTimes, hoursText, rangeBounds, type RangeKey } from "../../lib/team";
import { isMyTask, myHoursIn, myTasks, sumHours, workerClockEntry, workerHoursEntry } from "../../lib/workerView";
import { addDaysISO } from "../../lib/calendar";
import { allWork, workToday, type WorkItem } from "../../lib/work";
import { tickCrew } from "../../data/crew";
import { DurationInput } from "../../ui/DurationInput";
import { Link } from "react-router-dom";
import { WorkerPhotos } from "./WorkerPhotos";
import type { HourEntry } from "../../lib/types";
import { useUi } from "../../store/ui";
import { EmptyState } from "../../ui/EmptyState";
import { Icon } from "../../ui/Icon";
import { Modal } from "../../ui/Modal";
import "../Team.css";
import "./worker.css";
import { DatePicker } from "../../ui/DatePicker";

const hrs = hoursText;
const RANGE_LABEL: Record<RangeKey, [string, string]> = {
  week: ["This week", "Esta semana"], month: ["This month", "Este mes"], lastMonth: ["Last month", "Mes pasado"],
  ytd: ["Year to date", "En lo que va del año"], lastYear: ["Last year", "Año pasado"], all: ["All", "Todo"],
};

/**
 * The Team page for role "worker". It only ever reads what firestore.rules allow: my hours, my clock, my worker record and
 * the tasks assigned to me (+ my own job photos). No estimates, invoices, clients, settings, payouts, other workers, or any pay figure is shown.
 */
export function WorkerTeam() {
  const t = useT();
  const { workerId } = useAuth();
  return (
    <div className="page">
      <div className="page-h"><div><h1>{t("Team", "Equipo")}</h1><p>{t("Clock in, see your tasks and your hours.", "Marca entrada, mira tus tareas y tus horas.")}</p></div>
        {workerId && <Link className="btn" to="/timesheet">{t("My hours & pay", "Mis horas y pagos")} →</Link>}</div>
      {!workerId ? (
        <div className="card"><EmptyState icon="team" title={t("Ask your boss to link your worker record to your account", "Pídele a tu jefe que vincule tu registro de trabajador a tu cuenta")}
          text={t("Once it is linked you can clock in and out, log your hours and see the tasks assigned to you.", "Cuando esté vinculado podrás marcar entrada y salida, anotar tus horas y ver las tareas que te asignen.")} /></div>
      ) : <WorkerBody workerId={workerId} />}
    </div>
  );
}

function WorkerBody({ workerId }: { workerId: string }) {
  const t = useT();
  const { company } = useAuth();
  const track = !!company?.trackLocation; // the owner turned on "location at clock-in" (Team > map)
  const lang = useUi((s) => s.lang), toast = useUi((s) => s.toast);
  const { rows: hours, save: saveHours } = useHours();
  const { rows: clocks, save: saveClock, remove: removeClock } = useClock();
  const { rows: taskRows, patch: patchTask } = useTasks();
  const { rows: workerRows, patch: patchWorker } = useWorkers();
  const me = workerRows.find((w) => w.id === workerId) || null; // my own record (the rate is used silently, never shown)
  // location: only with the worker's own yes to the current notice (and only while the owner has it on)
  const allowLoc = locAllowed(track, me), askLoc = track && !!me && !locAnswered(me);
  const [locAsk, setLocAsk] = useState(false); // the notice, opened by "Clock in" while it has no answer
  const answerLoc = (on: boolean) => guard("loc", async () => {
    await patchWorker(workerId, { locConsent: { on, at: new Date().toISOString(), v: LOC_CONSENT_V } });
    setLocAsk(false);
    toast(on ? t("Thanks. Your location is saved only while you're on the clock.", "Gracias. Tu ubicación se guarda solo mientras estás trabajando.") : t("OK. Your location is not saved.", "Listo. Tu ubicación no se guarda."));
  });
  const tasks = useMemo(() => myTasks(taskRows, workerId), [taskRows, workerId]);
  const clock = clocks.find((c) => c.id === workerId);

  const [range, setRange] = useState<RangeKey>("week");
  // the clock always runs for ONE piece of today's work (owner rule): a task of mine, or one of my lines of today's job;
  // only one: picked by itself
  const { rows: crewJobs } = useCrewJobs();
  const taskOpts = useMemo(() => workToday(tasks, crewJobs, workerId, todayISO()), [tasks, crewJobs, workerId]);
  const work = useMemo(() => allWork(tasks, crewJobs, workerId), [tasks, crewJobs, workerId]);
  const photoJobs = useMemo(() => crewJobOptions(crewJobs, workerId, todayISO(), "near"), [crewJobs, workerId]);
  const today = todayISO();
  const [taskPick, setTaskPick] = useState("");
  const task = taskOpts.find((k) => k.id === taskPick) || (taskOpts.length === 1 ? taskOpts[0] : undefined);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!clock) return;
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(i);
  }, [clock]);

  const b = useMemo(() => rangeBounds(range), [range]);
  const list = useMemo(() => myHoursIn(hours, workerId, b), [hours, workerId, b]);
  const todayHours = useMemo(() => sumHours(myHoursIn(hours, workerId, { from: today, to: today })), [hours, workerId, today]);

  const guard = async (key: string, fn: () => Promise<void>) => {
    if (busy[key]) return;
    setBusy((x) => ({ ...x, [key]: true }));
    try { await fn(); } catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Intenta otra vez.")); } finally { setBusy((x) => ({ ...x, [key]: false })); }
  };
  const noLoc = () => toast(t("Clocked. Your location is off: allow it for TradeWorks so your boss sees you at the job.", "Registrado. Tu ubicación está apagada: permítela para TradeWorks y tu jefe verá que estás en el trabajo."));
  const clockIn = () => guard("clk", async () => {
    if (clock || !task) return;
    if (askLoc) { setLocAsk(true); return; } // answer the location notice first
    const loc = allowLoc ? await getLocation() : null;
    await saveClock({ id: workerId, ...clockFor(task, new Date().toISOString()), ...(loc ? { loc, last: loc } : {}) });
    if (allowLoc && !loc) noLoc(); else toast(t("Clocked in.", "Entrada registrada."));
  });
  const clockOut = () => guard("clk", async () => {
    if (!clock) return;
    const outLoc = allowLoc ? await getLocation() : null;
    const entry = { ...workerClockEntry(clock, workerId, me, t("Clock in/out", "Entrada/salida")), ...(clock.loc ? { inLoc: clock.loc } : {}), ...(outLoc ? { outLoc } : {}) };
    if (allowLoc && !outLoc) noLoc();
    // exactly the minutes on the clock (no rounding); under a minute nothing is saved
    if (entry.hours > 0) await saveHours(entry as unknown as HourEntry);
    await removeClock(workerId);
    toast(entry.hours > 0 ? t(`${hoursText(entry.hours)} saved.`, `${hoursText(entry.hours)} guardadas.`) : t("Less than a minute on the clock: nothing saved.", "Menos de un minuto en el reloj: no se guardó nada."));
  });
  // tick a task of mine, or one of my lines on a job's checklist (the crew copy holds those ticks)
  const tick = (k: WorkItem) => {
    if (k.kind === "check") {
      const j = crewJobs.find((x) => (x.estId || x.id) === k.estId);
      if (!j || !company || !k.key) return;
      return guard("task" + k.id, () => tickCrew(company.id, j, k.key!, !k.done, me?.name || ""));
    }
    const task = tasks.find((x) => x.id === k.id);
    if (!task || !isMyTask(task, workerId)) return;
    return guard("task" + k.id, async () => { await patchTask(k.id, { done: !k.done }); });
  };
  // my work list: today (plus late tasks), the next two weeks, done tasks
  const later = addDaysISO(today, 14);
  const todayWork = work.filter((k) => k.date === today || (k.kind === "task" && !k.done && k.date < today));
  const comingUp = work.filter((k) => k.date > today && k.date <= later && !k.done).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 40);
  const doneTasks = work.filter((k) => k.kind === "task" && k.done && k.date !== today).reverse().slice(0, 10);
  const openToday = todayWork.filter((k) => !k.done).length;

  const el = clock ? clockElapsed(clock.at, now) : null;
  const row = (k: WorkItem) => (
    <div key={k.id} className="wk-task">
      <button className={"wk-chk" + (k.done ? " on" : "")} disabled={busy["task" + k.id]} aria-label={k.done ? t("Mark not done", "Marcar como no hecha") : t("Mark done", "Marcar como hecha")}
        onClick={() => tick(k)}>✓</button>
      <div className="wk-info">
        <div className={"wk-tt" + (k.done ? " done" : "")}>{k.title}</div>
        <div className="muted wk-sub">{[k.date !== today && k.date ? fmtDate(k.date, lang) : "", k.time ? fmtTime(k.time) : "", k.jobLabel, k.crewWide ? t("whole crew", "todo el equipo") : ""].filter(Boolean).join(" · ")}</div>
        {k.note && <div className="muted wk-sub wk-pre">{k.note}</div>}
      </div>
    </div>);
  return (
    <>
      <section className="card wk-clock">
        <div className="wk-clock-t">
          <span className="wk-lbl">{t("Time clock", "Reloj de entrada")}</span>
          {el ? <b className="wk-run" aria-label={hoursText(el.h + el.m / 60)}>● {clockHHMM(el)}<small>{t("h:min", "h:min")}</small></b> : <b>{t("Not clocked in", "Sin entrada")}</b>}
          <small className="muted">{el ? hoursText(el.h + el.m / 60) + " · " + t("started at ", "empezaste a las ") + new Date(clock!.at).toLocaleTimeString(lang === "es" ? "es" : "en", { hour: "numeric", minute: "2-digit" }) : t("Pick the task you are starting, then tap Clock in.", "Elige la tarea que vas a empezar y toca Entrada.")}</small>
          {el && clock?.taskTitle && <small className="wk-on-task">{t("Task: ", "Tarea: ")}<b>{clock.taskTitle}</b>{clock.jobLabel ? " · " + clock.jobLabel : ""}</small>}
          {el && !clock?.taskTitle && clock?.jobLabel && <small className="muted">{t("Job: ", "Trabajo: ")}{clock.jobLabel}</small>}
        </div>
        {!el && (taskOpts.length === 0
          ? <p className="wk-notask">{t("You have no tasks for today. Ask your boss to assign you work to clock in.", "No tienes tareas para hoy. Pídele a tu jefe que te asigne trabajo para marcar entrada.")}</p>
          : <div className="wk-pick" role="radiogroup" aria-label={t("Task", "Tarea")}>
              {taskOpts.map((k) => (
                <label key={k.id} className={"wk-opt" + (task?.id === k.id ? " on" : "")}>
                  <input type="radio" name="clock-task" checked={task?.id === k.id} onChange={() => setTaskPick(k.id)} />
                  <span className="wk-opt-t"><b>{k.title}</b>{(k.time || k.jobLabel) && <small>{[k.time ? fmtTime(k.time) : "", k.kind === "check" && k.date < today ? t("from an earlier day", "de un día anterior") : "", k.jobLabel || ""].filter(Boolean).join(" · ")}</small>}</span>
                </label>))}
            </div>)}
        {el
          ? <button className="btn pri wk-btn" disabled={busy.clk} onClick={clockOut}><Icon name="clock" size={18} />{t("Clock out", "Salida")}</button>
          : <button className="btn pri wk-btn" disabled={busy.clk || !task} onClick={clockIn}><Icon name="clock" size={18} />{task ? t("Clock in", "Entrada") : taskOpts.length ? t("Pick a task", "Elige una tarea") : t("Clock in", "Entrada")}</button>}
        {track && (askLoc ? <LocNotice busy={!!busy.loc} onAnswer={answerLoc} />
          : <p className="wk-loc muted">📍 {allowLoc
            ? <>{t(`Your location is saved when you clock in and out, and every 5 minutes while TradeWorks is open during your shift. Never when you're clocked out. Deleted after ${LOC_KEEP_DAYS} days.`, `Tu ubicación se guarda al marcar entrada y salida, y cada 5 minutos mientras TradeWorks esté abierto en tu turno. Nunca cuando no estás trabajando. Se borra a los ${LOC_KEEP_DAYS} días.`)}
              {" "}<button type="button" className="linkish" disabled={busy.loc} onClick={() => answerLoc(false)}>{t("Stop saving my location", "Dejar de guardar mi ubicación")}</button></>
            : <>{t("Your location is not saved.", "Tu ubicación no se guarda.")} <button type="button" className="linkish" disabled={busy.loc} onClick={() => answerLoc(true)}>{t("Allow it while I'm on the clock", "Permitirla mientras trabajo")}</button></>}</p>)}
      </section>

      <WorkerPhotos workerId={workerId} tasks={tasks} clock={clock} extraJobs={photoJobs} />

      <div className="toolbar"><div className="pills">{RANGE_KEYS.map((k) => (
        <button key={k} className={"pill" + (range === k ? " on" : "")} onClick={() => setRange(k)}>{t(...RANGE_LABEL[k])}</button>))}</div></div>

      <div className="tm-tiles wk-tiles">
        <div className="card tm-tile"><span>{t("My hours", "Mis horas")}</span><b>{hrs(sumHours(list))}</b><small>{t(...RANGE_LABEL[range])}</small></div>
        <div className="card tm-tile"><span>{t("Today", "Hoy")}</span><b>{hrs(todayHours)}</b></div>
        <div className="card tm-tile"><span>{t("Tasks today", "Tareas hoy")}</span><b>{openToday}</b></div>
      </div>

      <section className="card tm-sec">
        <div className="card-h"><h2>{t("My hours", "Mis horas")}</h2><button className="btn sm" onClick={() => setModal(true)}>{t("+ Hours", "+ Horas")}</button></div>
        {list.length === 0 ? <p className="muted tm-empty">{t("No hours in this period.", "No hay horas en este periodo.")}</p> : (
          <>
            <div className="only-desk tbl-wrap">
              <table className="tbl tm-tbl">
                <thead><tr><th>{t("Date", "Fecha")}</th><th>{t("In – out", "Entrada – salida")}</th><th className="r">{t("Hours", "Horas")}</th><th>{t("Note", "Nota")}</th></tr></thead>
                <tbody>{list.slice(0, 80).map((h) => (
                  <tr key={h.id}>
                    <td className="nw">{fmtDate(h.date, lang)}</td><td className="nw">{clockTimes(h, lang) || <span className="muted">—</span>}</td><td className="r nw">{hrs(num(h.hours))}</td><td className="muted tm-note">{h.note || ""}{h.edits?.length ? <HourHistory h={h} compact /> : null}</td>
                  </tr>))}</tbody>
              </table>
            </div>
            <div className="cards only-phone tm-cards">{list.slice(0, 80).map((h) => (
              <div key={h.id} className="tm-card">
                <div className="l1"><span>{fmtDate(h.date, lang)}</span><span>{hrs(num(h.hours))}</span></div>
                {clockTimes(h, lang) && <div className="l2"><span>🕒 {clockTimes(h, lang)}</span></div>}
                <div className="l2"><span>{h.note || "—"}</span></div>
                {h.edits?.length ? <HourHistory h={h} compact /> : null}
              </div>))}</div>
            <p className="muted wk-hnote">{t("Only your boss can change or delete hours; you see here what they changed. If something is wrong, tell them.", "Solo tu jefe puede cambiar o borrar horas; aquí ves lo que cambió. Si algo está mal, avísale.")}</p>
          </>
        )}
      </section>

      <section className="card tm-sec">
        <div className="card-h"><h2>{t("My tasks", "Mis tareas")}</h2><Link className="btn sm" to="/jobs">{t("My jobs", "Mis trabajos")}</Link></div>
        {!todayWork.length && !comingUp.length && !doneTasks.length ? <p className="muted tm-empty">{t("Nothing is assigned to you right now.", "No tienes nada asignado por ahora.")}</p> : (
          <div className="wk-tasks">
            <div className="wk-grp">{t("Today", "Hoy")}</div>
            {todayWork.length ? todayWork.map(row) : <p className="muted wk-none">{t("Nothing for today.", "Nada para hoy.")}</p>}
            {comingUp.length > 0 && <div className="wk-grp">{t("Coming up", "Próximos días")}</div>}
            {comingUp.map(row)}
            {doneTasks.length > 0 && <div className="wk-grp">{t("Done", "Hechas")}</div>}
            {doneTasks.map(row)}
          </div>
        )}
      </section>

      {locAsk && askLoc && (
        <Modal title={t("Your location at work", "Tu ubicación en el trabajo")} onClose={() => setLocAsk(false)}>
          <LocNotice busy={!!busy.loc} onAnswer={(on) => { answerLoc(on); }} inModal />
        </Modal>
      )}
      {modal && (
        <WorkerHoursModal onClose={() => setModal(false)}
          onSave={async (f) => { await saveHours(workerHoursEntry(uid("h"), workerId, me, f) as unknown as HourEntry); setModal(false); toast(t("Hours saved.", "Horas guardadas.")); }} />
      )}
    </>
  );
}

function WorkerHoursModal({ onSave, onClose }: { onSave(f: { date: string; hours: number; note: string }): Promise<void>; onClose(): void }) {
  const t = useT(), toast = useUi((s) => s.toast);
  const [date, setDate] = useState(todayISO());
  const [h, setH] = useState(0); // hours, kept to the minute
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    if (!(num(h) > 0)) { toast(t("Write the time worked.", "Escribe el tiempo trabajado.")); return; }
    setSaving(true);
    try { await onSave({ date, hours: num(h), note }); }
    catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Intenta otra vez.")); setSaving(false); }
  };
  return (
    <Modal title={t("Log hours", "Anotar horas")} onClose={onClose}>
      <div className="grid2">
        <label className="f">{t("Date", "Fecha")}<DatePicker value={date} onChange={(v) => setDate(v)} /></label>
        <DurationInput label={t("Time worked", "Tiempo trabajado")} value={num(h)} onChange={setH} />
      </div>
      <label className="f">{t("Note (optional)", "Nota (opcional)")}<input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Sanding, priming, spraying…", "Lijado, primer, sprayado…")} /></label>
      <div className="tm-actions"><button className="btn pri" disabled={saving} onClick={save}>{t("Save", "Guardar")}</button></div>
    </Modal>
  );
}

/** The location notice (the worker's own yes / no, kept on their record with the date and the notice version). */
function LocNotice({ busy, onAnswer, inModal }: { busy: boolean; onAnswer(on: boolean): void; inModal?: boolean }) {
  const t = useT();
  return (
    <div className={"wk-locq" + (inModal ? " in" : "")}>
      {!inModal && <b>📍 {t("Your location at work", "Tu ubicación en el trabajo")}</b>}
      <p>{t("Your boss would like TradeWorks to save your phone's location while you are on the clock, to see that you are at the job.", "Tu jefe quiere que TradeWorks guarde la ubicación de tu teléfono mientras trabajas, para ver que estás en el trabajo.")}</p>
      <ul>
        <li>{t("When: when you clock in and out, and every 5 minutes while TradeWorks is open during your shift. Never when you're clocked out or the app is closed.", "Cuándo: al marcar entrada y salida, y cada 5 minutos mientras TradeWorks esté abierto en tu turno. Nunca cuando no estás trabajando o la app está cerrada.")}</li>
        <li>{t("Who sees it: your boss and the company's admins, on the team map and your hours.", "Quién la ve: tu jefe y los administradores de la empresa, en el mapa del equipo y en tus horas.")}</li>
        <li>{t(`How long: deleted after ${LOC_KEEP_DAYS} days.`, `Cuánto tiempo: se borra a los ${LOC_KEEP_DAYS} días.`)}</li>
        <li>{t("You can change your answer at any time on this page. You can clock in either way.", "Puedes cambiar tu respuesta cuando quieras en esta página. Puedes marcar entrada de las dos formas.")}</li>
      </ul>
      <div className="wk-locq-b">
        <button className="btn pri" disabled={busy} onClick={() => onAnswer(true)}>{t("I agree", "Acepto")}</button>
        <button className="btn" disabled={busy} onClick={() => onAnswer(false)}>{t("No, don't save it", "No, no la guarden")}</button>
      </div>
    </div>
  );
}
