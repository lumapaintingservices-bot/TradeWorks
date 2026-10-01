import { useT } from "../../i18n";
import { useUi } from "../../store/ui";
import { applyTypePreset, jobTypeLabel, jobTypeOf } from "../../lib/estimate";
import type { Settings } from "../../lib/types";
import type { TabProps } from "./types";
import { ask } from "../../ui/confirm";

export default function ScopeTab({ e, set, s, saveStandard }: TabProps & { saveStandard(patch: Partial<Settings>): Promise<void> }) {
  const t = useT();
  const toast = useUi((x) => x.toast);
  const type = jobTypeOf(e);
  const lines = (x: string) => x.split("\n").map((l) => l.trim()).filter(Boolean);

  const makeStandard = async () => {
    const label = jobTypeLabel(type).toLowerCase();
    if (!await ask(t(`Use this estimate's spec, days on site, scope of work and terms as the standard for every new ${label} estimate?`, `¿Usar la especificación, días, alcance y términos de este presupuesto como estándar para cada presupuesto nuevo de ${label}?`))) return;
    if (type === "cabinets") {
      await saveStandard({ processDays: e.days || s.processDays, pricing: { ...s.pricing, spec: e.spec, specEs: e.specEs }, scope: { en: lines(e.scopeEn), es: lines(e.scopeEs) }, terms: { en: lines(e.termsEn), es: lines(e.termsEs) } });
    } else {
      const prev = s.typePresets[type] || {};
      await saveStandard({ typePresets: { ...s.typePresets, [type]: { ...prev, days: e.days || 1, spec: e.spec, specEs: e.specEs, scopeEn: e.scopeEn, scopeEs: e.scopeEs, termsEn: e.termsEn, termsEs: e.termsEs } } });
    }
    toast(t("Saved. New estimates of this type start with these texts.", "Guardado. Los presupuestos nuevos de este tipo empiezan con estos textos."));
  };

  return (
    <div className="stack">
      <div className="card"><div className="card-h"><h2>{t("Scope of work", "Alcance del trabajo")}</h2>
        <span style={{ display: "flex", gap: 8 }}>
          <button className="btn sm" onClick={async () => { if (await ask(t("Reset spec, scope and terms to the standard for this job type?", "¿Restablecer especificación, alcance y términos al estándar de este tipo?"))) set(applyTypePreset(e, s, type)); }}>{t("Reset", "Restablecer")}</button>
          <button className="btn sm" onClick={makeStandard}>{t("Make standard", "Hacer estándar")}</button></span></div>
        <div className="card-b"><p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>{t('One line per bullet. A line like "Day 1 — Prep" or ending in ":" becomes a heading.', 'Una línea por punto. Una línea como "Día 1 — Preparar" o que termine en ":" es un título.')}</p>
          <div className="grid2">
            <label className="f">English<textarea rows={10} value={e.scopeEn} onChange={(ev) => set({ scopeEn: ev.target.value })} /></label>
            <label className="f">Español<textarea rows={10} value={e.scopeEs} onChange={(ev) => set({ scopeEs: ev.target.value })} /></label>
          </div></div></div>
      <div className="card"><div className="card-h"><h2>{t("Terms", "Términos")}</h2></div><div className="card-b">
        <div className="grid2">
          <label className="f">English<textarea rows={7} value={e.termsEn} onChange={(ev) => set({ termsEn: ev.target.value })} /></label>
          <label className="f">Español<textarea rows={7} value={e.termsEs} onChange={(ev) => set({ termsEs: ev.target.value })} /></label>
        </div></div></div>
      <div className="card"><div className="card-h"><h2>{t("Notes", "Notas")}</h2></div><div className="card-b">
        <label className="f">{t("Notes shown on the document", "Notas visibles en el documento")}<textarea rows={3} value={e.notes} onChange={(ev) => set({ notes: ev.target.value })} /></label>
        <label className="f">{t("Private notes for the crew (never shown to the client)", "Notas privadas para el equipo (nunca las ve el cliente)")}<textarea rows={3} value={e.crewNotes} onChange={(ev) => set({ crewNotes: ev.target.value })} /></label>
      </div></div>
    </div>
  );
}
