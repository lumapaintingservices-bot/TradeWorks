// Marketing-return blocks shared by the dashboard "Where clients come from" tab and Reports > Marketing return.
import { useT } from "../../i18n";
import type { marketingRows } from "../../lib/metrics";
import { money } from "../../lib/money";
import { ChartsBarRow, ChartsCard, ChartsTile, ChartsTiles, type ChartsTone } from "./ChartsParts";

export type SourcesData = ReturnType<typeof marketingRows>;
const roiTone = (roi: number): ChartsTone => (roi >= 5 ? "ok" : roi && roi < 2 ? "bad" : undefined);
const usd1 = (n: number) => "$" + n.toFixed(1);

export function SourcesTiles({ data }: { data: SourcesData }) {
  const t = useT(), x = data.totals;
  return (
    <ChartsTiles>
      <ChartsTile label={t("Spent on ads & leads", "Gastado en publicidad y leads")} value={money(x.spend)} />
      <ChartsTile label={t("Cost per lead", "Costo por lead")} value={x.leads && x.spend ? money(x.cpl) : "—"} sub={`${x.leads} ${t("leads", "leads")}`} />
      <ChartsTile label={t("Cost per job won", "Costo por trabajo ganado")} value={x.won && x.spend ? money(x.cpj) : "—"} sub={`${x.won} ${t("jobs", "trabajos")}`} />
      <ChartsTile label={t("Return", "Retorno")} value={x.spend ? usd1(x.roi) : "—"} sub={t("earned per $1 spent", "ganado por cada $1")} />
    </ChartsTiles>
  );
}

export function SourcesRoiBars({ data }: { data: SourcesData }) {
  const t = useT(), list = data.rows.filter((r) => r.spend);
  if (!list.length) return null;
  const max = Math.max(1, ...list.map((r) => r.roi));
  return (
    <ChartsCard title={t("Return per $1 spent", "Retorno por cada $1 gastado")} sub={t("Revenue won from each source divided by what you spent on it.", "Lo ganado de cada origen dividido entre lo que gastaste en él.")}>
      {list.map((r) => <ChartsBarRow key={r.source} label={r.source} pct={(r.roi / max) * 100} value={usd1(r.roi)} extra={t("per $1", "por $1")} />)}
    </ChartsCard>
  );
}

export function SourcesTable({ data }: { data: SourcesData }) {
  const t = useT(), rows = data.rows;
  const sub = t("Log ads and lead fees as expenses with their source (Thumbtack, Google…). Leads come from your clients' source; jobs and revenue from estimates won.",
    "Anota la publicidad y los leads como gastos con su origen (Thumbtack, Google…). Los leads salen del origen de tus clientes; los trabajos y ventas, de los estimados ganados.");
  const tot = data.totals;
  return (
    <ChartsCard title={t("By source", "Por origen")} sub={sub} flush={rows.length > 0}>
      {!rows.length ? <p className="cx-empty muted">{t("Nothing yet for this period.", "Nada todavía en este periodo.")}</p> : (
        <>
          <div className="only-desk">
            <table className="tbl sx-tbl">
              <thead><tr>
                <th>{t("Source", "Origen")}</th><th className="r">{t("Spent", "Gastado")}</th><th className="r">Leads</th><th className="r">{t("Per lead", "Por lead")}</th>
                <th className="r">{t("Won", "Ganados")}</th><th className="r">{t("Per job", "Por trabajo")}</th><th className="r">{t("Revenue", "Ventas")}</th><th className="r">{t("Return", "Retorno")}</th>
              </tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.source}>
                  <td><b>{r.source}</b></td><td className="r nw">{money(r.spend)}</td><td className="r">{r.leads}</td><td className="r nw">{r.cpl ? money(r.cpl) : "—"}</td>
                  <td className="r">{r.won}</td><td className="r nw">{r.cpj ? money(r.cpj) : "—"}</td><td className="r nw">{money(r.rev)}</td>
                  <td className="r nw"><b className={"sx-roi " + (r.spend ? roiTone(r.roi) || "" : "")}>{r.spend ? usd1(r.roi) : "—"}</b></td>
                </tr>))}</tbody>
              <tfoot><tr>
                <td>{t("Total", "Total")}</td><td className="r nw">{money(tot.spend)}</td><td className="r">{tot.leads}</td><td className="r nw">{tot.cpl ? money(tot.cpl) : "—"}</td>
                <td className="r">{tot.won}</td><td className="r nw">{tot.cpj ? money(tot.cpj) : "—"}</td><td className="r nw">{money(tot.rev)}</td><td className="r nw">{tot.spend ? usd1(tot.roi) : "—"}</td>
              </tr></tfoot>
            </table>
          </div>
          <div className="cards only-phone">
            {rows.map((r) => (
              <div key={r.source} className="ec sx-card">
                <div className="l1"><span>{r.source}</span><span className={"sx-roi " + (r.spend ? roiTone(r.roi) || "" : "")}>{r.spend ? usd1(r.roi) : "—"}</span></div>
                <dl className="sx-dl">
                  <div><dt>{t("Spent", "Gastado")}</dt><dd>{money(r.spend)}</dd></div>
                  <div><dt>Leads</dt><dd>{r.leads}</dd></div>
                  <div><dt>{t("Per lead", "Por lead")}</dt><dd>{r.cpl ? money(r.cpl) : "—"}</dd></div>
                  <div><dt>{t("Won", "Ganados")}</dt><dd>{r.won}</dd></div>
                  <div><dt>{t("Per job", "Por trabajo")}</dt><dd>{r.cpj ? money(r.cpj) : "—"}</dd></div>
                  <div><dt>{t("Revenue", "Ventas")}</dt><dd>{money(r.rev)}</dd></div>
                </dl>
              </div>))}
          </div>
        </>
      )}
    </ChartsCard>
  );
}
