import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useClients, useClock, useCrewJobs, useEstimates, useHours, useInvoices, usePayouts, useSettings, useTasks, useWorkers } from "../data/hooks";
import { useT } from "../i18n";
import { addDaysISO, clientNameOf, fmtTime, jobDates, jobStatus } from "../lib/calendar";
import { onSite } from "../lib/crew";
import { workToday, type WorkItem } from "../lib/work";
import { calcEstimate, todayISO, uid } from "../lib/estimate";
import { fmtDate, waLink } from "../lib/format";
import { money, num, r2 } from "../lib/money";
import {
  PAY_METHODS, RANGE_KEYS, clockElapsed, clockEntry, clockFor, clockTimes, entryPay, hourAmount, hoursText, inBounds, jobOnSite, laborByJob, overtime, rangeBounds, restoreEntry, softDelete, teamTotals, withEdit, workerStats, type RangeKey,
} from "../lib/team";
import type { Estimate, HourEntry, Payout, Task, Worker } from "../lib/types";
import { useUi } from "../store/ui";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { NumInput } from "../ui/NumInput";
import TeamMap from "./team/TeamMap";
import { WorkerTeam } from "./team/WorkerTeam";
import "./Team.css";
import { Badge } from "../ui/Badge";
import { Avatar } from "../ui/Avatar";
import { deleteImage } from "../lib/storage";
import { ask } from "../ui/confirm";
import { Combobox } from "../ui/Combobox";
import { revokeWorkerAccess, useTeamAccess } from "../data/workers";
import { DatePicker } from "../ui/DatePicker";
import { DurationInput } from "../ui/DurationInput";
import { RowMenu } from "../ui/RowMenu";
import { normEmail, workerAccessState } from "../lib/roles";
import { WorkerModal } from "./team/WorkerModal";
import { AssignModal } from "./team/AssignModal";
import { HourHistory } from "./team/HourHistory";

type ModalState =
  | { kind: "worker"; id?: string }
  | { kind: "hours"; id?: string; workerId?: string }
  | { kind: "pay"; workerId?: string }
  | { kind: "task"; id?: string; workerId?: string; thenClock?: boolean }
  | { kind: "clock"; workerId: string }
  | { kind: "assign"; workerId: string; estId?: string }
  | { kind: "deletedHours" };

