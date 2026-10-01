import { Link } from "react-router-dom";
import { useT } from "../../i18n";
import { uid } from "../../lib/estimate";
import { measureLines, measuresFor, measuresTotal, setMeasureQty, setMeasureRate } from "../../lib/measures";
import { money, num } from "../../lib/money";
import type { Estimate, Settings } from "../../lib/types";
import { NumInput } from "../../ui/NumInput";

/**
 * Measurements of the estimate's job type (src/lib/measures.ts): how many of each (sq ft of walls, doors…) times its
 * price. Each one is an estimate line; the price can be changed for this estimate once there is a quantity.
 * Fields look like shadcn's Input Group: the unit and the $ sit inside the box.
 */
export default function MeasuresCard({ e, set, s, lang, jobType, jobName }: {
  e: Estimate; set(patch: Partial<Estimate>): void; s: Settings; lang: "en" | "es"; jobType: string; jobName: string;
}) {
  const t = useT();
  const es = lang === "es";
  const list = measuresFor(s, jobType);
  const lines = measureLines(e.items || [], list.map((c) => c.id));
  if (!list.length) return (
    <p className="muted ms-none">{t(`${jobName} has no measurements yet.`, `${jobName} todavía no tiene medidas.`)}{" "}
      <Link to="/settings?section=jobtypes">{t("Choose them in Settings → Job types", "Elígelas en Ajustes → Tipos de trabajo")}</Link></p>);
  const total = measuresTotal(lines);
  return (
    <div className="card ms-card">
      <div className="card-h"><h2>{t("Measurements", "Medidas")}</h2><span className="muted ms-sub">{jobName}</span></div>
      <div className="card-b">
        <div className="ms-head" aria-hidden><span /><span>{t("How many", "Cantidad")}</span><span>{t("Price per unit", "Precio por unidad")}</span><span>{t("Total", "Total")}</span></div>
        {list.map((c) => {
          const line = lines.get(c.id), qty = num(line?.qty), rate = line ? num(line.rate) : c.rate;
          const unit = (es ? c.unitEs || c.unit : c.unit) || "";
          const name = es ? c.es || c.en : c.en || c.es;
          const qid = "ms-q-" + c.id;
          return (
            <div className={"ms-row" + (qty > 0 ? " on" : "")} key={c.id}>
              <label className="ms-name" htmlFor={qid}>{name}{line && num(line.rate) !== c.rate && <small>{t("price changed on this estimate", "precio cambiado en este presupuesto")}</small>}</label>
              <div className="ig">
                <NumInput id={qid} value={qty} placeholder="0" onChange={(n) => set({ items: setMeasureQty(e.items || [], c, n, uid("it")) })} />
                {unit && <span className="ig-a">{unit}</span>}
              </div>
              <div className={"ig" + (line ? "" : " off")} title={line ? undefined : t("Type how many first", "Primero escribe la cantidad")}>
                <span className="ig-a">$</span>
                <NumInput value={rate} disabled={!line} aria-label={t(`Price per ${unit || "unit"}`, `Precio por ${unit || "unidad"}`)} onChange={(n) => set({ items: setMeasureRate(e.items || [], c.id, n) })} />
                {unit && <span className="ig-a ig-u">/{unit}</span>}
              </div>
              <b className="ms-amt">{qty > 0 ? money(qty * rate) : "—"}</b>
            </div>);
        })}
        <div className="ms-foot"><span>{t("Measurements total", "Total de medidas")}</span><b>{money(total)}</b></div>
      </div>
    </div>
  );
}
