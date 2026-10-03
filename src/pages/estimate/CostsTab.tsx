import { useState } from "react";
import { useJobExpenseRows, useJobSpend } from "../../data/jobExpenses";
import { useT } from "../../i18n";
import { calcMaterials, jobEconomics } from "../../lib/estimate";
import { expCatLabel, legacyJobExpenses } from "../../lib/expenses";
import { fmtDate } from "../../lib/format";
import { money, num } from "../../lib/money";
import { usesCabinetTools } from "../../lib/trades";
import type { Estimate, Expense } from "../../lib/types";
import { ExpenseModal } from "../expenses/ExpenseModal";
import { useUi } from "../../store/ui";
import { NumInput } from "../../ui/NumInput";
import type { TabProps } from "./types";

export default function CostsTab({ e, set, s, lang }: TabProps) {
  const t = useT();
  const spent = useJobSpend(e.id, e);
  const x = jobEconomics(e, s, spent);
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const m = calcMaterials(e, s);
  const solo = x.mode === "solo";
  // "Cost only what the job uses" on: show the gallons used and what to buy
  const gal = (used: number, buy: number) => (s.materials.chargeUsed ? t(`${used} gal used (buy ${buy})`, `${used} gal usados (comprar ${buy})`) : `${buy} gal`);
  const painting = usesCabinetTools(s.trade);
  const good = solo ? x.perHour >= x.targetHourly : x.margin >= x.target;
  const mid = solo ? x.perHour >= x.targetHourly * 0.75 : x.margin >= x.target - 15;
  const col = good ? "var(--ok)" : mid ? "var(--warn)" : "var(--bad)";
  const Row = ({ a, b, dim, color }: { a: string; b: string; dim?: boolean; color?: string }) => <div className={"totline" + (dim ? " dim" : "")}><span>{a}</span><b style={color ? { color, fontWeight: 700 } : undefined}>{b}</b></div>;
  return (
    <div className="stack">
      <div className="card"><div className="card-h"><h2>{t("Real profit", "Ganancia real")}</h2><span style={{ color: col, fontWeight: 700 }}>{x.margin.toFixed(1)}%</span></div><div className="card-b">
        <Row a={t("Price (after discount)", "Precio (con descuento)")} b={money(x.t.afterDisc)} />
        {x.co > 0 && <Row a={t("Signed change orders", "Cambios firmados")} b={money(x.co)} />}
        <Row a={x.matReal ? t("Materials (real)", "Materiales (real)") : t("Materials (estimated)", "Materiales (estimado)")} b={"− " + money(x.mat)} />
        {x.mode === "crew" && <Row a={t("Team labor", "Mano de obra del equipo")} b={"− " + money(x.labor)} />}
        {x.sub > 0 && <Row a={t("Subcontractors (expenses)", "Subcontratistas (gastos)")} b={"− " + money(x.sub)} />}
        {x.other > 0 && <Row a={t("Other job expenses", "Otros gastos del trabajo")} b={"− " + money(x.other)} />}
        <Row a={t("What you keep", "Lo que te queda")} b={money(x.profit)} />
        {solo
          ? <Row a={t("You earn per hour", "Ganas por hora")} b={x.h.total > 0 ? money(x.perHour) : "—"} color={col} />
          : <Row a={t("Real margin", "Margen real")} b={x.margin.toFixed(1) + "%"} color={col} />}
        {x.suggested > 0 && <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>{x.mode === "solo" ? t(`To earn ${money(x.targetHourly)}/hour, charge about ${money(x.suggested)}.`, `Para ganar ${money(x.targetHourly)}/hora, cobra alrededor de ${money(x.suggested)}.`) : t(`For a ${x.target}% margin, charge about ${money(x.suggested)}.`, `Para un margen de ${x.target}%, cobra alrededor de ${money(x.suggested)}.`)}</p>}
      </div></div>

      <JobExpensesCard e={e} s={s} total={spent.total} onOpen={setEditing} />
      {editing && <ExpenseModal exp={editing === "new" ? null : editing} job={e.id} onClose={() => setEditing(null)} />}

      <div className="card"><div className="card-h"><h2>{t("Production hours", "Horas de producción")}</h2><b>{x.h.total} h · ~{x.days.toFixed(1)} {t("days", "días")}</b></div><div className="card-b">
        {x.h.rows.length === 0 && <p className="muted">{painting ? t("Add doors, drawers or lines to see hours.", "Agrega puertas, cajones o líneas para ver las horas.") : t("Add service lines (with hours set in Settings → Services & prices) or type extra hours to see your hours.", "Agrega líneas de servicio (con horas en Ajustes → Servicios y precios) o escribe horas extra para ver tus horas.")}</p>}
        {x.h.rows.map((r, i) => <Row key={i} dim a={`${r.label} · ${Math.round(r.qty * 100) / 100} × ${r.per}`} b={`${Math.round(r.h * 100) / 100} h`} />)}
        <div className="grid4" style={{ marginTop: 12 }}>
          <label className="f">{t("Extra hours", "Horas extra")}<NumInput value={e.extraHrs} onChange={(n) => set({ extraHrs: n })} /></label>
          <label className="f">{t("Who does the work", "Quién hace el trabajo")}<select value={x.mode} onChange={(ev) => set({ laborMode: ev.target.value as "solo" | "crew" })}>
            <option value="solo">{t("Just me", "Solo yo")}</option><option value="crew">{t("With workers", "Con trabajadores")}</option></select></label>
        </div>
      </div></div>

      <div className="card"><div className="card-h"><h2>{t("Materials", "Materiales")}</h2><b>{x.matReal ? money(x.mat) : money(m.totalCost)}</b></div><div className="card-b">
        {x.matReal && <div className="cost-cmp">
          <div><span>{t("Estimated", "Estimado")}</span><b>{money(m.totalCost)}</b></div>
          <div><span>{spent.mat > 0 ? t("Real (expenses)", "Real (gastos)") : t("Real (typed)", "Real (escrito)")}</span><b>{money(x.mat)}</b></div>
          <div className={x.mat > m.totalCost ? "over" : "under"}><span>{t("Difference", "Diferencia")}</span><b>{x.mat > m.totalCost ? "+" : "−"}{money(Math.abs(x.mat - m.totalCost))}</b></div>
        </div>}
        <label className="f" style={{ maxWidth: 320 }}>{t("Who buys the materials", "Quién compra los materiales")}<select value={e.matBuyer} onChange={(ev) => set({ matBuyer: ev.target.value as Estimate["matBuyer"] })}>
          <option value="me">{t("Me", "Yo")}</option>{painting && <option value="paint">{t("Client buys the paint", "El cliente compra la pintura")}</option>}<option value="client">{t("Client buys everything", "El cliente compra todo")}</option></select></label>
        {m.sqft > 0 && <Row dim a={t(`Cabinet surface · ${m.sqft} sq ft`, `Superficie de gabinetes · ${m.sqft} pie²`)} b="" />}
        {m.buyPrimer > 0 && <Row a={`${s.materials.primerName} · ${gal(m.primerGal, m.buyPrimer)}`} b={money(m.primerCost)} />}
        {m.buyPaint > 0 && <Row a={`${s.materials.paintName} · ${gal(m.paintGal, m.buyPaint)}`} b={money(m.paintCost)} />}
        {m.buyWall > 0 && <Row a={`${s.materials.wallPaintName} · ${gal(m.wallGal, m.buyWall)}`} b={money(m.wallCost)} />}
        {m.supplyLines.map((l) => <Row key={l.name} dim a={`${l.name} × ${l.units}`} b={money(l.amt)} />)}
        {m.factor !== 1 && m.baseCost > 0 && <Row a={t(`Adjusted to your real jobs (${Math.round(m.factor * 100)}%)`, `Ajustado a tus trabajos reales (${Math.round(m.factor * 100)}%)`)}
          b={(m.totalCost < m.baseCost ? "− " : "+ ") + money(Math.abs(m.baseCost - m.totalCost))} />}
        {spent.mat > 0
          ? <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>{lang === "es" ? `La ganancia usa tus gastos de materiales de este trabajo (${money(spent.mat)}) en lugar del estimado.` : `Profit uses this job's materials expenses (${money(spent.mat)}) instead of the estimate.`}</p>
          : <>
            <label className="f" style={{ maxWidth: 320, marginTop: 14 }}>{t("Real materials cost (after you buy)", "Costo real de materiales (después de comprar)")}
              <NumInput value={e.actualMaterialCost || 0} onChange={(n) => set({ actualMaterialCost: n })} /></label>
            <p className="muted" style={{ fontSize: 12.5 }}>{lang === "es" ? "Cuando pongas el costo real (o agregues gastos de materiales a este trabajo), la ganancia lo usa en lugar del estimado." : "Once you enter the real cost (or add materials expenses to this job), profit uses it instead of the estimate."}</p>
          </>}
      </div></div>
    </div>
  );
}

