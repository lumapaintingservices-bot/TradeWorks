import { useState } from "react";
import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { jobTypesOf, typePreset } from "../../lib/estimate";
import { defaultSettings } from "../../lib/settings";
import { firstBadNumber, linesOf, textOf } from "../../lib/settingsForm";
import { isPaintingTrade, jobTypePreset } from "../../lib/trades";
import type { JobType, Settings } from "../../lib/types";
import { Grid, Help, Num, Pills, SaveCard, Txt, useDraft } from "./parts";

type Texts = { services: string; servicesEs: string; spec: string; specEs: string; days: number; scopeEn: string; scopeEs: string; termsEn: string; termsEs: string };
type All = Record<string, Texts>;
const OTHERS = ["interior", "exterior", "other"] as const;

function pick(s: Settings): All {
  const one = (type: JobType): Texts => {
    const p = typePreset(s, type);
    return type === "cabinets"
      ? { services: s.services || "", servicesEs: s.servicesEs || "", spec: p.spec || "", specEs: p.specEs || "", days: p.days, scopeEn: p.scopeEn, scopeEs: p.scopeEs, termsEn: p.termsEn, termsEs: p.termsEs }
      : { services: p.services || "", servicesEs: p.servicesEs || "", spec: p.spec || "", specEs: p.specEs || "", days: p.days, scopeEn: p.scopeEn || "", scopeEs: p.scopeEs || "", termsEn: p.termsEn || "", termsEs: p.termsEs || "" };
  };
  return Object.fromEntries(jobTypesOf(s.trade).map((j) => [j.id, one(j.id)]));
}

