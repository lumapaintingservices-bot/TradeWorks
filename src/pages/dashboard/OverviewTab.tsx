import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import KpiCard from "../../components/KpiCard";
import LineChart from "../../components/LineChart";
import { useMetricsCtx } from "../../data/metrics";
import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { jobTypeLabel, jobTypeOf } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import { todayISO } from "../../lib/followups";
import {
  cashThisMonth, invoiceSummary, jobCosts, KPI_PERIODS, moneySeries, nameOf, plCompare, stillToCollect, type Period,
} from "../../lib/metrics";
import { money } from "../../lib/money";
import { useUi } from "../../store/ui";
import { Avatar } from "../../ui/Avatar";
import { Icon } from "../../ui/Icon";
import { FollowUpList } from "../FollowUps";
import GoalCard from "./GoalCard";
import { anyKpiDef, fmtKpi, kpiResult } from "../../lib/kpis";
import KpiLibrary, { dashCardsOf } from "./KpiLibrary";
import "./dashboard.css";

const shortDate = (iso: string, lang: "en" | "es") => fmtDate(iso, lang).replace(/,? \d{4}$/, "");
const pl0 = (): Period => { try { const v = localStorage.getItem("tw.glPl"); if (v === "month" || v === "lastmonth" || v === "ytd" || v === "lastyear") return v; } catch { /* ignore */ } return "lastmonth"; };

/** A row of the "Profit & loss" / "Cash this month" / "Invoices" mini cards: label, amount, and a bar. */
function Bar({ label, amount, pct, color }: { label: string; amount: number; pct: number; color: string }) {
  return (
    <>
      <div className="db-hb"><span>{label}</span><b>{money(amount)}</b></div>
      <div className="db-track db-hbar"><i style={{ width: Math.max(0, Math.min(100, pct)) + "%", background: color }} /></div>
    </>
  );
}

