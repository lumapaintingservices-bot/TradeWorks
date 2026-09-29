import { useState } from "react";
import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { goalProgress, type Ctx } from "../../lib/metrics";
import { money, num } from "../../lib/money";
import { Modal } from "../../ui/Modal";
import { NumInput } from "../../ui/NumInput";
import "./dashboard.css";

/** Monthly sales goal bar (prototype goalHTML). `goal` lives in settings.goal.sales; 0 / missing = not set. */
export default function GoalCard({ ctx }: { ctx: Ctx }) {
  const t = useT();
  const { settings, update } = useSettings();
  const g = goalProgress(ctx, ctx.now, settings.goal?.sales || 0);
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(0);
  const open = () => { setVal(g.goal || 15000); setEdit(true); };
  const save = async () => { await update({ goal: { sales: Math.max(0, num(val)) } }); setEdit(false); };
  const name = g.monthName.charAt(0).toUpperCase() + g.monthName.slice(1);

  return (
    <>
      <section className={"db-goal" + (g.goal ? "" : " empty")}>
        {g.goal ? (
          <>
            <div className="db-goal-t">
              <b>{t(`${name} goal`, `Meta de ${g.monthName}`)}</b>
              <span>{money(g.won)} {t("of", "de")} {money(g.goal)} · {Math.round(g.pct)}%</span>
              <span className="muted">{g.daysLeft === 1 ? t("1 day left", "1 día restante") : t(`${g.daysLeft} days left`, `${g.daysLeft} días restantes`)}</span>
              <button className="btn sm" onClick={open}>{t("Edit", "Editar")}</button>
            </div>
            <div className="db-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.pct)}>
              <i style={{ width: g.pct + "%", background: g.hit ? "var(--ok)" : "var(--acc)" }} />
            </div>
          </>
        ) : (
          <div className="db-goal-t">
            <b>{t("Set a monthly sales goal", "Ponte una meta de ventas del mes")}</b>
            <span className="muted">{t("See your progress here every day.", "Mira tu avance aquí todos los días.")}</span>
            <button className="btn sm pri" onClick={open}>{t("Set goal", "Poner meta")}</button>
          </div>
        )}
      </section>
      {edit && (
        <Modal title={t("Monthly sales goal", "Meta de ventas del mes")} onClose={() => setEdit(false)}>
          <label className="f">{t("Monthly sales goal ($)", "Meta de ventas del mes ($)")}
            <NumInput value={val} onChange={setVal} step="100" />
          </label>
          <p className="muted" style={{ fontSize: 13 }}>{t("Counts the jobs you sign this month (accepted, deposit paid or paid in full). Leave it empty to turn the goal off.", "Cuenta los trabajos que firmes este mes (aceptados, con depósito o pagados). Déjala vacía para quitar la meta.")}</p>
          <div className="db-goal-f">
            <button className="btn pri" onClick={save}>{t("Save goal", "Guardar meta")}</button>
            <button className="btn" onClick={() => setEdit(false)}>{t("Cancel", "Cancelar")}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
