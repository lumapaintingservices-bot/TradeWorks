// Dashboard > Charts (prototype insightsHTML): year pills, tiles, quoted-vs-won line chart (click a month for its jobs),
// funnel, and close rate by price band / lead source / job type. Numbers come from metrics.insights().
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import LineChart from "../../components/LineChart";
import { useMetricsCtx } from "../../data/metrics";
import { useT } from "../../i18n";
import { jobTypeLabel, jobTypeOf } from "../../lib/estimate";
import { calcEstimate } from "../../lib/estimate";
import { insightMonthJobs, insights, jobStatus, nameOf, type InsGroup } from "../../lib/metrics";
import { money } from "../../lib/money";
import { useUi } from "../../store/ui";
import { EmptyState } from "../../ui/EmptyState";
import { Modal } from "../../ui/Modal";
import { StatusBadge } from "../../ui/StatusBadge";
import { ChartsBarRow, ChartsCard, ChartsPills, ChartsTile, ChartsTiles, chartsShort } from "./ChartsParts";

const KEY = "tw.insRange";
const initial = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };

export default function ChartsTab() {
  const t = useT();
  const lang = useUi((s) => s.lang), es = lang === "es";
  const nav = useNavigate();
  const { ctx, loading } = useMetricsCtx();
  const [range, setRange] = useState(initial);
  const [month, setMonth] = useState<string | null>(null);
  const pick = (k: string) => { setRange(k); try { localStorage.setItem(KEY, k); } catch { /* ignore */ } };
  const ins = useMemo(() => insights(ctx, range || String(ctx.now.getFullYear())), [ctx, range]);
  if (loading) return null;
  if (!ctx.estimates.length) {
    return <div className="card"><EmptyState icon="chart" title={t("No charts yet", "Aún no hay gráficas")}
      text={t("Send a few estimates and this shows your close rate, sales month by month and where your best clients come from.", "Manda algunos estimados y aquí ves tu tasa de cierre, tus ventas mes a mes y de dónde vienen tus mejores clientes.")} /></div>;
  }

  const active = ins.range === "12m" ? "last12" : ins.range;
  const ranges: [string, string][] = [...ins.years.map((y) => [y, y] as [string, string]), ["last12", t("Last 12 months", "Últimos 12 meses")], ["all", t("All years", "Todos los años")]];
  const isYear = /^\d{4}$/.test(ins.range);
  const sel = month ? ins.months.findIndex((m) => m.key === month) : undefined;
  const selMonth = month ? ins.months.find((m) => m.key === month) : undefined;
  const jobs = month ? insightMonthJobs(ctx, ins.range === "all" ? "all" : ins.range, month) : [];
  const monthTitle = (m: { key: string; label: string }) => m.label + (ins.mLen === 7 ? " " + m.key.slice(0, 4) : "");
  const wonSub = ins.deltaPct === null ? (ins.won ? t(`average job ${money(ins.wonTotal / ins.won)}`, `trabajo promedio ${money(ins.wonTotal / ins.won)}`) : "")
    : `${ins.deltaPct >= 0 ? "▲ " : "▼ "}${Math.abs(ins.deltaPct)}% ${t("vs same period last year", "vs mismo periodo del año pasado")}`;

  const groupRows = (g: InsGroup[], emptyEn: string, emptyEs: string) => g.length ? g.map((x) => (
    <ChartsBarRow key={x.name} label={x.name} pct={x.pct} value={x.pct + "%"} extra={`${x.w}/${x.n}${x.v ? " · " + chartsShort(x.v) : ""}`} />
  )) : <p className="cx-empty muted">{t(emptyEn, emptyEs)}</p>;
  const top = ins.funnel[0].n || 1;

  return (
    <div className="cx-charts">
      <ChartsPills items={ranges} value={active} onChange={(k) => { pick(k); setMonth(null); }} />
      <ChartsTiles>
        <ChartsTile label={t("Close rate", "Tasa de cierre")} value={ins.sent ? ins.closeRate + "%" : "—"} sub={t(`${ins.won} won of ${ins.sent} sent`, `${ins.won} ganados de ${ins.sent} enviados`)} />
        <ChartsTile label={t("Won", "Ganado")} value={money(ins.wonTotal)} sub={wonSub} />
        <ChartsTile label={t("Days to sign", "Días hasta firmar")} value={ins.avgDays === null ? "—" : ins.avgDays.toFixed(1)} sub={t("from sent to signed", "de enviado a firmado")} />
        <ChartsTile label={t("Declined", "Rechazados")} value={String(ins.lost)} sub={ins.won + ins.lost ? `${ins.decidedRate}% ${t("won of decided", "ganados de los que decidieron")}` : ""} />
      </ChartsTiles>

      <ChartsCard title={ins.byYear ? t("Year by year", "Año por año") : t("Month by month", "Mes por mes") + (isYear ? " · " + ins.range : "")}
        sub={t("What you quoted and what you won, by estimate date.", "Lo que cotizaste y lo que ganaste, por fecha del estimado.")}>
        <LineChart height={230} labels={ins.months.map((m) => m.label)} tooltips={ins.months.map(monthTitle)} selected={sel !== undefined && sel >= 0 ? sel : undefined}
          series={[{ name: t("Won", "Ganado"), values: ins.months.map((m) => m.w), color: "var(--chart-main)", fill: true },
            { name: t("Quoted (sent)", "Cotizado (enviado)"), values: ins.months.map((m) => m.q), color: "var(--chart-compare)", dashed: true }]}
          onSelect={(i) => setMonth(ins.months[i]?.key ?? null)} />
        <p className="cx-hint muted">{t("Tap the chart to see the jobs of a month", "Toca la gráfica para ver los trabajos de un mes")}</p>
      </ChartsCard>

      <div className="cx-grid2">
        <ChartsCard title={t("From lead to paid", "De lead a pagado")} sub={t("How many make it to each step, and the % from the step before.", "Cuántos llegan a cada paso, y el % del paso anterior.")}>
          {ins.funnel.map((s) => <ChartsBarRow key={s.id} label={es ? s.es : s.en} pct={(s.n / top) * 100} value={s.n} extra={s.conv !== null ? s.conv + "%" : ""} />)}
        </ChartsCard>
        <ChartsCard title={t("Close rate by price", "Tasa de cierre por precio")} sub={t("Of the estimates you sent in each price range, how many you won.", "De los estimados que mandaste en cada rango de precio, cuántos ganaste.")}>
          {ins.bands.length ? (
            <>
              {ins.bands.map((b) => <ChartsBarRow key={b.label} label={b.label} pct={b.pct} tone={b.best ? "best" : undefined} value={b.pct + "%"} extra={t(`${b.won} of ${b.sent}`, `${b.won} de ${b.sent}`)} />)}
              {ins.bestBand && <p className="cx-best muted">{t("You close best at ", "Cierras mejor en ")}<b>{ins.bestBand.label}</b>.</p>}
            </>
          ) : <p className="cx-empty muted">{t("Send a few estimates and this shows at which prices clients say yes.", "Manda algunos estimados y aquí ves a qué precios los clientes dicen que sí.")}</p>}
        </ChartsCard>
      </div>
      <div className="cx-grid2">
        <ChartsCard title={t("Close rate by lead source", "Tasa de cierre por origen")} sub={t("Won / sent, and the money won from each source.", "Ganados / enviados, y el dinero ganado de cada origen.")}>
          {groupRows(ins.bySource, "Pick the source on each estimate and it shows up here.", "Escoge el origen en cada estimado y aparece aquí.")}
        </ChartsCard>
        <ChartsCard title={t("By job type", "Por tipo de trabajo")} sub={t("Won / sent and money won for cabinets, interior, exterior…", "Ganados / enviados y dinero ganado en gabinetes, interior, exterior…")}>
          {groupRows(ins.byType, "No estimates sent in this period.", "No hay estimados enviados en este periodo.")}
        </ChartsCard>
      </div>

      {selMonth && (
        <Modal title={monthTitle(selMonth)} onClose={() => setMonth(null)}>
          <div className="cx-jobs-h muted"><span>{t(`${selMonth.n} sent · ${selMonth.nw} won · ${money(selMonth.w)}`, `${selMonth.n} enviados · ${selMonth.nw} ganados · ${money(selMonth.w)}`)}</span></div>
          {!jobs.length ? <p className="cx-empty muted">{t("No estimates sent this month.", "No hay estimados enviados este mes.")}</p> : (
            <div className="cx-jobs">
              <div className="only-desk">
                <table className="tbl"><tbody>{jobs.map((e) => (
                  <tr key={e.id} className="click" onClick={() => nav(`/estimates/${e.id}`)}>
                    <td className="muted nw">{e.number}</td><td><b>{nameOf(ctx, e)}</b></td><td className="muted">{jobTypeLabel(jobTypeOf(e), es)}</td>
                    <td><StatusBadge status={jobStatus(ctx, e)} /></td><td className="r nw">{money(calcEstimate(e, ctx.settings).total)}</td>
                  </tr>))}</tbody></table>
              </div>
              <div className="cards only-phone">{jobs.map((e) => (
                <div key={e.id} className="ec" onClick={() => nav(`/estimates/${e.id}`)}>
                  <div className="l1"><span>{nameOf(ctx, e)}</span><span>{money(calcEstimate(e, ctx.settings).total)}</span></div>
                  <div className="l2"><span>{e.number} · {jobTypeLabel(jobTypeOf(e), es)}</span><StatusBadge status={jobStatus(ctx, e)} /></div>
                </div>))}</div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
