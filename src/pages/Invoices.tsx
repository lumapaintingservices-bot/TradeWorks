import { Fragment, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useEstimates } from "../data/hooks";
import { useT } from "../i18n";
import { fmtDate } from "../lib/format";
import { invKindText, isPaid, type InvoiceRec } from "../lib/invoices";
import { money, num, r2 } from "../lib/money";
import { useUi } from "../store/ui";
import { EmptyState } from "../ui/EmptyState";
import { statusPatch, useInvoiceOps } from "./estimate/InvoicesTab";
import { InvoicePreview } from "./invoices/InvoicePreview";
import { InvBadge, PayClaimBar } from "./invoices/PayParts";
import { useUrlFlag } from "../ui/useUrlFlag";
import { ask } from "../ui/confirm";
import "./Invoices.css";

type Filter = "all" | "unpaid" | "paid" | "claims";
const hasClaim = (v: InvoiceRec) => !!v.payClaim && !isPaid(v);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

export default function Invoices() {
  const t = useT();
  const lang = useUi((s) => s.lang), es = lang === "es";
  const toast = useUi((s) => s.toast);
  const nav = useNavigate();
  const ops = useInvoiceOps();
  const { rows: ests, save: saveEst } = useEstimates();
  const [q, setQ] = useState(""); const [f, setF] = useState<Filter>("all"); const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ id: string; start: "doc" | "send" } | null>(null);
  const estOf = (v: InvoiceRec) => ests.find((e) => e.id === v.estId);
  const nameOf = (v: InvoiceRec) => estOf(v)?.clientName || v.clientName || t("Unnamed client", "Cliente sin nombre");

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ops.invoices.filter((v) => (f === "all" || (f === "claims" ? hasClaim(v) : (f === "paid") === isPaid(v))) &&
      (!s || [v.number, v.estNumber, v.clientName, estOf(v)?.clientName].some((x) => (x || "").toLowerCase().includes(s))))
      .sort((a, b) => String(b.number).localeCompare(String(a.number), undefined, { numeric: true }));
  }, [ops.invoices, ests, q, f]); // eslint-disable-line react-hooks/exhaustive-deps

  const unpaid = ops.invoices.filter((v) => !isPaid(v)), paid = ops.invoices.filter(isPaid);
  const claims = ops.invoices.filter(hasClaim);
  const since = daysAgo(30);
  const recent = paid.filter((v) => (v.paidDate || v.date || "") >= since);
  const sum = (a: InvoiceRec[]) => r2(a.reduce((x, v) => x + num(v.amount), 0));

  /** Saves the estimate's new status (Deposit Paid / Paid in Full / back to Accepted) after an invoice changed. */
  const syncStatus = async (v: InvoiceRec, after: InvoiceRec[]) => {
    const e = estOf(v);
    const p = e && statusPatch(e, after);
    if (e && p) await saveEst({ ...e, ...p });
  };
  const run = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const toggle = (v: InvoiceRec, method?: string) => run(async () => {
    const now = !isPaid(v);
    await syncStatus(v, await ops.setPaid(v, now, method));
    toast(now ? t(`${v.number} marked paid.`, `${v.number} marcada como pagada.`) : t(`${v.number} marked unpaid.`, `${v.number} marcada como no pagada.`));
  });
  const del = (v: InvoiceRec) => run(async () => {
    if (!await ask(t(`Delete invoice ${v.number}? This can't be undone.`, `¿Borrar la factura ${v.number}? No se puede deshacer.`))) return;
    await syncStatus(v, await ops.removeInv(v));
    toast(t("Invoice deleted.", "Factura borrada."));
  });

  const actions = (v: InvoiceRec) => (
    <div className="iv-act" onClick={(ev) => ev.stopPropagation()}>
      <button className={"btn sm" + (isPaid(v) ? "" : " pri")} disabled={busy} onClick={() => toggle(v)}>{isPaid(v) ? t("Mark unpaid", "Marcar sin pagar") : t("Mark paid", "Marcar pagada")}</button>
      <button className="btn sm" onClick={() => setOpen({ id: v.id, start: "send" })}>{v.pay?.token ? t("Send ✓", "Enviar ✓") : t("Send", "Enviar")}</button>
      <button className="btn sm danger" disabled={busy} onClick={() => del(v)} aria-label={t("Delete", "Borrar")}>×</button>
    </div>
  );
  const claimBar = (v: InvoiceRec) => <PayClaimBar v={v} busy={busy} onConfirm={() => toggle(v, v.payClaim?.method)} onDismiss={() => run(async () => { await ops.dismissClaim(v); })} />;
  const openInv = open ? ops.invoices.find((v) => v.id === open.id) : undefined;
  useUrlFlag("open", (id) => setOpen({ id, start: "doc" }), !ops.loading); // Search
  const badge = (v: InvoiceRec) => <InvBadge v={v} />;

  return (
    <div className="page">
      <div className="page-h">
        <div><h1>{t("Invoices", "Facturas")}</h1><p>{t(`${money(sum(unpaid))} outstanding · ${money(sum(paid))} collected`, `${money(sum(unpaid))} pendiente · ${money(sum(paid))} cobrado`)}</p></div>
      </div>
      {ops.invoices.length === 0 ? (
        <div className="card"><EmptyState icon="invoices" title={t("No invoices yet", "Aún no hay facturas")} text={t("When a client accepts an estimate, one click creates the deposit and balance invoices.", "Cuando un cliente acepta un presupuesto, con un clic se crean las facturas del depósito y del saldo.")}>
          <button className="btn pri" onClick={() => nav("/estimates")}>{t("Go to estimates", "Ir a presupuestos")}</button></EmptyState></div>
      ) : (
        <>
          <div className="iv-tiles">
            <div className="card iv-tile"><span>{t("Unpaid", "Sin pagar")}</span><b>{money(sum(unpaid))}</b><small>{t(`${unpaid.length} invoice(s)`, `${unpaid.length} factura(s)`)}</small></div>
            <div className="card iv-tile"><span>{t("Paid, last 30 days", "Cobrado, últimos 30 días")}</span><b>{money(sum(recent))}</b><small>{t(`${recent.length} invoice(s)`, `${recent.length} factura(s)`)}</small></div>
            <div className="card iv-tile"><span>{t("Collected, all time", "Cobrado en total")}</span><b>{money(sum(paid))}</b><small>{t(`${paid.length} invoice(s)`, `${paid.length} factura(s)`)}</small></div>
          </div>
          <div className="toolbar">
            <input placeholder={t("Search number or client…", "Buscar número o cliente…")} value={q} onChange={(ev) => setQ(ev.target.value)} />
            <div className="pills">{(["all", "unpaid", "paid", ...(claims.length ? ["claims"] : [])] as Filter[]).map((k) => (
              <button key={k} className={"pill" + (f === k ? " on" : "")} onClick={() => setF(k)}>{k === "all" ? t("All", "Todas") : k === "unpaid" ? t("Unpaid", "Sin pagar") : k === "paid" ? t("Paid", "Pagadas") : t(`To confirm (${claims.length})`, `Por confirmar (${claims.length})`)}</button>))}</div>
          </div>
          {list.length === 0 ? <div className="card"><p className="muted" style={{ padding: 24 }}>{t("No invoices match this search.", "Ninguna factura coincide con la búsqueda.")}</p></div> : (
            <>
              <div className="card only-desk tbl-wrap">
                <table className="tbl iv-tbl">
                  <thead><tr><th>#</th><th>{t("Client", "Cliente")}</th><th>{t("Estimate", "Presupuesto")}</th><th>{t("Type", "Tipo")}</th><th>{t("Date", "Fecha")}</th><th className="r">{t("Amount", "Monto")}</th><th>{t("Status", "Estado")}</th><th /></tr></thead>
                  <tbody>{list.map((v) => (<Fragment key={v.id}>
                    <tr className="click" onClick={() => setOpen({ id: v.id, start: "doc" })}>
                      <td><b className="num">{v.number}</b></td>
                      <td><b>{nameOf(v)}</b></td>
                      <td><Link to={`/estimates/${v.estId}`} onClick={(ev) => ev.stopPropagation()}>{v.estNumber || estOf(v)?.number || "—"}</Link></td>
                      <td>{invKindText(v, es)}</td>
                      <td>{fmtDate(v.date, lang)}{isPaid(v) && v.paidDate && <div className="muted" style={{ fontSize: 12.5 }}>{t("paid ", "pagada ")}{fmtDate(v.paidDate, lang)}</div>}</td>
                      <td className="r"><b>{money(v.amount)}</b></td>
                      <td>{badge(v)}</td>
                      <td className="r">{actions(v)}</td>
                    </tr>
                    {hasClaim(v) && <tr className="iv-claim-row"><td colSpan={8}>{claimBar(v)}</td></tr>}
                  </Fragment>))}</tbody>
                </table>
              </div>
              <div className="cards only-phone">{list.map((v) => (
                <div key={v.id} className="ec iv-card" onClick={() => setOpen({ id: v.id, start: "doc" })}>
                  <div className="l1"><span>{nameOf(v)}</span><span>{money(v.amount)}</span></div>
                  <div className="l2"><span>{v.number} · {invKindText(v, es)} · {fmtDate(v.date, lang)}</span>{badge(v)}</div>
                  <div className="l2"><Link to={`/estimates/${v.estId}`} onClick={(ev) => ev.stopPropagation()}>{v.estNumber || estOf(v)?.number || "—"}</Link></div>
                  {claimBar(v)}
                  {actions(v)}
                </div>))}</div>
            </>
          )}
        </>
      )}
      {openInv && open && <InvoicePreview v={openInv} e={estOf(openInv)} client={nameOf(openInv)} busy={busy} start={open.start} onClose={() => setOpen(null)}
        onToggle={(method) => toggle(openInv, method)} onDismissClaim={() => run(async () => { await ops.dismissClaim(openInv); })} onDelete={() => del(openInv)} />}
    </div>
  );
}
