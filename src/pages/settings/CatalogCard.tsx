import { useAuth } from "../../auth/AuthProvider";
import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { uid } from "../../lib/estimate";
import { SERVICES } from "../../lib/services.data";
import { firstBadNumber, moveItem, rateOverrides } from "../../lib/settingsForm";
import { catalogIsPristine, catalogOf, cleanCatalog, mergeStarterItems, normalizeTrade, starterCatalog, TRADE_LIST, tradeById } from "../../lib/trades";
import type { CatalogItem } from "../../lib/types";
import { useUi } from "../../store/ui";
import { NumInput } from "../../ui/NumInput";
import { Help, Pills, SaveCard, useDraft } from "./parts";
import { useState } from "react";
import { ask } from "../../ui/confirm";

const BUILTIN = new Set(SERVICES.map((s) => s.id));

/** The company's trade. Switching changes the templates (job types, scope, terms, request form) — never the company's own services silently. */
export function TradeCard() {
  const t = useT();
  const toast = useUi((s) => s.toast);
  const { company, saveCompany } = useAuth();
  const { settings, update } = useSettings();
  const cur = normalizeTrade(company?.trade);
  const [pick, setPick] = useState<string>(cur);
  const [busy, setBusy] = useState(false);
  if (!company) return null;
  const target = tradeById(pick);
  const pristine = catalogIsPristine(settings.catalog, cur, settings.serviceRates);

  async function change() {
    if (pick === cur) return;
    const msg = pristine
      ? t(`Switch to ${target.en}? Your service list is still the starter list, so it is replaced by the ${target.en.toLowerCase()} starter list. Job types, scope and terms follow the new trade. Estimates you already wrote do not change.`,
        `¿Cambiar a ${target.es}? Tu lista de servicios sigue siendo la inicial, así que se reemplaza por la lista inicial de ${target.es.toLowerCase()}. Los tipos de trabajo, alcance y términos siguen al nuevo oficio. Los presupuestos que ya escribiste no cambian.`)
      : t(`Switch to ${target.en}? Your own services and prices stay exactly as they are (use “Add starter items” to add this trade's list). Job types, scope and terms follow the new trade. Estimates you already wrote do not change.`,
        `¿Cambiar a ${target.es}? Tus servicios y precios propios se quedan como están (usa “Agregar servicios iniciales” para sumar la lista de este oficio). Los tipos de trabajo, alcance y términos siguen al nuevo oficio. Los presupuestos que ya escribiste no cambian.`);
    if (!await ask(msg)) return;
    setBusy(true);
    try {
      await saveCompany({ name: company!.name, trade: target.id });
      if (pristine) await update({ catalog: starterCatalog(target.id, settings.serviceRates) });
      toast(t("Trade changed", "Oficio cambiado"));
    } catch { toast(t("Could not change the trade. Try again.", "No se pudo cambiar el oficio. Inténtalo de nuevo.")); }
    setBusy(false);
  }
  return (
    <section className="card st-card" id="trade">
      <div className="card-h"><h2>{t("Your trade", "Tu oficio")}</h2><span className="muted st-hint-h">{t("templates for job types, texts and the request form", "plantillas de tipos de trabajo, textos y formulario")}</span></div>
      <div className="card-b">
        <Help>{t("Your trade decides which job types, scope and terms new estimates start with, and what your request form asks. “Custom” has no template: you write your own services.", "Tu oficio decide con qué tipos de trabajo, alcance y términos empiezan los presupuestos, y qué pregunta tu formulario. “Personalizado” no tiene plantilla: escribes tus propios servicios.")}</Help>
        <Pills value={pick} options={TRADE_LIST.map((x) => [x.id, t(x.en, x.es)] as [string, string])} onChange={setPick} />
        <p className="muted st-help">{pick === cur ? t("This is your current trade.", "Este es tu oficio actual.") : t(target.hint.en, target.hint.es)}</p>
        <div className="st-foot">
          <button className="btn pri" disabled={busy || pick === cur} onClick={change}>{t(`Switch to ${target.en}`, `Cambiar a ${target.es}`)}</button>
        </div>
      </div>
    </section>
  );
}

