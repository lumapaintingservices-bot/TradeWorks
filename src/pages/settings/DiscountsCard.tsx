import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { cleanDiscounts } from "../../lib/settingsForm";
import type { Discount } from "../../lib/types";
import { NumInput } from "../../ui/NumInput";
import { Help, SaveCard, useDraft } from "./parts";

/** Discount codes a client (or you) can pick on an estimate — e.g. CASH3 for paying cash or Zelle. */
export default function DiscountsCard() {
  const t = useT();
  const { settings, update } = useSettings();
  const { draft: list, setDraft, dirty } = useDraft<Discount[]>(settings.discounts || []);
  const set = (i: number, p: Partial<Discount>) => setDraft(list.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function save() {
    const r = cleanDiscounts(list);
    if (!r.ok) return t(r.error.en, r.error.es);
    await update({ discounts: r.list });
    setDraft(r.list);
  }
  return (
    <SaveCard title={t("Discount codes", "Códigos de descuento")} hint={t("pick one on any estimate", "elige uno en cualquier presupuesto")} dirty={dirty} save={save} id="discounts">
      <Help>{t("A code takes a percent (%) or a fixed amount ($) off the estimate. CASH3 is the 3% you give for paying in cash or Zelle. Turn a code off to hide it without deleting it.", "Un código descuenta un porcentaje (%) o una cantidad fija ($) del presupuesto. CASH3 es el 3% que das por pagar en efectivo o Zelle. Apaga un código para ocultarlo sin borrarlo.")}</Help>
      {list.length === 0 && <p className="muted" style={{ margin: "0 0 12px" }}>{t("No codes yet.", "Aún no hay códigos.")}</p>}
      <div className="st-rows">
        {list.map((d, i) => (
          <div className="st-row st-disc" key={i}>
            <label className="f st-c-code">{t("Code", "Código")}<input value={d.code} style={{ textTransform: "uppercase" }} onChange={(e) => set(i, { code: e.target.value })} /></label>
            <label className="f st-c-type">{t("Type", "Tipo")}<select value={d.type} onChange={(e) => set(i, { type: e.target.value as Discount["type"] })}><option value="percent">%</option><option value="fixed">$</option></select></label>
            <label className="f st-c-val">{t("Value", "Valor")}<NumInput value={d.value} onChange={(n) => set(i, { value: n })} step="0.5" placeholder="0" /></label>
            <label className="f st-c-l1">{t("Label — English", "Etiqueta — inglés")}<input value={d.label} onChange={(e) => set(i, { label: e.target.value })} /></label>
            <label className="f st-c-l2">{t("Label — Español", "Etiqueta — español")}<input value={d.labelEs} onChange={(e) => set(i, { labelEs: e.target.value })} /></label>
            <div className="st-row-end">
              <label className="st-check"><input type="checkbox" checked={d.active !== false} onChange={(e) => set(i, { active: e.target.checked })} />{t("Active", "Activo")}</label>
              <button className="btn sm danger" type="button" onClick={() => { if (confirm(t(`Delete the code ${d.code || ""}? Estimates that use it will lose that discount.`, `¿Borrar el código ${d.code || ""}? Los presupuestos que lo usan perderán ese descuento.`))) setDraft(list.filter((_, j) => j !== i)); }}>{t("Delete", "Borrar")}</button>
            </div>
          </div>
        ))}
      </div>
      <button className="btn sm" type="button" onClick={() => setDraft([...list, { code: "", type: "percent", value: 0, label: "", labelEs: "", active: true }])}>{t("+ Add code", "+ Agregar código")}</button>
    </SaveCard>
  );
}
