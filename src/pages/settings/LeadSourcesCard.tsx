import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { LEAD_SOURCE_FALLBACK, leadSourceList } from "../../lib/leadSources";
import { cleanSources, moveItem } from "../../lib/settingsForm";
import { Help, SaveCard, useDraft } from "./parts";

/** Where your leads come from. Offered as choices on every estimate, lead and marketing expense. */
export default function LeadSourcesCard() {
  const t = useT();
  const { settings, update } = useSettings();
  const { draft: list, setDraft, dirty } = useDraft<string[]>(leadSourceList(settings));
  const set = (i: number, v: string) => setDraft(list.map((x, j) => (j === i ? v : x)));

  async function save() {
    const clean = cleanSources(list);
    if (clean.length === 0) return t("Keep at least one source.", "Deja al menos una fuente.");
    await update({ leadSources: clean });
    setDraft(clean);
  }
  return (
    <SaveCard title={t("Lead sources", "De dónde vienen tus clientes")} hint={t("choices on estimates, leads and ad costs", "opciones en presupuestos, prospectos y gastos de publicidad")} dirty={dirty} save={save} id="leads"
      extraFoot={<button className="btn" type="button" onClick={() => setDraft([...LEAD_SOURCE_FALLBACK])}>{t("Back to the starting list", "Volver a la lista inicial")}</button>}>
      <Help>{t("These appear as choices when you write “Where the lead came from”, and they group your numbers in the reports. If you rename one, clients already saved keep the old name.", "Salen como opciones en “De dónde vino el cliente” y agrupan tus números en los reportes. Si cambias un nombre, los clientes ya guardados conservan el nombre anterior.")}</Help>
      <div className="st-rows">
        {list.map((src, i) => (
          <div className="st-row st-src" key={i}>
            <input value={src} aria-label={t("Source name", "Nombre de la fuente")} onChange={(e) => set(i, e.target.value)} />
            <button className="btn sm" type="button" disabled={i === 0} aria-label={t("Move up", "Subir")} onClick={() => setDraft(moveItem(list, i, -1))}>↑</button>
            <button className="btn sm" type="button" disabled={i === list.length - 1} aria-label={t("Move down", "Bajar")} onClick={() => setDraft(moveItem(list, i, 1))}>↓</button>
            <button className="btn sm danger" type="button" aria-label={t("Remove", "Quitar")} onClick={() => setDraft(list.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn sm" type="button" onClick={() => setDraft([...list, ""])}>{t("+ Add source", "+ Agregar fuente")}</button>
    </SaveCard>
  );
}
