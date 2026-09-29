// TradeWorks line chart — port of lineChartHTML / lcPath / lcShow from the prototype.
// Monotone cubic curve (no overshoot), blue area fill, dashed grid, hover band + dot + tooltip.
import { useMemo, useRef, useState } from "react";
import "./LineChart.css";

export type Series = { name: string; values: number[]; color: string; fill?: boolean; dashed?: boolean };
type Props = {
  labels: string[];            // x labels (e.g. "Jan")
  tooltips?: string[];         // tooltip titles (e.g. "January 2026")
  series: Series[];
  height?: number;             // plot height in px (default 220)
  selected?: number;           // index highlighted by default (default: last non-zero of series[0])
  onSelect?: (index: number) => void;
  formatY?: (v: number) => string;
  formatValue?: (v: number) => string;
};

const W = 1000, H = 300;
const niceMax = (v: number) => { if (!(v > 0)) return 100; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 8 ? 8 : 10) * p; }; // ends divisible by 4 so the 5 grid labels are round
const shortMoney = (x: number) => (x >= 1000 ? "$" + (x / 1000).toFixed(x >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : "$" + Math.round(x));
const money = (x: number) => x.toLocaleString("en-US", { style: "currency", currency: "USD" });

function monotonePath(pts: [number, number][], close: boolean) {
  const n = pts.length; if (!n) return "";
  if (n < 3) { const d = "M" + pts.map(p => p.join(",")).join(" L"); return close ? `${d} L${pts[n - 1][0]},${H} L${pts[0][0]},${H} Z` : d; }
  const dx: number[] = [], m: number[] = [], t: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`; }
  return close ? `${d} L${pts[n - 1][0]},${H} L${pts[0][0]},${H} Z` : d;
}

export default function LineChart({ labels, tooltips, series, height = 220, selected, onSelect, formatY = shortMoney, formatValue = money }: Props) {
  const n = labels.length, plotRef = useRef<HTMLDivElement>(null);
  const { mn, rg } = useMemo(() => { const all = series.flatMap(s => s.values).concat(0);
    const mx = niceMax(Math.max(...all)), lo = Math.min(0, ...all); return { mn: lo, rg: mx - lo || 1 }; }, [series]);
  const X = (i: number) => (n < 2 ? W / 2 : (i / (n - 1)) * W), Y = (v: number) => H - ((v - mn) / rg) * H;
  const fallback = useMemo(() => { let last = -1; series[0]?.values.forEach((v, i) => { if (v) last = i; }); return last >= 0 ? last : n - 1; }, [series, n]);
  const start = selected ?? fallback;
  const [hover, setHover] = useState<number | null>(null);
  const idx = hover ?? start, xPct = n < 2 ? 50 : (idx / (n - 1)) * 100;
  const pick = (clientX: number) => { const r = plotRef.current!.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (n - 1)); };
  const gid = useMemo(() => "lc" + Math.random().toString(36).slice(2, 8), []);
  const top = Math.min(...series.map(s => 100 - ((s.values[idx] - mn) / rg) * 100));

  return (
    <div className="lc" style={{ ["--lch" as any]: height + "px" }}>
      <div className="lc-y">{[1, .75, .5, .25, 0].map(f => <span key={f} style={{ top: (1 - f) * 100 + "%" }}>{formatY(mn + rg * f)}</span>)}</div>
      <div className="lc-plot" ref={plotRef}
        onPointerMove={e => setHover(pick(e.clientX))} onPointerLeave={() => setHover(null)}
        onClick={e => onSelect?.(pick(e.clientX))}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>{series.map((s, si) => (
            <linearGradient key={si} id={gid + si} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity=".22" /><stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>))}</defs>
          {[0, .25, .5, .75, 1].map(f => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="lc-g" />)}
          {series.map((s, si) => { const pts = s.values.map((v, i) => [X(i), Y(v)] as [number, number]);
            return <g key={si}>
              {s.fill && <path d={monotonePath(pts, true)} fill={`url(#${gid + si})`} />}
              <path d={monotonePath(pts, false)} fill="none" stroke={s.color} strokeWidth={s.fill ? 2.5 : 2}
                strokeDasharray={s.dashed ? "6 6" : undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </g>; })}
        </svg>
        <div className="lc-band" style={{ left: xPct + "%" }} />
        {series.map((s, si) => <i key={si} className="lc-dot" style={{ left: xPct + "%", top: 100 - ((s.values[idx] - mn) / rg) * 100 + "%", borderColor: s.color }} />)}
        <div className={"lc-tip" + (xPct > 60 ? " r" : xPct < 40 ? " l" : "")} style={{ left: Math.max(2, Math.min(98, xPct)) + "%", top: top + "%" }}>
          <b>{(tooltips ?? labels)[idx]}</b>
          {series.map((s, si) => <span key={si}><i style={{ background: s.color }} />{series.length > 1 ? s.name + " " : ""}<em>{formatValue(s.values[idx])}</em></span>)}
        </div>
      </div>
      <div className="lc-x">{labels.map((l, i) => <span key={i} style={{ left: (n < 2 ? 50 : (i / (n - 1)) * 100) + "%" }}>{l}</span>)}</div>
      {series.length > 1 && <div className="lc-leg">{series.map((s, si) => <span key={si}><i style={{ background: s.color }} />{s.name}</span>)}</div>}
    </div>
  );
}
