import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useClients, useClock, useEstimates, useHours, useInvoices, usePayouts, useSettings, useTasks, useWorkers } from "../data/hooks";
import { useT } from "../i18n";
import { clientNameOf, jobStatus } from "../lib/calendar";
import { calcEstimate, todayISO, uid } from "../lib/estimate";
import { fmtDate, waLink } from "../lib/format";
import { money, num, r2 } from "../lib/money";
import {
  PAY_METHODS, RANGE_KEYS, clockElapsed, clockEntry, hourAmount, inBounds, jobOnSite, laborByJob, rangeBounds, teamTotals, workerStats, type RangeKey,
} from "../lib/team";
import type { Estimate, HourEntry, Payout, Task, Worker } from "../lib/types";
import { useUi } from "../store/ui";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { NumInput } from "../ui/NumInput";
import { WorkerTeam } from "./team/WorkerTeam";
import "./Team.css";

type ModalState =
  | { kind: "worker"; id?: string }
  | { kind: "hours"; id?: string; workerId?: string }
  | { kind: "pay"; workerId?: string }
  | { kind: "task"; id?: string };

const hrs = (n: number) => n.toFixed(1) + " h";

/**
 * Team page. Owners / admins get the full page (OwnerTeam). A worker gets WorkerTeam, a separate component tree, so a
 * worker never mounts hooks for collections the rules do not let them read (estimates, invoices, clients, settings...).
 */
export default function Team() {
  const { role } = useAuth();
  return role === "worker" ? <WorkerTeam /> : <OwnerTeam />;
}