const hrs = hoursText;

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
  const { rows: hours, all: allHours, save: saveHours } = useHours();
  const { rows: pays, save: savePay, remove: removePay } = usePayouts();
  const { rows: clocks, save: saveClock, remove: removeClock } = useClock();
  const { rows: ests, patch: patchEst } = useEstimates();
  const { rows: invoices } = useInvoices();
  const { rows: clients } = useClients();
  const { rows: tasks, save: saveTask, remove: removeTask } = useTasks();
  const { rows: crewJobs } = useCrewJobs();
  const { settings } = useSettings();

  const [range, setRange] = useState<RangeKey>("week");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(Date.now());
  const { company, user } = useAuth();
  const tracking = !!company?.trackLocation;
  const by = user?.name || user?.email || company?.name || ""; // who changed an hours entry (its history)
  const deletedHours = useMemo(() => allHours.filter((h) => h.deleted).sort((x, y) => String(y.deletedAt || "").localeCompare(String(x.deletedAt || ""))), [allHours]);
  // who can open the app (badges + the worker window)
  const access = useTeamAccess(company?.id);
  const accessOf = (id: string) => workerAccessState(id, access.members, access.invites);
  const takenEmails = useMemo(() => [...access.members.map((m) => normEmail(m.email)), ...access.invites.map((i) => normEmail(i.email))].filter(Boolean), [access.members, access.invites]);
  useEffect(() => {
    if (!clocks.length && !tracking) return;
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(i);
  }, [clocks.length, tracking]);

  const workers = useMemo(() => [...workerRows].sort((a, b) => (a.active === false ? 1 : 0) - (b.active === false ? 1 : 0) || a.name.localeCompare(b.name)), [workerRows]);
  const activeWorkers = useMemo(() => workers.filter((w) => w.active !== false), [workers]);
  const wById = (id?: string) => workers.find((w) => w.id === id);
  const estById = (id?: string) => ests.find((e) => e.id === id);
  const jobLabel = (e?: Estimate) => (e ? `${e.number} · ${clientNameOf(e, clients, lang)}` : "");
  const mapLabel = useCallback((e: Estimate) => clientNameOf(e, clients, lang) || e.number, [clients, lang]);
  const b = useMemo(() => rangeBounds(range), [range]);

  const stats = useMemo(() => new Map(workers.map((w) => [w.id, workerStats(w, b, hours, pays)])), [workers, b, hours, pays]);
  // overtime: 1.5x past 40 h in a Monday-Sunday week (workers who get it), spread over that week's entries
  const ot = useMemo(() => overtime(hours, workers), [hours, workers]);
  const tot = useMemo(() => teamTotals(workers, b, hours, pays), [workers, b, hours, pays]);
  const hoursIn = useMemo(() => hours.filter((h) => inBounds(h.date, b)).sort((x, y) => String(y.date).localeCompare(String(x.date))), [hours, b]);
  const paysIn = useMemo(() => pays.filter((p) => inBounds(p.date, b)).sort((x, y) => String(y.date).localeCompare(String(x.date))), [pays, b]);
  const jobRows = useMemo(() => laborByJob(hoursIn, ests, settings, workers, ot.byEntry), [hoursIn, ests, settings, workers, ot]);
  const openTasks = useMemo(() => tasks.filter((k) => !k.done && k.workerId).sort((x, y) => String(x.date).localeCompare(String(y.date))), [tasks]);
  // today's work of each worker: their tasks + their lines of the jobs they are at today (the clock runs for one of them)
  const today = todayISO();
  const workOf = useCallback((id: string) => workToday(tasks, crewJobs, id, today), [tasks, crewJobs, today]);
  // jobs to assign work on: sent / won ones and any job that already has a crew; on site or coming up first, then not scheduled, then past
  const assignJobs = useMemo(() => {
    const list = [...jobOptions(ests, invoices), ...ests.filter((e) => e.crew?.length)].filter((e, i, all) => all.findIndex((x) => x.id === e.id) === i && jobStatus(e, invoices) !== "Declined");
    const end = (e: Estimate) => (e.startDate ? addDaysISO(e.startDate, Math.max(1, num(e.days) || 1) - 1) : "");
    const group = (e: Estimate) => (!e.startDate ? 1 : end(e) >= today ? 0 : 2);
    return list.sort((a, b) => group(a) - group(b) || (group(a) === 0 ? String(a.startDate).localeCompare(String(b.startDate)) : String(b.startDate || b.date || "").localeCompare(String(a.startDate || a.date || ""))));
  }, [ests, invoices, today]);
  // where "Assign work" starts: the job the worker is on today (or next), else the next job on the schedule
  const upcomingJob = useMemo(() => assignJobs.find((e) => jobDates(e).some((d) => d >= today))?.id, [assignJobs, today]);
  const nextJobOf = (id: string) => crewJobs.filter((j) => (j.crew || []).includes(id) && (!j.start || j.start >= today || onSite(j, today)))
    .sort((a, b) => String(a.start || "9").localeCompare(String(b.start || "9")))[0]?.estId || upcomingJob;

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
  const lostAccess = (w: Worker, n: number) => {
    if (n > 0) toast(t(`${w.name} can no longer open the app. Invite them again if they come back.`, `${w.name} ya no puede entrar a la app. Invítalo otra vez si regresa.`));
    else if (n < 0) toast(t("The worker was saved, but their app access could not be removed. Remove it in Settings → Team & access.", "El trabajador se guardó, pero no se pudo quitar su acceso. Quítalo en Ajustes → Equipo y acceso."));
  };
  // the clock always runs for one task (owner rule): pick which of the worker's tasks for today
  const clockIn = (w: Worker) => { if (!clocks.some((c) => c.id === w.id)) setModal({ kind: "clock", workerId: w.id }); };
  const clockInTask = (w: Worker, k: WorkItem) => guard("clk" + w.id, async () => {
    if (clocks.some((c) => c.id === w.id)) return;
    const c = clockFor({ ...k, jobLabel: k.jobLabel || (k.estId ? jobLabel(estById(k.estId)) : "") }, new Date().toISOString());
    await saveClock({ id: w.id, ...c });
    setModal(null);
    toast(t("Clocked in.", "Entrada registrada."));
  });
  const clockOut = (w: Worker) => guard("clk" + w.id, async () => {
    const c = clocks.find((x) => x.id === w.id);
    if (!c) return;
    const entry = clockEntry(c, w, t("Clock in/out", "Entrada/salida"));
    // exactly the minutes on the clock (no rounding); under a minute nothing is saved
    if (entry.hours > 0) await saveHours(entry);
    await removeClock(w.id);
    toast(entry.hours > 0 ? t(`${hoursText(entry.hours)} saved.`, `${hoursText(entry.hours)} guardadas.`) : t("Less than a minute on the clock: nothing saved.", "Menos de un minuto en el reloj: no se guardó nada."));
  });
  const clockBtn = (w: Worker) => {
    const c = clocks.find((x) => x.id === w.id);
    if (!c) return <button className="btn sm" disabled={busy["clk" + w.id]} onClick={() => clockIn(w)}>{t("Clock in", "Entrada")}</button>;
    const el = clockElapsed(c.at, now), job = estById(c.estId);
    const what = [c.taskTitle, c.jobLabel || (job ? jobLabel(job) : "")].filter(Boolean).join(" · ");
    return (
      <>
        <span className="tm-clk" title={what || undefined}>● {hoursText(el.h + el.m / 60)}</span>
        <button className="btn sm pri" disabled={busy["clk" + w.id]} onClick={() => clockOut(w)}>{t("Clock out", "Salida")}</button>
      </>
    );
  };

  const delPay = async (id: string) => {
    const gone = pays.find((p) => p.id === id);
    if (!(await ask(t("Delete this payment?", "¿Borrar este pago?")))) return;
    await removePay(id);
    toast(t("Payment deleted.", "Pago borrado."), gone ? { undo: () => savePay(gone) } : undefined);
  };

  const workerActions = (w: Worker) => {
    const st = stats.get(w.id)!;
    return (
      <div className="tm-act">
        {w.active !== false && <button className="btn sm" aria-label={t("Assign work", "Asignar trabajo")} onClick={() => setModal({ kind: "assign", workerId: w.id, estId: nextJobOf(w.id) })}><Icon name="plus" size={14} />{t("Assign", "Asignar")}</button>}
        {w.active !== false && clockBtn(w)}
        {st.owed > 0.005 && <button className="btn sm pri" onClick={() => setModal({ kind: "pay", workerId: w.id })}>{t("Pay", "Pagar")}</button>}
        <RowMenu label={t(`More for ${w.name}`, `Más de ${w.name}`)} items={[
          { label: t("Edit", "Editar"), icon: "user", onClick: () => setModal({ kind: "worker", id: w.id }) },
          { label: t("Timesheet", "Hoja de horas"), icon: "clock", onClick: () => nav(`/team/${w.id}/timesheet`) },
          { label: t("Log hours", "Anotar horas"), icon: "plus", onClick: () => openHours(w.id), hidden: w.active === false },
          { label: "WhatsApp", icon: "chat", onClick: () => { window.open(waLink(w.phone || ""), "_blank", "noopener,noreferrer"); }, hidden: !w.phone },
        ]} />
      </div>
    );
  };
  const sub = (w: Worker) => [w.role, w.phone].filter(Boolean).join(" · ") || "—";
  const accessBadge = (w: Worker) => { const a = accessOf(w.id);
    return a.state === "app" ? <Badge tone="green" size="sm" icon="check" className="tm-acc" title={a.email}>{t("App", "App")}</Badge>
      : a.state === "invited" ? <Badge tone="amber" size="sm" icon="mail" className="tm-acc" title={a.email}>{t("Invited", "Invitado")}</Badge> : null; };
  // "Today: Sand the doors +2 · EST-1001": what they have to do today
  const todayLine = (w: Worker) => {
    if (w.active === false) return null;
    const list = workOf(w.id);
    if (!list.length) return <div className="tm-today none">{t("Nothing assigned today", "Nada asignado hoy")}</div>;
    const k = list[0];
    return <div className="tm-today" title={list.map((x) => x.title).join("\n")}><Icon name="check" size={13} />{t("Today: ", "Hoy: ")}<b>{k.title}</b>{list.length > 1 ? ` +${list.length - 1}` : ""}{k.jobLabel ? " · " + k.jobLabel.split(" · ")[0] : ""}</div>;
  };
  const editBtn = (w: Worker, children: ReactNode) => <button type="button" className="tm-name" onClick={() => setModal({ kind: "worker", id: w.id })} title={t("Edit", "Editar")}>{children}</button>;
  // green dot = on the clock right now
  const face = (w: Worker, size?: "sm") => { const on = clocks.some((c) => c.id === w.id);
    return <Avatar name={w.name} src={w.photo?.url} size={size} badge={on ? "ok" : null} badgeLabel={on ? t("On the clock", "Trabajando ahora") : undefined} />; };
  const otMark = (id: string) => { const x = ot.byEntry.get(id) || 0;
    return x > 0 ? <span className="tm-ot" title={t(`Includes ${money(x)} of overtime (1.5x past 40 h that week)`, `Incluye ${money(x)} de horas extra (1.5x pasadas las 40 h esa semana)`)}>+{t("OT", "extra")}</span> : null; };
  const editedMark = (h: HourEntry) => (h.edits?.some((x) => x.what === "edit") ? <Badge variant="outline" size="sm" className="tm-edited">{t("Edited", "Editada")}</Badge> : null);
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
          <TeamMap workers={workers} clocks={clocks} hours={hours} ests={ests} invoices={invoices} label={mapLabel} patchEst={patchEst} now={now} />

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
                  <td><div className="tm-who">{face(w)}<div>{editBtn(w, <b>{w.name}</b>)}{accessBadge(w)}{w.active === false && <Badge variant="outline" size="sm" className="tm-inact">{t("Inactive", "Inactivo")}</Badge>}<div className="muted tm-sub">{sub(w)}</div>{todayLine(w)}</div></div></td>
                  <td className="r nw">{money(num(w.rate))}/h</td><td className="r nw">{hrs(st.h)}{st.ot > 0 && <small className="tm-otl">{hrs(st.ot)} {t("overtime", "extra")}</small>}</td><td className="r nw">{money(st.earned)}</td><td className="r nw">{money(st.paid)}</td>
                  <td className="r nw">{owedCell(st.owed)}</td>
                  <td className="r">{workerActions(w)}</td>
                </tr>); })}</tbody>
            </table>,
            workers.map((w) => { const st = stats.get(w.id)!; return (
              <div key={w.id} className={"tm-card" + (w.active === false ? " tm-off" : "")}>
                <div className="l1"><span className="tm-who">{face(w, "sm")}{editBtn(w, <span>{w.name}</span>)}{accessBadge(w)}{w.active === false && <Badge variant="outline" size="sm" className="tm-inact">{t("Inactive", "Inactivo")}</Badge>}</span><span>{owedCell(st.owed)}</span></div>
                <div className="l2"><span>{sub(w)}</span><span>{t("owed", "se le debe")}</span></div>
                {todayLine(w)}
                <div className="tm-stats">
                  <div><span>{t("Rate", "Tarifa")}</span><b>{money(num(w.rate))}/h</b></div><div><span>{t("Hours", "Horas")}</span><b>{hrs(st.h)}</b>{st.ot > 0 && <small className="tm-otl">{hrs(st.ot)} {t("overtime", "extra")}</small>}</div>
                  <div><span>{t("Earned", "Ganado")}</span><b>{money(st.earned)}</b></div><div><span>{t("Paid", "Pagado")}</span><b>{money(st.paid)}</b></div>
                </div>
                {workerActions(w)}
              </div>); }))}

          {section(t("Hours", "Horas"), <div className="tm-act">{deletedHours.length > 0 && <button className="btn sm" onClick={() => setModal({ kind: "deletedHours" })}>{t(`Deleted (${deletedHours.length})`, `Borradas (${deletedHours.length})`)}</button>}<button className="btn sm" onClick={() => openHours()}>{t("+ Hours", "+ Horas")}</button></div>, t("No hours in this period.", "No hay horas en este periodo."), hoursIn.length > 0,
            <table className="tbl tm-tbl">
              <thead><tr><th>{t("Date", "Fecha")}</th><th>{t("Worker", "Trabajador")}</th><th>{t("In – out", "Entrada – salida")}</th><th>{t("Job", "Trabajo")}</th><th className="r">{t("Hours", "Horas")}</th><th className="r">{t("Amount", "Monto")}</th><th>{t("Note", "Nota")}</th><th /></tr></thead>
              <tbody>{hoursIn.slice(0, 80).map((h) => (
                <tr key={h.id}>
                  <td className="nw">{fmtDate(h.date, lang)}</td><td>{wById(h.workerId)?.name || "—"}</td>
                  <td className="nw">{clockTimes(h, lang) || <span className="muted">—</span>}</td>
                  <td className="muted nw" title={jobLabel(estById(h.estId))}>{estById(h.estId)?.number || "—"}</td>
                  <td className="r nw">{hrs(num(h.hours))}</td><td className="r nw">{money(entryPay(h, wById(h.workerId), ot.byEntry))}{otMark(h.id)}</td><td className="muted tm-note">{editedMark(h)}{h.note || ""}</td>
                  <td className="r"><button className="btn sm" onClick={() => openHours(undefined, h.id)}>{t("Edit", "Editar")}</button></td>
                </tr>))}</tbody>
            </table>,
            hoursIn.slice(0, 80).map((h) => (
              <div key={h.id} className="tm-card click" onClick={() => openHours(undefined, h.id)}>
                <div className="l1"><span>{wById(h.workerId)?.name || "—"}</span><span>{money(entryPay(h, wById(h.workerId), ot.byEntry))}{otMark(h.id)}</span></div>
                <div className="l2"><span>{fmtDate(h.date, lang)} · {hrs(num(h.hours))}{estById(h.estId) ? " · " + estById(h.estId)!.number : ""}</span><span>{t("Edit", "Editar")}</span></div>
                {clockTimes(h, lang) && <div className="l2"><span>🕒 {clockTimes(h, lang)}</span></div>}
                {(h.note || h.edits?.length) && <div className="l2"><span>{editedMark(h)}{h.note || ""}</span></div>}
              </div>)))}

          {section(t("Labor by job", "Mano de obra por trabajo"), null,
            t("Pick the job when you log hours and it shows here, next to the hours the estimate planned.", "Escoge el trabajo al anotar horas y sale aquí, al lado de las horas que planeó el estimado."), jobRows.length > 0,
            <table className="tbl tm-tbl">
              <thead><tr><th>{t("Job", "Trabajo")}</th><th className="r">{t("Logged", "Anotadas")}</th><th className="r">{t("Planned", "Planeadas")}</th><th className="r">{t("Difference", "Diferencia")}</th><th className="r">{t("Labor cost", "Mano de obra")}</th><th className="r">{t("Job price", "Precio")}</th></tr></thead>
              <tbody>{jobRows.map((j) => { const e = estById(j.estId)!; return (
                <tr key={j.estId} className="click" onClick={() => nav(`/estimates/${j.estId}`)}>
                  <td><b>{jobLabel(e)}</b></td><td className="r nw">{hrs(j.h)}</td><td className="r nw">{j.plan ? hrs(j.plan) : "—"}</td>
                  <td className={"r nw " + diffCls(j.plan, j.diff)}>{j.plan ? diffText(j.diff) : "—"}</td>
                  <td className="r nw">{money(j.cost)}</td><td className="r nw">{money(calcEstimate(e, settings).total)}</td>
                </tr>); })}</tbody>
            </table>,
            jobRows.map((j) => { const e = estById(j.estId)!; return (
              <div key={j.estId} className="tm-card click" onClick={() => nav(`/estimates/${j.estId}`)}>
                <div className="l1"><span>{jobLabel(e)}</span><span>{money(j.cost)}</span></div>
                <div className="tm-stats">
                  <div><span>{t("Logged", "Anotadas")}</span><b>{hrs(j.h)}</b></div><div><span>{t("Planned", "Planeadas")}</span><b>{j.plan ? hrs(j.plan) : "—"}</b></div>
                  <div><span>{t("Difference", "Diferencia")}</span><b className={diffCls(j.plan, j.diff)}>{j.plan ? diffText(j.diff) : "—"}</b></div><div><span>{t("Job price", "Precio")}</span><b>{money(calcEstimate(e, settings).total)}</b></div>
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

          {section(t("Other tasks", "Otras tareas"), <button className="btn sm" onClick={() => setModal({ kind: "task" })}>{t("+ Task", "+ Tarea")}</button>,
            t("One-off tasks on a day (buy materials, an estimate visit…). Work on a job: “Assign work” on the worker.", "Tareas sueltas en un día (comprar material, una visita…). El trabajo de un trabajo: “Asignar trabajo” en el trabajador."), openTasks.length > 0,
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
          access={modal.id ? accessOf(modal.id) : { state: "none" }} takenEmails={takenEmails} onInvited={() => access.reload()}
          hasRecords={(id) => hours.some((h) => h.workerId === id) || pays.some((p) => p.workerId === id)}
          onSave={async (w) => {
            const was = workers.find((x) => x.id === w.id);
            await saveWorker(w);
            // marked inactive: their login loses access to the company (invite them again if they come back)
            if (was && was.active !== false && w.active === false && company) { lostAccess(w, await revokeWorkerAccess(company.id, w.id).catch(() => -1)); access.reload(); }
          }}
          onDelete={async (w) => {
            await removeWorker(w.id); deleteImage(w.photo?.path); if (clocks.some((c) => c.id === w.id)) await removeClock(w.id); setModal(null);
            if (company) { lostAccess(w, await revokeWorkerAccess(company.id, w.id).catch(() => -1)); access.reload(); }
          }} />
      )}
      {modal?.kind === "deletedHours" && (
        <Modal title={t("Deleted hours", "Horas borradas")} onClose={() => setModal(null)}>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t("Deleted hours are kept as a record (time records must be kept for years) but count nowhere. Put one back if it was a mistake.", "Las horas borradas se guardan como registro (los registros de horas se deben guardar por años) pero no cuentan en nada. Restaura una si fue un error.")}</p>
          <div className="tm-del">{deletedHours.slice(0, 100).map((h) => (
            <div key={h.id} className="tm-del-it">
              <div><b>{wById(h.workerId)?.name || "—"}</b> · {fmtDate(h.date, lang)} · {hrs(num(h.hours))}{h.estId ? " · " + (estById(h.estId)?.number || "") : ""}
                <div className="muted tm-sub">{t("Deleted", "Borrada")}{h.deletedBy ? " " + t("by", "por") + " " + h.deletedBy : ""}{h.deletedAt && !isNaN(Date.parse(h.deletedAt)) ? " · " + fmtDate(new Date(h.deletedAt).toLocaleDateString("en-CA"), lang) : ""}</div></div>
              <button className="btn sm" onClick={async () => { await saveHours(restoreEntry(h, by)); toast(t("Hours put back.", "Horas restauradas.")); }}>{t("Restore", "Restaurar")}</button>
            </div>))}</div>
        </Modal>
      )}
      {modal?.kind === "assign" && wById(modal.workerId) && (
        <AssignModal worker={wById(modal.workerId)!} workers={workers} jobs={assignJobs} settings={settings} jobLabel={jobLabel} startJob={modal.estId}
          onSave={(id, p) => patchEst(id, p)} onClose={() => setModal(null)}
          onOtherTask={() => setModal({ kind: "task", workerId: modal.workerId })} />
      )}
      {modal?.kind === "hours" && (
        <HoursModal entry={hours.find((h) => h.id === modal.id)} workers={modal.id ? workers : activeWorkers} startWorker={modal.workerId} jobOf={(id) => jobLabel(estById(id))}
          jobs={jobOptions(ests, invoices, hours.find((h) => h.id === modal.id)?.estId).map((e) => ({ id: e.id, label: jobLabel(e) }))}
          onSite={jobOnSite(ests, todayISO(), invoices)?.id || ""} onClose={() => setModal(null)}
          onSave={async (h) => {
            const next = { ...h, jobLabel: h.estId ? jobLabel(estById(h.estId)) : "" }, before = hours.find((x) => x.id === h.id);
            await saveHours(before ? withEdit(before, next, by) : next); setModal(null); toast(t("Hours saved.", "Horas guardadas."));
          }}
          onDelete={async (id) => {
            const gone = hours.find((h) => h.id === id);
            if (!gone) return;
            // kept as a record (wage-hour law), left out of every total; "Deleted" lists it
            await saveHours(softDelete(gone, by)); setModal(null);
            toast(t("Hours deleted. They stay in “Deleted”.", "Horas borradas. Quedan en “Borradas”."), { undo: () => saveHours(gone) });
          }} />
      )}
      {modal?.kind === "pay" && (
        <PayModal workers={workers} startWorker={modal.workerId} owedOf={(id) => { const w = wById(id); return w ? workerStats(w, { from: "", to: "" }, hours, pays).owed : 0; }}
          onClose={() => setModal(null)}
          onSave={async (p) => { await savePay(p); setModal(null); toast(t("Payment saved.", "Pago guardado.")); }} />
      )}
      {modal?.kind === "clock" && wById(modal.workerId) && (
        <ClockTaskModal worker={wById(modal.workerId)!} opts={workOf(modal.workerId)} busy={!!busy["clk" + modal.workerId]}
          onPick={(k) => clockInTask(wById(modal.workerId)!, k)} onNewTask={() => setModal({ kind: "task", workerId: modal.workerId, thenClock: true })}
          onAssign={() => setModal({ kind: "assign", workerId: modal.workerId, estId: nextJobOf(modal.workerId) })} onClose={() => setModal(null)} />
      )}
      {modal?.kind === "task" && (
        <TaskModal task={tasks.find((k) => k.id === modal.id)} workers={activeWorkers} startWorker={modal.workerId}
          jobs={jobOptions(ests, invoices, tasks.find((k) => k.id === modal.id)?.estId).map((e) => ({ id: e.id, label: jobLabel(e) }))}
          onClose={() => setModal(null)}
          onSave={async (k) => { await saveTask({ ...k, jobLabel: k.estId ? jobLabel(estById(k.estId)) : "" }); setModal(modal.thenClock && k.workerId ? { kind: "clock", workerId: k.workerId } : null); toast(t("Task saved.", "Tarea guardada.")); }}
          onDelete={async (id) => { const gone = tasks.find((k) => k.id === id); await removeTask(id); setModal(null); toast(t("Task deleted.", "Tarea eliminada."), gone ? { undo: () => saveTask(gone) } : undefined); }} />
      )}
    </div>
  );
}

/** "+2 h", "−34 h 56 min": logged minus planned (hoursText alone shows no sign). */
const diffText = (d: number) => (Math.round(d * 60) > 0 ? "+" : Math.round(d * 60) < 0 ? "−" : "") + hoursText(Math.abs(d));
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
      <Combobox value={value} onChange={onChange} none={t("No job", "Sin trabajo")} placeholder={t("Search jobs…", "Buscar trabajos…")}
        options={jobs.map((j) => ({ value: j.id, label: j.label }))} /></label>
  );
}

