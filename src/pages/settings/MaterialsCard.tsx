import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { money, num } from "../../lib/money";
import { firstBadNumber, formSupplies } from "../../lib/settingsForm";
import type { Settings, Supply } from "../../lib/types";
import { NumInput } from "../../ui/NumInput";
import { Grid, Help, Num, SaveCard, Sub, Txt, useDraft } from "./parts";

type Mat = Settings["materials"];

/** Paint, primer and supplies: the internal cost of a job. Never printed on client documents. */
export default function MaterialsCard() {
  const t = useT();
  const { settings, update } = useSettings();
  const { draft: m, setDraft, dirty } = useDraft<Mat>({ ...settings.materials, supplies: formSupplies(settings.materials.supplies) });
  const set = (patch: Partial<Mat>) => setDraft({ ...m, ...patch });
  const setSup = (i: number, p: Partial<Supply>) => set({ supplies: m.supplies.map((x, j) => (j === i ? { ...x, ...p } : x)) });

  async function save() {
    if (firstBadNumber(m)) return t("Numbers can't be negative. Please check the costs.", "Los números no pueden ser negativos. Revisa los costos.");
    if (m.coverageSqftPerGal <= 0) return t("Coverage (sq ft per gallon) must be more than 0.", "El rendimiento (pies² por galón) debe ser mayor que 0.");
    if (m.supplies.some((s) => !s.name.trim())) return t("Every supply needs a name.", "Cada suministro necesita un nombre.");
    const clean: Mat = { ...settings.materials, ...m, supplies: m.supplies.map((s) => ({ ...s, name: s.name.trim() })) };
    await update({ materials: clean });
    setDraft({ ...clean, supplies: formSupplies(clean.supplies) });
  }

  return (
    <SaveCard title={t("Materials & costs", "Materiales y costos")} hint={t("internal — never printed", "interno — nunca se imprime")} dirty={dirty} save={save} id="materials">
      <div className="st-warn">{t("These coverage figures are starting estimates, not manufacturer data. Real coverage depends on your gun, your tip and how much you thin. Note what you actually use on a few jobs and adjust.", "Estos rendimientos son estimados de partida, no datos del fabricante. El rendimiento real depende de tu pistola, tu boquilla y cuánto diluyes. Anota lo que realmente usas en algunos trabajos y ajusta.")}</div>

      <Sub>{t("Cabinet surface area", "Superficie de los gabinetes")}</Sub>
      <Grid>
        <Num label={t("Sq ft per door (both faces)", "Pies² por puerta (ambas caras)")} value={m.sqftPerDoor} onChange={(n) => set({ sqftPerDoor: n })} step="0.25" />
        <Num label={t("Frame sq ft per door", "Pies² de marco por puerta")} value={m.frameSqftPerDoor} onChange={(n) => set({ frameSqftPerDoor: n })} step="0.25" />
        <Num label={t("Sq ft per drawer front", "Pies² por cajón")} value={m.sqftPerDrawer} onChange={(n) => set({ sqftPerDrawer: n })} step="0.25" />
        <Num label={t("Sq ft per cabinet box", "Pies² por caja de gabinete")} value={m.sqftPerBox} onChange={(n) => set({ sqftPerBox: n })} step="0.25" />
      </Grid>

      <Sub>{t("Cabinet paint & primer", "Pintura y primer de gabinetes")}</Sub>
      <Grid>
        <Num label={t("Coverage (sq ft per gallon)", "Rendimiento (pies² por galón)")} value={m.coverageSqftPerGal} onChange={(n) => set({ coverageSqftPerGal: n })} step="5" />
        <Num label={t("Primer coats", "Manos de primer")} value={m.primerCoats} onChange={(n) => set({ primerCoats: n })} step="1" />
        <Num label={t("Paint coats", "Manos de pintura")} value={m.paintCoats} onChange={(n) => set({ paintCoats: n })} step="1" />
        <Num label={t("Waste / overspray (%)", "Desperdicio / rocío (%)")} value={m.wastePct} onChange={(n) => set({ wastePct: n })} step="1" />
      </Grid>
      <Grid wide>
        <Txt label={t("Primer name", "Nombre del primer")} value={m.primerName} onChange={(v) => set({ primerName: v })} />
        <Num label={t("Primer price per gallon ($)", "Primer, precio por galón ($)")} value={m.primerCostPerGal} onChange={(n) => set({ primerCostPerGal: n })} step="1" />
        <Txt label={t("Paint name", "Nombre de la pintura")} value={m.paintName} onChange={(v) => set({ paintName: v })} />
        <Num label={t("Paint price per gallon ($)", "Pintura, precio por galón ($)")} value={m.paintCostPerGal} onChange={(n) => set({ paintCostPerGal: n })} step="1" />
      </Grid>

      <Sub>{t("Wall & ceiling paint (interior / exterior jobs)", "Pintura de paredes y techos (trabajos interiores / exteriores)")}</Sub>
      <Grid wide>
        <Txt label={t("Paint name", "Nombre de la pintura")} value={m.wallPaintName} onChange={(v) => set({ wallPaintName: v })} />
        <Num label={t("Paint price per gallon ($)", "Pintura, precio por galón ($)")} value={m.wallPaintCostPerGal} onChange={(n) => set({ wallPaintCostPerGal: n })} step="1" />
        <Num label={t("Coverage (sq ft per gallon)", "Rendimiento (pies² por galón)")} value={m.wallCoverageSqftPerGal} onChange={(n) => set({ wallCoverageSqftPerGal: n })} step="5" />
        <Num label={t("Coats", "Manos")} value={m.wallCoats} onChange={(n) => set({ wallCoats: n })} step="1" />
        <Txt label={t("Primer name", "Nombre del primer")} value={m.wallPrimerName} onChange={(v) => set({ wallPrimerName: v })} />
        <Num label={t("Primer price per gallon ($)", "Primer, precio por galón ($)")} value={m.wallPrimerCostPerGal} onChange={(n) => set({ wallPrimerCostPerGal: n })} step="1" />
        <Num label={t("Primer coats (0 if you rarely prime)", "Manos de primer (0 si casi no aplicas)")} value={m.wallPrimerCoats} onChange={(n) => set({ wallPrimerCoats: n })} step="1" />
      </Grid>
      <Help>{t("How many square feet each service paints per unit (a linear foot of baseboard counts as 0.6 sq ft, a door as 40) is built into the app.", "Cuántos pies cuadrados pinta cada servicio por unidad (un pie lineal de zócalo cuenta como 0.6 pies², una puerta como 40) ya viene incluido en la app.")}</Help>

      <Sub aside={<button className="btn sm" type="button" onClick={() => set({ supplies: [...m.supplies, { name: "", qty: 1, cost: 0, basis: "item" }] })}>{t("+ Add supply", "+ Agregar suministro")}</button>}>{t("Supplies", "Suministros")}</Sub>
      <Help>{t("Everything that is not paint or primer. Put the quantity you actually buy. “Once per job” lines charge one time; the other two are multiplied by the doors or drawers on the estimate.", "Todo lo que no es pintura ni primer. Pon la cantidad que realmente compras. Las líneas “Una vez por trabajo” se cobran una sola vez; las otras dos se multiplican por las puertas o cajones del presupuesto.")}</Help>
      {m.supplies.length === 0 && <p className="muted" style={{ margin: "0 0 12px" }}>{t("No supplies yet.", "Aún no hay suministros.")}</p>}
      <div className="st-rows">
        {m.supplies.map((sp, i) => (
          <div className="st-row st-sup" key={i}>
            <label className="f st-s-name">{t("Item", "Artículo")}<input value={sp.name} onChange={(e) => setSup(i, { name: e.target.value })} /></label>
            <label className="f">{t("Qty", "Cant.")}<NumInput value={num(sp.qty)} step="0.5" placeholder="0" onChange={(n) => setSup(i, { qty: n })} /></label>
            <label className="f">{t("Unit cost ($)", "Costo c/u ($)")}<NumInput value={sp.cost} step="0.25" placeholder="0" onChange={(n) => setSup(i, { cost: n })} /></label>
            <label className="f">{t("Multiplied by", "Se multiplica por")}
              <select value={sp.basis} onChange={(e) => setSup(i, { basis: e.target.value as Supply["basis"] })}>
                <option value="item">{t("Once per job", "Una vez por trabajo")}</option><option value="door">{t("Doors", "Puertas")}</option><option value="drawer">{t("Drawers", "Cajones")}</option></select></label>
            <div className="st-row-end"><b className="st-line">{money(num(sp.qty) * num(sp.cost))}</b>
              <button className="btn sm danger" type="button" aria-label={t("Remove", "Quitar")} onClick={() => set({ supplies: m.supplies.filter((_, j) => j !== i) })}>✕</button></div>
          </div>
        ))}
      </div>
    </SaveCard>
  );
}
