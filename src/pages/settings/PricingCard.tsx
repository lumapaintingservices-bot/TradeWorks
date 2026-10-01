import { nextEstimateNumber, useEstimates, useInvoices, useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { invNumberText, nextInvNumber, asInv } from "../../lib/invoices";
import { counter, firstBadNumber } from "../../lib/settingsForm";
import { usesCabinetTools } from "../../lib/trades";
import type { Settings } from "../../lib/types";
import { Check, Fold, Grid, Help, Num, SaveCard, Sub, Txt, useDraft } from "./parts";

const pick = (s: Settings) => ({
  pricing: { ...s.pricing }, processDays: s.processDays, services: s.services || "", servicesEs: s.servicesEs || "",
  tax: { ...s.tax }, nextEst: s.numbering?.nextEst || 1001, nextInv: s.numbering?.nextInv || 1001,
});

/** Prices a NEW estimate starts with (existing estimates keep the numbers they were written with). */
export default function PricingCard() {
  const t = useT();
  const { settings, update } = useSettings();
  const { rows: ests } = useEstimates();
  const { rows: invs } = useInvoices();
  const { draft: d, setDraft, dirty } = useDraft(pick(settings));
  const p = d.pricing;
  const painting = usesCabinetTools(settings.trade); // cabinet wording is for painting & cabinets only
  const setP = (patch: Partial<Settings["pricing"]>) => setDraft({ ...d, pricing: { ...p, ...patch } });

  async function save() {
    const bad = firstBadNumber(d);
    if (bad) return t("Numbers can't be negative. Please check the prices.", "Los números no pueden ser negativos. Revisa los precios.");
    if (d.pricing.depositPct > 100) return t("The deposit can't be more than 100%.", "El depósito no puede pasar de 100%.");
    if (d.tax.rate > 100) return t("The tax rate can't be more than 100%.", "El impuesto no puede pasar de 100%.");
    if (d.processDays < 1) return t("Days on site must be at least 1.", "Los días en sitio deben ser al menos 1.");
    const { doorRate: _d, drawerRate: _w, frameMode: _fm, frameRate: _fr, boxMode: _bm, boxRate: _br, ...own } = d.pricing;
    await update({
      pricing: { ...settings.pricing, ...own }, processDays: Math.round(d.processDays),
      services: d.services.trim(), servicesEs: d.servicesEs.trim(),
      tax: { ...settings.tax, ...d.tax, label: d.tax.label.trim(), labelEs: d.tax.labelEs.trim() },
      numbering: { ...settings.numbering, nextEst: counter(d.nextEst), nextInv: counter(d.nextInv) },
    });
    setDraft({ ...d, processDays: Math.round(d.processDays), services: d.services.trim(), servicesEs: d.servicesEs.trim(), tax: { ...d.tax, label: d.tax.label.trim(), labelEs: d.tax.labelEs.trim() }, nextEst: counter(d.nextEst), nextInv: counter(d.nextInv) });
  }
  const nextEst = nextEstimateNumber({ ...settings, numbering: { ...settings.numbering, nextEst: counter(d.nextEst) } }, ests).number;
  const nextInv = invNumberText(nextInvNumber({ numbering: { nextEst: 0, nextInv: counter(d.nextInv) } }, invs.map(asInv)));

  return (
    <SaveCard title={t("Prices & estimate defaults", "Precios y valores de los presupuestos")} hint={t("what every NEW estimate starts with", "con lo que empieza cada presupuesto NUEVO")} dirty={dirty} save={save} id="pricing">
      <Help>{t("These are your starting prices. You can still change them on each estimate; estimates you already wrote keep their own numbers.", "Estos son tus precios de partida. Los puedes cambiar en cada presupuesto; los que ya escribiste conservan sus números.")}</Help>

      <Help>{t("The prices of what you measure (doors, sq ft of walls, hours…) are now in Settings → Job types, for each job type.", "Los precios de lo que mides (puertas, pie² de paredes, horas…) ahora están en Ajustes → Tipos de trabajo, para cada tipo de trabajo.")}</Help>


      <Sub>{t("Deposit, validity and schedule", "Depósito, vigencia y calendario")}</Sub>
      <Grid>
        <Num label={t("Deposit (%)", "Depósito (%)")} value={p.depositPct} onChange={(n) => setP({ depositPct: n })} step="5" help={t("Asked when the client signs", "Se pide cuando el cliente firma")} />
        <Num label={t("Estimate valid for (days)", "Presupuesto válido por (días)")} value={p.validDays} onChange={(n) => setP({ validDays: n })} step="1" />
        {painting && <Num label={t("Days on site (cabinets)", "Días en sitio (gabinetes)")} value={d.processDays} onChange={(n) => setDraft({ ...d, processDays: n })} step="1" help={t("Each other job type has its own in Job types", "Cada otro tipo de trabajo tiene el suyo en Tipos de trabajo")} />}
      </Grid>

      <Sub>{t("What the client reads", "Lo que lee el cliente")}</Sub>
      <Grid wide>
        <Txt label={t("Standard spec — English", "Especificación estándar — inglés")} value={p.spec} onChange={(v) => setP({ spec: v })} placeholder={t("e.g. Sprayed 2-part finish · 2 coats", "ej. Acabado a pistola de 2 partes · 2 manos")} />
        <Txt label={t("Standard spec — Español", "Especificación estándar — español")} value={p.specEs} onChange={(v) => setP({ specEs: v })} />
        <Txt label={t("Services line — English", "Línea de servicios — inglés")} value={d.services} onChange={(v) => setDraft({ ...d, services: v })} help={t("One short line printed under your name", "Una línea corta bajo tu nombre")} />
        <Txt label={t("Services line — Español", "Línea de servicios — español")} value={d.servicesEs} onChange={(v) => setDraft({ ...d, servicesEs: v })} />
      </Grid>

      {painting && <Fold title={t("Wording of the price lines on the document", "Texto de las líneas de precio en el documento")}>
        <Help>{t("What the client sees next to each price. Change only if you want different words.", "Lo que ve el cliente junto a cada precio. Cámbialo solo si quieres otras palabras.")}</Help>
        <Grid wide>
          <Txt label={t("Door line, frame included — English", "Línea de puertas, con marco — inglés")} value={p.doorLabel} onChange={(v) => setP({ doorLabel: v })} />
          <Txt label={t("Door line, frame included — Español", "Línea de puertas, con marco — español")} value={p.doorLabelEs} onChange={(v) => setP({ doorLabelEs: v })} />
          <Txt label={t("Door line, doors only — English", "Línea de puertas, solo puertas — inglés")} value={p.doorLabelNoFrame} onChange={(v) => setP({ doorLabelNoFrame: v })} />
          <Txt label={t("Door line, doors only — Español", "Línea de puertas, solo puertas — español")} value={p.doorLabelNoFrameEs} onChange={(v) => setP({ doorLabelNoFrameEs: v })} />
          <Txt label={t("Drawer line — English", "Línea de cajones — inglés")} value={p.drawerLabel} onChange={(v) => setP({ drawerLabel: v })} />
          <Txt label={t("Drawer line — Español", "Línea de cajones — español")} value={p.drawerLabelEs} onChange={(v) => setP({ drawerLabelEs: v })} />
          <Txt label={t("Frame line — English", "Línea de marcos — inglés")} value={p.frameLabel} onChange={(v) => setP({ frameLabel: v })} />
          <Txt label={t("Frame line — Español", "Línea de marcos — español")} value={p.frameLabelEs} onChange={(v) => setP({ frameLabelEs: v })} />
          <Txt label={t("Box line — English", "Línea de cajas — inglés")} value={p.boxLabel} onChange={(v) => setP({ boxLabel: v })} />
          <Txt label={t("Box line — Español", "Línea de cajas — español")} value={p.boxLabelEs} onChange={(v) => setP({ boxLabelEs: v })} />
        </Grid>
      </Fold>}

      <Fold title={t("Sales tax", "Impuesto sobre ventas")} open={d.tax.enabled}>
        <Check label={t("Charge tax on new estimates by default", "Cobrar impuesto por defecto en presupuestos nuevos")} checked={d.tax.enabled} onChange={(v) => setDraft({ ...d, tax: { ...d.tax, enabled: v } })} />
        <Grid wide>
          <Num label={t("Tax rate (%)", "Impuesto (%)")} value={d.tax.rate} onChange={(n) => setDraft({ ...d, tax: { ...d.tax, rate: n } })} step="0.1" />
          <span />
          <Txt label={t("Name on the document — English", "Nombre en el documento — inglés")} value={d.tax.label} onChange={(v) => setDraft({ ...d, tax: { ...d.tax, label: v } })} />
          <Txt label={t("Name on the document — Español", "Nombre en el documento — español")} value={d.tax.labelEs} onChange={(v) => setDraft({ ...d, tax: { ...d.tax, labelEs: v } })} />
        </Grid>
      </Fold>

      <Fold title={t("Numbering", "Numeración")}>
        <Grid>
          <Num label={t("Next estimate number", "Próximo número de presupuesto")} value={d.nextEst} onChange={(n) => setDraft({ ...d, nextEst: n })} step="1" />
          <Num label={t("Next invoice number", "Próximo número de factura")} value={d.nextInv} onChange={(n) => setDraft({ ...d, nextInv: n })} step="1" />
        </Grid>
        <Help>{t(`The next ones will be ${nextEst} and ${nextInv}. The app never goes lower than the highest number you already used.`, `Los próximos serán ${nextEst} y ${nextInv}. La app nunca baja del número más alto que ya usaste.`)}</Help>
      </Fold>
    </SaveCard>
  );
}
