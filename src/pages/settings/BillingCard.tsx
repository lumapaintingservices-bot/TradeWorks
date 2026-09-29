import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { BILLING_API, billingEnabled, billingState, toMs, type BillingStatus } from "../../lib/billing";
import { auth, hasFirebase } from "../../lib/firebase";
import { fmtDate } from "../../lib/format";
import { useT } from "../../i18n";
import { useUi } from "../../store/ui";

const BADGE: Record<BillingStatus, { cls: string; en: string; es: string }> = {
  trial: { cls: "b-blue", en: "Free trial", es: "Prueba gratis" },
  active: { cls: "b-green", en: "Pro · active", es: "Pro · activo" },
  grace: { cls: "b-amber", en: "Payment problem", es: "Problema de pago" },
  expired: { cls: "b-red", en: "Read-only", es: "Solo lectura" },
};

/** POSTs to `${VITE_BILLING_API}/checkout|portal` with the Firebase ID token and returns the Stripe URL. */
async function callBilling(path: "checkout" | "portal", companyId: string): Promise<string> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("no-token");
  const res = await fetch(`${BILLING_API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ companyId }),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error || `HTTP ${res.status}`);
  if (!/^https:\/\//.test(data.url)) throw new Error("bad-url");
  return data.url;
}

/** Settings card (owners only): TradeWorks plan, trial days left, Subscribe / Manage billing. Feature is off unless VITE_BILLING_API is set. */
export default function BillingCard() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const { company } = useAuth();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState<"" | "checkout" | "portal">("");
  const [err, setErr] = useState("");

  const st = billingState(company, Date.now());
  const badge = BADGE[st.status];
  const canPortal = !!company?.stripeCustomerId;
  const renew = toMs(company?.currentPeriodEnd);
  const back = params.get("checkout");

  async function go(path: "checkout" | "portal") {
    if (!company) return;
    setErr(""); setBusy(path);
    try { window.location.assign(await callBilling(path, company.id)); }
    catch (e) {
      const m = e instanceof Error ? e.message : "";
      setErr(/^(no-token|HTTP 401)/.test(m) || /sign in/i.test(m)
        ? t("Please sign out and sign in again, then try once more.", "Sal de tu cuenta y vuelve a entrar; luego intenta otra vez.")
        : /Only the owner/i.test(m)
          ? t("Only the owner of the company can manage billing.", "Solo el dueño de la empresa puede manejar la facturación.")
          : t("We could not open the payment page. Please try again in a minute.", "No pudimos abrir la página de pago. Intenta otra vez en un minuto."));
      setBusy("");
    }
  }

  const head = (
    <div className="card-h"><h2>{t("Plan & billing", "Plan y facturación")}</h2><span className="muted" style={{ fontSize: 12.5 }}>TradeWorks</span></div>
  );

  if (!billingEnabled()) {
    return (
      <div className="card" style={{ maxWidth: 640, marginTop: 16 }} id="billing">
        {head}
        <div className="card-b">
          <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 6px" }}>{t("Billing isn't set up yet", "La facturación aún no está configurada")}</p>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {t("Everything works as usual and nothing is charged. When online payments are turned on, you will subscribe here.",
              "Todo funciona como siempre y no se cobra nada. Cuando se activen los pagos en línea, te suscribirás aquí.")}
          </p>
        </div>
      </div>
    );
  }

  const noCloud = !hasFirebase;
  const showSubscribe = st.status === "trial" || st.status === "expired" || (st.status === "grace" && !canPortal);
  return (
    <div className="card" style={{ maxWidth: 640, marginTop: 16 }} id="billing">
      {head}
      <div className="card-b">
        {back === "success" && (
          <div style={{ background: "var(--tile-green)", color: "var(--up-ink)", borderRadius: "var(--r-md)", padding: "10px 12px", fontSize: 13, marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ flex: "1 1 200px" }}>{t("Thank you! Your payment went through. It can take a minute to show here.", "¡Gracias! Tu pago se realizó. Puede tardar un minuto en verse aquí.")}</span>
            <button className="btn sm" onClick={() => window.location.assign("/settings?section=billing")}>{t("Refresh", "Actualizar")}</button>
          </div>
        )}
        {back === "cancel" && (
          <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>{t("No problem, nothing was charged. You can subscribe any time.", "Sin problema, no se cobró nada. Puedes suscribirte cuando quieras.")}</p>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className={"badge " + badge.cls} style={badge.cls === "b-amber" ? { background: "var(--tile-amber)", color: "var(--icon-amber)" } : undefined}><i />{t(badge.en, badge.es)}</span>
          {st.status === "trial" && <b style={{ fontSize: 14 }}>{t(`${st.daysLeft} ${st.daysLeft === 1 ? "day" : "days"} left`, `Quedan ${st.daysLeft} ${st.daysLeft === 1 ? "día" : "días"}`)}</b>}
          {st.status === "grace" && <b style={{ fontSize: 14 }}>{t(`${st.daysLeft} ${st.daysLeft === 1 ? "day" : "days"} to fix it`, `${st.daysLeft} ${st.daysLeft === 1 ? "día" : "días"} para arreglarlo`)}</b>}
          {st.status === "active" && renew != null && <span className="muted" style={{ fontSize: 13 }}>{t("Renews on", "Se renueva el")} {fmtDate(new Date(renew).toISOString().slice(0, 10), lang)}</span>}
        </div>
        {(st.status === "grace" || st.status === "expired") && <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>{t(st.message.en, st.message.es)}</p>}
        {st.status === "trial" && (
          <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
            {t("If you subscribe now you are not charged until the trial ends.", "Si te suscribes ahora, no se cobra hasta que termine la prueba.")}
          </p>
        )}

        {noCloud ? (
          <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>{t("Payments only work with your online account. Sign in with it to subscribe.", "Los pagos solo funcionan con tu cuenta en línea. Entra con ella para suscribirte.")}</p>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {showSubscribe && (
              <button className="btn pri" disabled={!!busy} onClick={() => go("checkout")}>
                {busy === "checkout" ? t("Opening…", "Abriendo…") : t("Subscribe", "Suscribirme")}
              </button>
            )}
            {canPortal && (
              <button className={"btn" + (st.status === "grace" ? " pri" : "")} disabled={!!busy} onClick={() => go("portal")}>
                {busy === "portal" ? t("Opening…", "Abriendo…") : st.status === "grace" ? t("Update payment method", "Actualizar método de pago") : t("Manage billing", "Administrar facturación")}
              </button>
            )}
          </div>
        )}
        {err && <p role="alert" style={{ color: "var(--down-ink)", fontSize: 13, marginTop: 10 }}>{err}</p>}
        <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
          {t("Payments are handled securely by Stripe. TradeWorks never sees your card number. If a subscription ends, your data stays safe and you can still view everything.",
            "Los pagos los maneja Stripe de forma segura. TradeWorks nunca ve el número de tu tarjeta. Si una suscripción termina, tus datos siguen seguros y puedes ver todo.")}
        </p>
      </div>
    </div>
  );
}
