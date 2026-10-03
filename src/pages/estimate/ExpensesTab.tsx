import { useMemo, useState } from "react";
import { useExpenses, useHours, useWorkers } from "../../data/hooks";
import { useT } from "../../i18n";
import { downloadText } from "../../lib/download";
import { expCatLabel, METHOD_ES } from "../../lib/expenses";
import { fmtDate } from "../../lib/format";
import { jobLedger, type LedgerCat } from "../../lib/jobLedger";
import { csvText } from "../../lib/metrics";
import { money, num } from "../../lib/money";
import { safeImgSrc } from "../../lib/safeUrl";
import type { Expense } from "../../lib/types";
import { useUi } from "../../store/ui";
import { ExpenseModal } from "../expenses/ExpenseModal";
import type { TabProps } from "./types";

/** Estimate > Expenses: everything spent on this job in detail — budget vs actual, every receipt, the team's hours, profit so far. */
export default function ExpensesTab({ e, s }: TabProps) {
  const t = useT();
  const es = useUi((u) => u.lang) === "es", L = es ? "es" : "en";
  const { rows: expenses } = useExpenses();
  const { rows: hours } = useHours();
  const { rows: workers } = useWorkers();
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [cat, setCat] = useState("all");
  const led = useMemo(() => jobLedger(e, s, expenses, hours, workers), [e, s, expenses, hours, workers]);
  const name = (id: string) => (id === "team" ? t("Team labor (logged hours)", "Mano de obra del equipo (horas)") : id === "labor" ? t("Subcontractors", "Subcontratistas") : expCatLabel(id, es, s.expCats));
  const used = [...new Set(led.expenses.map((x) => x.category || "other"))];
  const shown = cat === "all" ? led.expenses : led.expenses.filter((x) => (x.category || "other") === cat);
  const tone = led.spent === 0 ? "" : led.margin >= num(s.production.targetMargin) ? "tone-good" : led.margin >= num(s.production.targetMargin) - 15 ? "tone-mid" : "tone-low";
  const max = Math.max(1, ...led.cats.map((c) => Math.max(c.real, c.est || 0)));

  const exportCsv = () => {
    const rows: (string | number)[][] = [[t("Date", "Fecha"), t("Type", "Tipo"), t("Vendor / worker", "Proveedor / trabajador"), t("Category", "Categoría"), t("Paid with", "Pagado con"), t("Note", "Nota"), t("Hours", "Horas"), t("Amount", "Monto")]];
    led.expenses.forEach((x) => rows.push([x.date, t("Expense", "Gasto"), x.vendor || "", name(x.category || "other"), x.method || "", x.note || "", "", num(x.amount)]));
    led.legacy.forEach((x) => rows.push([x.date, t("Receipt (old app)", "Recibo (app anterior)"), x.desc, name("materials"), "", "", "", x.amount]));
    led.team.forEach((r) => rows.push([r.date, t("Team hours", "Horas del equipo"), r.worker, name("team"), "", r.note, r.hours, r.pay]));
    rows.push(["", "", "", "", "", "", t("Total spent", "Total gastado"), led.spent]);
    downloadText(`${e.number || "job"}-expenses.csv`, csvText(rows));
  };

  return (
    <div className="stack">
      <div className="tiles jl-tiles">
        <div className="card tile"><span>{t("Job price", "Precio del trabajo")}</span><b>{money(led.price)}</b></div>
        <div className="card tile"><span>{t("Spent so far", "Gastado hasta ahora")}</span><b>{money(led.spent)}</b></div>
        <div className={"card tile " + tone}><span>{t("Profit so far", "Ganancia hasta ahora")}</span><b>{money(led.profit)}</b></div>
        <div className={"card tile " + tone}><span>{t("Margin", "Margen")}</span><b>{led.price > 0 ? led.margin.toFixed(1) + "%" : "—"}</b></div>
      </div>
      <p className="muted jl-note">{t("Counts only what is recorded: expenses linked to this job and the team's logged hours. Materials you haven't bought yet are not in it.", "Cuenta solo lo registrado: gastos conectados a este trabajo y horas registradas del equipo. Los materiales que aún no compras no están incluidos.")}</p>

      <div className="card"><div className="card-h"><h2>{t("Budget vs actual", "Presupuesto vs real")}</h2></div><div className="card-b">
        <div className="jl-bva">
          <div className="jl-bva-h"><span>{t("What", "Qué")}</span><span>{t("Estimated", "Estimado")}</span><span>{t("Real", "Real")}</span><span>{t("Difference", "Diferencia")}</span></div>
          {led.cats.map((c) => <BvaRow key={c.id} c={c} label={name(c.id)} max={max} />)}
          <div className="jl-bva-r total"><span>{t("Total", "Total")}</span><span>{money(led.budget)}</span><span>{money(led.spent)}</span><Diff est={led.cats.every((c) => c.est !== null || c.real === 0) ? led.budget : null} real={led.spent} /></div>
        </div>
        {led.cats.find((c) => c.id === "team")!.est === null && <p className="muted jl-note">{t("Team labor has no estimate because this job is set to “Just me” (Costs & profit).", "La mano de obra no tiene estimado porque este trabajo está en “Solo yo” (Costos y ganancia).")}</p>}
      </div></div>

      <div className="card"><div className="card-h"><h2>{t("Receipts & expenses", "Recibos y gastos")}</h2>
        <span className="jl-acts"><button type="button" className="btn sm" onClick={exportCsv} disabled={!led.expenses.length && !led.team.length && !led.legacy.length}>{t("Export CSV", "Exportar CSV")}</button>
          <button type="button" className="btn pri sm" onClick={() => setEditing("new")}>+ {t("Add expense", "Agregar gasto")}</button></span></div>
        <div className="card-b">
          {used.length > 1 && <div className="pills jl-pills">
            <button type="button" className={"pill" + (cat === "all" ? " on" : "")} onClick={() => setCat("all")}>{t("All", "Todos")} · {led.expenses.length}</button>
            {used.map((k) => <button key={k} type="button" className={"pill" + (cat === k ? " on" : "")} onClick={() => setCat(k)}>{name(k)} · {led.expenses.filter((x) => (x.category || "other") === k).length}</button>)}
          </div>}
          {shown.length === 0 && led.legacy.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("No expenses on this job yet. Add receipts here (materials, subcontractors, tools, fuel…) and they count in the profit.", "Aún no hay gastos en este trabajo. Agrega recibos aquí (materiales, subcontratistas, herramientas, gasolina…) y se cuentan en la ganancia.")}</p>}
          {(shown.length > 0 || (cat === "all" && led.legacy.length > 0)) && <div className="jl-list">
            {shown.map((x) => {
              const img = safeImgSrc(x.receiptUrl);
              return (
                <button type="button" key={x.id} className="jl-row" onClick={() => setEditing(x)}>
                  <span className={"jl-thumb" + (img ? "" : " none")}>{img ? <img src={img} alt="" loading="lazy" /> : "🧾"}</span>
                  <span className="jl-main"><b>{x.vendor || name(x.category || "other")}</b>
                    <small>{fmtDate(x.date, L)} · {name(x.category || "other")}{x.method ? " · " + (es ? METHOD_ES[x.method] || x.method : x.method) : ""}</small>
                    {x.note && <small className="jl-n">{x.note}</small>}</span>
                  <span className="jl-amt">{money(num(x.amount))}</span>
                </button>
              );
            })}
            {cat === "all" && led.legacy.map((x) => (
              <div key={x.id} className="jl-row static">
                <span className="jl-thumb none">🧾</span>
                <span className="jl-main"><b>{x.desc || t("Receipt", "Recibo")}</b><small>{x.date ? fmtDate(x.date, L) + " · " : ""}{t("Materials (old app)", "Materiales (app anterior)")}</small></span>
                <span className="jl-amt">{money(x.amount)}</span>
              </div>
            ))}
          </div>}
        </div></div>

      <div className="card"><div className="card-h"><h2>{t("Team hours on this job", "Horas del equipo en este trabajo")}</h2>
        <b>{led.teamHours} h{led.plannedHours > 0 ? " / " + led.plannedHours + " h " + t("planned", "planeadas") : ""}</b></div>
        <div className="card-b">
          {led.team.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t("No hours logged on this job yet. Hours from the time clock or Team > Log hours show here with their pay.", "Aún no hay horas en este trabajo. Las horas del reloj o de Equipo > Registrar horas salen aquí con su pago.")}</p>
            : <div className="jl-list">{led.team.map((r) => (
              <div key={r.id} className="jl-row static">
                <span className="jl-main"><b>{r.worker}</b><small>{fmtDate(r.date, L)} · {r.hours} h{r.note ? " · " + r.note : ""}{r.ot > 0 ? " · " + t("incl. overtime", "incl. horas extra") + " " + money(r.ot) : ""}</small></span>
                <span className="jl-amt">{money(r.pay)}</span>
              </div>))}
              <div className="jl-row static total"><span className="jl-main"><b>{t("Total team labor", "Total mano de obra")}</b></span><span className="jl-amt">{money(led.team.reduce((a, r) => a + r.pay, 0))}</span></div>
            </div>}
        </div></div>

      {editing && <ExpenseModal exp={editing === "new" ? null : editing} job={e.id} onClose={() => setEditing(null)} />}
    </div>
  );
}

const Diff = ({ est, real }: { est: number | null; real: number }) => {
  if (est === null || est === 0) return <span className="muted">—</span>;
  const d = real - est;
  return <span className={d > 0 ? "jl-over" : "jl-under"}>{d > 0 ? "+" : d < 0 ? "−" : ""}{money(Math.abs(d))}</span>;
};
function BvaRow({ c, label, max }: { c: LedgerCat; label: string; max: number }) {
  return (
    <div className="jl-bva-r">
      <span className="jl-lbl">{label}
        <i className="jl-bar"><i className="est" style={{ width: `${((c.est || 0) / max) * 100}%` }} /><i className={"real" + (c.est !== null && c.real > c.est ? " over" : "")} style={{ width: `${(c.real / max) * 100}%` }} /></i></span>
      <span>{c.est === null ? "—" : money(c.est)}</span><span>{money(c.real)}</span><Diff est={c.est} real={c.real} />
    </div>
  );
}
