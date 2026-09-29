import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { billingEnabled, billingState } from "../lib/billing";
import { useT } from "../i18n";
import "./BillingBanner.css";

const key = (companyId: string, status: string) => `tw.billBanner.${companyId}.${status}`;
const seen = (k: string) => { try { return sessionStorage.getItem(k) === "1"; } catch { return false; } };
const remember = (k: string) => { try { sessionStorage.setItem(k, "1"); } catch { /* private mode: dismissal lasts until re-render */ } };

/** App-wide notice when the free trial ends soon, a payment failed (grace) or the account is read-only. Hidden unless billing is configured. */
export default function BillingBanner() {
  const t = useT();
  const { company, role } = useAuth();
  const [, bump] = useState(0);
  if (!company || !billingEnabled()) return null;
  const st = billingState(company, Date.now());
  if (st.level === "none") return null;
  const k = key(company.id, st.status);
  if (seen(k)) return null;
  const owner = role === "owner";
  const cta = st.status === "grace" ? t("Fix payment", "Arreglar pago") : t("Subscribe", "Suscribirme");

  return (
    <div className={"bill-banner " + st.level} role="status">
      <i />
      <span>
        {t(st.message.en, st.message.es)}
        {!owner && " " + t("Ask the owner of the company to fix it.", "Pídele al dueño de la empresa que lo resuelva.")}
      </span>
      {owner && <Link className="btn sm pri" to="/settings?section=billing">{cta}</Link>}
      <button className="bill-x" aria-label={t("Dismiss", "Cerrar")} onClick={() => { remember(k); bump((n) => n + 1); }}>×</button>
    </div>
  );
}
