import { useState } from "react";
import { useInvoices, useSettings } from "../../data/hooks";
import { deleteTop, patchTop, type Rec } from "../../data/repo";
import { useT } from "../../i18n";
import { calcEstimate, todayISO } from "../../lib/estimate";
import {
  changeInvoiceFor, changesToInvoice, contractTotal, createInvoices, invKindText, invNumberText, isPaid, invoicesFor, makeChangeInvoice, nextInvNumber,
  statusAfterPayment, syncInvoiceAmounts, type InvoiceRec,
} from "../../lib/invoices";
import { fmtDate } from "../../lib/format";
import { money, num } from "../../lib/money";
import type { ChangeOrder, Estimate, Invoice } from "../../lib/types";
import { useUi } from "../../store/ui";
import { Icon } from "../../ui/Icon";
import { Modal } from "../../ui/Modal";
import { InvoicePreview } from "../invoices/InvoicePreview";
import { InvBadge, PayClaimBar } from "../invoices/PayParts";
import "../Invoices.css";
import type { TabProps } from "./types";

/** Reads and writes this company's invoices. Shared by the Invoices page and the estimate tabs. */
export function useInvoiceOps() {
  const { rows, save, remove, loading } = useInvoices();
  const { settings, update } = useSettings();
  const invoices = rows as unknown as InvoiceRec[];
  const put = (v: InvoiceRec) => save(v as unknown as Invoice & Rec);
  const bump = (nextInv: number) => update({ numbering: { ...settings.numbering, nextInv } });

  /** Deposit + balance (or stage) invoices for an estimate. */
  async function createStages(e: Estimate) {
    const r = createInvoices(e, settings, invoices);
    if (!r.ok) return r;
    for (const v of r.invoices) await put(v);
    await bump(r.nextInv);
    return r;
  }
  /** Invoice for a signed change order (never twice for the same change order). */
  async function createChange(e: Estimate, co: ChangeOrder) {
    const cur = changeInvoiceFor(invoices, co);
    if (cur) return cur;
    const n = nextInvNumber(settings, invoices);
    const v = makeChangeInvoice(e, co, n);
    await put(v); await bump(n + 1);
    return v;
  }
  /**
   * Marks paid / unpaid (paying also settles a "client says they paid" claim; `method` records how).
   * Returns the invoice list as it is after the change (use it with statusAfterPayment).
   */
  async function setPaid(v: InvoiceRec, paid: boolean, method?: string): Promise<InvoiceRec[]> {
    const next: InvoiceRec = { ...v, status: paid ? "Paid" : "Unpaid", paidDate: paid ? v.paidDate || todayISO() : "",
      paidMethod: paid ? method || v.paidMethod : undefined, payClaim: paid ? undefined : v.payClaim };
    await put(next);
    return invoices.map((x) => (x.id === v.id ? next : x));
  }
  /**
   * The client said they paid but the money never arrived: drop the claim (the same claim never comes back) and clear it on the
   * payment link, so the client sees the ways to pay again and can tell us once more.
   */
  async function dismissClaim(v: InvoiceRec) {
    await put({ ...v, payClaim: undefined });
    if (v.pay?.token) await patchTop("paylink", v.pay.token, { set: { "client.paid": null } }).catch(() => {});
  }
  async function removeInv(v: InvoiceRec): Promise<InvoiceRec[]> {
    if (v.pay?.token) await deleteTop("paylink", v.pay.token).catch(() => {});
    await remove(v.id);
    return invoices.filter((x) => x.id !== v.id);
  }
  async function syncAmounts(e: Estimate) {
    const ch = syncInvoiceAmounts(e, settings, invoices);
    for (const v of ch) await put(v);
    return ch.length;
  }
  return { invoices, loading, settings, createStages, createChange, setPaid, dismissClaim, removeInv, syncAmounts, put };
}

/** Estimate patch for a status computed from the invoices (also clears the "client says they paid" claim). */
export function statusPatch(e: Estimate, list: InvoiceRec[]): Partial<Estimate> | null {
  const st = statusAfterPayment(e, list);
  if (!st || st === e.status) return null;
  return st === "Deposit Paid" || st === "Paid in Full" ? { status: st, payClaim: undefined } : { status: st };
}

