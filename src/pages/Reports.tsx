// Reports (/reports): Profit & loss · Profit by job · Marketing return · Export. Numbers come from src/lib/metrics.ts
// (plFor / plSeries / plBreakdown / profitByJob / marketingRows / exportCsv); this file only lays them out.
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import LineChart from "../components/LineChart";
import { useMetricsCtx } from "../data/metrics";
import { useT } from "../i18n";
import { jobTypeLabel, jobTypeOf } from "../lib/estimate";
import { expCatLabel } from "../lib/expenses";
import { downloadText, filePrefix } from "../lib/download";
import {
  csvFileName, exportCsv, exportCsvRows, marketingRows, nameOf, plBreakdown, plFor, plSeries, profitByJob, reportYears, type Bounds, type CsvKind, type JobRow,
} from "../lib/metrics";
import { money } from "../lib/money";
import { useUi } from "../store/ui";
import { ChartsBarRow, ChartsCard, ChartsPills, ChartsTile, ChartsTiles } from "./dashboard/ChartsParts";
import { SourcesRoiBars, SourcesTable, SourcesTiles } from "./dashboard/SourcesParts";
import "./Reports.css";

const TABS = [["pl", "Profit & loss", "Ganancias y pérdidas"], ["jobs", "Profit by job", "Ganancia por trabajo"], ["mkt", "Marketing return", "Retorno de publicidad"], ["export", "Export", "Exportar"]] as const;
type Tab = (typeof TABS)[number][0];
const isYear = (k: string) => /^\d{4}$/.test(k);
const marginTone = (m: number) => (m >= 45 ? "ok" : m >= 25 ? "warn" : "bad");
const EXPORTS: { kind: CsvKind; en: string; es: string }[] = [
  { kind: "expenses", en: "Expenses (every line, with category, job and receipt)", es: "Gastos (cada línea, con categoría, trabajo y recibo)" },
  { kind: "pl", en: "Profit & loss by month", es: "Ganancias y pérdidas por mes" },
  { kind: "income", en: "Income (payments collected)", es: "Ingresos (pagos cobrados)" },
  { kind: "jobs", en: "Profit by job", es: "Ganancia por trabajo" },
  { kind: "team", en: "Team payments", es: "Pagos al equipo" },
];