function OwnerTeam() {
  const t = useT();
  const lang = useUi((s) => s.lang), toast = useUi((s) => s.toast);
  const nav = useNavigate();
  const { rows: workerRows, save: saveWorker, remove: removeWorker } = useWorkers();
  const { rows: hours, save: saveHours, remove: removeHours } = useHours();
  const { rows: pays, save: savePay, remove: removePay } = usePayouts();
  const { rows: clocks, save: saveClock, remove: removeClock } = useClock();
  const { rows: ests } = useEstimates();
  const { rows: invoices } = useInvoices();
  const { rows: clients } = useClients();
  const { rows: tasks, save: saveTask, remove: removeTask } = useTasks();
  const { settings } = useSettings();

  const [range, setRange] = useState<RangeKey>("week");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!clocks.length) return;
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(i);
  }, [clocks.length]);

  const workers = useMemo(() => [...workerRows].sort((a, b) => (a.active === false ? 1 : 0) - (b.active === false ? 1 : 0) || a.name.localeCompare(b.name)), [workerRows]);
  const activeWorkers = useMemo(() => workers.filter((w) => w.active !== false), [workers]);
  const wById = (id?: string) => workers.find((w) => w.id === id);
  const estById = (id?: string) => ests.find((e) => e.id === id);
  const jobLabel = (e?: Estimate) => (e ? `${e.number} · ${clientNameOf(e, clients, lang)}` : "");
  const b = useMemo(() => rangeBounds(range), [range]);

  const stats = useMemo(() => new Map(workers.map((w) => [w.id, workerStats(w, b, hours, pays)])), [workers, b, hours, pays]);
  const tot = useMemo(() => teamTotals(workers, b, hours, pays), [workers, b, hours, pays]);
  const hoursIn = useMemo(() => hours.filter((h) => inBounds(h.date, b)).sort((x, y) => String(y.date).localeCompare(String(x.date))), [hours, b]);
  const paysIn = useMemo(() => pays.filter((p) => inBounds(p.date, b)).sort((x, y) => String(y.date).localeCompare(String(x.date))), [pays, b]);
  const jobRows = useMemo(() => laborByJob(hoursIn, ests, settings, workers), [hoursIn, ests, settings, workers]);
  const openTasks = useMemo(() => tasks.filter((k) => !k.done && k.workerId).sort((x, y) => String(x.date).localeCompare(String(y.date))), [tasks]);

  const rangeLabel: Record<RangeKey, [string, string]> = {
    week: ["This week", "Esta semana"], month: ["This month", "Este mes"], lastMonth: ["Last month", "Mes pasado"],
    ytd: ["Year to date", "En lo que va del año"], lastYear: ["Last year", "Año pasado"], all: ["All", "Todo"],
  };

  /* ---------- clock in / out ---------- */
  const guard = async (key: string, fn: () => Promise<void>) => {
    if (busy[key]) return;
    setBusy((x) => ({ ...x, [key]: true }));
    try { await fn(); } catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Intenta otra vez.")); } finally { setBusy((x) => ({ ...x, [key]: false })); }
  };
  const clockIn = (w: Worker) => guard("clk" + w.id, async () => {
    if (clocks.some((c) => c.id === w.id)) return;
    const job = jobOnSite(ests, todayISO(), invoices);
    await saveClock({ id: w.id, at: new Date().toISOString(), estId: job ? job.id : "" });
    toast(t("Clocked in.", "Entrada registrada."));
  });
  const clockOut = (w: Worker) => guard("clk" + w.id, async () => {
    const c = clocks.find((x) => x.id === w.id);
    if (!c) return;
    const entry = clockEntry(c, w, t("Clock in/out", "Entrada/salida"));
    await saveHours(entry);
    await removeClock(w.id);
    toast(t(`${entry.hours} h saved.`, `${entry.hours} h guardadas.`));
  });
  const clockBtn = (w: Worker) => {
    const c = clocks.find((x) => x.id === w.id);
    if (!c) return <button className="btn sm" disabled={busy["clk" + w.id]} onClick={() => clockIn(w)}>{t("Clock in", "Entrada")}</button>;
    const el = clockElapsed(c.at, now), job = estById(c.estId);
    return (
      <>
        <span className="tm-clk" title={job ? jobLabel(job) : undefined}>● {el.h}h {el.m}m</span>
        <button className="btn sm pri" disabled={busy["clk" + w.id]} onClick={() => clockOut(w)}>{t("Clock out", "Salida")}</button>
      </>
    );
  };

  const delPay = (id: string) => { if (confirm(t("Delete this payment?", "¿Borrar este pago?"))) removePay(id); };

  const workerActions = (w: Worker) => {
    const st = stats.get(w.id)!;
    return (
      <div className="tm-act">
        {w.active !== false && clockBtn(w)}
        {st.owed > 0.005 && <button className="btn sm pri" onClick={() => setModal({ kind: "pay", workerId: w.id })}>{t("Pay", "Pagar")}</button>}
        {w.phone && <a className="btn sm tm-wa" href={waLink(w.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        <button className="btn sm" onClick={() => setModal({ kind: "worker", id: w.id })}>{t("Edit", "Editar")}</button>
      </div>
    );
  };
  const sub = (w: Worker) => [w.role, w.phone].filter(Boolean).join(" · ") || "—";
  const owedCell = (owed: number) => <b className={owed > 0.005 ? "tm-owed" : ""}>{money(owed)}</b>;

  const section = (title: string, action: ReactNode, empty: string, has: boolean, table: ReactNode, cards: ReactNode, hint?: string) => (
    <section className="card tm-sec">
      <div className="card-h"><h2>{title}</h2>{action}</div>
      {hint && <p className="muted tm-hint">{hint}</p>}
      {has ? (
        <>
          <div className="only-desk tbl-wrap">{table}</div>
          <div className="cards only-phone tm-cards">{cards}</div>
        </>
      ) : <p className="muted tm-empty">{empty}</p>}
    </section>
  );

  const hasW = workers.length > 0;
  const openHours = (workerId?: string, id?: string) => {
    if (!id && !activeWorkers.length) { toast(t("Add a worker first.", "Primero agrega un trabajador.")); return; }
    setModal({ kind: "hours", id, workerId });
  };
  const openPay = (workerId?: string) => {
    if (!hasW) { toast(t("Add a worker first.", "Primero agrega un trabajador.")); return; }
    setModal({ kind: "pay", workerId });
  };

  return (
    <div className="page">
      <div className="page-h">
        <div><h1>{t("Team", "Equipo")}</h1><p>{t("Workers, hours, payments and labor per job.", "Trabajadores, horas, pagos y mano de obra por trabajo.")}</p></div>
        <div className="tm-head-btns">
          <button className="btn" onClick={() => setModal({ kind: "worker" })}><Icon name="plus" size={16} />{t("Worker", "Trabajador")}</button>
          {hasW && <button className="btn" onClick={() => openPay()}>{t("+ Payment", "+ Pago")}</button>}
          {hasW && <button className="btn pri" onClick={() => openHours()}><Icon name="clock" size={16} />{t("Log hours", "Anotar horas")}</button>}
        </div>
      </div>

      {!hasW ? (
        <div className="card"><EmptyState icon="team" title={t("Add the people who work with you", "Agrega a la gente que trabaja contigo")}
          text={t("Log their hours on each job and the app keeps what you owe them, and what each job really cost.", "Anota sus horas en cada trabajo y la app lleva lo que les debes y lo que te costó de verdad cada trabajo.")}>
          <button className="btn pri" onClick={() => setModal({ kind: "worker" })}>{t("+ Add a worker", "+ Agregar trabajador")}</button>
        </EmptyState></div>
      ) : (
        <>
          <div className="toolbar"><div className="pills">{RANGE_KEYS.map((k) => (
            <button key={k} className={"pill" + (range === k ? " on" : "")} onClick={() => setRange(k)}>{t(...rangeLabel[k])}</button>))}</div></div>

          <div className="tm-tiles">
            <div className="card tm-tile"><span>{t("Hours", "Horas")}</span><b>{hrs(tot.h)}</b></div>
            <div className="card tm-tile"><span>{t("Labor cost", "Mano de obra")}</span><b>{money(tot.cost)}</b></div>
            <div className="card tm-tile"><span>{t("Paid", "Pagado")}</span><b>{money(tot.paid)}</b></div>
            <div className="card tm-tile"><span>{t("You owe now", "Debes ahora")}</span><b className={tot.owed > 0.005 ? "tm-owed" : ""}>{money(tot.owed)}</b><small>{t("all time, all workers", "todo, todos los trabajadores")}</small></div>
          </div>

          {section(t("Workers", "Trabajadores"), null, "", true,
            <table className="tbl tm-tbl">
              <thead><tr><th>{t("Name", "Nombre")}</th><th className="r">{t("Rate", "Tarifa")}</th><th className="r">{t("Hours", "Horas")}</th><th className="r">{t("Earned", "Ganado")}</th><th className="r">{t("Paid", "Pagado")}</th><th className="r">{t("Owed", "Se le debe")}</th><th /></tr></thead>
              <tbody>{workers.map((w) => { const st = stats.get(w.id)!; return (
                <tr key={w.id} className={w.active === false ? "tm-off" : ""}>
                  <td><b>{w.name}</b>{w.active === false && <span className="badge b-gray tm-inact">{t("Inactive", "Inactivo")}</span>}<div className="muted tm-sub">{sub(w)}</div></td>
                  <td className="r nw">{money(num(w.rate))}/h</td><td className="r nw">{hrs(st.h)}</td><td className="r nw">{money(st.earned)}</td><td className="r nw">{money(st.paid)}</td>
                  <td className="r nw">{owedCell(st.owed)}</td>
                  <td className="r">{workerActions(w)}</td>
                </tr>); })}</tbody>
            </table>,
            workers.map((w) => { const st = stats.get(w.id)!; return (
              <div key={w.id} className={"tm-card" + (w.active === false ? " tm-off" : "")}>
                <div className="l1"><span>{w.name}{w.active === false && <span className="badge b-gray tm-inact">{t("Inactive", "Inactivo")}</span>}</span><span>{owedCell(st.owed)}</span></div>
                <div className="l2"><span>{sub(w)}</span><span>{t("owed", "se le debe")}</span></div>
                <div className="tm-stats">
                  <div><span>{t("Rate", "Tarifa")}</span><b>{money(num(w.rate))}/h</b></div><div><span>{t("Hours", "Horas")}</span><b>{hrs(st.h)}</b></div>
                  <div><span>{t("Earned", "Ganado")}</span><b>{money(st.earned)}</b></div><div><span>{t("Paid", "Pagado")}</span><b>{money(st.paid)}</b></div>
                </div>
                {workerActions(w)}
              </div>); }))}

          {section(t("Hours", "Horas"), <button className="btn sm" onClick={() => openHours()}>{t("+ Hours", "+ Horas")}</button>, t("No hours in this period.", "No hay horas en este periodo."), hoursIn.length > 0,
            <table className="tbl tm-tbl">
              <thead><tr><th>{t("Date", "Fecha")}</th><th>{t("Worker", "Trabajador")}</th><th>{t("Job", "Trabajo")}</th><th className="r">{t("Hours", "Horas")}</th><th className="r">{t("Amount", "Monto")}</th><th>{t("Note", "Nota")}</th><th /></tr></thead>
              <tbody>{hoursIn.slice(0, 80).map((h) => (
                <tr key={h.id}>
                  <td className="nw">{fmtDate(h.date, lang)}</td><td>{wById(h.workerId)?.name || "—"}</td>
                  <td className="muted nw" title={jobLabel(estById(h.estId))}>{estById(h.estId)?.number || "—"}</td>
                  <td className="r nw">{hrs(num(h.hours))}</td><td className="r nw">{money(hourAmount(h, wById(h.workerId)))}</td><td className="muted tm-note">{h.note || ""}</td>
                  <td className="r"><button className="btn sm" onClick={() => openHours(undefined, h.id)}>{t("Edit", "Editar")}</button></td>
                </tr>))}</tbody>
            </table>,
            hoursIn.slice(0, 80).map((h) => (
              <div key={h.id} className="tm-card click" onClick={() => openHours(undefined, h.id)}>
                <div className="l1"><span>{wById(h.workerId)?.name || "—"}</span><span>{money(hourAmount(h, wById(h.workerId)))}</span></div>
                <div className="l2"><span>{fmtDate(h.date, lang)} · {hrs(num(h.hours))}{estById(h.estId) ? " · " + estById(h.estId)!.number : ""}</span><span>{t("Edit", "Editar")}</span></div>
                {h.note && <div className="l2"><span>{h.note}</span></div>}
              </div>)))}

          {section(t("Labor by job", "Mano de obra por trabajo"), null,
            t("Pick the job when you log hours and it shows here, next to the hours the estimate planned.", "Escoge el trabajo al anotar horas y sale aquí, al lado de las horas que planeó el estimado."), jobRows.length > 0,
            <table className="tbl tm-tbl">
              <thead><tr><th>{t("Job", "Trabajo")}</th><th className="r">{t("Logged", "Anotadas")}</th><th className="r">{t("Planned", "Planeadas")}</th><th className="r">{t("Difference", "Diferencia")}</th><th className="r">{t("Labor cost", "Mano de obra")}</th><th className="r">{t("Job price", "Precio")}</th></tr></thead>
              <tbody>{jobRows.map((j) => { const e = estById(j.estId)!; return (
                <tr key={j.estId} className="click" onClick={() => nav(`/estimates/${j.estId}`)}>
                  <td><b>{jobLabel(e)}</b></td><td className="r nw">{hrs(j.h)}</td><td className="r nw">{j.plan ? hrs(j.plan) : "—"}</td>
                  <td className={"r nw " + diffCls(j.plan, j.diff)}>{j.plan ? (j.diff > 0 ? "+" : "") + hrs(j.diff) : "—"}</td>
                  <td className="r nw">{money(j.cost)}</td><td className="r nw">{money(calcEstimate(e, settings).total)}</td>
                </tr>); })}</tbody>
            </table>,
            jobRows.map((j) => { const e = estById(j.estId)!; return (
              <div key={j.estId} className="tm-card click" onClick={() => nav(`/estimates/${j.estId}`)}>
                <div className="l1"><span>{jobLabel(e)}</span><span>{money(j.cost)}</span></div>
                <div className="tm-stats">
                  <div><span>{t("Logged", "Anotadas")}</span><b>{hrs(j.h)}</b></div><div><span>{t("Planned", "Planeadas")}</span><b>{j.plan ? hrs(j.plan) : "—"}</b></div>
                  <div><span>{t("Difference", "Diferencia")}</span><b className={diffCls(j.plan, j.diff)}>{j.plan ? (j.diff > 0 ? "+" : "") + hrs(j.diff) : "—"}</b></div><div><span>{t("Job price", "Precio")}</span><b>{money(calcEstimate(e, settings).total)}</b></div>
                </div>
              </div>); }),
            t("Hours logged in the period you picked, against the hours the estimate planned.", "Horas anotadas en el periodo que escogiste, contra las horas que planeó el estimado."))}

          {section(t("Payments", "Pagos"), <button className="btn sm" onClick={() => openPay()}>{t("+ Payment", "+ Pago")}</button>, t("No payments in this period.", "No hay pagos en este periodo."), paysIn.length > 0,
            <table className="tbl tm-tbl">
              <thead><tr><th>{t("Date", "Fecha")}</th><th>{t("Worker", "Trabajador")}</th><th className="r">{t("Amount", "Monto")}</th><th>{t("Method", "Forma")}</th><th>{t("Note", "Nota")}</th><th /></tr></thead>
              <tbody>{paysIn.slice(0, 60).map((p) => (
                <tr key={p.id}>
                  <td className="nw">{fmtDate(p.date, lang)}</td><td>{wById(p.workerId)?.name || "—"}</td><td className="r nw">{money(p.amount)}</td><td>{methodLabel(p.method, t)}</td><td className="muted tm-note">{p.note || ""}</td>
                  <td className="r"><button className="btn sm danger" onClick={() => delPay(p.id)} aria-label={t("Delete", "Borrar")} title={t("Delete", "Borrar")}>×</button></td>
                </tr>))}</tbody>
            </table>,
            paysIn.slice(0, 60).map((p) => (
              <div key={p.id} className="tm-card">
                <div className="l1"><span>{wById(p.workerId)?.name || "—"}</span><span>{money(p.amount)}</span></div>
                <div className="l2"><span>{fmtDate(p.date, lang)} · {methodLabel(p.method, t) || "—"}{p.note ? " · " + p.note : ""}</span>
                  <button className="btn sm danger" onClick={() => delPay(p.id)} aria-label={t("Delete", "Borrar")}>×</button></div>
              </div>)))}

          {section(t("Assigned tasks", "Tareas asignadas"), <button className="btn sm" onClick={() => setModal({ kind: "task" })}>{t("+ Task", "+ Tarea")}</button>,
            t("Tasks you assign to a worker show here and on the calendar.", "Las tareas que le asignas a un trabajador salen aquí y en el calendario."), openTasks.length > 0,
            <table className="tbl tm-tbl">
              <thead><tr><th>{t("Date", "Fecha")}</th><th>{t("Worker", "Trabajador")}</th><th>{t("Task", "Tarea")}</th><th>{t("Job", "Trabajo")}</th><th /></tr></thead>
              <tbody>{openTasks.slice(0, 40).map((k) => (
                <tr key={k.id}>
                  <td className="nw">{fmtDate(k.date, lang)}</td><td>{wById(k.workerId)?.name || "—"}</td><td><b>{k.title}</b></td><td className="muted">{jobLabel(estById(k.estId))}</td>
                  <td className="r"><button className="btn sm" onClick={() => setModal({ kind: "task", id: k.id })}>{t("Open", "Abrir")}</button></td>
                </tr>))}</tbody>
            </table>,
            openTasks.slice(0, 40).map((k) => (
              <div key={k.id} className="tm-card click" onClick={() => setModal({ kind: "task", id: k.id })}>
                <div className="l1"><span>{k.title}</span><span>{fmtDate(k.date, lang)}</span></div>
                <div className="l2"><span>{wById(k.workerId)?.name || "—"}{estById(k.estId) ? " · " + jobLabel(estById(k.estId)) : ""}</span><span>{t("Open", "Abrir")}</span></div>
              </div>)))}
        </>
      )}

      {modal?.kind === "worker" && (
        <WorkerModal worker={workers.find((w) => w.id === modal.id)} onClose={() => setModal(null)}
          hasRecords={(id) => hours.some((h) => h.workerId === id) || pays.some((p) => p.workerId === id)}
          onSave={async (w) => { await saveWorker(w); setModal(null); }}
          onDelete={async (w) => { await removeWorker(w.id); if (clocks.some((c) => c.id === w.id)) await removeClock(w.id); setModal(null); }} />
      )}
      {modal?.kind === "hours" && (
        <HoursModal entry={hours.find((h) => h.id === modal.id)} workers={modal.id ? workers : activeWorkers} startWorker={modal.workerId}
          jobs={jobOptions(ests, invoices, hours.find((h) => h.id === modal.id)?.estId).map((e) => ({ id: e.id, label: jobLabel(e) }))}
          onSite={jobOnSite(ests, todayISO(), invoices)?.id || ""} onClose={() => setModal(null)}
          onSave={async (h) => { await saveHours(h); setModal(null); toast(t("Hours saved.", "Horas guardadas.")); }}
          onDelete={async (id) => { await removeHours(id); setModal(null); }} />
      )}
      {modal?.kind === "pay" && (
        <PayModal workers={workers} startWorker={modal.workerId} owedOf={(id) => { const w = wById(id); return w ? workerStats(w, { from: "", to: "" }, hours, pays).owed : 0; }}
          onClose={() => setModal(null)}
          onSave={async (p) => { await savePay(p); setModal(null); toast(t("Payment saved.", "Pago guardado.")); }} />
      )}
      {modal?.kind === "task" && (
        <TaskModal task={tasks.find((k) => k.id === modal.id)} workers={activeWorkers}
          jobs={jobOptions(ests, invoices, tasks.find((k) => k.id === modal.id)?.estId).map((e) => ({ id: e.id, label: jobLabel(e) }))}
          onClose={() => setModal(null)}
          onSave={async (k) => { await saveTask(k); setModal(null); toast(t("Task saved.", "Tarea guardada.")); }}
          onDelete={async (id) => { await removeTask(id); setModal(null); toast(t("Task deleted.", "Tarea eliminada.")); }} />
      )}
    </div>
  );
}

const diffCls = (plan: number, diff: number) => (plan && diff > 0.5 ? "tm-over" : plan && diff < -0.5 ? "tm-under" : "");
const methodLabel = (m: string | undefined, t: (en: string, es: string) => string) =>
  m === "Cash" ? t("Cash", "Efectivo") : m === "Check" ? t("Check", "Cheque") : m === "Transfer" ? t("Transfer", "Transferencia") : m || "";

/** Jobs you can log hours against: won or sent, newest first (plus the one already selected). */
function jobOptions(ests: Estimate[], invoices: { estId: string; status: "Unpaid" | "Paid" }[], sel?: string): Estimate[] {
  const ok = ["Sent", "Viewed", "Accepted", "Deposit Paid", "Paid in Full"];
  return ests.filter((e) => ok.includes(jobStatus(e, invoices)) || e.id === sel)
    .sort((a, b) => String(b.startDate || b.date || "").localeCompare(String(a.startDate || a.date || ""))).slice(0, 80);
}

type Job = { id: string; label: string };
function JobSelect({ value, jobs, onChange, label }: { value: string; jobs: Job[]; onChange(v: string): void; label: string }) {
  const t = useT();
  return (
    <label className="f">{label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("No job", "Sin trabajo")}</option>
        {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
      </select></label>
  );
}

function WorkerModal({ worker, hasRecords, onSave, onDelete, onClose }: {
  worker?: Worker; hasRecords(id: string): boolean; onSave(w: Worker): Promise<void>; onDelete(w: Worker): Promise<void>; onClose(): void;
}) {
  const t = useT(), toast = useUi((s) => s.toast);
  const isNew = !worker;
  const [w, setW] = useState<Worker>(() => worker || { id: uid("w"), name: "", phone: "", role: "", rate: 0, active: true });
  const [saving, setSaving] = useState(false);
  const run = async (fn: () => Promise<void>) => { if (saving) return; setSaving(true); try { await fn(); } catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Intenta otra vez.")); setSaving(false); } };
  const save = () => {
    const name = w.name.trim();
    if (!name) { toast(t("Write the name.", "Escribe el nombre.")); return; }
    return run(() => onSave({ ...w, name, phone: (w.phone || "").trim(), role: (w.role || "").trim(), rate: num(w.rate) }));
  };
  const del = () => run(async () => {
    if (hasRecords(w.id)) {
      if (!confirm(t("This worker has hours or payments. Mark as inactive instead? (Cancel keeps everything as is.)", "Este trabajador tiene horas o pagos. ¿Marcarlo como inactivo? (Cancelar deja todo igual.)"))) { setSaving(false); return; }
      await onSave({ ...w, active: false });
      return;
    }
    if (!confirm(t("Delete this worker?", "¿Borrar este trabajador?"))) { setSaving(false); return; }
    await onDelete(w);
  });
  return (
    <Modal title={isNew ? t("New worker", "Trabajador nuevo") : t("Edit worker", "Editar trabajador")} onClose={onClose}>
      <label className="f">{t("Name", "Nombre")}<input autoFocus={!w.name} value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></label>
      <div className="grid2">
        <label className="f">{t("Phone", "Teléfono")}<input type="tel" value={w.phone || ""} onChange={(e) => setW({ ...w, phone: e.target.value })} /></label>
        <label className="f">{t("Pay per hour ($)", "Pago por hora ($)")}<NumInput step="0.5" value={num(w.rate)} onChange={(n) => setW({ ...w, rate: n })} /></label>
      </div>
      <label className="f">{t("Role", "Rol")}<input value={w.role || ""} onChange={(e) => setW({ ...w, role: e.target.value })} placeholder={t("Painter, helper, sprayer…", "Pintor, ayudante, sprayador…")} /></label>
      {!isNew && <label className="tm-check"><input type="checkbox" checked={w.active !== false} onChange={(e) => setW({ ...w, active: e.target.checked })} /> {t("Active (shows when logging hours)", "Activo (sale al anotar horas)")}</label>}
      <div className="tm-actions">
        <button className="btn pri" disabled={saving} onClick={save}>{t("Save", "Guardar")}</button>
        {!isNew && <button className="btn danger" disabled={saving} onClick={del}>{t("Delete", "Borrar")}</button>}
      </div>
    </Modal>
  );
}

function HoursModal({ entry, workers, startWorker, jobs, onSite, onSave, onDelete, onClose }: {
  entry?: HourEntry; workers: Worker[]; startWorker?: string; jobs: Job[]; onSite: string;
  onSave(h: HourEntry): Promise<void>; onDelete(id: string): Promise<void>; onClose(): void;
}) {
  const t = useT(), toast = useUi((s) => s.toast);
  const isNew = !entry;
  const [h, setH] = useState<HourEntry>(() => {
    if (entry) return entry;
    const w = workers.find((x) => x.id === startWorker) || workers[0];
    return { id: uid("h"), workerId: w?.id || "", date: todayISO(), hours: 0, rate: num(w?.rate), estId: onSite, note: "" }; // start with the job on site today, if any
  });
  const [saving, setSaving] = useState(false);
  const w = workers.find((x) => x.id === h.workerId);
  const pickWorker = (id: string) => setH({ ...h, workerId: id, rate: num(workers.find((x) => x.id === id)?.rate) });
  const run = async (fn: () => Promise<void>) => { if (saving) return; setSaving(true); try { await fn(); } catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Intenta otra vez.")); setSaving(false); } };
  const save = () => {
    if (!(num(h.hours) > 0)) { toast(t("Write the hours.", "Escribe las horas.")); return; }
    if (!h.workerId) { toast(t("Pick a worker.", "Escoge un trabajador.")); return; }
    return run(() => onSave({ ...h, hours: num(h.hours), rate: num(h.rate), date: h.date || todayISO(), estId: h.estId || "", note: (h.note || "").trim() }));
  };
  return (
    <Modal title={isNew ? t("Log hours", "Anotar horas") : t("Edit hours", "Editar horas")} onClose={onClose}>
      <div className="grid2">
        <label className="f">{t("Worker", "Trabajador")}
          <select value={h.workerId} onChange={(e) => pickWorker(e.target.value)}>
            {workers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            {!w && h.workerId && <option value={h.workerId}>—</option>}
          </select></label>
        <label className="f">{t("Date", "Fecha")}<input type="date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} /></label>
      </div>
      <div className="grid2">
        <label className="f">{t("Hours", "Horas")}<NumInput step="0.25" placeholder="8" value={num(h.hours)} onChange={(n) => setH({ ...h, hours: n })} /></label>
        <label className="f">{t("Pay per hour ($)", "Pago por hora ($)")}<NumInput step="0.5" value={num(h.rate)} onChange={(n) => setH({ ...h, rate: n })} /></label>
      </div>
      <JobSelect label={t("Job", "Trabajo")} value={h.estId || ""} jobs={jobs} onChange={(v) => setH({ ...h, estId: v })} />
      <label className="f">{t("Note (optional)", "Nota (opcional)")}<input value={h.note || ""} onChange={(e) => setH({ ...h, note: e.target.value })} placeholder={t("Sanding, priming, spraying…", "Lijado, primer, sprayado…")} /></label>
      <p className="muted tm-amt">{num(h.rate) ? t(`Amount: ${money(hourAmount(h))} (${money(num(h.rate))}/h)`, `Monto: ${money(hourAmount(h))} (${money(num(h.rate))}/h)`) : " "}</p>
      <div className="tm-actions">
        <button className="btn pri" disabled={saving} onClick={save}>{t("Save", "Guardar")}</button>
        {!isNew && <button className="btn danger" disabled={saving} onClick={() => { if (confirm(t("Delete these hours?", "¿Borrar estas horas?"))) run(() => onDelete(h.id)); }}>{t("Delete", "Borrar")}</button>}
      </div>
    </Modal>
  );
}

function PayModal({ workers, startWorker, owedOf, onSave, onClose }: {
  workers: Worker[]; startWorker?: string; owedOf(id: string): number; onSave(p: Payout): Promise<void>; onClose(): void;
}) {
  const t = useT(), toast = useUi((s) => s.toast);
  const first = startWorker || (workers.find((w) => w.active !== false) || workers[0])?.id || "";
  const [wid, setWid] = useState(first);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState(() => { const o = owedOf(first); return o > 0 ? r2(o) : 0; });
  const [method, setMethod] = useState<string>(PAY_METHODS[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const owed = owedOf(wid);
  const pick = (id: string) => { setWid(id); const o = owedOf(id); setAmount(o > 0 ? r2(o) : 0); };
  const save = async () => {
    if (saving) return;
    if (!(num(amount) > 0)) { toast(t("Write the amount.", "Escribe el monto.")); return; }
    setSaving(true);
    try { await onSave({ id: uid("pay"), workerId: wid, date: date || todayISO(), amount: r2(amount), method, note: note.trim() }); }
    catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Intenta otra vez.")); setSaving(false); }
  };
  return (
    <Modal title={t("Payment to a worker", "Pago a un trabajador")} onClose={onClose}>
      <div className="grid2">
        <label className="f">{t("Worker", "Trabajador")}<select value={wid} onChange={(e) => pick(e.target.value)}>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <label className="f">{t("Date", "Fecha")}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      <div className="grid2">
        <label className="f">{t("Amount ($)", "Monto ($)")}<NumInput step="0.01" value={amount} onChange={setAmount} /></label>
        <label className="f">{t("Method", "Forma de pago")}<select value={method} onChange={(e) => setMethod(e.target.value)}>{PAY_METHODS.map((m) => <option key={m} value={m}>{methodLabel(m, t)}</option>)}</select></label>
      </div>
      <label className="f">{t("Note (optional)", "Nota (opcional)")}<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <p className="muted tm-amt">{t(`Owed right now: ${money(owed)}`, `Se le debe ahora: ${money(owed)}`)}</p>
      <div className="tm-actions"><button className="btn pri" disabled={saving} onClick={save}>{t("Save payment", "Guardar pago")}</button></div>
    </Modal>
  );
}

function TaskModal({ task, workers, jobs, onSave, onDelete, onClose }: {
  task?: Task; workers: Worker[]; jobs: Job[]; onSave(k: Task): Promise<void>; onDelete(id: string): Promise<void>; onClose(): void;
}) {
  const t = useT(), toast = useUi((s) => s.toast);
  const isNew = !task;
  const [k, setK] = useState<Task>(() => task || { id: uid("task"), title: "", date: todayISO(), time: "", note: "", estId: "", workerId: workers[0]?.id || "", done: false });
  const [saving, setSaving] = useState(false);
  const run = async (fn: () => Promise<void>) => { if (saving) return; setSaving(true); try { await fn(); } catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Intenta otra vez.")); setSaving(false); } };
  const save = () => {
    if (!k.title.trim()) { toast(t("Write what needs to be done.", "Escribe qué hay que hacer.")); return; }
    return run(() => onSave({ ...k, title: k.title.trim(), date: k.date || todayISO() }));
  };
  const known = workers.some((w) => w.id === k.workerId);
  return (
    <Modal title={isNew ? t("New task", "Nueva tarea") : t("Edit task", "Editar tarea")} onClose={onClose}>
      <label className="f">{t("What needs to be done?", "¿Qué hay que hacer?")}<input autoFocus value={k.title} onChange={(e) => setK({ ...k, title: e.target.value })} /></label>
      <div className="grid2">
        <label className="f">{t("Date", "Fecha")}<input type="date" value={k.date} onChange={(e) => setK({ ...k, date: e.target.value })} /></label>
        <label className="f">{t("Time (optional)", "Hora (opcional)")}<input type="time" value={k.time || ""} onChange={(e) => setK({ ...k, time: e.target.value })} /></label>
      </div>
      <label className="f">{t("Assign to", "Asignar a")}
        <select value={k.workerId || ""} onChange={(e) => setK({ ...k, workerId: e.target.value })}>
          <option value="">{t("Me", "Yo")}</option>
          {!known && k.workerId && <option value={k.workerId}>—</option>}
          {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select></label>
      <JobSelect label={t("Link to a job (optional)", "Vincular a un trabajo (opcional)")} value={k.estId || ""} jobs={jobs} onChange={(v) => setK({ ...k, estId: v })} />
      <label className="f">{t("Note (optional)", "Nota (opcional)")}<textarea rows={3} value={k.note || ""} onChange={(e) => setK({ ...k, note: e.target.value })} /></label>
      {!isNew && <label className="tm-check"><input type="checkbox" checked={!!k.done} onChange={(e) => setK({ ...k, done: e.target.checked })} /> {t("Done", "Hecha")}</label>}
      <div className="tm-actions">
        <button className="btn pri" disabled={saving} onClick={save}>{t("Save task", "Guardar tarea")}</button>
        {!isNew && <button className="btn danger" disabled={saving} onClick={() => { if (confirm(t("Delete this task?", "¿Eliminar esta tarea?"))) run(() => onDelete(k.id)); }}>{t("Delete task", "Eliminar tarea")}</button>}
      </div>
    </Modal>
  );
}
