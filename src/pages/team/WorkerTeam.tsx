import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useClock, useHours, useTasks, useWorkers } from "../../data/hooks";
import { useT } from "../../i18n";
import { todayISO, uid } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import { getLocation } from "../../lib/geo";
import { num } from "../../lib/money";
import { RANGE_KEYS, clockElapsed, clockTimes, rangeBounds, type RangeKey } from "../../lib/team";
import { clockJobOptions, isMyTask, myHoursIn, myTasks, splitTasks, sumHours, workerClockEntry, workerHoursEntry } from "../../lib/workerView";
import { Link } from "react-router-dom";
import type { HourEntry } from "../../lib/types";
import { useUi } from "../../store/ui";
import { EmptyState } from "../../ui/EmptyState";
import { Icon } from "../../ui/Icon";
import { Modal } from "../../ui/Modal";
import { NumInput } from "../../ui/NumInput";
import "../Team.css";
import "./worker.css";

const hrs = (n: number) => n.toFixed(1) + " h";
const RANGE_LABEL: Record<RangeKey, [string, string]> = {
  week: ["This week", "Esta semana"], month: ["This month", "Este mes"], lastMonth: ["Last month", "Mes pasado"],
  ytd: ["Year to date", "En lo que va del año"], lastYear: ["Last year", "Año pasado"], all: ["All", "Todo"],
};

/**
 * The Team page for role "worker". It only ever reads what firestore.rules allow: my hours, my clock, my worker record and
 * the tasks assigned to me. No estimates, invoices, clients, settings, payouts, other workers, or any pay figure is shown.
 */