export default function Reports() {
  const t = useT();
  const lang = useUi((s) => s.lang), es = lang === "es";
  const [sp, setSp] = useSearchParams();
  const { ctx, loading } = useMetricsCtx();
  const years = useMemo(() => reportYears(ctx), [ctx]);
  const rawTab = sp.get("tab"), tab: Tab = TABS.some((x) => x[0] === rawTab) ? (rawTab as Tab) : "pl";
  const rawRange = sp.get("range") || "", range = rawRange === "all" || years.includes(rawRange) ? rawRange : years[0];
  const set = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); n.set(k, v); return n; }, { replace: true });
  const b: Bounds = useMemo(() => (isYear(range) ? { from: `${range}-01-01`, to: `${range}-12-31` } : { from: "", to: "" }), [range]);

  return (
    <div className="page rp">
      <div className="page-h"><div><h1>{t("Reports", "Reportes")}</h1><p>{t("Money in, money out, and what's left.", "Lo que entra, lo que sale y lo que queda.")}</p></div></div>
      <div className="tabs" role="tablist">{TABS.map(([k, en, esx]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => set("tab", k)}>{t(en, esx)}</button>)}</div>
      <ChartsPills items={[...years.map((y) => [y, y] as [string, string]), ["all", t("All time", "Todo")]]} value={range} onChange={(k) => set("range", k)} />
      {loading ? null : tab === "pl" ? <PlTab b={b} range={range} /> : tab === "jobs" ? <JobsTab b={b} /> : tab === "mkt" ? <MktTab b={b} /> : <ExportTab b={b} es={es} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Profit & loss */
function PlTab({ b, range }: { b: Bounds; range: string }) {
  const t = useT(), es = useUi((s) => s.lang) === "es";
  const { ctx } = useMetricsCtx();
  const pl = useMemo(() => plFor(ctx, b), [ctx, b]);
  const series = useMemo(() => plSeries(ctx, range), [ctx, range]);
  const cats = useMemo(() => plBreakdown(pl), [pl]);
  const catName = (c: string) => expCatLabel(c, es, ctx.settings.expCats);
  const yr = isYear(range), tone = pl.profit < 0 ? "bad" : "ok", max = Math.max(1, ...cats.map((c) => c.amount));
  return (
    <>
      <ChartsTiles>
        <ChartsTile label={t("Money in", "Entró")} value={money(pl.income)} sub={t("payments collected", "pagos cobrados")} />
        <ChartsTile label={t("Money out", "Salió")} value={money(pl.expenses)} sub={t("expenses + team", "gastos + equipo")} />
        <ChartsTile label={t("Net profit", "Ganancia neta")} value={money(pl.profit)} tone={tone} />
        <ChartsTile label={t("Profit margin", "Margen")} value={pl.income ? pl.margin.toFixed(1) + "%" : "—"} />
      </ChartsTiles>
      <ChartsCard title={yr ? `${t("Month by month", "Mes por mes")} · ${range}` : t("Year by year", "Año por año")}
        sub={t("Money in counts invoices marked paid, on the day they were paid.", "Lo que entró cuenta las facturas pagadas, en la fecha en que se pagaron.")}>
        <LineChart height={230} labels={series.map((p) => p.label)} tooltips={series.map((p) => (yr ? `${p.label} ${range}` : p.label))}
          series={[{ name: t("Money in", "Entró"), values: series.map((p) => p.inc), color: "var(--chart-main)", fill: true },
            { name: t("Money out", "Salió"), values: series.map((p) => p.exp), color: "var(--ink)", dashed: true }]} />
      </ChartsCard>
      <div className="cx-grid2">
        <ChartsCard title={t("Statement", "Estado de resultados")} flush>
          <table className="rp-stmt"><tbody>
            <tr><td className="strong">{t("Income — payments collected", "Ingresos — pagos cobrados")}</td><td className="r strong">{money(pl.income)}</td></tr>
            {cats.map((c) => <tr key={c.cat}><td className="ind">{catName(c.cat)}</td><td className="r">−{money(c.amount)}</td></tr>)}
            <tr><td className="strong">{t("Total expenses", "Total de gastos")}</td><td className="r">−{money(pl.expenses)}</td></tr>
            <tr className="net"><td className="strong">{t("Net profit", "Ganancia neta")}</td><td className={"r strong " + tone}>{money(pl.profit)}</td></tr>
          </tbody></table>
        </ChartsCard>
        <ChartsCard title={t("Where the money went", "A dónde se fue el dinero")}>
          {cats.length ? cats.map((c) => <ChartsBarRow key={c.cat} label={catName(c.cat)} pct={(c.amount / max) * 100} value={money(c.amount)} extra={c.pct + "%"} />)
            : <p className="cx-empty muted">{t("No expenses in this period.", "No hay gastos en este periodo.")}</p>}
        </ChartsCard>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Profit by job */
function JobsTab({ b }: { b: Bounds }) {
  const t = useT(), es = useUi((s) => s.lang) === "es";
  const nav = useNavigate();
  const { ctx } = useMetricsCtx();
  const d = useMemo(() => profitByJob(ctx, b), [ctx, b]);
  const open = (id: string) => nav(`/estimates/${id}`);
  const kind = (r: JobRow) => jobTypeLabel(jobTypeOf(r.e), es);
  return (
    <>
      <ChartsTiles>
        <ChartsTile label={t("Jobs won", "Trabajos ganados")} value={String(d.jobs)} />
        <ChartsTile label={t("Revenue", "Ventas")} value={money(d.revenue)} />
        <ChartsTile label={t("Real profit", "Ganancia real")} value={money(d.profit)} tone={d.profit < 0 ? "bad" : "ok"} />
        <ChartsTile label={t("Average margin", "Margen promedio")} value={d.margin === null ? "—" : d.margin.toFixed(1) + "%"} />
      </ChartsTiles>
      <ChartsCard title={t("All jobs", "Todos los trabajos")}
        sub={t("Income collected against the price, and costs so far against what the estimate expected. Most profitable first.", "Lo cobrado contra el precio, y los costos hasta ahora contra lo que esperaba el estimado. Del más rentable al menos.")}>
        {!d.rows.length ? <p className="cx-empty muted">{t("No jobs won in this period.", "No hay trabajos ganados en este periodo.")}</p> : (
          <div className="aj">
            <div className="aj-h"><span>{t("Job / client", "Trabajo / cliente")}</span><span className="r">{t("Actual", "Real")}</span>
              <span><i className="lg lg-in" />{t("Income", "Ingresos")}<br /><i className="lg lg-co" />{t("Costs", "Costos")}</span><span className="r">{t("Estimate", "Estimado")}</span><span className="r">{t("Margin", "Margen")}</span></div>
            {d.rows.map((r) => (
              <button key={r.e.id} className="aj-r" onClick={() => open(r.e.id)}>
                <span className="nm"><b>{r.e.number}<span className="aj-t"> · {kind(r)}</span></b><em>{nameOf(ctx, r.e)}</em></span>
                <span className="r n">{money(r.c.paid)}<br />{money(r.actCost)}</span>
                <span className="bars"><i className="t"><i style={{ width: r.inPct + "%", background: "var(--ok)" }} /></i><i className="t"><i style={{ width: r.coPct + "%", background: r.over ? "var(--bad)" : "var(--acc)" }} /></i></span>
                <span className="r n muted">{money(r.c.price)}<br />{money(r.expCost)}</span>
                <span className={"r mg " + marginTone(r.margin)}>{r.margin.toFixed(0)}%{!r.c.hasReal && <em>{t("expected", "esperado")}</em>}</span>
              </button>))}
          </div>
        )}
      </ChartsCard>
      <ChartsCard title={t("Details", "Detalle")} sub={t("Price − materials (receipts) − labor (team hours) − other job expenses.", "Precio − materiales (recibos) − mano de obra (horas del equipo) − otros gastos del trabajo.")} flush={d.rows.length > 0}>
        {!d.rows.length ? <p className="cx-empty muted">{t("No jobs won in this period.", "No hay trabajos ganados en este periodo.")}</p> : (
          <>
            <div className="only-desk">
              <table className="tbl rp-det">
                <thead><tr><th>{t("Job", "Trabajo")}</th><th className="r">{t("Price", "Precio")}</th><th className="r">{t("Materials", "Materiales")}</th><th className="r">{t("Labor", "Mano de obra")}</th><th className="r">{t("Other", "Otros")}</th><th className="r">{t("Profit", "Ganancia")}</th><th className="r">%</th></tr></thead>
                <tbody>{d.rows.map((r) => { const tone = marginTone(r.c.margin); return (
                  <tr key={r.e.id} className="click" onClick={() => open(r.e.id)}>
                    <td><b>{r.e.number} · {nameOf(ctx, r.e)}</b><div className="muted rp-sub">{kind(r)}{r.c.hasReal ? "" : " · " + t("no costs logged yet", "sin costos anotados")}</div></td>
                    <td className="r nw">{money(r.c.price)}</td><td className="r nw">{money(r.c.mat)}</td><td className="r nw">{money(r.c.labor)}</td><td className="r nw">{money(r.c.other)}</td>
                    <td className={"r nw strong " + tone}>{money(r.c.profit)}</td><td className={"r nw " + tone}>{r.c.margin.toFixed(0)}%</td>
                  </tr>); })}</tbody>
              </table>
            </div>
            <div className="cards only-phone">{d.rows.map((r) => { const tone = marginTone(r.c.margin); return (
              <div key={r.e.id} className="ec" onClick={() => open(r.e.id)}>
                <div className="l1"><span>{nameOf(ctx, r.e)}</span><span className={"rp-pr " + tone}>{money(r.c.profit)}</span></div>
                <div className="l2"><span>{r.e.number} · {kind(r)}</span><span className={tone}>{r.c.margin.toFixed(0)}%</span></div>
                <dl className="sx-dl">
                  <div><dt>{t("Price", "Precio")}</dt><dd>{money(r.c.price)}</dd></div><div><dt>{t("Materials", "Materiales")}</dt><dd>{money(r.c.mat)}</dd></div>
                  <div><dt>{t("Labor", "Mano de obra")}</dt><dd>{money(r.c.labor)}</dd></div>
                  {r.c.other > 0 && <div><dt>{t("Other", "Otros")}</dt><dd>{money(r.c.other)}</dd></div>}
                </dl>
                {!r.c.hasReal && <div className="l2"><span>{t("no costs logged yet", "sin costos anotados")}</span></div>}
              </div>); })}</div>
          </>
        )}
      </ChartsCard>
    </>
  );
}

/* ------------------------------------------------------------------ Marketing return */
function MktTab({ b }: { b: Bounds }) {
  const { ctx } = useMetricsCtx();
  const data = useMemo(() => marketingRows(ctx, b), [ctx, b]);
  return (<><SourcesTiles data={data} /><SourcesRoiBars data={data} /><SourcesTable data={data} /></>);
}

/* ------------------------------------------------------------------ Export */
function ExportTab({ b, es }: { b: Bounds; es: boolean }) {
  const t = useT();
  const { company } = useAuth();
  const toast = useUi((s) => s.toast);
  const { ctx } = useMetricsCtx();
  const prefix = filePrefix(company?.name);
  const counts = useMemo(() => Object.fromEntries(EXPORTS.map((x) => [x.kind, Math.max(0, exportCsvRows(x.kind, ctx, b).length - 1)])) as Record<CsvKind, number>, [ctx, b]);
  const go = (kind: CsvKind) => { downloadText(csvFileName(kind, b, prefix), exportCsv(kind, ctx, b)); toast(t("File downloaded.", "Archivo descargado.")); };
  const label = isYear(b.from.slice(0, 4)) && b.from ? b.from.slice(0, 4) : t("All time", "Todo");
  return (
    <ChartsCard title={t("For your accountant", "Para tu contador")} sub={t("Files open in Excel or Google Sheets. They cover the period selected above.", "Los archivos abren en Excel o Google Sheets. Cubren el periodo seleccionado arriba.")}
      right={<span className="muted rp-per">{t("Period", "Periodo")}: <b>{label}</b></span>}>
      <div className="rp-exp">
        {EXPORTS.map((x) => (
          <button key={x.kind} className="btn rp-exp-b" onClick={() => go(x.kind)}>
            <span className="rp-exp-t">{es ? x.es : x.en}</span>
            <span className="rp-exp-n muted">{csvFileName(x.kind, b, prefix)} · {counts[x.kind]} {t("rows", "filas")}</span>
          </button>))}
      </div>
      <p className="cx-note muted">{t("Organized to make your accountant's job easy — they decide how each category is filed.", "Organizado para facilitarle el trabajo a tu contador — él decide cómo se declara cada categoría.")}</p>
    </ChartsCard>
  );
}