export default function OverviewTab() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const es = lang === "es";
  const nav = useNavigate();
  const { ctx, loading } = useMetricsCtx();
  const { settings, update } = useSettings();
  const [lib, setLib] = useState(false);
  const [plp, setPlp] = useState<Period>(pl0);

  const cards = dashCardsOf(settings);
  const kpis = useMemo(() => cards.map((c) => ({ c, def: anyKpiDef(c.id), r: kpiResult(ctx, c.id, c.p) })).filter((x) => x.def), [ctx, cards]);
  const money12 = useMemo(() => moneySeries(ctx, 12), [ctx]);
  const owe = useMemo(() => stillToCollect(ctx), [ctx]);
  const plc = useMemo(() => plCompare(ctx, plp), [ctx, plp]);
  const cash = useMemo(() => cashThisMonth(ctx), [ctx]);
  const inv = useMemo(() => invoiceSummary(ctx), [ctx]);

  if (loading) return null;

  const setPeriod = (i: number, p: Period) => update({ dashCards: cards.map((c, j) => (j === i ? { ...c, p } : c)) });
  const pickPl = (p: Period) => { setPlp(p); try { localStorage.setItem("tw.glPl", p); } catch { /* ignore */ } };
  const plMax = Math.max(plc.a.income, plc.a.expenses, 1);
  const delta = money12.deltaPct;

  return (
    <>
      {ctx.estimates.length === 0 && (
        <section className="card db-welcome">
          <span className="ic"><Icon name="chart" group="empty" size={22} /></span>
          <div className="tx"><h3>{t("Welcome to TradeWorks", "Bienvenido a TradeWorks")}</h3>
            <p>{t("Your numbers show up here as soon as you send your first estimate.", "Tus números salen aquí en cuanto mandes tu primer presupuesto.")}</p></div>
          <div className="bt">
            <button className="btn pri" onClick={() => nav("/estimates?new=1")}>{t("+ New estimate", "+ Nuevo presupuesto")}</button>
            <button className="btn" onClick={() => nav("/settings")}>{t("Share your request form", "Compartir tu formulario")}</button>
          </div>
        </section>
      )}

      <GoalCard ctx={ctx} />

      <div className="db-top">
        <div className="muted">{t("Your business at a glance", "Tu negocio de un vistazo")}</div>
        <button className="btn sm" onClick={() => setLib(true)}><Icon name="chart" size={16} />{t("Customize", "Personalizar")}</button>
      </div>
      <div className="db-kgrid">
        {kpis.map(({ c, def, r }, i) => (
          <KpiCard key={c.id + i} id={def!.icon} title={es ? def!.es : def!.en} value={fmtKpi(def!, r.value, money)}
            delta={r.delta} deltaIsPoints={r.deltaIsPoints} lowerIsBetter={def!.lowerIsBetter} subtitle={es ? def!.subEs : def!.subEn}
            period={def!.asOfToday ? undefined : c.p} onPeriodChange={(p) => setPeriod(i, p)} t={t} />
        ))}
      </div>


      <div className="db-main">
        <section className="db-card db-money">
          <div className="db-h"><h3>{t("Money in", "Dinero que entró")}</h3><span className="sub">{t("Last 12 months", "Últimos 12 meses")}</span></div>
          <div className="db-head">
            <span className="kv">{money(money12.total)}</span>
            {delta !== null && isFinite(delta) && (
              <span className="kd"><span className={"dp " + (delta >= 0 ? "up" : "down")}>{delta >= 0 ? "↑ " : "↓ "}{Math.abs(delta).toFixed(1)}%</span>{t("vs the 12 months before", "vs los 12 meses anteriores")}</span>
            )}
          </div>
          <LineChart height={260} labels={money12.points.map((p) => p.label)} tooltips={money12.points.map((p) => p.tip)}
            series={[
              { name: t("Money in", "Entró"), values: money12.points.map((p) => p.income), color: "var(--chart-main)", fill: true },
              { name: t("Money out", "Salió"), values: money12.points.map((p) => p.expenses), color: "var(--chart-compare)", dashed: true },
            ]} />
        </section>

        <section className="db-card">
          <div className="db-h"><h3>{t("Still to collect", "Por cobrar")}</h3><span className="sub">{money(owe.total)}</span></div>
          {owe.list.length ? (
            <div className="db-owe-list">
              {owe.list.slice(0, 5).map((x, i) => {
                const nm = nameOf(ctx, x.e), paid = jobCosts(ctx, x.e).paid;
                return (
                  <button key={x.e.id} className="db-owe" onClick={() => nav(`/estimates/${x.e.id}`)}>
                    <Avatar name={nm} />
                    <span className="nm"><b>{nm}</b><span>{x.e.number} · {jobTypeLabel(jobTypeOf(x.e), es)}{paid > 0 && <i className="db-dep">{t("deposit in", "depósito")}</i>}</span></span>
                    <span className="amt">{money(x.v)}</span>
                    <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 6 6 6-6 6" /></svg>
                  </button>
                );
              })}
            </div>
          ) : <div className="db-empty">{t("Nothing owed — every signed job is paid.", "Nada pendiente — todo trabajo firmado está pagado.")}</div>}
          {owe.list.length > 5 && <div className="db-f"><Link to="/reports?tab=jobs">{t(`See all ${owe.list.length}`, `Ver los ${owe.list.length}`)}</Link></div>}
        </section>
      </div>

      <div className="db-4">
        <section className="db-card">
          <div className="db-h"><h3>{t("Profit & loss", "Ganancias y pérdidas")}</h3>
            <select className="kp" value={plp} aria-label={t("Period", "Periodo")} onChange={(e) => pickPl(e.target.value as Period)}>
              {KPI_PERIODS.map(([k, en, esl]) => <option key={k} value={k}>{t(en, esl)}</option>)}
            </select></div>
          <div className="kv">{money(plc.a.profit)}</div>
          {plc.deltaPct !== null && isFinite(plc.deltaPct)
            ? <div className="kd"><span className={"dp " + (plc.deltaPct >= 0 ? "up" : "down")}>{plc.deltaPct >= 0 ? "↑ " : "↓ "}{Math.abs(plc.deltaPct).toFixed(0)}%</span>{t("from previous period", "vs periodo anterior")}</div>
            : <div className="kd">&nbsp;</div>}
          <Bar label={t("Income", "Ingresos")} amount={plc.a.income} pct={(plc.a.income / plMax) * 100} color="var(--ok)" />
          <Bar label={t("Expenses", "Gastos")} amount={plc.a.expenses} pct={(plc.a.expenses / plMax) * 100} color="var(--acc)" />
          <div className="db-f"><Link to="/reports?tab=pl">{t("See the profit and loss report", "Ver el reporte de ganancias y pérdidas")}</Link></div>
        </section>

        <section className="db-card">
          <div className="db-h"><h3>{t("Cash this month", "Efectivo este mes")}</h3><span className="sub">{shortDate(todayISO(ctx.now), lang)}</span></div>
          <div className="kv" style={cash.profit < 0 ? { color: "var(--bad)" } : undefined}>{money(cash.profit)}</div>
          <div className="kd">{t("in − out so far this month", "entró − salió en lo que va del mes")}</div>
          <Bar label={t("Money in", "Entró")} amount={cash.income} pct={(cash.income / cash.max) * 100} color="var(--ok)" />
          <Bar label={t("Money out", "Salió")} amount={cash.expenses} pct={(cash.expenses / cash.max) * 100} color="var(--acc)" />
          <div className="db-f"><Link to="/expenses">{t("Go to expenses", "Ir a gastos")}</Link></div>
        </section>

        <section className="db-card">
          <div className="db-h"><h3>{t("Invoices", "Facturas")}</h3></div>
          <div className="db-hb"><span><b>{money(inv.unpaid)}</b> {t("unpaid", "sin pagar")}</span></div>
          <div className="db-hb" style={{ marginTop: 8 }}>
            <span><b>{money(inv.overdue)}</b><em>{t("Overdue", "Vencido")}</em></span>
            <span className="r"><b>{money(inv.notDue)}</b><em>{t("Not due yet", "Aún no vence")}</em></span>
          </div>
          <div className="db-track split db-hbar">
            <i style={{ width: (inv.overdue / inv.max) * 100 + "%", background: "var(--bad)" }} />
            <i style={{ width: (inv.notDue / inv.max) * 100 + "%", background: "var(--ink-3)" }} />
          </div>
          <div className="db-hb" style={{ marginTop: 14 }}><span><b>{money(inv.paid30)}</b> {t("paid, last 30 days", "pagado, últimos 30 días")}</span></div>
          <div className="db-track db-hbar"><i style={{ width: (inv.paid30 / inv.max) * 100 + "%", background: "var(--ok)" }} /></div>
          <div className="db-f"><Link to="/invoices">{t("Go to invoices", "Ir a facturas")}</Link></div>
        </section>

        <section className="db-card">
          <div className="db-h"><h3>{t("Shortcuts", "Atajos")}</h3></div>
          <div className="db-links">
            <Link to="/reports?tab=pl"><Icon name="reports" size={18} />{t("Profit and loss report", "Reporte de ganancias y pérdidas")}</Link>
            <Link to="/reports?tab=jobs"><Icon name="chart" size={18} />{t("All jobs: income vs costs", "Todos los trabajos: ingresos vs costos")}</Link>
            <Link to="/expenses?import=1"><Icon name="expenses" size={18} />{t("Import bank CSV", "Importar CSV del banco")}</Link>
            <Link to="/reports?tab=export"><Icon name="mail" size={18} />{t("Export for the accountant", "Exportar para el contador")}</Link>
          </div>
        </section>
      </div>

      <div className="db-fu"><FollowUpList limit={5} /></div>

      {lib && <KpiLibrary ctx={ctx} onClose={() => setLib(false)} />}
    </>
  );
}
