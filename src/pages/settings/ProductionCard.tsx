import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { usesCabinetTools } from "../../lib/trades";
import { blankEstimate, jobHours } from "../../lib/estimate";
import { firstBadNumber } from "../../lib/settingsForm";
import { SERVICES } from "../../lib/services.data";
import type { Settings } from "../../lib/types";
import { NumInput } from "../../ui/NumInput";
import { Grid, Help, Num, Pills, SaveCard, Sub, useDraft } from "./parts";

type Prod = Settings["production"];

/** Who does the work, what they cost and how long each piece takes — drives hours, days and profit on every estimate. */
export default function ProductionCard() {
  const t = useT();
  const { settings, update } = useSettings();
  const { draft: p, setDraft, dirty } = useDraft<Prod>(settings.production);
  const set = (patch: Partial<Prod>) => setDraft({ ...p, ...patch });
  const cab = usesCabinetTools(settings.trade);
  const crew = p.laborMode === "crew", piece = cab && p.payBy === "piece";

  async function save() {
    if (firstBadNumber(p)) return t("Numbers can't be negative. Please check the rates.", "Los números no pueden ser negativos. Revisa las tasas.");
    if (p.hoursPerDay <= 0 || p.hoursPerDay > 24) return t("Hours per day must be between 0 and 24.", "Las horas por día deben estar entre 0 y 24.");
    if (p.targetMargin >= 100) return t("The target margin must be below 100%.", "El margen que quieres debe ser menor de 100%.");
    if (crew && p.crewSize < 1) return t("A crew has at least 1 person.", "Una cuadrilla tiene al menos 1 persona.");
    await update({ production: { ...settings.production, ...p, svcHrs: { ...(settings.production.svcHrs || {}), ...(p.svcHrs || {}) } } });
  }

  // worked example so the numbers mean something: a 20-door / 10-drawer kitchen with these rates
  const ex = { ...blankEstimate(settings, "EX"), doors: 20, drawers: 10 };
  const exH = jobHours(ex, { ...settings, production: p }).total;
  const exDays = Math.round((exH / ((crew ? Math.max(1, p.crewSize) : 1) * Math.max(1, p.hoursPerDay))) * 10) / 10; // same formula as jobEconomics

  return (
    <SaveCard title={t("Production & labor", "Producción y mano de obra")} hint={t("the numbers behind your profit", "los números detrás de tu ganancia")} dirty={dirty} save={save} id="production">
      <Help>{t("The examples are a starting point — put yours. They are used to estimate hours, days on site and your profit on every job. They are never shown to the client.", "Los números de ejemplo son un punto de partida — pon los tuyos. Se usan para calcular horas, días en sitio y tu ganancia en cada trabajo. Nunca se los mostramos al cliente.")}</Help>

      <Sub>{t("Who does the work", "Quién hace el trabajo")}</Sub>
      <Pills value={p.laborMode} options={[["solo", t("Just me", "Solo yo")], ["crew", t("With workers", "Con trabajadores")]]} onChange={(v) => set({ laborMode: v })} />
      <Help>{crew
        ? t("Workers' pay is a cost. The app shows your profit and margin after paying them.", "El pago de los trabajadores es un gasto. La app te muestra la ganancia y el margen después de pagarles.")
        : t("Your own hours are not a cost: everything left after materials is yours. The app shows how much you earn per hour.", "Tus horas no son un gasto: todo lo que queda después de materiales es tuyo. La app te muestra cuánto ganas por hora.")}{" "}
        {t("You can change it on each job.", "Lo puedes cambiar en cada trabajo.")}</Help>

      {crew ? <>
        <Sub>{t("How you pay them", "Cómo les pagas")}</Sub>
        {cab
          ? <Pills value={p.payBy} options={[["hour", t("By the hour", "Por hora")], ["piece", t("By the piece", "Por pieza")]]} onChange={(v) => set({ payBy: v })} />
          : <Help>{t("Workers are paid by the hour.", "A los trabajadores se les paga por hora.")}</Help>}
        <div style={{ height: 12 }} />
        <Grid>
          <Num label={piece ? t("Per hour, for work not paid by the piece ($)", "Por hora, para lo que no es por pieza ($)") : t("Pay per hour ($)", "Pago por hora ($)")} value={p.laborRate} onChange={(n) => set({ laborRate: n })} step="1" />
          {piece && cab && <>
            <Num label={t("Per door ($)", "Por puerta ($)")} value={p.doorPay} onChange={(n) => set({ doorPay: n })} step="1" />
            <Num label={t("Per drawer front ($)", "Por cajón ($)")} value={p.drawerPay} onChange={(n) => set({ drawerPay: n })} step="1" />
            <Num label={t("Per frame, if charged apart ($)", "Por marco, si se cobra aparte ($)")} value={p.framePay} onChange={(n) => set({ framePay: n })} step="1" />
            <Num label={t("Per box, if charged apart ($)", "Por caja, si se cobra aparte ($)")} value={p.boxPay} onChange={(n) => set({ boxPay: n })} step="1" />
          </>}
          <Num label={t("People on a crew", "Personas por cuadrilla")} value={p.crewSize} onChange={(n) => set({ crewSize: n })} step="1" />
          <Num label={t("Target margin (%)", "Margen que quieres (%)")} value={p.targetMargin} onChange={(n) => set({ targetMargin: n })} step="1" help={t("Profit you want out of each sale", "Ganancia que quieres de cada venta")} />
          <Num label={t("Hours per day", "Horas por día")} value={p.hoursPerDay} onChange={(n) => set({ hoursPerDay: n })} step="0.5" />
        </Grid>
      </> : (
        <Grid>
          <Num label={t("What you want to earn per hour ($)", "Lo que quieres ganar por hora ($)")} value={p.targetHourly} onChange={(n) => set({ targetHourly: n })} step="1" />
          <Num label={t("Hours you work per day", "Horas que trabajas por día")} value={p.hoursPerDay} onChange={(n) => set({ hoursPerDay: n })} step="0.5" />
        </Grid>
      )}

      {cab && <>
      <Sub>{t("How long each piece takes", "Cuánto tarda cada pieza")}</Sub>
      <Grid>
        <Num label={t("Hours per cabinet door", "Horas por puerta")} value={p.doorHrs} onChange={(n) => set({ doorHrs: n })} step="0.05" />
        <Num label={t("Hours per drawer front", "Horas por cajón")} value={p.drawerHrs} onChange={(n) => set({ drawerHrs: n })} step="0.05" />
        <Num label={t("Hours per frame", "Horas por marco")} value={p.frameHrs} onChange={(n) => set({ frameHrs: n })} step="0.05" />
        <Num label={t("Hours per box", "Horas por caja")} value={p.boxHrs} onChange={(n) => set({ boxHrs: n })} step="0.05" />
        <Num label={t("Set-up and cleanup per kitchen (h)", "Preparar y limpiar por cocina (h)")} value={p.setupHrs} onChange={(n) => set({ setupHrs: n })} step="0.5" />
      </Grid>
      <Help>{t("When frames and boxes are inside the door price, put their work inside the hours per door. Hours per frame and per box only count when you charge them apart.", "Cuando los marcos y las cajas van incluidos en el precio por puerta, pon su trabajo dentro de las horas por puerta. Las horas por marco y por caja solo cuentan cuando las cobras aparte.")}</Help>
      <div className="st-example">
        {t(`Example: a kitchen with 20 doors and 10 drawer fronts takes about ${Math.round(exH * 10) / 10} hours, around ${exDays} working days${crew ? " for your crew" : ""}.`, `Ejemplo: una cocina con 20 puertas y 10 cajones tarda unas ${Math.round(exH * 10) / 10} horas, cerca de ${exDays} días de trabajo${crew ? " para tu cuadrilla" : ""}.`)}
      </div>
      </>}

      {cab ? <>
      <Sub>{t("Hours per unit for your other services", "Horas por unidad de tus otros servicios")}</Sub>
      <div className="st-rows">
        {SERVICES.map((sv) => {
          const h = Number(p.svcHrs?.[sv.id]) || 0;
          return (
            <div className="st-row st-svc" key={sv.id}>
              <div className="st-svc-n"><b>{sv.short}</b><span className="muted"> · {t(sv.unit, sv.unitEs)}</span></div>
              <NumInput value={h} step="0.001" placeholder="0" onChange={(n) => set({ svcHrs: { ...(p.svcHrs || {}), [sv.id]: n } })} />
              <span className="muted st-svc-h">{h > 0 ? t(`about ${Math.round((1 / h) * 10) / 10} ${sv.unit} per hour`, `unas ${Math.round((1 / h) * 10) / 10} ${sv.unitEs} por hora`) : "—"}</span>
            </div>
          );
        })}
      </div>
      </> : <Help>{t("Hours per unit for each of your services are set in Services & prices (“Your hours per unit”).", "Las horas por unidad de cada servicio se ponen en Servicios y precios (“Tus horas por unidad”).")}</Help>}
    </SaveCard>
  );
}