/** Services & prices: the company's own priced services (any trade). Picked on the estimate's Pricing tab. */
export default function CatalogCard() {
  const t = useT();
  const toast = useUi((s) => s.toast);
  const { settings, update } = useSettings();
  const trade = tradeById(settings.trade);
  const { draft: list, setDraft, dirty } = useDraft<CatalogItem[]>(catalogOf(settings));
  const set = (i: number, p: Partial<CatalogItem>) => setDraft(list.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const missing = mergeStarterItems(list, trade.id).added;

  async function save() {
    if (firstBadNumber(list.map((c) => [c.rate, c.hrs ?? 0]))) return t("Prices and hours can't be negative.", "Los precios y las horas no pueden ser negativos.");
    const clean = cleanCatalog(list);
    const patch: Parameters<typeof update>[0] = { catalog: clean };
    // painting: keep the old per-service overrides in step so anything reading serviceRates still sees the same prices
    if (trade.id === "painting") patch.serviceRates = rateOverrides(SERVICES, Object.fromEntries(clean.filter((c) => BUILTIN.has(c.id)).map((c) => [c.id, c.rate])));
    await update(patch);
    setDraft(clean);
  }
  const addStarter = () => {
    const r = mergeStarterItems(list, trade.id);
    setDraft(r.catalog);
    toast(r.added ? t(`${r.added} starter items added — press Save to keep them.`, `${r.added} servicios iniciales agregados — pulsa Guardar para conservarlos.`) : t("Nothing new to add.", "No hay nada nuevo que agregar."));
  };

  return (
    <SaveCard title={t("Services & prices", "Servicios y precios")} hint={t("what you pick on an estimate", "lo que eliges en un presupuesto")} dirty={dirty} save={save} id="services"
      extraFoot={trade.id !== "custom" && trade.id !== "painting" ? <button className="btn" type="button" disabled={missing === 0} onClick={addStarter}>{t(`Add ${trade.en.toLowerCase()} starter items`, `Agregar servicios iniciales de ${trade.es.toLowerCase()}`)}{missing ? ` (${missing})` : ""}</button> : undefined}>
      <Help>{t("Your priced services. On an estimate, “+ Add line” lists these with the price and unit below (you can still change any line there). The prices that came with the app are only a starting point — put yours. Lines already on an estimate keep their price. Hours per unit feed “you earn per hour”.", "Tus servicios con precio. En un presupuesto, “+ Agregar línea” muestra estos con el precio y la unidad de abajo (aun así puedes cambiar cualquier línea allí). Los precios que trae la app son solo un punto de partida — pon los tuyos. Las líneas que ya están en un presupuesto conservan su precio. Las horas por unidad alimentan “ganas por hora”.")}</Help>
      {list.length === 0 && <p className="muted" style={{ margin: "0 0 12px" }}>{t("No services yet. Add your first one.", "Aún no hay servicios. Agrega el primero.")}</p>}
      <div className="st-rows">
        {list.map((c, i) => {
          const builtin = BUILTIN.has(c.id);
          return (
            <div className="st-row st-cat" key={c.id}>
              <label className="f st-k-n1">{t("Name — English", "Nombre — inglés")}<input value={c.en} onChange={(e) => set(i, { en: e.target.value })} /></label>
              <label className="f st-k-n2">{t("Name — Español", "Nombre — español")}<input value={c.es} onChange={(e) => set(i, { es: e.target.value })} /></label>
              <label className="f st-k-u1">{t("Unit", "Unidad")}<input value={c.unit} placeholder="hr, ea, sq ft…" onChange={(e) => set(i, { unit: e.target.value })} /></label>
              <label className="f st-k-u2">{t("Unit — Español", "Unidad — español")}<input value={c.unitEs} placeholder="hora, c/u, pie²…" onChange={(e) => set(i, { unitEs: e.target.value })} /></label>
              <label className="f st-k-p">{t("Price ($)", "Precio ($)")}<NumInput value={c.rate} step="0.05" placeholder="0" onChange={(n) => set(i, { rate: n })} /></label>
              {builtin
                ? <div className="f st-k-h"><span className="muted" style={{ fontSize: 12.5 }}>{t("Hours: set in Costs & profit", "Horas: en Costos y ganancia")}</span></div>
                : <label className="f st-k-h">{t("Your hours per unit", "Tus horas por unidad")}<NumInput value={c.hrs ?? 0} step="0.05" placeholder="0" onChange={(n) => set(i, { hrs: n })} /></label>}
              <div className="st-row-end st-k-e">
                <span style={{ display: "flex", gap: 6 }}>
                  <button className="btn sm" type="button" disabled={i === 0} aria-label={t("Move up", "Subir")} onClick={() => setDraft(moveItem(list, i, -1))}>↑</button>
                  <button className="btn sm" type="button" disabled={i === list.length - 1} aria-label={t("Move down", "Bajar")} onClick={() => setDraft(moveItem(list, i, 1))}>↓</button>
                </span>
                <button className="btn sm danger" type="button" onClick={() => setDraft(list.filter((_, j) => j !== i))}>{t("Remove", "Quitar")}</button>
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn sm" type="button" onClick={() => setDraft([...list, { id: uid("svc"), en: "", es: "", unit: "job", unitEs: "trabajo", rate: 0 }])}>{t("+ Add service", "+ Agregar servicio")}</button>
    </SaveCard>
  );
}
