import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useT } from "../../i18n";
import { calcEstimate, uid } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import { changeInvoiceFor, coSignedTotal, contractTotal, nextChangeNumber, signChange } from "../../lib/invoices";
import { money, num } from "../../lib/money";
import type { ChangeOrder, Estimate } from "../../lib/types";
import { useUi } from "../../store/ui";
import { Modal } from "../../ui/Modal";
import { NumInput } from "../../ui/NumInput";
import "../Invoices.css";
import { useInvoiceOps } from "./InvoicesTab";
import type { TabProps } from "./types";

type CO = ChangeOrder & { via?: string };
const logLine = (e: Estimate, text: string) => [...(e.activity || []), { at: new Date().toISOString(), text }].slice(-100);

/** Text the owner sends about one change order, in the client's language. */
export function changeMessage(e: Estimate, co: ChangeOrder, business: string, phone: string, link: string): string {
  const es = e.docLang === "es", first = String(e.clientName || "").split(" ")[0];
  const d = es ? co.descEs || co.desc : co.desc || co.descEs;
  return es
    ? `Hola ${first}, le dejo el cambio #${co.n} (${d}) por ${money(co.amount)}.` + (link ? ` Puede revisarlo y aprobarlo aquí: ${link}` : " Si está de acuerdo, respóndame este mensaje para confirmarlo.") + `\n\n${business}\n${phone}`
    : `Hi ${first}, here is change order #${co.n} (${d}) for ${money(co.amount)}.` + (link ? ` You can review and approve it here: ${link}` : " If you agree, just reply to this message to confirm.") + `\n\n${business}\n${phone}`;
}

