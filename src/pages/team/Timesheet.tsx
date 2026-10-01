import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import LineChart from "../../components/LineChart";
import { useClients, useEstimates, useHours, usePayouts, useWorkers } from "../../data/hooks";
import { useT } from "../../i18n";
import { clientNameOf } from "../../lib/calendar";
import { todayISO } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import { money, num } from "../../lib/money";
import { RANGE_KEYS, clockTimes, rangeBounds, type RangeKey } from "../../lib/team";
import { byJob, paymentsIn, paySummary, periodSeries, timesheetDays } from "../../lib/timesheet";
import type { HourEntry, Payout, Worker } from "../../lib/types";
import { useUi } from "../../store/ui";
import { Avatar } from "../../ui/Avatar";
import { EmptyState } from "../../ui/EmptyState";
import "../Team.css";
import "./timesheet.css";

const hrs = (n: number) => `${Math.round(num(n) * 100) / 100} h`;
const RANGE_LABEL: Record<RangeKey, [string, string]> = {
  week: ["This week", "Esta semana"], month: ["This month", "Este mes"], lastMonth: ["Last month", "Mes pasado"],
  ytd: ["Year to date", "En lo que va del año"], lastYear: ["Last year", "Año pasado"], all: ["All", "Todo"],
};

/** /timesheet — a worker's own hours, money and payments. */
export function WorkerTimesheet() {
  const t = useT();
  const { workerId, role } = useAuth();
  const { rows: workers } = useWorkers();
  const { rows: hours } = useHours();
  const { rows: pays } = usePayouts();
  const me = workers.find((w) => w.id === workerId);
  if (role && role !== "worker") return <Navigate to="/team" replace />;
  return (
    <div className="page">
      <div className="page-h"><div><h1>{t("My hours & pay", "Mis horas y pagos")}</h1><p>{t("Every day you worked, what you earned and what you were paid.", "Cada día que trabajaste, lo que ganaste y lo que te pagaron.")}</p></div></div>
      {!workerId ? <div className="card"><EmptyState icon="team" title={t("Ask your boss to link your worker record to your account", "Pídele a tu jefe que vincule tu registro de trabajador a tu cuenta")}
        text={t("Once it is linked your hours and pay show up here.", "Cuando esté vinculado, aquí salen tus horas y tus pagos.")} /></div>
        : me ? <TimesheetBody worker={me} hours={hours} payouts={pays} self /> : <div className="card"><p className="muted tm-empty">…</p></div>}
    </div>
  );
}

/** /team/:workerId/timesheet — the owner / admin sees what that worker sees (plus job names from the estimates). */
export function OwnerWorkerTimesheet() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const { role } = useAuth();
  const { workerId = "" } = useParams();
  const { rows: workers, loading } = useWorkers();
  const { rows: hours } = useHours();
  const { rows: pays } = usePayouts();
  const { rows: ests } = useEstimates();
  const { rows: clients } = useClients();
  const labelOf = useMemo(() => (estId: string) => { const e = ests.find((x) => x.id === estId); return e ? `${e.number} · ${clientNameOf(e, clients, lang)}` : ""; }, [ests, clients, lang]);
  if (role === "worker") return <Navigate to="/timesheet" replace />;
  const w = workers.find((x) => x.id === workerId);
  return (
    <div className="page">
      <div className="page-h"><div><Link className="ts-back" to="/team">← {t("Team", "Equipo")}</Link>
        <h1 className="ts-name">{w && <Avatar name={w.name} size="lg" />}{w ? w.name : t("Worker", "Trabajador")}</h1><p>{t("Timesheet: hours by day, money by job and payments. This is what the worker sees.", "Hoja de horas: horas por día, dinero por trabajo y pagos. Es lo mismo que ve el trabajador.")}</p></div></div>
      {w ? <TimesheetBody worker={w} hours={hours} payouts={pays} labelOf={labelOf} />
        : !loading && <div className="card"><p className="muted tm-empty">{t("Worker not found.", "No se encontró el trabajador.")}</p></div>}
    </div>
  );
}

