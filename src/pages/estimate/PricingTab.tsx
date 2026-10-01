import { useT } from "../../i18n";
import { applyTypePreset, defaultPlan, jobTypesOf, uid } from "../../lib/estimate";
import { depositAtSignOf } from "../../lib/deposit";
import { catalogLine, catalogOf, usesCabinetTools } from "../../lib/trades";
import { money, num } from "../../lib/money";
import type { Estimate, Item, JobType, PayStep, Upgrade } from "../../lib/types";
import { NumInput } from "../../ui/NumInput";
import type { TabProps } from "./types";

const MODES = [["included", "Included in door price", "Incluido en el precio de la puerta"], ["separate", "Charged separately", "Cobrado aparte"], ["none", "Not painted", "No se pinta"]] as const;

export default function PricingTab({ e, set, s, lang }: TabProps) {
  const t = useT();
  const es = lang === "es";
  const jobTypes = jobTypesOf(s.trade), painting = usesCabinetTools(s.trade), catalog = catalogOf(s);
  const curType = e.jobType || jobTypes[0]?.id || "cabinets";
  // cabinet controls (doors, drawers, frames, boxes) belong to painting; other trades only see them if an old estimate has cabinet counts
  const showCabBlock = (painting && curType === "cabinets") || num(e.doors) > 0 || num(e.drawers) > 0;
  const setItem = (id: string, p: Partial<Item>) => set({ items: e.items.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const setUp = (id: string, p: Partial<Upgrade>) => set({ upgrades: e.upgrades.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const addSvc = (id: string) => {
    const sv = catalog.find((x) => x.id === id);
    if (!sv) return;
    set({ items: [...e.items, catalogLine(sv, uid("it"))] });
  };
  const plan = e.payPlan || [];
  const planSum = plan.reduce((a, p) => a + num(p.pct), 0);
  const setStep = (i: number, p: Partial<PayStep>) => set({ payPlan: plan.map((x, j) => (j === i ? { ...x, ...p } : x)) });

  return (
    <div className="stack">
      <div className="card"><div className="card-h"><h2>{t("Job type", "Tipo de trabajo")}</h2></div><div className="card-b">
        <div className="pills">{jobTypes.map((j) => (
          <button key={j.id} className={"pill" + (curType === j.id ? " on" : "")} onClick={() => {
            if (j.id === curType) return;
            if (confirm(t("Switch job type? Spec, days, scope and terms will be replaced with this type's standard texts.", "¿Cambiar el tipo? La especificación, días, alcance y términos se reemplazan con los textos estándar de este tipo."))) set(applyTypePreset(e, s, j.id as JobType));
          }}>{es ? j.es : j.en}</button>))}</div>
      </div></div>

      {showCabBlock && (
        <div className="card"><div className="card-h"><h2>{t("Cabinets", "Gabinetes")}</h2></div><div className="card-b">
          <div className="grid4">
            <label className="f">{t("Doors", "Puertas")}<NumInput value={e.doors} onChange={(n) => set({ doors: n })} /></label>
            <label className="f">{t("Price per door", "Precio por puerta")}<NumInput value={e.doorRate} onChange={(n) => set({ doorRate: n })} /></label>
            <label className="f">{t("Drawers", "Cajones")}<NumInput value={e.drawers} onChange={(n) => set({ drawers: n })} /></label>
            <label className="f">{t("Price per drawer", "Precio por cajón")}<NumInput value={e.drawerRate} onChange={(n) => set({ drawerRate: n })} /></label>
          </div>
          {(["frame", "box"] as const).map((k) => {
            const mode = k === "frame" ? e.frameMode : e.boxMode, count = k === "frame" ? e.frames : e.boxes, rate = k === "frame" ? e.frameRate : e.boxRate;
            return (
              <div className="grid4" key={k}>
                <label className="f" style={{ gridColumn: "span 2" }}>{k === "frame" ? t("Frames", "Marcos") : t("Boxes", "Cajas")}
                  <select value={mode} onChange={(ev) => set(k === "frame" ? { frameMode: ev.target.value as Estimate["frameMode"] } : { boxMode: ev.target.value as Estimate["boxMode"] })}>
                    {MODES.map(([v, en, esT]) => <option key={v} value={v}>{es ? esT : en}</option>)}</select></label>
                {mode === "separate" && <>
                  <label className="f">{t("Count", "Cantidad")}<NumInput value={count} onChange={(n) => set(k === "frame" ? { frames: n } : { boxes: n })} /></label>
                  <label className="f">{t("Price each", "Precio c/u")}<NumInput value={rate} onChange={(n) => set(k === "frame" ? { frameRate: n } : { boxRate: n })} /></label></>}
              </div>);
          })}
        </div></div>
      )}

      <div className="card"><div className="card-h"><h2>{t("Project spec", "Especificación")}</h2></div><div className="card-b">
        <div className="grid2">
          <label className="f">English<textarea rows={2} value={e.spec} onChange={(ev) => set({ spec: ev.target.value })} /></label>
          <label className="f">Español<textarea rows={2} value={e.specEs} onChange={(ev) => set({ specEs: ev.target.value })} /></label>
        </div>
      </div></div>

      <div className="card"><div className="card-h"><h2>{painting ? t("Other work", "Otros trabajos") : t("Services", "Servicios")}</h2>
        <select style={{ width: "auto" }} value="" onChange={(ev) => { if (ev.target.value === "_") set({ items: [...e.items, { id: uid("it"), desc: "", descEs: "", qty: 1, unit: "", rate: 0 }] }); else if (ev.target.value) addSvc(ev.target.value); }}>
          <option value="">{t("+ Add line", "+ Agregar línea")}</option><option value="_">{t("Custom line", "Línea personalizada")}</option>
          {catalog.map((sv) => <option key={sv.id} value={sv.id}>{es ? sv.es : sv.en}</option>)}</select></div>
        <div className="card-b">
          {e.items.length === 0 && <p className="muted">{t("No lines yet.", "Aún no hay líneas.")}{!painting && catalog.length === 0 && " " + t("Add your services once in Settings → Services & prices, then pick them here.", "Agrega tus servicios una vez en Ajustes → Servicios y precios, y elígelos aquí.")}</p>}
          {e.items.map((it) => (
            <div className="line" key={it.id}>
              <input placeholder={t("Description", "Descripción")} value={es ? it.descEs || it.desc : it.desc} onChange={(ev) => setItem(it.id, es ? { descEs: ev.target.value } : { desc: ev.target.value })} />
              <NumInput value={it.qty} onChange={(n) => setItem(it.id, { qty: n })} placeholder={t("Qty", "Cant.")} />
              <input value={it.unit} onChange={(ev) => setItem(it.id, { unit: ev.target.value })} placeholder={t("unit", "unidad")} />
              <NumInput value={it.rate} onChange={(n) => setItem(it.id, { rate: n })} placeholder={t("Rate", "Precio")} />
              <b className="amt">{money(num(it.qty) * num(it.rate))}</b>
              <button className="btn sm" title={t("Hide from client", "Ocultar al cliente")} onClick={() => setItem(it.id, { hidden: !it.hidden })} style={{ opacity: it.hidden ? 1 : .5 }}>{it.hidden ? "◌" : "●"}</button>
              <button className="btn sm danger" onClick={() => set({ items: e.items.filter((x) => x.id !== it.id) })}>✕</button>
            </div>))}
        </div>
      </div>

      <div className="card"><div className="card-h"><h2>{t("Upgrades & options", "Mejoras y opciones")}</h2>
        <button className="btn sm" onClick={() => set({ upgrades: [...e.upgrades, { id: uid("up"), desc: "", descEs: "", qty: 1, rate: 0 }] })}>{t("+ Add option", "+ Agregar opción")}</button></div>
        <div className="card-b">
          {e.upgrades.length === 0 && <p className="muted">{t("Optional add-ons the client can pick on their link.", "Extras opcionales que el cliente puede elegir en su enlace.")}</p>}
          {e.upgrades.map((u) => (
            <div className="line" key={u.id}>
              <input placeholder={t("Description", "Descripción")} value={es ? u.descEs || u.desc : u.desc} onChange={(ev) => setUp(u.id, es ? { descEs: ev.target.value } : { desc: ev.target.value })} />
              <NumInput value={u.qty} onChange={(n) => setUp(u.id, { qty: n })} placeholder={t("Qty", "Cant.")} />
              <NumInput value={u.rate} onChange={(n) => setUp(u.id, { rate: n })} placeholder={t("Price", "Precio")} />
              <b className="amt">{money(num(u.qty) * num(u.rate))}</b>
              <label className="chk"><input type="checkbox" checked={!!u.included} onChange={(ev) => setUp(u.id, { included: ev.target.checked })} />{t("Included", "Incluida")}</label>
              <button className="btn sm danger" onClick={() => set({ upgrades: e.upgrades.filter((x) => x.id !== u.id) })}>✕</button>
            </div>))}
        </div>
      </div>

      <div className="card"><div className="card-h"><h2>{t("Discount & tax", "Descuento e impuesto")}</h2></div><div className="card-b">
        <div className="grid4">
          <label className="f">{t("Discount", "Descuento")}<select value={e.discountMode} onChange={(ev) => set({ discountMode: ev.target.value as Estimate["discountMode"] })}>
            <option value="">{t("None", "Ninguno")}</option><option value="code">{t("Code", "Código")}</option><option value="manual">{t("Manual", "Manual")}</option></select></label>
          {e.discountMode === "code" && <label className="f">{t("Code", "Código")}<select value={e.discountCode} onChange={(ev) => set({ discountCode: ev.target.value })}>
            <option value="">—</option>{s.discounts.filter((d) => d.active !== false).map((d) => <option key={d.code} value={d.code}>{d.code} · {d.type === "fixed" ? money(d.value) : d.value + "%"}</option>)}</select></label>}
          {e.discountMode === "manual" && <>
            <label className="f">{t("Type", "Tipo")}<select value={e.manualType} onChange={(ev) => set({ manualType: ev.target.value as "percent" | "fixed" })}><option value="percent">%</option><option value="fixed">$</option></select></label>
            <label className="f">{t("Value", "Valor")}<NumInput value={e.manualValue} onChange={(n) => set({ manualValue: n })} /></label></>}
        </div>
        <div className="grid4">
          <label className="f chk2"><span><input type="checkbox" checked={e.taxEnabled} onChange={(ev) => set({ taxEnabled: ev.target.checked })} /> {t("Charge tax", "Cobrar impuesto")}</span></label>
          {e.taxEnabled && <label className="f">{t("Tax rate %", "Impuesto %")}<NumInput value={e.taxRate} onChange={(n) => set({ taxRate: n })} /></label>}
        </div>
      </div></div>

      <div className="card"><div className="card-h"><h2>{t("Payment", "Pago")}</h2></div><div className="card-b">
        <div className="grid4">
          <label className="f">{t("Deposit %", "Depósito %")}<NumInput value={e.depositPct} onChange={(n) => set({ depositPct: n })} /></label>
          <label className="f chk2"><span><input type="checkbox" checked={e.payPlanOn} onChange={(ev) => set({ payPlanOn: ev.target.checked, payPlan: ev.target.checked && plan.length < 2 ? defaultPlan() : plan })} /> {t("Use payment stages", "Usar etapas de pago")}</span></label>
          <label className="f chk2" title={t("When on, the client is asked to pay the first payment right after signing (same payment page as an invoice).", "Si está activo, al firmar se le pide al cliente el primer pago (la misma página de pago que una factura).")}>
            <span><input type="checkbox" checked={depositAtSignOf(e, s)} onChange={(ev) => set({ depositAtSign: ev.target.checked })} /> {t("Ask for the deposit when the client signs", "Pedir depósito al firmar")}</span>
            <small className="muted">{typeof e.depositAtSign === "boolean" ? t("Set for this estimate", "Elegido para este presupuesto") : t("Company default (Settings)", "Predeterminado de la empresa (Ajustes)")}</small></label>
        </div>
        {e.payPlanOn && <>
          {plan.map((p, i) => (
            <div className="line" key={i} style={{ gridTemplateColumns: "1fr 1fr 90px 40px" }}>
              <input value={p.label} onChange={(ev) => setStep(i, { label: ev.target.value })} /><input value={p.labelEs} onChange={(ev) => setStep(i, { labelEs: ev.target.value })} />
              <NumInput value={p.pct} onChange={(n) => setStep(i, { pct: n })} /><button className="btn sm danger" disabled={plan.length <= 2} onClick={() => set({ payPlan: plan.filter((_, j) => j !== i) })}>✕</button>
            </div>))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button className="btn sm" onClick={() => set({ payPlan: [...plan, { label: "", labelEs: "", pct: 0 }] })}>{t("+ Add stage", "+ Agregar etapa")}</button>
            <span style={{ color: planSum === 100 ? "var(--ok)" : "var(--bad)", fontWeight: 600 }}>{planSum}%{planSum !== 100 ? t(" — must add up to 100%", " — debe sumar 100%") : ""}</span>
          </div>
        </>}
      </div></div>
    </div>
  );
}