/** Clock a worker in: always for one of their open tasks for today, or a line of the job they are at today (owner rule). */
function ClockTaskModal({ worker, opts, busy, onPick, onNewTask, onAssign, onClose }: {
  worker: Worker; opts: WorkItem[]; busy: boolean; onPick(k: WorkItem): void; onNewTask(): void; onAssign(): void; onClose(): void;
}) {
  const t = useT();
  const [pick, setPick] = useState(opts.length === 1 ? opts[0].id : "");
  const k = opts.find((x) => x.id === pick);
  return (
    <Modal title={t(`Clock in ${worker.name}`, `Entrada de ${worker.name}`)} onClose={onClose}>
      {opts.length === 0 ? <>
        <p className="muted" style={{ marginTop: 0 }}>{t(`${worker.name} has no open tasks for today. The clock always runs for a task: assign work on a job, or add a quick task.`, `${worker.name} no tiene tareas abiertas para hoy. El reloj siempre corre para una tarea: asígnale trabajo de un trabajo o agrega una tarea rápida.`)}</p>
        <div className="tm-actions"><button className="btn pri" onClick={onAssign}><Icon name="briefcase" size={16} />{t("Assign work", "Asignar trabajo")}</button>
          <button className="btn" onClick={onNewTask}><Icon name="plus" size={16} />{t("New task", "Nueva tarea")}</button></div>
      </> : <>
        <p className="muted" style={{ marginTop: 0 }}>{t("Which task is the time for?", "¿Para qué tarea es el tiempo?")}</p>
        <div className="wk-pick tm-clk-pick" role="radiogroup" aria-label={t("Task", "Tarea")}>
          {opts.map((x) => (
            <label key={x.id} className={"wk-opt" + (pick === x.id ? " on" : "")}>
              <input type="radio" name="owner-clock-task" checked={pick === x.id} onChange={() => setPick(x.id)} />
              <span className="wk-opt-t"><b>{x.title}</b>{(x.time || x.jobLabel) && <small>{[x.time ? fmtTime(x.time) : "", x.jobLabel || ""].filter(Boolean).join(" · ")}</small>}</span>
            </label>))}
        </div>
        <div className="tm-actions"><button className="btn pri" disabled={!k || busy} onClick={() => k && onPick(k)}><Icon name="clock" size={16} />{t("Clock in", "Entrada")}</button></div>
      </>}
    </Modal>
  );
}