function TimesheetBody({ worker, hours, payouts, labelOf, self }: { worker: Worker; hours: HourEntry[]; payouts: Payout[]; labelOf?: (estId: string) => string; self?: boolean }) {
  const t = useT();
  const lang = useUi((s) => s.lang), es = lang === "es";
  const today = todayISO();
  const [mode, setMode] = useState<"week" | "month">("week");
  const [range, setRange] = useState<RangeKey>("month");
  const [sel, setSel] = useState<number | undefined>(undefined);
  const b = useMemo(() => rangeBounds(range, today), [range, today]);

  const week = useMemo(() => paySummary(hours, payouts, worker, rangeBounds("week", today)), [hours, payouts, worker, today]);
  const month = useMemo(() => paySummary(hours, payouts, worker, rangeBounds("month", today)), [hours, payouts, worker, today]);
  const inRange = useMemo(() => paySummary(hours, payouts, worker, b), [hours, payouts, worker, b]);
  const series = useMemo(() => periodSeries(hours, worker, mode, 12, today), [hours, worker, mode, today]);
  const days = useMemo(() => timesheetDays(hours, worker, b), [hours, worker, b]);
  const jobs = useMemo(() => byJob(hours, worker, b, labelOf), [hours, worker, b, labelOf]);
  const paid = useMemo(() => paymentsIn(payouts, worker.id, b), [payouts, worker.id, b]);

  const mon = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso + "T12:00:00").toLocaleDateString(es ? "es" : "en", opts);
  const labels = series.map((p) => mode === "week" ? mon(p.from, { month: "short", day: "numeric" }) : mon(p.from, { month: "short" }));
  const tips = series.map((p) => mode === "week" ? t("Week of ", "Semana del ") + mon(p.from, { month: "long", day: "numeric" }) : mon(p.from, { month: "long", year: "numeric" }));
  const pick = sel !== undefined && series[sel] ? series[sel] : [...series].reverse().find((p) => p.amount > 0) || series[series.length - 1];
  const jobName = (estId: string, label: string) => label || (estId ? t("Job", "Trabajo") : t("No job picked", "Sin trabajo"));

  return (
    <>
      <div className="tm-tiles">
        <div className="card tm-tile"><span>{t("This week", "Esta semana")}</span><b>{money(week.earned)}</b><small>{hrs(week.hours)}</small></div>
        <div className="card tm-tile"><span>{t("This month", "Este mes")}</span><b>{money(month.earned)}</b><small>{hrs(month.hours)}</small></div>
        <div className="card tm-tile"><span>{self ? t("Paid to you", "Te han pagado") : t("Paid", "Pagado")}</span><b>{money(month.paid)}</b><small>{t("this month", "este mes")} · {money(week.paidAll)} {t("in total", "en total")}</small></div>
        <div className="card tm-tile"><span>{self ? t("Still owed to you", "Te deben") : t("Still owed", "Se le debe")}</span><b className={week.owed > 0.005 ? "tm-owed" : ""}>{money(Math.max(0, week.owed))}</b><small>{t("earned − paid, all time", "ganado − pagado, todo")}</small></div>
      </div>

      <section className="card ts-chart">
        <div className="card-h"><h2>{mode === "week" ? t("Pay by week", "Pago por semana") : t("Pay by month", "Pago por mes")}</h2>
          <div className="seg">{(["week", "month"] as const).map((m) => <button key={m} className={mode === m ? "on" : ""} onClick={() => { setMode(m); setSel(undefined); }}>{m === "week" ? t("Weeks", "Semanas") : t("Months", "Meses")}</button>)}</div></div>
        <div className="card-b">
          {pick && <div className="ts-pick"><span>{tips[series.indexOf(pick)]}</span><b>{money(pick.amount)}</b><small>{hrs(pick.hours)}</small></div>}
          <LineChart height={220} labels={labels} tooltips={tips} selected={sel} onSelect={setSel}
            series={[{ name: t("Earned", "Ganado"), values: series.map((p) => p.amount), color: "var(--chart-main)", fill: true }]} />
        </div>
      </section>

      <div className="toolbar"><div className="pills">{RANGE_KEYS.map((k) => (
        <button key={k} className={"pill" + (range === k ? " on" : "")} onClick={() => setRange(k)}>{t(...RANGE_LABEL[k])}</button>))}</div></div>

      <div className="tm-tiles ts-sum">
        <div className="card tm-tile"><span>{t("Hours", "Horas")}</span><b>{hrs(inRange.hours)}</b><small>{t(...RANGE_LABEL[range])}</small></div>
        <div className="card tm-tile"><span>{t("Earned", "Ganado")}</span><b>{money(inRange.earned)}</b><small>{days.length} {t("day(s) worked", "día(s) trabajados")}</small></div>
        <div className="card tm-tile"><span>{t("Paid", "Pagado")}</span><b>{money(inRange.paid)}</b><small>{paid.length} {t("payment(s)", "pago(s)")}</small></div>
      </div>

      <section className="card tm-sec">
        <div className="card-h"><h2>{t("By job", "Por trabajo")}</h2></div>
        {jobs.length === 0 ? <p className="muted tm-empty">{t("No hours in this period.", "No hay horas en este periodo.")}</p> : (
          <ul className="ts-jobs">{jobs.map((j) => {
            const max = Math.max(...jobs.map((x) => x.amount), 1);
            return (
              <li key={j.key}>
                <div className="ts-job-t"><span className={j.estId ? "" : "muted"}>{jobName(j.estId, j.label)}</span><b>{money(j.amount)}</b></div>
                <div className="ts-bar"><i style={{ width: `${Math.max(2, (j.amount / max) * 100)}%` }} /></div>
                <small className="muted">{hrs(j.hours)}</small>
              </li>);
          })}</ul>
        )}
      </section>

      <section className="card tm-sec">
        <div className="card-h"><h2>{t("Timesheet by day", "Horas por día")}</h2></div>
        {days.length === 0 ? <p className="muted tm-empty">{t("No hours in this period.", "No hay horas en este periodo.")}</p> : (
          <div className="ts-days">{days.map((d) => (
            <div key={d.date} className="ts-day">
              <div className="ts-day-h"><b>{fmtDate(d.date, lang)}</b><span>{hrs(d.hours)} · <b>{money(d.amount)}</b></span></div>
              {d.entries.map((h) => (
                <div key={h.id} className="ts-ent">
                  <span className="ts-time">{clockTimes(h, lang) || t("Logged by hand", "Anotado a mano")}</span>
                  <span className="ts-job">{jobName(h.estId || "", String(h.jobLabel || "") || (h.estId && labelOf ? labelOf(h.estId) : ""))}{h.note && h.note !== "Clock in/out" && h.note !== "Entrada/salida" ? <em> · {h.note}</em> : null}</span>
                  <span className="ts-h">{hrs(num(h.hours))}</span>
                </div>))}
            </div>))}</div>
        )}
      </section>

      <section className="card tm-sec">
        <div className="card-h"><h2>{self ? t("Payments to you", "Pagos que recibiste") : t("Payments", "Pagos")}</h2></div>
        {paid.length === 0 ? <p className="muted tm-empty">{t("No payments in this period.", "No hay pagos en este periodo.")}</p> : (
          <div className="ts-days">{paid.map((p) => (
            <div key={p.id} className="ts-ent ts-pay"><span className="ts-time">{fmtDate(p.date, lang)}</span><span className="ts-job">{[p.method, p.note].filter(Boolean).join(" · ") || "—"}</span><span className="ts-h"><b>{money(num(p.amount))}</b></span></div>))}</div>
        )}
      </section>
    </>
  );
}
