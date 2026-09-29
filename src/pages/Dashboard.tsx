import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useT } from "../i18n";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";

/** Phase 1: empty-state dashboard. KPIs, charts and tabs arrive in phase 6. */
export default function Dashboard() {
  const t = useT();
  const nav = useNavigate();
  const { company } = useAuth();
  return (
    <div className="page">
      <div className="page-h">
        <div><h1>{t("Overview", "Resumen")}</h1><p>{company?.area}</p></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => nav("/pipeline")}>{t("Pipeline", "Embudo")}</button>
          <button className="btn pri" onClick={() => nav("/estimates?new=1")}><Icon name="plus" />{t("New estimate", "Nuevo presupuesto")}</button>
        </div>
      </div>
      <div className="card">
        <EmptyState icon="estimates" title={t(`Welcome, ${company?.name}`, `Bienvenido, ${company?.name}`)}
          text={t("Create your first estimate and send your client a link to review and sign.", "Crea tu primer presupuesto y envía a tu cliente un enlace para revisar y firmar.")}>
          <button className="btn pri" onClick={() => nav("/estimates?new=1")}>{t("Create first estimate", "Crear primer presupuesto")}</button>
        </EmptyState>
      </div>
    </div>
  );
}
