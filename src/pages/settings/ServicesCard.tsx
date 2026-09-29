import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { serviceRate } from "../../lib/estimate";
import { money } from "../../lib/money";
import { firstBadNumber, rateOverrides } from "../../lib/settingsForm";
import { SERVICES } from "../../lib/services.data";
import { NumInput } from "../../ui/NumInput";
import { Help, SaveCard, useDraft } from "./parts";

/** Your price for each service offered as an "Other work" line (interior, exterior, repairs). */
export default function ServicesCard() {
  const t = useT();
  const { settings, update } = useSettings();
  const source = Object.fromEntries(SERVICES.map((sv) => [sv.id, serviceRate(settings, sv)])) as Record<string, number>;
  const { draft: rates, setDraft, dirty } = useDraft<Record<string, number>>(source);

  async function save() {
    if (firstBadNumber(rates)) return t("Rates can't be negative.", "Los precios no pueden ser negativos.");
    const serviceRates = rateOverrides(SERVICES, rates);
    await update({ serviceRates });
    setDraft(Object.fromEntries(SERVICES.map((sv) => [sv.id, serviceRates[sv.id] ?? sv.rate])));
  }
  const changed = SERVICES.filter((sv) => Math.round((rates[sv.id] ?? sv.rate) * 10000) !== Math.round(sv.rate * 10000)).length;

  return (
    <SaveCard title={t("Other work — my rates", "Otros trabajos — mis precios")} hint={t("interior, exterior and repairs", "interior, exterior y reparaciones")} dirty={dirty} save={save} id="services"
      extraFoot={changed > 0 ? <button className="btn" type="button" onClick={() => setDraft(Object.fromEntries(SERVICES.map((sv) => [sv.id, sv.rate])))}>{t("Back to the app's starting rates", "Volver a los precios de partida")}</button> : undefined}>
      <Help>{t("When you add one of these lines to an estimate, it starts with the price below. The rates that came with the app are only a starting point — put yours. Lines already on an estimate keep their price.", "Cuando agregas una de estas líneas a un presupuesto, empieza con el precio de abajo. Los precios que trae la app son solo un punto de partida — pon los tuyos. Las líneas que ya están en un presupuesto conservan su precio.")}</Help>
      <div className="st-rows">
        {SERVICES.map((sv) => {
          const v = rates[sv.id] ?? sv.rate, custom = Math.round(v * 10000) !== Math.round(sv.rate * 10000);
          return (
            <div className="st-row st-rate" key={sv.id}>
              <div className="st-rate-n"><b>{t(sv.en, sv.es)}</b>{custom && <span className="muted st-rate-d">{t(`starting rate ${money(sv.rate)}`, `precio de partida ${money(sv.rate)}`)}</span>}</div>
              <div className="st-rate-i"><span className="st-pre">$</span><NumInput value={v} step="0.05" placeholder="0" onChange={(n) => setDraft({ ...rates, [sv.id]: n })} /></div>
              <span className="muted st-rate-u">/ {t(sv.unit, sv.unitEs)}</span>
            </div>
          );
        })}
      </div>
    </SaveCard>
  );
}