export default function InvoicesTab({ e, set, s }: TabProps) {
  const t = useT();
  const lang = useUi((x) => x.lang);
  const es = lang === "es";
  const toast = useUi((x) => x.toast);
  const ops = useInvoiceOps();
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const mine = invoicesFor(ops.invoices, e.id);
  const mains = mine.filter((v) => v.kind !== "co");
  const tot = calcEstimate(e, s);
  const pending = changesToInvoice(e, ops.invoices);
  const invoiced = mine.reduce((a, v) => a + num(v.amount), 0);
  const paid = mine.filter(isPaid).reduce((a, v) => a + num(v.amount), 0);
  const drift = mains.length > 0 && syncInvoiceAmounts(e, s, ops.invoices).length > 0;
  const planned = e.payPlanOn && e.payPlan.length >= 2 ? e.payPlan.map((p) => `${es ? p.labelEs || p.label : p.label} ${num(p.pct)}%`).join(" · ")
    : tot.deposit > 0 && tot.balance > 0 ? t(`Deposit ${money(tot.deposit)} (${tot.depositPct}%) + balance ${money(tot.balance)}`, `Depósito ${money(tot.deposit)} (${tot.depositPct}%) + saldo ${money(tot.balance)}`) : t(`One invoice for ${money(tot.total)}`, `Una factura por ${money(tot.total)}`);

  const run = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const create = () => run(async () => {
    const r = await ops.createStages(e);
    if (!r.ok) { toast(r.reason === "exists" ? t("This job already has invoices.", "Este trabajo ya tiene facturas.") : t("Add line items before invoicing.", "Agrega conceptos antes de facturar.")); return; }
    if (r.status) set({ status: r.status });
    toast(r.invoices.length > 1 ? t(`${r.invoices.length} invoices created.`, `${r.invoices.length} facturas creadas.`) : t("Invoice created.", "Factura creada."));
  });
  const toggle = (v: InvoiceRec, method?: string) => run(async () => {
    const now = !isPaid(v);
    const list = await ops.setPaid(v, now, method);
    const patch = statusPatch(e, list);
    if (patch) set(patch);
    toast(now ? t(`${v.number} marked paid.`, `${v.number} marcada como pagada.`) : t(`${v.number} marked unpaid.`, `${v.number} marcada como no pagada.`));
  });
  const [open, setOpen] = useState<{ id: string; start: "doc" | "send" } | null>(null);
  const openInv = open ? mine.find((v) => v.id === open.id) : undefined;
  const del = (v: InvoiceRec) => run(async () => {
    if (!confirm(t(`Delete invoice ${v.number}?`, `¿Borrar la factura ${v.number}?`))) return;
    const list = await ops.removeInv(v);
    const patch = statusPatch(e, list);
    if (patch) set(patch);
    toast(t("Invoice deleted.", "Factura borrada."));
  });
  const sync = () => run(async () => { const n = await ops.syncAmounts(e); toast(n ? t(`Updated ${n} invoice amounts.`, `Se actualizaron ${n} montos.`) : t("Invoices already match the estimate.", "Las facturas ya coinciden con el presupuesto.")); });
  const addFor = (co: ChangeOrder) => run(async () => { await ops.createChange(e, co); toast(t("Invoice created.", "Factura creada.")); setPick(false); });

  return (
    <div className="stack">
      <div className="card">
        <div className="card-h"><h2>{t("Invoices", "Facturas")}</h2>
          <button className="btn sm" onClick={() => setPick(true)}>{t("Add invoice", "Agregar factura")}{pending.length > 0 && <span className="iv-dot">{pending.length}</span>}</button></div>
        <div className="card-b">
          {mains.length === 0 ? (
            <>
              <p className="muted" style={{ marginBottom: 6 }}>{t("One click builds the invoices from this estimate — nothing to re-type.", "Con un clic se crean las facturas desde este presupuesto — sin volver a escribir nada.")}</p>
              <p className="iv-plan">{planned}</p>
              <button className="btn pri" disabled={busy || tot.total <= 0} onClick={create}>
                {e.payPlanOn && e.payPlan.length >= 2 ? t("Create one invoice per payment", "Crear una factura por pago") : t("Create deposit + balance invoices", "Crear facturas de depósito y saldo")}</button>
              {tot.total <= 0 && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{t("Add line items first.", "Primero agrega conceptos.")}</p>}
            </>
          ) : null}
          {mine.map((v) => (
            <div className="iv-row" key={v.id}>
              <div className="iv-main">
                <b className="num">{v.number}</b>
                <span className="muted">{invKindText(v, es)} · {fmtDate(v.date, lang)}</span>
              </div>
              <b className="iv-amt">{money(v.amount)}</b>
              <InvBadge v={v} />
              <div className="iv-act">
                <button className={"btn sm" + (isPaid(v) ? "" : " pri")} disabled={busy} onClick={() => toggle(v)}>{isPaid(v) ? t("Mark unpaid", "Marcar sin pagar") : t("Mark paid", "Marcar pagada")}</button>
                <button className="btn sm" onClick={() => setOpen({ id: v.id, start: "doc" })}><Icon name="eye" size={15} />{t("Preview", "Ver")}</button>
                <button className="btn sm" onClick={() => setOpen({ id: v.id, start: "send" })}>{v.pay?.token ? t("Send ✓", "Enviar ✓") : t("Send", "Enviar")}</button>
                <button className="btn sm danger" disabled={busy} onClick={() => del(v)} aria-label={t("Delete", "Borrar")}>×</button>
              </div>
              <PayClaimBar v={v} busy={busy} onConfirm={() => toggle(v, v.payClaim?.method)} onDismiss={() => run(async () => { await ops.dismissClaim(v); })} />
            </div>
          ))}
          {mine.length > 0 && (
            <div className="iv-sum">
              <div className="totline dim"><span>{t("Invoiced", "Facturado")}</span><b>{money(invoiced)}</b></div>
              <div className="totline dim"><span>{t("Paid", "Cobrado")}</span><b>{money(paid)}</b></div>
              <div className="totline"><span>{t("Still to collect", "Falta por cobrar")}</span><b>{money(invoiced - paid)}</b></div>
              {contractTotal(e, s) !== tot.total && <div className="totline dim"><span>{t("Contract with signed changes", "Contrato con cambios firmados")}</span><b>{money(contractTotal(e, s))}</b></div>}
            </div>
          )}
          {mains.length > 0 && (
            <div className="pills" style={{ marginTop: 14 }}>
              {drift && <button className="btn sm" disabled={busy} onClick={sync}>{t("Update amounts from estimate", "Actualizar montos desde el presupuesto")}</button>}
            </div>
          )}
          {pending.length > 0 && <p className="iv-warn">{t(`${pending.length} signed change order(s) still have no invoice.`, `${pending.length} orden(es) de cambio firmada(s) todavía no tienen factura.`)}</p>}
        </div>
      </div>

      {openInv && open && <InvoicePreview v={openInv} e={e} client={e.clientName || t("Unnamed client", "Cliente sin nombre")} busy={busy} start={open.start} inEstimate onClose={() => setOpen(null)}
        onToggle={(method) => toggle(openInv, method)} onDismissClaim={() => run(async () => { await ops.dismissClaim(openInv); })} onDelete={() => del(openInv)} />}
      {pick && (
        <Modal title={t("Invoice for a change order", "Factura de una orden de cambio")} onClose={() => setPick(false)}>
          {pending.length === 0 ? <p className="muted">{t("There is nothing to invoice. A change order gets its invoice once the client (or you) signs it — see the Change orders tab.", "No hay nada que facturar. Una orden de cambio tiene su factura cuando el cliente (o tú) la firma — mira la pestaña Cambios.")}</p>
            : pending.map((co) => (
              <div className="iv-row" key={co.id || co.n}>
                <div className="iv-main"><b>{t("Change order #", "Orden de cambio #")}{co.n}</b><span className="muted">{(es ? co.descEs || co.desc : co.desc || co.descEs) || ""}</span></div>
                <b className="iv-amt">{money(co.amount)}</b>
                <button className="btn sm pri" disabled={busy} onClick={() => addFor(co)}>{t("Create invoice", "Crear factura")} {invNumberText(nextInvNumber(ops.settings, ops.invoices))}</button>
              </div>))}
        </Modal>
      )}
    </div>
  );
}
