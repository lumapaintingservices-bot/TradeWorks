import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useSettings } from "../../data/hooks";
import { createPayLink, payLinkOf, removePayLink } from "../../data/paylinks";
import { useT } from "../../i18n";
import { type InvoiceRec } from "../../lib/invoices";
import { mailUrl, smsUrl, waUrl } from "../../lib/messages";
import { money } from "../../lib/money";
import { payLinkMessage, payOptionsOf } from "../../lib/paylink";
import type { Estimate } from "../../lib/types";
import { useUi } from "../../store/ui";
import { Modal } from "../../ui/Modal";

/** "Ana says she paid $500 by Venmo" + Confirm / Not received. */
export function PayClaimBar({ v, busy, onConfirm, onDismiss }: { v: InvoiceRec; busy?: boolean; onConfirm(): void; onDismiss(): void }) {
  const t = useT();
  if (!v.payClaim || v.status === "Paid") return null;
  const c = v.payClaim;
  return (
    <div className="iv-claim" onClick={(ev) => ev.stopPropagation()}>
      <div>
        <b>{t("Confirm the payment", "Confirmar el pago")}</b>
        <span>{t(`The client says they sent ${money(v.amount)} by ${c.method}. Check your account, then confirm.`, `El cliente dice que envió ${money(v.amount)} por ${c.method}. Revisa tu cuenta y confirma.`)}</span>
        {c.note && <span className="muted">“{c.note}”</span>}
      </div>
      <div className="iv-act">
        <button className="btn sm pri" disabled={busy} onClick={onConfirm}>{t("Payment received", "Pago recibido")}</button>
        <button className="btn sm" disabled={busy} onClick={onDismiss}>{t("Not received", "No llegó")}</button>
      </div>
    </div>
  );
}

/** Create / send / turn off the public payment link of one invoice. */
export function PayLinkModal({ v, e, onClose }: { v: InvoiceRec; e: Estimate | undefined; onClose(): void }) {
  const t = useT();
  const toast = useUi((x) => x.toast);
  const { company } = useAuth();
  const { settings } = useSettings();
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState(v.pay?.token || "");
  const link = token ? payLinkOf(token) : "";
  const lang = e?.docLang === "es" ? "es" : "en";
  const [body, setBody] = useState(link ? payLinkMessage(v, link, company?.name || "", lang) : "");
  const methods = payOptionsOf(settings);
  const phone = e?.phone || v.phone || "", email = e?.email || v.email || "";

  const create = async () => {
    if (!e || !company || busy) return;
    setBusy(true);
    try {
      const tk = await createPayLink(v, e, settings, company);
      setToken(tk); setBody(payLinkMessage(v, payLinkOf(tk), company.name, lang));
      toast(t("Payment link created", "Enlace de pago creado"));
    } catch (err) { console.error(err); toast(t("Could not create the link. Try again.", "No se pudo crear el enlace. Inténtalo de nuevo.")); }
    finally { setBusy(false); }
  };
  const turnOff = async () => {
    if (!company || busy || !confirm(t("Turn off this payment link? The client will see that it is no longer active.", "¿Desactivar este enlace de pago? El cliente verá que ya no está activo."))) return;
    setBusy(true);
    try { await removePayLink({ ...v, pay: { token } }, company.id); setToken(""); toast(t("Payment link turned off", "Enlace de pago desactivado")); }
    finally { setBusy(false); }
  };
  const copy = () => navigator.clipboard?.writeText(link).then(() => toast(t("Copied.", "Copiado."))).catch(() => prompt(t("Copy the link", "Copia el enlace"), link));
  const subject = (lang === "es" ? "Factura " : "Invoice ") + v.number;

  return (
    <Modal title={t("Payment link", "Enlace de pago") + " — " + v.number} onClose={onClose}>
      {methods.length === 0 && (
        <p className="iv-warn" style={{ marginTop: 0 }}>{t("Add at least one way to pay (Zelle, Venmo, Cash App…) so the client knows how. ", "Agrega al menos una forma de pago (Zelle, Venmo, Cash App…) para que el cliente sepa cómo pagar. ")}
          <Link to="/settings?section=client" onClick={onClose}>{t("Open settings", "Abrir ajustes")}</Link></p>)}
      {!token ? (
        <>
          <p className="muted" style={{ marginTop: 0 }}>{t(`The client opens the invoice on their phone, sees ${money(v.amount)} due and your payment options, and taps “I paid”. You confirm when the money arrives.`, `El cliente abre la factura en su teléfono, ve ${money(v.amount)} a pagar y tus formas de pago, y toca “Ya pagué”. Tú confirmas cuando llegue el dinero.`)}</p>
          {!e && <p className="iv-warn">{t("This invoice's estimate was deleted, so there is nothing to show the client.", "Se borró el presupuesto de esta factura, así que no hay nada que mostrarle al cliente.")}</p>}
          <button className="btn pri" disabled={busy || !e} onClick={create}>{t("Create payment link", "Crear enlace de pago")}</button>
        </>
      ) : (
        <>
          <div className="linkbox">{link}</div>
          <p className="muted" style={{ fontSize: 12.5, margin: "8px 0 0" }}>{t(`Opened ${v.payViews || 0} time(s). It updates by itself when you change or mark the invoice paid.`, `Abierto ${v.payViews || 0} vez/veces. Se actualiza solo cuando cambias la factura o la marcas pagada.`)}</p>
          <label className="f" style={{ marginTop: 12 }}>{t("Message (in the client's language — edit anything)", "Mensaje (en el idioma del cliente — cambia lo que quieras)")}<textarea rows={7} value={body} onChange={(ev) => setBody(ev.target.value)} /></label>
          <div className="pills">
            <a className="btn wa-btn" href={waUrl(phone, body)} target="_blank" rel="noreferrer">WhatsApp</a>
            <a className="btn" href={smsUrl(phone, body)}>SMS</a>
            <a className="btn" href={mailUrl(email, subject, body)}>{t("Email", "Correo")}</a>
            <button className="btn" onClick={copy}>{t("Copy link", "Copiar enlace")}</button>
            <a className="btn" href={link} target="_blank" rel="noreferrer">{t("Open", "Abrir")}</a>
          </div>
          <div style={{ marginTop: 14 }}><button className="link-btn" disabled={busy} onClick={turnOff}>{t("Turn off link", "Desactivar enlace")}</button></div>
        </>
      )}
    </Modal>
  );
}
