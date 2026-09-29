// Dashboard > Money: won / collected / still to collect by job date, close rate, and money in / out / net profit by payment date
// (prototype wonPanelHTML = wonSummary + closeStats + netProfit).
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMetricsCtx } from "../../data/metrics";
import { useT } from "../../i18n";
import { fmtDate } from "../../lib/format";
import { closeStats, jobRefDate, nameOf, netProfit, wonSummary } from "../../lib/metrics";
import { money } from "../../lib/money";
import { useUi } from "../../store/ui";
import { EmptyState } from "../../ui/EmptyState";
import { StatusBadge } from "../../ui/StatusBadge";
import { ChartsCard, ChartsPills, ChartsTile, ChartsTiles, chartsShort } from "./ChartsParts";

type Kind = "month" | "year" | "all";
const KEY = "tw.wonRange";
const initial = (): Kind => { try { const v = localStorage.getItem(KEY); return v === "month" || v === "all" ? v : "year"; } catch { return "year"; } };
const SHOWN = 25;

export default function MoneyTab() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const nav = useNavigate();
  const { ctx, loading } = useMetricsCtx();
  const [kind, setKind] = useState<Kind>(initial);
  const pick = (k: Kind) => { setKind(k); try { localStorage.setItem(KEY, k); } catch { /* ignore */ } };
  const w = useMemo(() => wonSummary(ctx, kind), [ctx, kind]);
  const cs = useMemo(() => closeStats(ctx, kind), [ctx, kind]);
  const np = useMemo(() => netProfit(ctx, kind), [ctx, kind]);
  if (loading) return null;

  const shown = w.list.slice(0, SHOWN), tone = np.profit < 0 ? "bad" : "ok";
  const openEst = (id: string) => nav(`/estimates/${id}`);
  const goReports = () => nav(kind === "year" ? `/reports?range=${new Date().getFullYear()}` : kind === "all" ? "/reports?range=all" : "/reports");
  const pills = <ChartsPills small items={[["month", t("This month", "Este mes")], ["year", t("This year", "Este año")], ["all", t("All time", "Todo")]] as [Kind, string][]} value={kind} onChange={pick} />;

  if (!ctx.estimates.length && !ctx.invoices.length) {
    return <div className="card"><EmptyState icon="chart" title={t("No money to show yet", "Aún no hay dinero que mostrar")}
      text={t("Once you send and win estimates and mark invoices paid, your sales, collections and profit show up here.", "Cuando envíes y ganes estimados y marques facturas como pagadas, tus ventas, cobros y ganancia aparecen aquí.")} /></div>;
  }
  return (
    <div className="cx-money">
      <ChartsCard title={t("Money from accepted jobs", "Dinero de los trabajos aceptados")} right={pills}>
        <ChartsTiles>
          <ChartsTile label={t("Won", "Ganado")} value={money(w.total)} sub={t(`${w.n} accepted jobs`, `${w.n} trabajos aceptados`)} />
          <ChartsTile label={t("Collected", "Cobrado")} value={money(w.collected)} sub={t("paid invoices", "facturas pagadas")} />
          <ChartsTile label={t("Still to collect", "Por cobrar")} value={money(w.due)} sub={`${t("Average per job", "Promedio por trabajo")}: ${money(w.avg)}`} />
          <ChartsTile label={t("After materials", "Después de materiales")} value={money(w.after)} sub={t(`materials ${money(w.mat)}`, `materiales ${money(w.mat)}`)} />
        </ChartsTiles>
        <ChartsTiles>
          <ChartsTile label={t("Close rate", "Tasa de cierre")} value={cs.sent ? cs.rate + "%" : "—"} sub={t(`${cs.won} won of ${cs.sent} sent`, `${cs.won} ganados de ${cs.sent} enviados`)} />
          <ChartsTile label={t("Average bid", "Estimado promedio")} value={cs.sent ? money(cs.avgBid) : "—"} sub={t("sent estimates", "estimados enviados")} />
          <ChartsTile label={t("Still deciding", "Todavía decidiendo")} value={String(cs.open)} sub={t("sent, no answer yet", "enviados, sin respuesta")} />
          <ChartsTile label={t("Declined", "Rechazados")} value={String(cs.lost)} sub={cs.won + cs.lost ? t(`${cs.decided}% won of the ones that decided`, `${cs.decided}% ganados de los que decidieron`) : ""} />
        </ChartsTiles>
        <ChartsTiles>
          <ChartsTile label={t("Money in", "Entró")} value={money(np.income)} sub={t("invoices paid in this period", "facturas pagadas en este periodo")} />
          <ChartsTile label={t("Money out", "Salió")} value={money(np.expenses)}
            sub={t(`materials ${chartsShort(np.materials)} · team ${chartsShort(np.team)} · other ${chartsShort(np.other)}`, `materiales ${chartsShort(np.materials)} · equipo ${chartsShort(np.team)} · otros ${chartsShort(np.other)}`)} />
          <ChartsTile label={t("Net profit", "Ganancia neta")} value={money(np.profit)} sub={t("collected − everything spent", "cobrado − todo lo gastado")} tone={tone} />
          <ChartsTile label={t("Margin", "Margen")} value={np.income ? np.margin.toFixed(1) + "%" : "—"} tone={tone} onClick={goReports}
            sub={<u>{t("See the full report →", "Ver el reporte completo →")}</u>} />
        </ChartsTiles>
        <p className="cx-note muted">
          {t("By work date — the start date, or the estimate date when the job has none.", "Por fecha de trabajo — la fecha de inicio, o la del estimado si no tiene.")}{" "}
          {t("Close rate and average bid go by the estimate date and skip drafts.", "La tasa de cierre y el promedio van por la fecha del estimado y no cuentan borradores.")}{" "}
          {t("Money in, money out and net profit go by the date the money moved — the same as Reports.", "Entró, salió y ganancia neta van por la fecha en que se movió el dinero — igual que en Reportes.")}{" "}
          {t("After materials: estimated — uses your real expenses when you logged them.", "Después de materiales: estimado — usa tus gastos reales cuando los anotaste.")}
        </p>
      </ChartsCard>

      <ChartsCard title={t("Accepted jobs", "Trabajos aceptados")} right={<span className="muted cx-cnt">{w.n}</span>} flush={w.n > 0}>
        {!w.n ? <p className="cx-empty muted">{t("Nothing accepted in this period yet.", "Aún no hay nada aceptado en este periodo.")}</p> : (
          <>
            <div className="only-desk">
              <table className="tbl cx-tbl">
                <thead><tr><th>{t("Number", "Número")}</th><th>{t("Job", "Trabajo")}</th><th>{t("Date", "Fecha")}</th><th>{t("Status", "Estado")}</th>
                  <th className="r">{t("Total", "Total")}</th><th className="r">{t("Collected", "Cobrado")}</th><th className="r">{t("Pending", "Pendiente")}</th></tr></thead>
                <tbody>{shown.map((r) => (
                  <tr key={r.e.id} className="click" onClick={() => openEst(r.e.id)}>
                    <td className="nw muted">{r.e.number}</td><td><b>{nameOf(ctx, r.e)}</b></td><td className="nw">{fmtDate(jobRefDate(r.e), lang)}</td>
                    <td><StatusBadge status={r.st} /></td><td className="r nw">{money(r.total)}</td><td className="r nw muted">{money(r.paid)}</td>
                    <td className="r nw" style={r.due > 0 ? { fontWeight: 650 } : undefined}>{money(r.due)}</td>
                  </tr>))}</tbody>
                <tfoot><tr><td colSpan={4} className="r">{t("Won", "Ganado")}</td><td className="r nw">{money(w.total)}</td><td className="r nw">{money(w.collected)}</td><td className="r nw">{money(w.due)}</td></tr></tfoot>
              </table>
            </div>
            <div className="cards only-phone">
              {shown.map((r) => (
                <div key={r.e.id} className="ec" onClick={() => openEst(r.e.id)}>
                  <div className="l1"><span>{nameOf(ctx, r.e)}</span><span>{money(r.total)}</span></div>
                  <div className="l2"><span>{r.e.number} · {fmtDate(jobRefDate(r.e), lang)}</span><StatusBadge status={r.st} /></div>
                  <div className="l2"><span>{t("Collected", "Cobrado")} {money(r.paid)}</span><span style={r.due > 0 ? { color: "var(--ink)", fontWeight: 600 } : undefined}>{t("Pending", "Pendiente")} {money(r.due)}</span></div>
                </div>))}
            </div>
            {w.n > shown.length && <p className="cx-note muted cx-more">{t(`Showing the first ${shown.length}.`, `Mostrando los primeros ${shown.length}.`)}</p>}
          </>
        )}
      </ChartsCard>
    </div>
  );
}