export default function ChangeOrdersTab({ e, set, s }: TabProps) {
  const t = useT();
  const lang = useUi((x) => x.lang);
  const es = lang === "es";
  const toast = useUi((x) => x.toast);
  const { company } = useAuth();
  const ops = useInvoiceOps();
  const [signing, setSigning] = useState<CO | null>(null);
  const [name, setName] = useState("");
  const list = (e.changeOrders || []) as CO[];
  const base = calcEstimate(e, s).total, signedSum = coSignedTotal(e);
  const accepted = !!e.signature || e.status === "Accepted" || e.status === "Deposit Paid" || e.status === "Paid in Full" || ops.invoices.some((v) => v.estId === e.id);

  const patch = (id: string | undefined, p: Partial<CO>) => set({ changeOrders: list.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const add = () => set({ changeOrders: [...list, { id: uid("co"), n: nextChangeNumber(e), desc: "", descEs: "", amount: 0, hours: 0, status: "draft" }] });
  const remove = (co: CO) => { if (confirm(t(`Delete change order #${co.n}?`, `¿Borrar la orden de cambio #${co.n}?`))) set({ changeOrders: list.filter((c) => c.id !== co.id) }); };
  const send = (co: CO) => {
    if (num(co.amount) <= 0 || !(co.desc || co.descEs)) { toast(t("Add what will be done and the price first.", "Primero pon qué se va a hacer y el precio.")); return; }
    set({ changeOrders: list.map((c) => (c.id === co.id ? { ...c, status: "sent" } : c)), activity: logLine(e, t(`Change order #${co.n} sent for approval`, `Orden de cambio #${co.n} enviada para aprobar`)) });
    toast(e.portal ? t("Now on the client link, ready to approve.", "Ya está en el enlace del cliente, lista para aprobar.") : t("Marked as sent. Copy the message and send it.", "Marcada como enviada. Copia el mensaje y envíalo."));
  };
  const copyMsg = (co: CO) => {
    const link = e.portal ? `${location.origin}/p/${e.portal.token}` : "";
    const msg = changeMessage(e, co, company?.name || "", company?.phone || "", link);
    navigator.clipboard?.writeText(msg).then(() => toast(t("Message copied.", "Mensaje copiado."))).catch(() => prompt(t("Copy the message", "Copia el mensaje"), msg));
  };
  const sign = async () => {
    const co = signing; const nm = name.trim();
    if (!co || !nm) { toast(t("Type the name of the person signing.", "Escribe el nombre de quien firma.")); return; }
    const next = signChange(e, co, nm, { via: "here" });
    const signed = next.find((c) => c.id === co.id)!;
    set({ changeOrders: next, activity: logLine(e, t(`Change order #${co.n} signed (${money(co.amount)})`, `Orden de cambio #${co.n} firmada (${money(co.amount)})`)) });
    setSigning(null);
    if (num(co.amount) > 0) await ops.createChange({ ...e, changeOrders: next }, signed);
    toast(t("Change signed. Its invoice is ready.", "Cambio firmado. Su factura ya está lista."));
  };
  const makeInvoice = async (co: CO) => { await ops.createChange(e, co); toast(t("Invoice created.", "Factura creada.")); };

  return (
    <div className="stack">
      <div className="card"><div className="card-h"><h2>{t("Change orders", "Órdenes de cambio")}</h2><span className="muted" style={{ fontSize: 12.5 }}>{t("extra work after the client signed", "trabajo extra después de que el cliente firmó")}</span></div>
        <div className="card-b">
          {!accepted && <p className="iv-warn" style={{ marginTop: 0 }}>{t("These are for after the estimate is accepted. Until then, change the estimate itself.", "Son para después de que el presupuesto esté aceptado. Mientras tanto, cambia el presupuesto directamente.")}</p>}
          {list.length === 0 && <p className="muted">{t("No change orders. Each signed change gets its own invoice and adds its hours to the job.", "Sin órdenes de cambio. Cada cambio firmado sale con su propia factura y suma sus horas al trabajo.")}</p>}
          {list.map((co) => {
            const signed = co.status === "signed", inv = changeInvoiceFor(ops.invoices, co);
            const d = es ? co.descEs || co.desc : co.desc || co.descEs;
            return (
              <div className={"co" + (signed ? " on" : "")} key={co.id || co.n}>
                <div className="co-h">
                  <b>#{co.n}</b>
                  <span className={"badge " + (signed ? "b-green" : co.status === "sent" ? "b-blue" : "b-gray")}><i />{signed ? t("Signed", "Firmado") : co.status === "sent" ? t("Waiting for signature", "Esperando firma") : t("Draft", "Borrador")}</span>
                  <b className="co-amt">{money(co.amount)}</b>
                </div>
                {signed ? (
                  <>
                    <p style={{ marginTop: 8 }}>{d}</p>
                    <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t(`Signed by ${co.signedName || ""} on ${fmtDate(co.signedAt, lang)}`, `Firmado por ${co.signedName || ""} el ${fmtDate(co.signedAt, lang)}`)}{co.via === "link" ? t(", from the link", ", desde el enlace") : ""} · {num(co.hours)} h</p>
                    <div className="pills" style={{ marginTop: 10 }}>
                      {inv ? <Link className="btn sm" to={`/invoices/${inv.id}/doc`} target="_blank">{t("Open invoice", "Abrir factura")} {inv.number}</Link>
                        : num(co.amount) > 0 && <button className="btn sm pri" onClick={() => makeInvoice(co)}>{t("Create invoice", "Crear factura")}</button>}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid2" style={{ marginTop: 10 }}>
                      <label className="f">{t("What will be done (English)", "Qué se va a hacer (inglés)")}<input value={co.desc || ""} onChange={(ev) => patch(co.id, { desc: ev.target.value })} /></label>
                      <label className="f">{t("Spanish", "Español")}<input value={co.descEs || ""} onChange={(ev) => patch(co.id, { descEs: ev.target.value })} /></label>
                      <label className="f">{t("Price", "Precio")}<NumInput value={num(co.amount)} onChange={(n) => patch(co.id, { amount: n })} /></label>
                      <label className="f">{t("Labor hours", "Horas de trabajo")}<NumInput step="0.5" value={num(co.hours)} onChange={(n) => patch(co.id, { hours: n })} /></label>
                    </div>
                    <div className="pills">
                      <button className="btn sm pri" onClick={() => { setName(e.clientName || ""); setSigning(co); }}>{t("Mark signed", "Marcar firmado")}</button>
                      {co.status !== "sent" ? <button className="btn sm" onClick={() => send(co)}>{t("Send for approval", "Mandar para aprobar")}</button>
                        : <button className="btn sm" onClick={() => copyMsg(co)}>{t("Copy message", "Copiar mensaje")}</button>}
                      <button className="btn sm danger" onClick={() => remove(co)}>{t("Delete", "Borrar")}</button>
                    </div>
                    {co.status === "sent" && e.portal && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{t("The client can approve it from the link (Review & approve).", "El cliente puede aprobarla desde el enlace (Revisar y aprobar).")}</p>}
                  </>
                )}
              </div>
            );
          })}
          <div className="pills" style={{ marginTop: 14 }}><button className="btn sm" onClick={add}>{t("+ New change order", "+ Nueva orden de cambio")}</button></div>
        </div>
      </div>

      {list.length > 0 && (
        <div className="card"><div className="card-h"><h2>{t("Contract total", "Total del contrato")}</h2></div><div className="card-b">
          <div className="totline dim"><span>{t("Estimate total", "Total del presupuesto")}</span><b>{money(base)}</b></div>
          <div className="totline dim"><span>{t("Signed change orders", "Cambios firmados")}</span><b>+ {money(signedSum)}</b></div>
          <div className="totline big"><span>{t("New contract total", "Nuevo total del contrato")}</span><b>{money(contractTotal(e, s))}</b></div>
        </div></div>
      )}

      {signing && (
        <Modal title={t(`Change order #${signing.n} signed`, `Orden de cambio #${signing.n} firmada`)} onClose={() => setSigning(null)}>
          <p style={{ marginBottom: 10 }}>{(es ? signing.descEs || signing.desc : signing.desc || signing.descEs)} — <b>{money(signing.amount)}</b></p>
          <label className="f">{t("Name of the person who approved", "Nombre de quien aprobó")}<input value={name} autoFocus onChange={(ev) => setName(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && sign()} /></label>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{t("Use this when the client agreed in person or by message. The invoice is created right away.", "Úsalo cuando el cliente aceptó en persona o por mensaje. La factura se crea al momento.")}</p>
          <button className="btn pri" onClick={sign}>{t("Mark signed", "Marcar firmado")}</button>
        </Modal>
      )}
    </div>
  );
}
