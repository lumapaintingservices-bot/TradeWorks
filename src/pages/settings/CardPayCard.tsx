import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, useRole } from "../../auth/AuthProvider";
import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { auth, hasFirebase } from "../../lib/firebase";
import { isTrustedRedirect } from "../../lib/safeUrl";
import { useUi } from "../../store/ui";
import { Badge } from "../../ui/Badge";

type Status = { connected: boolean; ready: boolean; details: boolean };

/** POSTs to /api/connect/{start|status} (Pages Functions, same site) with the Firebase ID token. */
async function callConnect<T>(path: "start" | "status", companyId: string): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("no-token");
  const res = await fetch(`/api/connect/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ companyId }),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(res.status === 503 ? "not-setup" : data.error || `HTTP ${res.status}`);
  return data;
}

/**
 * Settings card: connect the company's own Stripe account so clients can pay invoices by card or bank on the payment link.
 * The money goes straight to that Stripe account; TradeWorks only opens the Stripe page and marks the invoice paid.
 */
export default function CardPayCard() {
  const t = useT();
  const toast = useUi((s) => s.toast);
  const role = useRole();
  const { company } = useAuth();
  const { settings, update } = useSettings();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState<"" | "start" | "status">("");
  const [err, setErr] = useState("");
  const [live, setLive] = useState<Status | null>(null);
  const checked = useRef(false);
  const owner = role === "owner";

  const connected = live?.connected ?? !!company?.stripeAccountId;
  const ready = live?.ready ?? !!company?.stripeReady;
  const showOn = settings.cardPay?.on !== false;

  const fail = (e: unknown) => {
    const m = e instanceof Error ? e.message : "";
    setErr(m === "not-setup"
      ? t("Card payments aren't switched on in TradeWorks yet. Try again later.", "Los pagos con tarjeta todavía no están activados en TradeWorks. Intenta más tarde.")
      : /^(no-token|HTTP 401)/.test(m) || /sign in/i.test(m)
        ? t("Please sign out and sign in again, then try once more.", "Sal de tu cuenta y vuelve a entrar; luego intenta otra vez.")
        : t("Stripe didn't answer. Please try again in a minute.", "Stripe no respondió. Intenta otra vez en un minuto."));
  };

  async function check(quiet = false) {
    if (!company) return;
    setBusy("status"); setErr("");
    try {
      const s = await callConnect<Status>("status", company.id);
      setLive(s);
      if (!quiet) toast(s.ready ? t("Stripe is connected.", "Stripe está conectado.") : t("Stripe still needs a few details.", "Stripe todavía necesita algunos datos."));
      // the company in memory was read at sign-in: reload once so the rest of the app sees the change
      if (s.ready !== !!company.stripeReady || s.connected !== !!company.stripeAccountId) window.location.replace("/settings?section=client");
    } catch (e) { fail(e); }
    setBusy("");
  }
  async function start() {
    if (!company) return;
    setBusy("start"); setErr("");
    try {
      const { url } = await callConnect<{ url: string }>("start", company.id);
      if (!isTrustedRedirect(url, window.location.origin)) throw new Error("bad-url");
      window.location.assign(url);
    } catch (e) { fail(e); setBusy(""); }
  }

  // back from Stripe, or already connected: ask Stripe once how the account is doing
  useEffect(() => {
    if (checked.current || !company || !owner || !hasFirebase) return;
    const back = params.get("stripe");
    if (back || company.stripeAccountId) {
      checked.current = true;
      if (back) { params.delete("stripe"); setParams(params, { replace: true }); }
      if (back === "refresh") start(); else check(true);
    }
  }, [company?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (on: boolean) => { await update({ cardPay: { on } }); toast(t("Saved", "Guardado")); };

  return (
    <div className="card" style={{ maxWidth: 640, marginTop: 16 }} id="card-payments">
      <div className="card-h"><h2>{t("Card & bank payments", "Pagos con tarjeta y banco")}</h2>
        {connected && <Badge tone={ready ? "green" : "amber"} icon={ready ? "check" : "alert"}>{ready ? t("Connected", "Conectado") : t("Setup not finished", "Falta terminar")}</Badge>}</div>
      <div className="card-b">
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t(
          "Connect your own Stripe account and each invoice's payment link gets a “Pay by card or bank” button for the exact amount. When the client pays, the invoice is marked paid by itself. The money goes straight to your Stripe account and then to your bank; Stripe charges its fee (about 2.9% + 30¢ per card, 0.8% up to $5 per bank payment).",
          "Conecta tu propia cuenta de Stripe y el enlace de pago de cada factura tendrá un botón “Pagar con tarjeta o banco” por el monto exacto. Cuando el cliente paga, la factura se marca pagada sola. El dinero va directo a tu cuenta de Stripe y luego a tu banco; Stripe cobra su comisión (aprox. 2.9% + 30¢ por tarjeta, 0.8% hasta $5 por pago bancario).")}</p>

        {!hasFirebase ? <p className="muted" style={{ fontSize: 13 }}>{t("Available in the live app (not in demo mode).", "Disponible en la app real (no en modo demo).")}</p>
          : !owner ? <p className="muted" style={{ fontSize: 13 }}>{connected
            ? (ready ? t("Stripe is connected by the owner.", "El dueño ya conectó Stripe.") : t("The owner started connecting Stripe but hasn't finished.", "El dueño empezó a conectar Stripe pero no ha terminado."))
            : t("Only the owner of the company can connect Stripe.", "Solo el dueño de la empresa puede conectar Stripe.")}</p>
          : !connected ? <>
            <button className="btn pri" disabled={!!busy} onClick={start}>{busy === "start" ? t("Opening Stripe…", "Abriendo Stripe…") : t("Connect Stripe", "Conectar Stripe")}</button>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>{t("Stripe asks for your business details and the bank account for your deposits. If you already use Stripe, sign in with that e-mail.", "Stripe te pide los datos de tu negocio y la cuenta de banco para tus depósitos. Si ya usas Stripe, entra con ese correo.")}</p>
          </> : !ready ? <>
            <p style={{ fontSize: 13.5, marginTop: 0 }}>{t("Stripe still needs a few details before you can take payments.", "Stripe todavía necesita algunos datos antes de que puedas cobrar.")}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn pri" disabled={!!busy} onClick={start}>{busy === "start" ? t("Opening Stripe…", "Abriendo Stripe…") : t("Finish on Stripe", "Terminar en Stripe")}</button>
              <button className="btn" disabled={!!busy} onClick={() => check()}>{busy === "status" ? t("Checking…", "Revisando…") : t("Check again", "Revisar otra vez")}</button>
            </div>
          </> : <>
            <label className="chk" style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
              <input type="checkbox" role="switch" className="sw" checked={showOn} onChange={(e) => toggle(e.target.checked)} />{t("Show “Pay by card or bank” on invoice payment links", "Mostrar “Pagar con tarjeta o banco” en los enlaces de pago")}</label>
            {!showOn && <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>{t("Off: clients only see your other ways to pay.", "Apagado: los clientes solo ven tus otras formas de pago.")}</p>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a className="btn" href="https://dashboard.stripe.com/payments" target="_blank" rel="noopener noreferrer">{t("Open my Stripe", "Abrir mi Stripe")} ↗</a>
              <button className="btn" disabled={!!busy} onClick={() => check()}>{busy === "status" ? t("Checking…", "Revisando…") : t("Check connection", "Revisar conexión")}</button>
            </div>
          </>}
        {err && <p role="alert" style={{ color: "var(--down-ink)", fontSize: 13, marginBottom: 0 }}>{err}</p>}
      </div>
    </div>
  );
}
