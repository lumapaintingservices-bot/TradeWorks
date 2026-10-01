import { useState } from "react";
import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { jobTypesOf, typePreset, uid } from "../../lib/estimate";
import { DEFAULT_MEASURES, measureIds } from "../../lib/measures";
import { SERVICES } from "../../lib/services.data";
import { defaultSettings } from "../../lib/settings";
import { firstBadNumber, linesOf, moveItem, rateOverrides, textOf } from "../../lib/settingsForm";
import { catalogOf, cleanCatalog, isPaintingTrade, jobTypePreset } from "../../lib/trades";
import type { CatalogItem, JobType, Settings } from "../../lib/types";
import { Combobox } from "../../ui/Combobox";
import { Icon } from "../../ui/Icon";
import { NumInput } from "../../ui/NumInput";
import { Grid, Help, Num, Pills, SaveCard, Sub, Txt, useDraft } from "./parts";
import { ask } from "../../ui/confirm";

type Texts = { services: string; servicesEs: string; spec: string; specEs: string; days: number; scopeEn: string; scopeEs: string; termsEn: string; termsEs: string };
type All = Record<string, Texts>;
type Cab = Pick<Settings["pricing"], "doorRate" | "drawerRate" | "frameMode" | "frameRate" | "boxMode" | "boxRate">;
/** Measurements of every job type + the service prices they use + the cabinet prices. */
type Meas = { measures: Record<string, string[]>; catalog: CatalogItem[]; cab: Cab };
const OTHERS = ["interior", "exterior", "other"] as const;
const BUILTIN = new Set(SERVICES.map((s) => s.id));

function pick(s: Settings): All {
  const one = (type: JobType): Texts => {
    const p = typePreset(s, type);
    return type === "cabinets"
      ? { services: s.services || "", servicesEs: s.servicesEs || "", spec: p.spec || "", specEs: p.specEs || "", days: p.days, scopeEn: p.scopeEn, scopeEs: p.scopeEs, termsEn: p.termsEn, termsEs: p.termsEs }
      : { services: p.services || "", servicesEs: p.servicesEs || "", spec: p.spec || "", specEs: p.specEs || "", days: p.days, scopeEn: p.scopeEn || "", scopeEs: p.scopeEs || "", termsEn: p.termsEn || "", termsEs: p.termsEs || "" };
  };
  return Object.fromEntries(jobTypesOf(s.trade).map((j) => [j.id, one(j.id)]));
}
const pickMeas = (s: Settings): Meas => {
  const p = s.pricing;
  return {
    measures: Object.fromEntries(jobTypesOf(s.trade).map((j) => [j.id, measureIds(s, j.id)])),
    catalog: catalogOf(s),
    cab: { doorRate: p.doorRate, drawerRate: p.drawerRate, frameMode: p.frameMode, frameRate: p.frameRate, boxMode: p.boxMode, boxRate: p.boxRate },
  };
};

