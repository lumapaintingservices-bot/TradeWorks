// Small shared building blocks of the Money / Charts / Sources tabs and the Reports page (styles in charts.css, prefix cx-).
import type { ReactNode } from "react";
import { useUi } from "../../store/ui";
import { RangeSelect } from "../../ui/RangeSelect";
import { money, num } from "../../lib/money";
import "./charts.css";

/** Port of shortMoney: "$4.6k", "$570". */
export const chartsShort = (x: unknown): string => {
  const v = num(x), a = Math.abs(v), s = a >= 1000 ? "$" + (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : money(a).replace(/\.00$/, "");
  return v < 0 ? "-" + s : s;
};

export type ChartsTone = "ok" | "bad" | "warn" | undefined;

/** Stat tile (prototype .tile): small label, big number, optional muted line. Clickable when `onClick` is given. */
export function ChartsTile({ label, value, sub, tone, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: ChartsTone; onClick?: () => void }) {
  const body = (<><span className="cx-k">{label}</span><b className={"cx-v" + (tone ? " " + tone : "")}>{value}</b>{sub != null && sub !== "" && <span className="cx-m">{sub}</span>}</>);
  return onClick ? <button type="button" className="card cx-tile click" onClick={onClick}>{body}</button> : <div className="card cx-tile">{body}</div>;
}
export const ChartsTiles = ({ children }: { children: ReactNode }) => <div className="cx-tiles">{children}</div>;

/** Card with a title (and optional right-hand controls) and an optional muted sentence under it. */
export function ChartsCard({ title, sub, right, children, flush }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="card cx-card">
      <div className="card-h cx-h"><h2>{title}</h2>{right && <div className="cx-right">{right}</div>}</div>
      <div className={flush ? "cx-flush" : "card-b cx-b"}>{sub && <p className="cx-sub muted">{sub}</p>}{children}</div>
    </section>
  );
}

/** Segmented pills (same look as the page tabs). */
/** The period picker of the charts / reports pages: one dropdown button (RangeSelect), the same on every page. */
export function ChartsPills<K extends string>({ items, value, onChange, small }: { items: [K, string][]; value: K; onChange: (k: K) => void; small?: boolean }) {
  const es = useUi((u) => u.lang) === "es";
  return <div className={"cx-pills" + (small ? " sm" : "")}><RangeSelect items={items} value={value} onChange={onChange} small={small} label={es ? "Periodo" : "Period"} /></div>;
}

/** Horizontal bar row: label, track filled to `pct` (0-100), and a right-hand value with optional muted extra. */
export function ChartsBarRow({ label, pct, value, extra, tone }: { label: ReactNode; pct: number; value?: ReactNode; extra?: ReactNode; tone?: "best" | "ink" }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="cx-row">
      <span className="cx-l" title={typeof label === "string" ? label : undefined}>{label}</span>
      <div className="cx-track"><i className={tone || ""} style={{ width: (p > 0 ? Math.max(p, 3) : 0) + "%" }} /></div>
      <span className="cx-r"><b>{value}</b>{extra != null && extra !== "" && <em> {extra}</em>}</span>
    </div>
  );
}
