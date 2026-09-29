import { useEstimates, useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { SHOWCASE_MAX, type ShowcaseItem } from "../../lib/jobday";
import { moveItem } from "../../lib/settingsForm";
import { Help, SaveCard, useDraft } from "./parts";

/** "Our recent work": the photos every client link shows before signing. Photos are added from the estimate's Photos tab. */
export default function ShowcaseCard() {
  const t = useT();
  const { settings, update } = useSettings();
  const { rows: ests, save: saveEst } = useEstimates();
  const { draft: list, setDraft, dirty } = useDraft<ShowcaseItem[]>((settings.showcase || []).map((x) => ({ id: x.id, url: x.url, caption: x.caption || "" })));
  const set = (i: number, caption: string) => setDraft(list.map((x, j) => (j === i ? { ...x, caption } : x)));

  async function save() {
    const clean = list.map((x) => ({ ...x, caption: x.caption.trim() }));
    await update({ showcase: clean });
    // a photo taken out of the list is no longer "our recent work" on its estimate either
    const gone = new Set((settings.showcase || []).map((x) => x.id).filter((id) => !clean.some((x) => x.id === id)));
    if (gone.size) for (const e of ests) if ((e.photos || []).some((p) => gone.has(p.id) && p.inWork)) await saveEst({ ...e, photos: (e.photos || []).map((p) => (gone.has(p.id) ? { ...p, inWork: false } : p)) });
    setDraft(clean);
  }
  return (
    <SaveCard title={t("Our recent work", "Nuestros trabajos recientes")} hint={t(`shown on every client link · ${list.length}/${SHOWCASE_MAX}`, `se muestra en todos los enlaces · ${list.length}/${SHOWCASE_MAX}`)} dirty={dirty} save={save} id="showcase">
      <Help>{t("Your best jobs, shown to the client right before they sign. To add a photo, open an estimate, go to its Photos tab and tick “Our recent work”. Here you can rename or remove them.", "Tus mejores trabajos, que ve el cliente justo antes de firmar. Para agregar una foto, abre un presupuesto, ve a su pestaña Fotos y marca “Trabajos recientes”. Aquí puedes renombrarlas o quitarlas.")}</Help>
      {list.length === 0 ? <p className="muted" style={{ margin: "0 0 4px" }}>{t("No photos yet.", "Aún no hay fotos.")}</p> : (
        <div className="st-showcase">
          {list.map((x, i) => (
            <div className="st-sc" key={x.id}>
              <img src={x.url} alt={x.caption} loading="lazy" />
              <input value={x.caption} placeholder={t("Caption (optional)", "Texto (opcional)")} onChange={(e) => set(i, e.target.value)} />
              <div className="st-sc-b">
                <button className="btn sm" type="button" disabled={i === 0} aria-label={t("Move earlier", "Mover antes")} onClick={() => setDraft(moveItem(list, i, -1))}>←</button>
                <button className="btn sm" type="button" disabled={i === list.length - 1} aria-label={t("Move later", "Mover después")} onClick={() => setDraft(moveItem(list, i, 1))}>→</button>
                <button className="btn sm danger" type="button" onClick={() => setDraft(list.filter((_, j) => j !== i))}>{t("Remove", "Quitar")}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SaveCard>
  );
}
