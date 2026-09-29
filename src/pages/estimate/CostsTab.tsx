import { useJobExpenses } from "../../data/jobExpenses";
import { useT } from "../../i18n";
import { calcMaterials, jobEconomics } from "../../lib/estimate";
import { money } from "../../lib/money";
import type { Estimate } from "../../lib/types";
import { NumInput } from "../../ui/NumInput";
import type { TabProps } from "./types";

export default function CostsTab({ e, set, s, lang }: TabProps) {
  const t = useT();
  const listed = useJobExpenses(e.id, e);
  const x = jobEconomics(e, s, listed);
  const m = calcMaterials(e, s);
  const good = x.mode === "solo" ? x.perHour >= x.targetHourly : x.margin >= x.target;
  const col = good ? "var(--ok)" : "var(--warn)";
  const Row = ({ a, b, dim }: { a: string; b: string; dim?: boolean }) => <div className={"totline" + (dim ? " dim" : "")}><span>{a}</span><b>{b}</b></div>;
  return (
    <div className="stack">
      <div className="card"><div className="card-h"><h2>{t("Real profit", "Ganancia real")}</h2><span style={{ color: col, fontWeight: 700 }}>{x.margin.toFixed(1)}%</span></div><div className="card-b">
        <Row a={t("Price (after discount)", "Precio (con descuento)")} b={money(x.t.afterDisc)} />
        {x.co > 0 && <Row a={t("Signed change orders", "Cambios firmados")} b={money(x.co)} />}
        <Row a={x.matReal ? t("Materials (real)", "Materiales (real)") : t("Materials (estimated)", "Materiales (estimado)")} b={"− " + money(x.mat)} />
        {x.mode === "crew" && <Row a={t("Team labor", "Mano de obra del equipo")} b={"− " + money(x.labor)} />}
        <Row a={t("What you keep", "Lo que te queda")} b={money(x.profit)} />
        <Row a={t("Earn per hour", "Ganas por hora")} b={money(x.perHour)} dim />
        {x.suggested > 0 && <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>{x.mode === "solo" ? t(`To earn ${money(x.targetHourly)}/hour, charge about ${money(x.suggested)}.`, `Para ganar ${money(x.targetHourly)}/hora, cobra alrededor de ${money(x.suggested)}.`) : t(`For a ${x.target}% margin, charge about ${money(x.suggested)}.`, `Para un margen de ${x.target}%, cobra alrededor de ${money(x.suggested)}.`)}</p>}
      </div></div>

      <div className="card"><div className="card-h"><h2>{t("Production hours", "Horas de producción")}</h2><b>{x.h.total} h · ~{x.days.toFixed(1)} {t("days", "días")}</b></div><div className="card-b">
        {x.h.rows.length === 0 && <p className="muted">{t("Add doors, drawers or lines to see hours.", "Agrega puertas, cajones o líneas para ver las horas.")}</p>}
        {x.h.rows.map((r, i) => <Row key={i} dim a={`${r.label} · ${Math.round(r.qty * 100) / 100} × ${r.per}`} b={`${Math.round(r.h * 100) / 100} h`} />)}
        <div className="grid4" style={{ marginTop: 12 }}>
          <label className="f">{t("Extra hours", "Horas extra")}<NumInput value={e.extraHrs} onChange={(n) => set({ extraHrs: n })} /></label>
          <label className="f">{t("Who does the work", "Quién hace el trabajo")}<select value={x.mode} onChange={(ev) => set({ laborMode: ev.target.value as "solo" | "crew" })}>
            <option value="solo">{t("Just me", "Solo yo")}</option><option value="crew">{t("With workers", "Con trabajadores")}</option></select></label>
        </div>
      </div></div>

      <div className="card"><div className="card-h"><h2>{t("Materials", "Materiales")}</h2><b>{money(m.totalCost)}</b></div><div className="card-b">
        <label className="f" style={{ maxWidth: 320 }}>{t("Who buys the materials", "Quién compra los materiales")}<select value={e.matBuyer} onChange={(ev) => set({ matBuyer: ev.target.value as Estimate["matBuyer"] })}>
          <option value="me">{t("Me", "Yo")}</option><option value="paint">{t("Client buys the paint", "El cliente compra la pintura")}</option><option value="client">{t("Client buys everything", "El cliente compra todo")}</option></select></label>
        {m.sqft > 0 && <Row dim a={t(`Cabinet surface · ${m.sqft} sq ft`, `Superficie de gabinetes · ${m.sqft} pie²`)} b="" />}
        {m.buyPrimer > 0 && <Row a={`${s.materials.primerName} · ${m.buyPrimer} gal`} b={money(m.primerCost)} />}
        {m.buyPaint > 0 && <Row a={`${s.materials.paintName} · ${m.buyPaint} gal`} b={money(m.paintCost)} />}
        {m.buyWall > 0 && <Row a={`${s.materials.wallPaintName} · ${m.buyWall} gal`} b={money(m.wallCost)} />}
        {m.supplyLines.map((l) => <Row key={l.name} dim a={`${l.name} × ${l.units}`} b={money(l.amt)} />)}
        <label className="f" style={{ maxWidth: 320, marginTop: 14 }}>{t("Real materials cost (after you buy)", "Costo real de materiales (después de comprar)")}
          <NumInput value={e.actualMaterialCost || 0} onChange={(n) => set({ actualMaterialCost: n })} /></label>
        <p className="muted" style={{ fontSize: 12.5 }}>{lang === "es" ? "Cuando pongas el costo real, la ganancia lo usa en lugar del estimado." : "Once you enter the real cost, profit uses it instead of the estimate."}</p>
      </div></div>
    </div>
  );
}
