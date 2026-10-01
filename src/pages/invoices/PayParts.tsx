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
import { Icon } from "../../ui/Icon";
import { Badge } from "../../ui/Badge";

/** Paid / Unpaid badge, plus what happened online: a bank payment on its way, or a second payment (to refund in Stripe). */
export function InvBadge({ v }: { v: InvoiceRec }) {
  const t = useT();
  const paid = v.status === "Paid", o = v.online;
  return <>
    {!paid && o?.status === "processing"
      ? <Badge tone="amber" spinner title={t("The client paid from their bank; it takes 3–5 business days to arrive.", "El cliente pagó desde su banco; tarda de 3 a 5 días hábiles en llegar.")}>{t("Bank payment on its way", "Pago bancario en camino")}</Badge>
      : <Badge tone={paid ? "green" : "gray"} icon={paid ? "check" : undefined} dot={!paid}>{paid ? t("Paid", "Pagada") : t("Unpaid", "Sin pagar")}</Badge>}
    {paid && o?.dup && <Badge tone="amber" icon="alert" style={{ marginLeft: 6 }} title={t("It was already paid when the client also paid online. You can refund it in your Stripe account.", "Ya estaba pagada cuando el cliente también pagó en línea. Puedes devolverlo desde tu cuenta de Stripe.")}>{t("Paid twice", "Pagada dos veces")}</Badge>}
  </>;
}

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

/**
 * Send one invoice to the client: creates its public payment link if needed, then the message (in the client's language)
 * with WhatsApp / SMS / e-mail / copy buttons. A paid invoice's link shows it as paid, so it doubles as a receipt.
 */
export function PaySend({ v, e, lang }: { v: InvoiceRec; e: Estimate | undefined; lang: "en" | "es" }) {
  const t = useT();
  const toast = useUi((x) => x.toast);
  const { company } = useAuth();
  const { settings } = useSettings();
  const [busy, setBusy] = useState(false);
  const token = v.pay?.token || "";
  const link = token ? payLinkOf(token) : "";
  const paid = v.status === "Paid";
  const auto = link ? payLinkMessage(v, link, company?.name || "", lang) : "";
  const [edit, setEdit] = useState<{ base: string; text: string } | null>(null);
  // an edited message is kept until what it was written from changes (other language, marked paid, new amount)
  const body = edit && edit.base === auto ? edit.text : auto;
  const methods = payOptionsOf(settings);
  const phone = e?.phone || v.phone || "", email = e?.email || v.email || "";
  const subject = (lang === "es" ? "Factura " : "Invoice ") + v.number;

  const create = async () => {
    if (!e || !company || busy) return;
    setBusy(true);
    try { await createPayLink(v, e, settings, company); toast(t("Link created", "Enlace creado")); }
    catch (err) { console.error(err); toast(t("Could not create the link. Try again.", "No se pudo crear el enlace. Inténtalo de nuevo.")); }
    finally { setBusy(false); }
  };
  const turnOff = async () => {
    if (!company || busy || !confirm(t("Turn off this link? The client will see that it is no longer active.", "¿Desactivar este enlace? El cliente verá que ya no está activo."))) return;
    setBusy(true);
    try { await removePayLink(v, company.id); toast(t("Link turned off", "Enlace desactivado")); }
    finally { setBusy(false); }
  };
  const copy = (x: string, done: string) => navigator.clipboard?.writeText(x).then(() => toast(done)).catch(() => prompt(t("Copy it", "Cópialo"), x));

  return (
    <div className="pay-send">
      {!paid && methods.length === 0 && (
        <p className="iv-warn" style={{ marginTop: 0 }}>{t("Add at least one way to pay (Zelle, Venmo, Cash App…) so the client knows how. ", "Agrega al menos una forma de pago (Zelle, Venmo, Cash App…) para que el cliente sepa cómo pagar. ")}
          <Link to="/settings?section=client">{t("Open settings", "Abrir ajustes")}</Link></p>)}
      {!token ? (
        <>
          <p className="muted">{paid
            ? t("This invoice is paid. Create a link to send the client a copy marked paid.", "Esta factura está pagada. Crea un enlace para mandarle al cliente una copia marcada como pagada.")
            : t(`The client opens the invoice on their phone, sees ${money(v.amount)} due and your payment options, and taps “I paid”. You confirm when the money arrives.`, `El cliente abre la factura en su teléfono, ve ${money(v.amount)} a pagar y tus formas de pago, y toca “Ya pagué”. Tú confirmas cuando llegue el dinero.`)}</p>
          {!e && <p className="iv-warn">{t("This invoice's estimate was deleted, so there is nothing to show the client.", "Se borró el presupuesto de esta factura, así que no hay nada que mostrarle al cliente.")}</p>}
          <button className="btn pri" disabled={busy || !e} onClick={create}><Icon name="send" size={16} />{paid ? t("Create link", "Crear enlace") : t("Create payment link", "Crear enlace de pago")}</button>
        </>
      ) : (
        <>
          <div className="pay-link">
            <span>{link}</span>
            <button className="btn sm icon-only" onClick={() => copy(link, t("Link copied.", "Enlace copiado."))} title={t("Copy link", "Copiar enlace")} aria-label={t("Copy link", "Copiar enlace")}><Icon name="copy" size={16} /></button>
          </div>
          <p className="muted pay-views">{t(`Opened ${v.payViews || 0} time(s). It updates by itself when you change the invoice or mark it paid.`, `Abierto ${v.payViews || 0} vez/veces. Se actualiza solo cuando cambias la factura o la marcas pagada.`)}</p>
          <label className="f">{t("Message (edit anything)", "Mensaje (cambia lo que quieras)")}<textarea rows={6} value={body} onChange={(ev) => setEdit({ base: auto, text: ev.target.value })} /></label>
          <div className="pay-btns">
            <a className="btn wa-btn" href={waUrl(phone, body)} target="_blank" rel="noreferrer"><Icon name="chat" size={16} />WhatsApp</a>
            <a className="btn" href={smsUrl(phone, body)}><Icon name="phone" size={16} />SMS</a>
            <a className="btn" href={mailUrl(email, subject, body)}><Icon name="mail" size={16} />{t("Email", "Correo")}</a>
            <button className="btn" onClick={() => copy(body, t("Message copied.", "Mensaje copiado."))}><Icon name="copy" size={16} />{t("Copy message", "Copiar mensaje")}</button>
          </div>
          <div className="pay-more">
            <a className="link-btn" href={link} target="_blank" rel="noreferrer">{t("See what the client sees", "Ver lo que ve el cliente")}</a>
            <button className="link-btn" disabled={busy} onClick={turnOff}>{t("Turn off link", "Desactivar enlace")}</button>
          </div>
        </>
      )}
    </div>
  );
}
