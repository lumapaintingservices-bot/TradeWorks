// Dashboard > "Where clients come from": marketing return per lead source for a range (prototype marketingFor / Reports "Marketing return").
import { useMemo, useState } from "react";
import { useMetricsCtx } from "../../data/metrics";
import { useT } from "../../i18n";
import { rangeBounds } from "../../lib/expenses";
import { todayISO } from "../../lib/followups";
import { marketingRows } from "../../lib/metrics";
import { ChartsCard, ChartsPills } from "./ChartsParts";
import { SourcesRoiBars, SourcesTable, SourcesTiles } from "./SourcesParts";

const RANGES: ["month" | "lastmonth" | "ytd" | "lastyear" | "all", string, string][] = [
  ["month", "This month", "Este mes"], ["lastmonth", "Last month", "Mes pasado"], ["ytd", "This year", "Este año"], ["lastyear", "Last year", "Año pasado"], ["all", "All time", "Todo"],
];
type R = (typeof RANGES)[number][0];
const KEY = "tw.srcRange";
const initial = (): R => { try { const v = localStorage.getItem(KEY) as R; return RANGES.some((r) => r[0] === v) ? v : "ytd"; } catch { return "ytd"; } };

export default function SourcesTab() {
  const t = useT();
  const { ctx, loading } = useMetricsCtx();
  const [range, setRange] = useState<R>(initial);
  const pick = (k: R) => { setRange(k); try { localStorage.setItem(KEY, k); } catch { /* ignore */ } };
  const data = useMemo(() => marketingRows(ctx, rangeBounds(range, todayISO(ctx.now))), [ctx, range]);
  if (loading) return null;
  const empty = !data.rows.length;
  return (
    <div className="cx-src">
      <ChartsPills small={false} items={RANGES.map(([k, en, es]) => [k, t(en, es)] as [R, string])} value={range} onChange={pick} />
      {empty ? (
        <ChartsCard title={t("Where clients come from", "De dónde vienen los clientes")}>
          <p className="cx-empty muted">{t("Pick the source on each estimate and log ads and lead fees as expenses with their source. Your cost per lead, cost per job and return per $1 show up here.",
            "Escoge el origen en cada estimado y anota la publicidad y los leads como gastos con su origen. Aquí verás tu costo por lead, costo por trabajo y retorno por cada $1.")}</p>
        </ChartsCard>
      ) : (
        <>
          <SourcesTiles data={data} />
          <SourcesRoiBars data={data} />
          <SourcesTable data={data} />
        </>
      )}
    </div>
  );
}