/** Every expense linked to this job (any category), with "Add expense" that opens the expense window already on this job. */
function JobExpensesCard({ e, s, total, onOpen }: { e: Estimate; s: TabProps["s"]; total: number; onOpen(x: Expense | "new"): void }) {
  const t = useT();
  const es = useUi((u) => u.lang) === "es";
  const rows = useJobExpenseRows(e.id);
  const legacy = legacyJobExpenses(e).filter((x) => num(x.amount) > 0);
  return (
    <div className="card"><div className="card-h"><h2>{t("Expenses for this job", "Gastos de este trabajo")}</h2><b>{money(total)}</b></div><div className="card-b">
      {rows.length === 0 && legacy.length === 0 && <p className="muted" style={{ margin: "0 0 12px" }}>{t("Receipts you add here (materials, subcontractors, tools…) count in the real profit above.", "Los recibos que agregues aquí (materiales, subcontratistas, herramientas…) se cuentan en la ganancia real de arriba.")}</p>}
      {(rows.length > 0 || legacy.length > 0) && <div className="jx-list">
        {rows.map((x) => (
          <button type="button" key={x.id} className="jx-row" onClick={() => onOpen(x)}>
            <span className="jx-l"><b>{x.vendor || expCatLabel(x.category, es, s.expCats)}</b><small>{fmtDate(x.date, es ? "es" : "en")} · {expCatLabel(x.category, es, s.expCats)}{x.receiptUrl ? " · 📎" : ""}</small></span>
            <span className="jx-v">{money(num(x.amount))}</span>
          </button>
        ))}
        {legacy.map((x, i) => (
          <div key={"l" + i} className="jx-row static">
            <span className="jx-l"><b>{x.desc || t("Receipt", "Recibo")}</b><small>{x.date ? fmtDate(x.date, es ? "es" : "en") + " · " : ""}{t("Materials (old app)", "Materiales (app anterior)")}</small></span>
            <span className="jx-v">{money(num(x.amount))}</span>
          </div>
        ))}
      </div>}
      <button type="button" className="btn" onClick={() => onOpen("new")}>+ {t("Add expense", "Agregar gasto")}</button>
    </div></div>
  );
}
