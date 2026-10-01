// TradeWorks KPI card — icon tile, title, period select, big value, delta pill (see .kcard in the prototype)
import { KPI_ICONS } from "../design/icons";
import "./KpiCard.css";

export type Period = "month" | "lastmonth" | "ytd" | "lastyear";
type Props = {
  id: string;                      // KPI id (job_margin, net_profit, sales_won, backlog, …) → icon + color
  title: string;
  value: string;                   // already formatted ("$26,112.00", "52.0%")
  delta?: number | null;           // % change vs previous period (or points for % KPIs)
  deltaIsPoints?: boolean;
  lowerIsBetter?: boolean;         // money out, cost per lead… (green when it goes down)
  subtitle?: string;               // shown when there is no delta
  period?: Period;                 // omit for "as of today" KPIs
  onPeriodChange?: (p: Period) => void;
  t: (en: string, es: string) => string;
};
const TREND_UP = '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>', TREND_DOWN = '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>';
const PERIODS: [Period, string, string][] = [["month","This month","Este mes"],["lastmonth","Last month","Mes pasado"],["ytd","This year to date","Este año hasta hoy"],["lastyear","Last year","Año pasado"]];

export default function KpiCard({ id, title, value, delta, deltaIsPoints, lowerIsBetter, subtitle, period, onPeriodChange, t }: Props) {
  const icon = KPI_ICONS[id];
  const good = delta == null ? true : lowerIsBetter ? delta <= 0 : delta >= 0;
  return (
    <div className="kcard">
      <div className="kh">
        <span className="kt">
          {icon && <span className={`kic c-${icon[0]}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
            strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: icon[1] }} /></span>}
          {title}
        </span>
        {period ? (
          <select className="kp" value={period} onChange={e => onPeriodChange?.(e.target.value as Period)}>
            {PERIODS.map(([k, en, es]) => <option key={k} value={k}>{t(en, es)}</option>)}
          </select>
        ) : <span className="kp muted">{t("As of today", "A hoy")}</span>}
      </div>
      {delta != null && isFinite(delta) ? <>
        {/* trend badge next to the number (idea from the studio-admin dashboard) */}
        <div className="kvrow"><div className="kv">{value}</div>
          <span className={`dp ${good ? "up" : "down"}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
            dangerouslySetInnerHTML={{ __html: delta >= 0 ? TREND_UP : TREND_DOWN }} />{delta >= 0 ? "+" : "−"}{Math.abs(delta).toFixed(deltaIsPoints ? 1 : 0)}{deltaIsPoints ? " pts" : "%"}</span></div>
        <div className="kd">{t("from previous period", "vs periodo anterior")}</div>
      </> : <><div className="kv">{value}</div><div className="kd">{subtitle}</div></>}
    </div>
  );
}
