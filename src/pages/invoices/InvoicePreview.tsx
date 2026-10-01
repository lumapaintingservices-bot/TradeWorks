import { useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../../i18n";
import { fmtDate } from "../../lib/format";
import { invKindText, isPaid, type InvoiceRec } from "../../lib/invoices";
import { money } from "../../lib/money";
import type { Estimate } from "../../lib/types";
import { useUi } from "../../store/ui";
import { Drawer } from "../../ui/Drawer";
import { Icon } from "../../ui/Icon";
import { InvoicePaper, PaperFit } from "./InvoicePaper";
import { InvBadge, PayClaimBar, PaySend } from "./PayParts";
import "./preview.css";

type Props = {
  v: InvoiceRec; e: Estimate | undefined; client: string; busy: boolean; start?: "doc" | "send"; inEstimate?: boolean;
  onToggle(method?: string): void; onDismissClaim(): void; onDelete(): void; onClose(): void;
};

/**
 * One invoice in a side panel: the document exactly as the client gets it (their language, your branding) next to
 * what to do with it: send it (WhatsApp / SMS / e-mail with the payment link), mark it paid, print, delete.
 * On a phone the two halves are tabs: "Invoice" and "Send".
 */
export function InvoicePreview({ v, e, client, busy, start = "doc", inEstimate, onToggle, onDismissClaim, onDelete, onClose }: Props) {
  const t = useT();
  const appLang = useUi((s) => s.lang), es = appLang === "es";
  const [lang, setLang] = useState<"en" | "es">(e?.docLang === "es" ? "es" : "en");
  const [tab, setTab] = useState<"doc" | "send">(start);
  const paid = isPaid(v);

  return (
    <Drawer title={<>{v.number}<InvBadge v={v} /></>} sub={`${client} · ${invKindText(v, es)} · ${fmtDate(v.date, appLang)}`} onClose={onClose}>
      <div className="ivp">
        <div className="seg ivp-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "doc"} className={tab === "doc" ? "on" : ""} onClick={() => setTab("doc")}><Icon name="eye" size={15} />{t("Invoice", "Factura")}</button>
          <button role="tab" aria-selected={tab === "send"} className={tab === "send" ? "on" : ""} onClick={() => setTab("send")}><Icon name="send" size={15} />{t("Send", "Enviar")}</button>
        </div>

        <div className={"ivp-doc" + (tab === "doc" ? " on" : "")}>
          <div className="ivp-docbar">
            <span className="muted">{t("What the client sees", "Lo que ve el cliente")}</span>
            <div className="seg">{(["en", "es"] as const).map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l === "en" ? "English" : "Español"}</button>)}</div>
          </div>
          {e ? <PaperFit><InvoicePaper v={v} e={e} lang={lang} /></PaperFit>
            : <p className="iv-warn">{t("This invoice's estimate was deleted, so the document can't be shown.", "Se borró el presupuesto de esta factura, así que no se puede mostrar el documento.")}</p>}
        </div>

        <aside className={"ivp-side" + (tab === "send" ? " on" : "")}>
          <section className="ivp-sum">
            <span className="muted">{paid ? t("Paid", "Pagada") + (v.paidDate ? " · " + fmtDate(v.paidDate, appLang) : "") : t("Amount due", "Monto a pagar")}</span>
            <b>{money(v.amount)}</b>
            {v.paidMethod && paid && <span className="muted">{v.paidMethod}</span>}
            <PayClaimBar v={v} busy={busy} onConfirm={() => onToggle(v.payClaim?.method)} onDismiss={onDismissClaim} />
            <button className={"btn" + (paid ? "" : " pri")} disabled={busy} onClick={() => onToggle()}>
              {paid ? t("Mark unpaid", "Marcar sin pagar") : <><Icon name="check" size={16} />{t("Mark paid", "Marcar pagada")}</>}</button>
          </section>

          <section>
            <h3>{t("Send to the client", "Enviar al cliente")}</h3>
            <PaySend v={v} e={e} lang={lang} />
          </section>

          <section className="ivp-links">
            <Link className="btn" to={`/invoices/${v.id}/doc?lang=${lang}`} target="_blank"><Icon name="print" size={16} />{t("Print / Save PDF", "Imprimir / Guardar PDF")}</Link>
            {e && !inEstimate && <Link className="btn" to={`/estimates/${e.id}?tab=inv`} onClick={onClose}><Icon name="estimates" size={16} />{t("Open estimate", "Abrir presupuesto")} {e.number}</Link>}
            <button className="link-btn danger" disabled={busy} onClick={onDelete}>{t("Delete invoice", "Borrar factura")}</button>
          </section>
        </aside>
      </div>
    </Drawer>
  );
}