/** What each NEW estimate of a job type starts with: services line, spec, days, scope of work and terms (EN + ES). */
export default function JobTypesCard() {
  const t = useT();
  const { settings, update } = useSettings();
  const { draft, setDraft, dirty } = useDraft<All>(pick(settings));
  const painting = isPaintingTrade(settings.trade);
  const types = jobTypesOf(settings.trade);
  const [picked, setType] = useState<JobType>(types[0].id);
  const type = draft[picked] ? picked : types[0].id;
  const d = draft[type];
  const set = (patch: Partial<Texts>) => setDraft({ ...draft, [type]: { ...d, ...patch } });

  async function save() {
    if (firstBadNumber(draft)) return t("Numbers can't be negative.", "Los números no pueden ser negativos.");
    for (const k of Object.keys(draft)) if (draft[k].days < 1) return t("Days on site must be at least 1.", "Los días en sitio deben ser al menos 1.");
    const tidy = (x: Texts): Texts => ({ ...x, days: Math.round(x.days), services: x.services.trim(), servicesEs: x.servicesEs.trim(), spec: x.spec.trim(), specEs: x.specEs.trim() });
    const typePresets = { ...settings.typePresets };
    const asPreset = (x: Texts, prev?: Settings["typePresets"][string]) => ({ ...(prev || {}), days: Math.round(x.days), services: x.services.trim(), servicesEs: x.servicesEs.trim(), spec: x.spec.trim(), specEs: x.specEs.trim(), scopeEn: x.scopeEn, scopeEs: x.scopeEs, termsEn: x.termsEn, termsEs: x.termsEs });
    if (!painting) { // a trade's job types: every one is a preset saved under its own id
      for (const j of types) typePresets[j.id] = asPreset(draft[j.id], settings.typePresets[j.id]);
      await update({ typePresets });
      setDraft(Object.fromEntries(types.map((j) => [j.id, tidy(draft[j.id])])));
      return;
    }
    const c = draft.cabinets;
    for (const k of OTHERS) typePresets[k] = asPreset(draft[k], settings.typePresets[k]);
    await update({
      processDays: Math.round(c.days), services: c.services.trim(), servicesEs: c.servicesEs.trim(),
      pricing: { ...settings.pricing, spec: c.spec.trim(), specEs: c.specEs.trim() },
      scope: { en: linesOf(c.scopeEn), es: linesOf(c.scopeEs) }, terms: { en: linesOf(c.termsEn), es: linesOf(c.termsEs) },
      typePresets,
    });
    // show the saved (tidied) text so the card is not left "unsaved"
    setDraft({ cabinets: { ...tidy(c), scopeEn: textOf(linesOf(c.scopeEn)), scopeEs: textOf(linesOf(c.scopeEs)), termsEn: textOf(linesOf(c.termsEn)), termsEs: textOf(linesOf(c.termsEs)) }, interior: tidy(draft.interior), exterior: tidy(draft.exterior), other: tidy(draft.other) });
  }
  const restore = () => {
    if (!confirm(t("Put back the original texts for this job type?", "¿Regresar los textos originales de este tipo de trabajo?"))) return;
    if (!painting) {
      const o = jobTypePreset(type);
      if (o) set({ services: o.services || "", servicesEs: o.servicesEs || "", spec: o.spec || "", specEs: o.specEs || "", days: o.days, scopeEn: o.scopeEn || "", scopeEs: o.scopeEs || "", termsEn: o.termsEn || "", termsEs: o.termsEs || "" });
    } else if (type === "cabinets") {
      const o = defaultSettings();
      set({ services: "", servicesEs: "", spec: "", specEs: "", days: o.processDays, scopeEn: textOf(o.scope.en), scopeEs: textOf(o.scope.es), termsEn: textOf(o.terms.en), termsEs: textOf(o.terms.es) });
    } else {
      const o = defaultSettings().typePresets[type]!;
      set({ services: o.services || "", servicesEs: o.servicesEs || "", spec: o.spec || "", specEs: o.specEs || "", days: o.days, scopeEn: o.scopeEn || "", scopeEs: o.scopeEs || "", termsEn: o.termsEn || "", termsEs: o.termsEs || "" });
    }
  };

  return (
    <SaveCard title={t("Job types", "Tipos de trabajo")} hint={t("what each new estimate starts with", "con qué empieza cada presupuesto nuevo")} dirty={dirty} save={save} id="jobtypes"
      extraFoot={<button className="btn" type="button" onClick={restore}>{t("Restore the original texts", "Restaurar los textos originales")}</button>}>
      <Help>{t("Pick a job type and write the texts once. Every new estimate of that type starts with them; you can still edit each estimate. You can also press “Make standard” inside any estimate.", "Elige un tipo de trabajo y escribe los textos una vez. Cada presupuesto nuevo de ese tipo empieza con ellos; aun así puedes editar cada presupuesto. También puedes pulsar “Hacer estándar” dentro de cualquier presupuesto.")}</Help>
      <Pills<JobType> value={type} options={types.map((j) => [j.id, t(j.en, j.es)] as [JobType, string])} onChange={(v) => setType(v)} />
      <div style={{ height: 14 }} />
      <Grid wide>
        <Txt label={t("Services line on the document — English", "Línea de servicios en el documento — inglés")} value={d.services} onChange={(v) => set({ services: v })} />
        <Txt label={t("Services line — Español", "Línea de servicios — español")} value={d.servicesEs} onChange={(v) => set({ servicesEs: v })} />
        <Txt label={t("Spec — English", "Especificación — inglés")} value={d.spec} onChange={(v) => set({ spec: v })} />
        <Txt label={t("Spec — Español", "Especificación — español")} value={d.specEs} onChange={(v) => set({ specEs: v })} />
      </Grid>
      <Grid><Num label={t("Days on site", "Días en sitio")} value={d.days} onChange={(n) => set({ days: n })} step="1" /></Grid>
      <Help>{t("One line per bullet. A line ending in “:” becomes a heading on the document.", "Una línea por punto. Una línea que termina en “:” es un título en el documento.")}</Help>
      <Grid wide>
        <Txt label={t("Scope of work — English", "Alcance del trabajo — inglés")} rows={9} value={d.scopeEn} onChange={(v) => set({ scopeEn: v })} />
        <Txt label={t("Scope of work — Español", "Alcance del trabajo — español")} rows={9} value={d.scopeEs} onChange={(v) => set({ scopeEs: v })} />
        <Txt label={t("Terms & warranty — English", "Términos y garantía — inglés")} rows={7} value={d.termsEn} onChange={(v) => set({ termsEn: v })} />
        <Txt label={t("Terms & warranty — Español", "Términos y garantía — español")} rows={7} value={d.termsEs} onChange={(v) => set({ termsEs: v })} />
      </Grid>
    </SaveCard>
  );
}