export function WorkerTeam() {
  const t = useT();
  const { workerId } = useAuth();
  return (
    <div className="page">
      <div className="page-h"><div><h1>{t("Team", "Equipo")}</h1><p>{t("Your hours and your tasks.", "Tus horas y tus tareas.")}</p></div>
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
  const track = !!useAuth().company?.trackLocation; // the owner turned on "location at clock-in" (Team > map)
  const lang = useUi((s) => s.lang), toast = useUi((s) => s.toast);
  const { rows: hours, save: saveHours, remove: removeHours } = useHours();
  const { rows: clocks, save: saveClock, remove: removeClock } = useClock();
  const { rows: taskRows, patch: patchTask } = useTasks();
  const { rows: workerRows } = useWorkers();
  const me = workerRows.find((w) => w.id === workerId) || null; // my own record (the rate is used silently, never shown)
  const tasks = useMemo(() => myTasks(taskRows, workerId), [taskRows, workerId]);
  const { open, done } = useMemo(() => splitTasks(tasks), [tasks]);
  const clock = clocks.find((c) => c.id === workerId);

  const [range, setRange] = useState<RangeKey>("week");
  // the job for the next clock-in: from my tasks for today (one task: picked by itself)
  const jobOpts = useMemo(() => clockJobOptions(tasks, todayISO()), [tasks]);
  const [jobPick, setJobPick] = useState("");
  const job = jobOpts.find((o) => o.estId === jobPick) || (jobPick === "none" ? undefined : jobOpts[0]);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!clock) return;
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(i);
  }, [clock]);

  const b = useMemo(() => rangeBounds(range), [range]);
  const list = useMemo(() => myHoursIn(hours, workerId, b), [hours, workerId, b]);
  const today = todayISO();
  const todayHours = useMemo(() => sumHours(myHoursIn(hours, workerId, { from: today, to: today })), [hours, workerId, today]);

  const guard = async (key: string, fn: () => Promise<void>) => {
    if (busy[key]) return;
    setBusy((x) => ({ ...x, [key]: true }));
    try { await fn(); } catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Intenta otra vez.")); } finally { setBusy((x) => ({ ...x, [key]: false })); }
  };
  const noLoc = () => toast(t("Clocked. Your location is off: allow it for TradeWorks so your boss sees you at the job.", "Registrado. Tu ubicación está apagada: permítela para TradeWorks y tu jefe verá que estás en el trabajo."));
  const clockIn = () => guard("clk", async () => {
    if (clock) return;
    const loc = track ? await getLocation() : null;
    await saveClock({ id: workerId, at: new Date().toISOString(), estId: job?.estId || "", ...(job ? { jobLabel: job.label } : {}), ...(loc ? { loc, last: loc } : {}) });
    if (track && !loc) noLoc(); else toast(t("Clocked in.", "Entrada registrada."));
  });
  const clockOut = () => guard("clk", async () => {
    if (!clock) return;
    const outLoc = track ? await getLocation() : null;
    const entry = { ...workerClockEntry(clock, workerId, me, t("Clock in/out", "Entrada/salida")), ...(clock.loc ? { inLoc: clock.loc } : {}), ...(outLoc ? { outLoc } : {}) };
    if (track && !outLoc) noLoc();
    await saveHours(entry as unknown as HourEntry);
    await removeClock(workerId);
    toast(t(`${entry.hours} h saved.`, `${entry.hours} h guardadas.`));
  });
  const tick = (id: string, isDone: boolean) => {
    const k = tasks.find((x) => x.id === id);
    if (!k || !isMyTask(k, workerId)) return;
    return guard("task" + id, async () => { await patchTask(id, { done: !isDone }); });
  };
  const delHours = (id: string) => { if (confirm(t("Delete these hours?", "¿Borrar estas horas?"))) guard("h" + id, () => removeHours(id)); };

  const el = clock ? clockElapsed(clock.at, now) : null;
  return (
    <>
      <section className="card wk-clock">
        <div className="wk-clock-t">
          <span className="wk-lbl">{t("Time clock", "Reloj de entrada")}</span>
          {el ? <b className="wk-run">● {el.h}h {String(el.m).padStart(2, "0")}m</b> : <b>{t("Not clocked in", "Sin entrada")}</b>}
          <small className="muted">{el ? t("Started at ", "Empezaste a las ") + new Date(clock!.at).toLocaleTimeString(lang === "es" ? "es" : "en", { hour: "numeric", minute: "2-digit" }) : t("Tap when you start working.", "Toca cuando empieces a trabajar.")}</small>
          {el && clock?.jobLabel && <small className="muted">{t("Job: ", "Trabajo: ")}{clock.jobLabel}</small>}
          {!el && jobOpts.length > 1 && <label className="wk-job">{t("Job", "Trabajo")}
            <select value={job?.estId || "none"} onChange={(e) => setJobPick(e.target.value)}>
              {jobOpts.map((o) => <option key={o.estId} value={o.estId}>{o.label}</option>)}
              <option value="none">{t("Other / no job", "Otro / sin trabajo")}</option>
            </select></label>}
          {!el && jobOpts.length === 1 && <small className="muted">{t("Job: ", "Trabajo: ")}{jobOpts[0].label}</small>}
        </div>
        {el
          ? <button className="btn pri wk-btn" disabled={busy.clk} onClick={clockOut}><Icon name="clock" size={18} />{t("Clock out", "Salida")}</button>
          : <button className="btn pri wk-btn" disabled={busy.clk} onClick={clockIn}><Icon name="clock" size={18} />{t("Clock in", "Entrada")}</button>}
        {track && <p className="wk-loc muted">📍 {t("Your location is saved when you clock in and out, and every few minutes while TradeWorks is open during your shift, so your boss can see you're at the job. Nothing is saved when you're clocked out.",
          "Tu ubicación se guarda al marcar entrada y salida, y cada pocos minutos mientras TradeWorks esté abierto en tu turno, para que tu jefe vea que estás en el trabajo. No se guarda nada cuando no estás trabajando.")}</p>}
      </section>

      <div className="toolbar"><div className="pills">{RANGE_KEYS.map((k) => (
        <button key={k} className={"pill" + (range === k ? " on" : "")} onClick={() => setRange(k)}>{t(...RANGE_LABEL[k])}</button>))}</div></div>

      <div className="tm-tiles wk-tiles">
        <div className="card tm-tile"><span>{t("My hours", "Mis horas")}</span><b>{hrs(sumHours(list))}</b><small>{t(...RANGE_LABEL[range])}</small></div>
        <div className="card tm-tile"><span>{t("Today", "Hoy")}</span><b>{hrs(todayHours)}</b></div>
        <div className="card tm-tile"><span>{t("Open tasks", "Tareas abiertas")}</span><b>{open.length}</b></div>
      </div>

      <section className="card tm-sec">
        <div className="card-h"><h2>{t("My hours", "Mis horas")}</h2><button className="btn sm" onClick={() => setModal(true)}>{t("+ Hours", "+ Horas")}</button></div>
        {list.length === 0 ? <p className="muted tm-empty">{t("No hours in this period.", "No hay horas en este periodo.")}</p> : (
          <>
            <div className="only-desk tbl-wrap">
              <table className="tbl tm-tbl">
                <thead><tr><th>{t("Date", "Fecha")}</th><th>{t("In – out", "Entrada – salida")}</th><th className="r">{t("Hours", "Horas")}</th><th>{t("Note", "Nota")}</th><th /></tr></thead>
                <tbody>{list.slice(0, 80).map((h) => (
                  <tr key={h.id}>
                    <td className="nw">{fmtDate(h.date, lang)}</td><td className="nw">{clockTimes(h, lang) || <span className="muted">—</span>}</td><td className="r nw">{hrs(num(h.hours))}</td><td className="muted tm-note">{h.note || ""}</td>
                    <td className="r"><button className="btn sm danger" disabled={busy["h" + h.id]} onClick={() => delHours(h.id)} aria-label={t("Delete", "Borrar")} title={t("Delete", "Borrar")}>×</button></td>
                  </tr>))}</tbody>
              </table>
            </div>
            <div className="cards only-phone tm-cards">{list.slice(0, 80).map((h) => (
              <div key={h.id} className="tm-card">
                <div className="l1"><span>{fmtDate(h.date, lang)}</span><span>{hrs(num(h.hours))}</span></div>
                {clockTimes(h, lang) && <div className="l2"><span>🕒 {clockTimes(h, lang)}</span></div>}
                <div className="l2"><span>{h.note || "—"}</span><button className="btn sm danger" disabled={busy["h" + h.id]} onClick={() => delHours(h.id)} aria-label={t("Delete", "Borrar")}>×</button></div>
              </div>))}</div>
          </>
        )}
      </section>

      <section className="card tm-sec">
        <div className="card-h"><h2>{t("My tasks", "Mis tareas")}</h2></div>
        {tasks.length === 0 ? <p className="muted tm-empty">{t("Nothing is assigned to you right now.", "No tienes nada asignado por ahora.")}</p> : (
          <div className="wk-tasks">
            {[...open, ...done.slice(0, 20)].map((k) => (
              <div key={k.id} className="wk-task">
                <button className={"wk-chk" + (k.done ? " on" : "")} disabled={busy["task" + k.id]} aria-label={k.done ? t("Mark not done", "Marcar como no hecha") : t("Mark done", "Marcar como hecha")}
                  onClick={() => tick(k.id, !!k.done)}>✓</button>
                <div className="wk-info">
                  <div className={"wk-tt" + (k.done ? " done" : "")}>{k.title}</div>
                  <div className="muted wk-sub">{fmtDate(k.date, lang)}{k.time ? " · " + k.time : ""}</div>
                  {k.note && <div className="muted wk-sub wk-pre">{k.note}</div>}
                </div>
              </div>))}
          </div>
        )}
      </section>

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
  const [h, setH] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    if (!(num(h) > 0)) { toast(t("Write the hours.", "Escribe las horas.")); return; }
    setSaving(true);
    try { await onSave({ date, hours: num(h), note }); }
    catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Intenta otra vez.")); setSaving(false); }
  };
  return (
    <Modal title={t("Log hours", "Anotar horas")} onClose={onClose}>
      <div className="grid2">
        <label className="f">{t("Date", "Fecha")}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="f">{t("Hours", "Horas")}<NumInput step="0.25" placeholder="8" value={num(h)} onChange={setH} /></label>
      </div>
      <label className="f">{t("Note (optional)", "Nota (opcional)")}<input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Sanding, priming, spraying…", "Lijado, primer, sprayado…")} /></label>
      <div className="tm-actions"><button className="btn pri" disabled={saving} onClick={save}>{t("Save", "Guardar")}</button></div>
    </Modal>
  );
}