/** What each NEW estimate of a job type starts with: measurements and their prices, services line, spec, days, scope and terms. */
export default function JobTypesCard() {
  const t = useT();
  const { settings, update } = useSettings();
  const { draft, setDraft, dirty: textsDirty } = useDraft<All>(pick(settings));
  const { draft: m, setDraft: setM, dirty: measDirty } = useDraft<Meas>(pickMeas(settings));
  const painting = isPaintingTrade(settings.trade);
  const types = jobTypesOf(settings.trade);
  const [picked, setType] = useState<JobType>(types[0].id);
  const type = draft[picked] ? picked : types[0].id;
  const d = draft[type];
  const set = (patch: Partial<Texts>) => setDraft({ ...draft, [type]: { ...d, ...patch } });

  async function save() {
    if (firstBadNumber(draft) || firstBadNumber(m.catalog.map((c) => c.rate)) || firstBadNumber(m.cab)) return t("Numbers can't be negative.", "Los números no pueden ser negativos.");
    for (const k of Object.keys(draft)) if (draft[k].days < 1) return t("Days on site must be at least 1.", "Los días en sitio deben ser al menos 1.");
    const tidy = (x: Texts): Texts => ({ ...x, days: Math.round(x.days), services: x.services.trim(), servicesEs: x.servicesEs.trim(), spec: x.spec.trim(), specEs: x.specEs.trim() });
    const typePresets = { ...settings.typePresets };
    const asPreset = (x: Texts, prev?: Settings["typePresets"][string]) => ({ ...(prev || {}), days: Math.round(x.days), services: x.services.trim(), servicesEs: x.servicesEs.trim(), spec: x.spec.trim(), specEs: x.specEs.trim(), scopeEn: x.scopeEn, scopeEs: x.scopeEs, termsEn: x.termsEn, termsEs: x.termsEs });
    let patch: Partial<Settings> = {};
    if (textsDirty) {
      if (!painting) { // a trade's job types: every one is a preset saved under its own id
        for (const j of types) typePresets[j.id] = asPreset(draft[j.id], settings.typePresets[j.id]);
        patch = { typePresets };
      } else {
        const c = draft.cabinets;
        for (const k of OTHERS) typePresets[k] = asPreset(draft[k], settings.typePresets[k]);
        patch = {
          processDays: Math.round(c.days), services: c.services.trim(), servicesEs: c.servicesEs.trim(),
          pricing: { ...settings.pricing, spec: c.spec.trim(), specEs: c.specEs.trim() },
          scope: { en: linesOf(c.scopeEn), es: linesOf(c.scopeEs) }, terms: { en: linesOf(c.termsEn), es: linesOf(c.termsEs) },
          typePresets,
        };
      }
    }
    let clean = m.catalog;
    if (measDirty) {
      clean = cleanCatalog(m.catalog);
      const ids = new Set(clean.map((c) => c.id));
      patch.measures = Object.fromEntries(Object.entries(m.measures).map(([k, v]) => [k, v.filter((id) => ids.has(id))]));
      patch.catalog = clean;
      // painting: keep the per-service overrides in step (see CatalogCard)
      if (painting) patch.serviceRates = rateOverrides(SERVICES, Object.fromEntries(clean.filter((c) => BUILTIN.has(c.id)).map((c) => [c.id, c.rate])));
      if (painting) patch.pricing = { ...(patch.pricing || settings.pricing), ...m.cab };
    }
    await update(patch);
    // show the saved (tidied) values so the card is not left "unsaved"
    if (textsDirty) {
      if (!painting) setDraft(Object.fromEntries(types.map((j) => [j.id, tidy(draft[j.id])])));
      else { const c = draft.cabinets; setDraft({ cabinets: { ...tidy(c), scopeEn: textOf(linesOf(c.scopeEn)), scopeEs: textOf(linesOf(c.scopeEs)), termsEn: textOf(linesOf(c.termsEn)), termsEs: textOf(linesOf(c.termsEs)) }, interior: tidy(draft.interior), exterior: tidy(draft.exterior), other: tidy(draft.other) }); }
    }
    if (measDirty) setM({ ...m, catalog: clean, measures: patch.measures || m.measures });
  }
  const restore = async () => {
    if (!await ask(t("Put back the original texts and measurements for this job type?", "¿Regresar los textos y medidas originales de este tipo de trabajo?"))) return;
    setM({ ...m, measures: { ...m.measures, [type]: DEFAULT_MEASURES[type] || [] } });
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
  const jobName = (() => { const j = types.find((x) => x.id === type); return j ? t(j.en, j.es) : type; })();

  return (
    <SaveCard title={t("Job types", "Tipos de trabajo")} hint={t("what each new estimate starts with", "con qué empieza cada presupuesto nuevo")} dirty={textsDirty || measDirty} save={save} id="jobtypes"
      extraFoot={<button className="btn" type="button" onClick={restore}>{t("Restore the originals", "Restaurar los originales")}</button>}>
      <Help>{t("Pick a job type. Choose what you measure on it and your prices, then the texts. Every new estimate of that type starts with them; you can still edit each estimate.", "Elige un tipo de trabajo. Escoge qué mides en él y tus precios, y luego los textos. Cada presupuesto nuevo de ese tipo empieza con ellos; aun así puedes editar cada presupuesto.")}</Help>
      <Pills<JobType> value={type} options={types.map((j) => [j.id, t(j.en, j.es)] as [JobType, string])} onChange={(v) => setType(v)} />
      <div style={{ height: 14 }} />
      {painting && type === "cabinets" && <CabinetPrices cab={m.cab} onChange={(cab) => setM({ ...m, cab })} />}
      <MeasuresEditor jobName={jobName} ids={m.measures[type] || []} catalog={m.catalog}
        onChange={(ids, catalog) => setM({ ...m, measures: { ...m.measures, [type]: ids }, catalog: catalog || m.catalog })} />

      <Sub>{t("Texts on the document", "Textos del documento")}</Sub>
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

/** Door / drawer prices and how frames and boxes are charged (cabinet estimates). */
function CabinetPrices({ cab, onChange }: { cab: Cab; onChange(c: Cab): void }) {
  const t = useT();
  const modeOpts = (none: string): [Cab["frameMode"], string][] => [["included", t("Included in the door price", "Incluido en el precio de la puerta")], ["separate", t("Charged separately", "Cobrado aparte")], ["none", none]];
  const setC = (p: Partial<Cab>) => onChange({ ...cab, ...p });
  return <>
    <Sub>{t("Cabinet prices", "Precios de gabinetes")}</Sub>
    <Grid>
      <Num label={t("Price per door ($)", "Precio por puerta ($)")} value={cab.doorRate} onChange={(n) => setC({ doorRate: n })} step="1" />
      <Num label={t("Price per drawer front ($)", "Precio por cajón ($)")} value={cab.drawerRate} onChange={(n) => setC({ drawerRate: n })} step="1" />
    </Grid>
    <div className="st-two">
      <div>
        <div className="st-lbl">{t("Frames (the cabinet face frame)", "Marcos (el marco del gabinete)")}</div>
        <Pills value={cab.frameMode} options={modeOpts(t("Frames not painted", "Marcos no se pintan"))} onChange={(v) => setC({ frameMode: v })} />
        {cab.frameMode === "separate" && <Num label={t("Price per frame ($)", "Precio por marco ($)")} value={cab.frameRate} onChange={(n) => setC({ frameRate: n })} step="1" style={{ marginTop: 12, maxWidth: 200 }} />}
      </div>
      <div>
        <div className="st-lbl">{t("Boxes (the cabinet body)", "Cajas (el cuerpo del gabinete)")}</div>
        <Pills value={cab.boxMode} options={modeOpts(t("Boxes not painted", "Cajas no se pintan"))} onChange={(v) => setC({ boxMode: v })} />
        {cab.boxMode === "separate" && <Num label={t("Price per box ($)", "Precio por caja ($)")} value={cab.boxRate} onChange={(n) => setC({ boxRate: n })} step="1" style={{ marginTop: 12, maxWidth: 200 }} />}
      </div>
    </div>
    <Help>{t("“Included” means the door price already covers painting it. Choose “Charged separately” to add a line with its own price.", "“Incluido” significa que el precio de la puerta ya cubre pintarlo. Elige “Cobrado aparte” para agregar una línea con su propio precio.")}</Help>
  </>;
}

/**
 * The measurements of one job type: a list of the company's services with their price per unit, reorder / remove,
 * add one from the services, or create a new service right here.
 */
function MeasuresEditor({ jobName, ids, catalog, onChange }: { jobName: string; ids: string[]; catalog: CatalogItem[]; onChange(ids: string[], catalog?: CatalogItem[]): void }) {
  const t = useT();
  const [adding, setAdding] = useState<CatalogItem | null>(null);
  const list = ids.map((id) => catalog.find((c) => c.id === id)).filter((c): c is CatalogItem => !!c);
  const setRate = (id: string, rate: number) => onChange(ids, catalog.map((c) => (c.id === id ? { ...c, rate } : c)));
  const rest = catalog.filter((c) => !ids.includes(c.id) && (c.en || c.es));
  const addNew = () => {
    if (!adding) return;
    const en = adding.en.trim(), es = adding.es.trim();
    if (!en && !es) return;
    const item = { ...adding, en: en || es, es: es || en, unit: adding.unit.trim() || "ea", unitEs: adding.unitEs.trim() || adding.unit.trim() || "c/u" };
    onChange([...ids, item.id], [...catalog, item]);
    setAdding(null);
  };
  return <>
    <Sub>{t(`Measurements on a ${jobName} estimate`, `Medidas en un presupuesto de ${jobName}`)}</Sub>
    <Help>{t("The boxes you fill in on the estimate (sq ft, doors, hours…). The price is your service price: changing it here changes it in Services & prices too.", "Las casillas que llenas en el presupuesto (pie², puertas, horas…). El precio es el de tu servicio: si lo cambias aquí, también cambia en Servicios y precios.")}</Help>
    {list.length === 0 && <p className="muted msx-empty">{t("No measurements yet. Add one below.", "Todavía no hay medidas. Agrega una abajo.")}</p>}
    {list.length > 0 && <div className="msx-list">
      {list.map((c, i) => (
        <div className="msx-row" key={c.id}>
          <div className="msx-name"><b>{t(c.en || c.es, c.es || c.en)}</b><span>{t("per", "por")} {t(c.unit, c.unitEs || c.unit)}</span></div>
          <div className="ig msx-price"><span className="ig-a">$</span>
            <NumInput value={c.rate} step="0.05" aria-label={t(`Price for ${c.en}`, `Precio de ${c.es || c.en}`)} onChange={(n) => setRate(c.id, n)} />
            <span className="ig-a ig-u">/{t(c.unit, c.unitEs || c.unit)}</span></div>
          <div className="msx-act">
            <button type="button" className="btn sm icon-only" disabled={i === 0} aria-label={t("Move up", "Subir")} onClick={() => onChange(moveItem(ids, ids.indexOf(c.id), -1))}>↑</button>
            <button type="button" className="btn sm icon-only" disabled={i === list.length - 1} aria-label={t("Move down", "Bajar")} onClick={() => onChange(moveItem(ids, ids.indexOf(c.id), 1))}>↓</button>
            <button type="button" className="btn sm icon-only danger" aria-label={t(`Remove ${c.en} from this job type`, `Quitar ${c.es || c.en} de este tipo`)} title={t("Remove from this job type", "Quitar de este tipo de trabajo")}
              onClick={() => onChange(ids.filter((x) => x !== c.id))}><Icon name="x" size={15} /></button>
          </div>
        </div>))}
    </div>}
    <div className="msx-add">
      {rest.length > 0 && <div className="msx-pick"><Combobox value="" placeholder={t("+ Add a measurement…", "+ Agregar una medida…")} ariaLabel={t("Add a measurement", "Agregar una medida")}
        options={rest.map((c) => ({ value: c.id, label: t(c.en || c.es, c.es || c.en), sub: `$${c.rate} / ${t(c.unit, c.unitEs || c.unit)}` }))}
        onChange={(id) => id && onChange([...ids, id])} /></div>}
      {!adding && <button type="button" className="btn sm" onClick={() => setAdding({ id: uid("svc"), en: "", es: "", unit: "", unitEs: "", rate: 0 })}><Icon name="plus" size={15} />{t("New service", "Servicio nuevo")}</button>}
    </div>
    {adding && <div className="msx-new">
      <label className="f">{t("Name — English", "Nombre — inglés")}<input autoFocus value={adding.en} placeholder={t("e.g. Garage floor", "ej. Garage floor")} onChange={(e) => setAdding({ ...adding, en: e.target.value })} /></label>
      <label className="f">{t("Name — Español", "Nombre — español")}<input value={adding.es} placeholder={t("e.g. Piso de garaje", "ej. Piso de garaje")} onChange={(e) => setAdding({ ...adding, es: e.target.value })} /></label>
      <label className="f">{t("Unit", "Unidad")}<input value={adding.unit} placeholder="sq ft, ea, hr…" onChange={(e) => setAdding({ ...adding, unit: e.target.value })} /></label>
      <label className="f">{t("Unit — Español", "Unidad — español")}<input value={adding.unitEs} placeholder="pie², c/u, hora…" onChange={(e) => setAdding({ ...adding, unitEs: e.target.value })} /></label>
      <label className="f">{t("Price per unit ($)", "Precio por unidad ($)")}<NumInput value={adding.rate} step="0.05" placeholder="0" onChange={(n) => setAdding({ ...adding, rate: n })} /></label>
      <div className="msx-new-b">
        <button type="button" className="btn sm pri" disabled={!adding.en.trim() && !adding.es.trim()} onClick={addNew}>{t("Add", "Agregar")}</button>
        <button type="button" className="btn sm" onClick={() => setAdding(null)}>{t("Cancel", "Cancelar")}</button>
      </div>
    </div>}
  </>;
}
