import { useMemo } from "react";
import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { KPI_DEFAULT, KPI_LIB, kpiFormat, kpiSeries, type Ctx, type Period, type SeriesPoint } from "../../lib/metrics";
import { money } from "../../lib/money";
import type { Settings } from "../../lib/types";
import { useUi } from "../../store/ui";
import { Modal } from "../../ui/Modal";
import "./dashboard.css";

export type DashCard = { id: string; p: Period };
/** Prototype dashCards(): the contractor's own list, or the default four while it is empty. */
export const dashCardsOf = (s: Settings): DashCard[] => (s.dashCards && s.dashCards.length ? s.dashCards : KPI_DEFAULT) as DashCard[];

/** Port of sparkSVG: 6 points, month labels underneath. */
function Spark({ series }: { series: SeriesPoint[] }) {
  const w = 220, h = 54, vals = series.map((s) => s.v), mx = Math.max(0, ...vals), mn = Math.min(0, ...vals);
  const rg = mx - mn || 1, step = w / (series.length - 1);
  const pts = series.map((s, i) => (i * step).toFixed(1) + "," + (h - 6 - ((s.v - mn) / rg) * (h - 12)).toFixed(1)).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h + 14}`} className="db-spark" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {series.map((s, i) => <text key={s.key} x={Math.min(w - 10, Math.max(10, i * step))} y={h + 12} textAnchor="middle">{s.label}</text>)}
    </svg>
  );
}

/** KPI library modal (prototype openKpiLibrary): every KPI with a 6-month sparkline, add / remove, back to the default four. */
export default function KpiLibrary({ ctx, onClose }: { ctx: Ctx; onClose(): void }) {
  const t = useT();
  const es = useUi((s) => s.lang) === "es";
  const { settings, update } = useSettings();
  const cards = dashCardsOf(settings), on = new Set(cards.map((c) => c.id));
  const series = useMemo(() => KPI_LIB.map((k) => kpiSeries(ctx, k.id)), [ctx]);

  const toggle = (id: string) => update({ dashCards: on.has(id) ? cards.filter((c) => c.id !== id) : [...cards, { id, p: "ytd" as Period }] });
  const reset = () => update({ dashCards: [] });

  return (
    <Modal title={t("KPI library", "Biblioteca de indicadores")} onClose={onClose} wide>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{t("Pick the cards for the top of your dashboard. Each chart shows the last 6 months.", "Escoge las tarjetas de arriba de tu panel. Cada gráfica muestra los últimos 6 meses.")}</div>
      <div className="db-klib">
        {KPI_LIB.map((k, i) => {
          const ser = series[i], last = ser[ser.length - 1].v, isOn = on.has(k.id);
          return (
            <div key={k.id} className={"db-kl" + (isOn ? " on" : "")}>
              <div className="db-kl-h"><b>{es ? k.es : k.en}</b><span>{t("Last 6 months", "Últimos 6 meses")}</span></div>
              <div className="db-kl-s">{es ? k.subEs : k.subEn}</div>
              <Spark series={ser} />
              <div className="db-kl-f">
                <b>{kpiFormat(k, last, money)}</b>
                <button className={"btn sm" + (isOn ? "" : " pri")} onClick={() => toggle(k.id)}>
                  {isOn ? t("× Remove from dashboard", "× Quitar del panel") : t("+ Add to dashboard", "+ Agregar al panel")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="db-kl-foot">
        <button className="btn sm" onClick={reset}>{t("Back to the default four", "Regresar a las cuatro de siempre")}</button>
        <button className="btn pri" onClick={onClose}>{t("Done", "Listo")}</button>
      </div>
    </Modal>
  );
}