function HoursModal({ entry, workers, startWorker, jobs, onSite, jobOf, onSave, onDelete, onClose }: {
  entry?: HourEntry; workers: Worker[]; startWorker?: string; jobs: Job[]; onSite: string; jobOf(estId: string): string;
  onSave(h: HourEntry): Promise<void>; onDelete(id: string): Promise<void>; onClose(): void;
}) {
  const t = useT(), toast = useUi((s) => s.toast), lang = useUi((s) => s.lang);
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
    if (!(num(h.hours) > 0)) { toast(t("Write the time worked.", "Escribe el tiempo trabajado.")); return; }
    if (!h.workerId) { toast(t("Pick a worker.", "Escoge un trabajador.")); return; }
    return run(() => onSave({ ...h, hours: num(h.hours), rate: num(h.rate), date: h.date || todayISO(), estId: h.estId || "", note: (h.note || "").trim() }));
  };
  return (
    <Modal title={isNew ? t("Log hours", "Anotar horas") : t("Edit hours", "Editar horas")} onClose={onClose}>
      {clockTimes(h, lang) && <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>🕒 {t("Time clock: ", "Reloj: ")}{clockTimes(h, lang)}</p>}
      <div className="grid2">
        <label className="f">{t("Worker", "Trabajador")}
          <select value={h.workerId} onChange={(e) => pickWorker(e.target.value)}>
            {workers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            {!w && h.workerId && <option value={h.workerId}>—</option>}
          </select></label>
        <label className="f">{t("Date", "Fecha")}<DatePicker value={h.date} onChange={(v) => setH({ ...h, date: v })} /></label>
      </div>
      <div className="grid2">
        <DurationInput label={t("Time worked", "Tiempo trabajado")} value={num(h.hours)} onChange={(n) => setH({ ...h, hours: n })} />
        <label className="f">{t("Pay per hour ($)", "Pago por hora ($)")}<NumInput step="0.5" value={num(h.rate)} onChange={(n) => setH({ ...h, rate: n })} /></label>
      </div>
      <JobSelect label={t("Job", "Trabajo")} value={h.estId || ""} jobs={jobs} onChange={(v) => setH({ ...h, estId: v })} />
      <label className="f">{t("Note (optional)", "Nota (opcional)")}<input value={h.note || ""} onChange={(e) => setH({ ...h, note: e.target.value })} placeholder={t("Sanding, priming, spraying…", "Lijado, primer, sprayado…")} /></label>
      <p className="muted tm-amt">{num(h.rate) ? t(`Amount: ${money(hourAmount(h))} (${money(num(h.rate))}/h). Overtime is added by week.`, `Monto: ${money(hourAmount(h))} (${money(num(h.rate))}/h). Las horas extra se suman por semana.`) : " "}</p>
      {!isNew && <p className="muted tm-amt">{t("Changes you make are kept on this entry, and the worker sees them.", "Los cambios que hagas quedan guardados en esta entrada y el trabajador los ve.")}</p>}
      {entry && <HourHistory h={entry} nameOf={(id) => workers.find((x) => x.id === id)?.name || ""} jobOf={jobOf} />}
      <div className="tm-actions">
        <button className="btn pri" disabled={saving} onClick={save}>{t("Save", "Guardar")}</button>
        {!isNew && <button className="btn danger" disabled={saving} onClick={async () => { if (await ask(t("Delete these hours?", "¿Borrar estas horas?"))) run(() => onDelete(h.id)); }}>{t("Delete", "Borrar")}</button>}
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
        <label className="f">{t("Date", "Fecha")}<DatePicker value={date} onChange={(v) => setDate(v)} /></label>
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

function TaskModal({ task, workers, jobs, startWorker, onSave, onDelete, onClose }: {
  task?: Task; workers: Worker[]; jobs: Job[]; startWorker?: string; onSave(k: Task): Promise<void>; onDelete(id: string): Promise<void>; onClose(): void;
}) {
  const t = useT(), toast = useUi((s) => s.toast);
  const isNew = !task;
  const [k, setK] = useState<Task>(() => task || { id: uid("task"), title: "", date: todayISO(), time: "", note: "", estId: "", workerId: startWorker || workers[0]?.id || "", done: false });
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
        <label className="f">{t("Date", "Fecha")}<DatePicker value={k.date} onChange={(v) => setK({ ...k, date: v })} /></label>
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
        {!isNew && <button className="btn danger" disabled={saving} onClick={async () => { if (await ask(t("Delete this task?", "¿Eliminar esta tarea?"))) run(() => onDelete(k.id)); }}>{t("Delete task", "Eliminar tarea")}</button>}
      </div>
    </Modal>
  );
}
