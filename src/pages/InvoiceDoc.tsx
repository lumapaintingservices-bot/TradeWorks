import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useEstimates, useInvoices, useSettings } from "../data/hooks";
import { fmtDate } from "../lib/format";
import { asInv, invKindLabel, invoiceSheetData, isPaid } from "../lib/invoices";
import { money, num } from "../lib/money";
import { nl2list, scopeGroups } from "../lib/scope";
import "./InvoiceDoc.css";
import { safeImgSrc } from "../lib/safeUrl";

/** Client-facing invoice: always light, in the contractor's brand color, printable to PDF. Route: /invoices/:id/doc */
export default function InvoiceDoc() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const { company } = useAuth();
  const { rows: invs, loading } = useInvoices();
  const { rows: ests } = useEstimates();
  const { settings: s } = useSettings();
  const raw = invs.find((r) => r.id === id);
  const v = raw ? asInv(raw) : undefined;
  const e = v && ests.find((r) => r.id === v.estId);
  const [lang, setLang] = useState<"en" | "es">((sp.get("lang") as "en" | "es") || "en");
  useEffect(() => { if (e && !sp.get("lang")) setLang(e.docLang || "en"); }, [e?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.documentElement.classList.remove("tw-dark"); }, []);
  if (!company) return null;
  const es = lang === "es", T = (a: string, b: string) => (es ? b : a);
  if (!v || !e) return <div className="idoc-wrap"><p className="idoc-none">{loading ? "" : T("Invoice not found, or its estimate was deleted.", "No se encontró la factura, o se borró su presupuesto.")}</p></div>;

  const compact = sp.get("compact") === "1";
  const d = invoiceSheetData(v, e, s, lang);
  const paid = isPaid(v);
  const spec = es ? e.specEs || e.spec : e.spec || e.specEs;
  const scope = v.kind === "co" ? [] : scopeGroups(nl2list(es ? e.scopeEs : e.scopeEn));
  const terms = v.kind === "co" ? [] : nl2list(es ? e.termsEs : e.termsEn);
  const notes = e.notes;

  return (
    <div className="idoc-wrap" style={{ ["--brand" as string]: company.brandColor || "#EF6A2C" }}>
      <div className="idoc-bar no-print">
        <div className="seg">{(["en", "es"] as const).map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
        <label className="chk"><input type="checkbox" checked={compact} onChange={(ev) => setSp((p) => { const n = new URLSearchParams(p); ev.target.checked ? n.set("compact", "1") : n.delete("compact"); return n; }, { replace: true })} />{T("Compact", "Compacto")}</label>
        <button className="btn pri" onClick={() => window.print()}>{T("Print / Save PDF", "Imprimir / Guardar PDF")}</button>
      </div>
      <article className={"idoc" + (compact ? " compact" : "")}>
        <header>
          <div className="who">
            {company.logoUrl ? <img src={company.logoUrl} alt="" /> : <span className="mk">{company.name.slice(0, 2).toUpperCase()}</span>}
            <div><h1>{company.name}</h1><p>{[company.phone, company.email, company.website].filter(Boolean).join(" · ")}</p>{company.area && <p>{company.area}</p>}</div>
          </div>
          <div className="meta">
            <h2>{T("INVOICE", "FACTURA")}</h2>
            <p><b>{v.number}</b></p>
            <p>{invKindLabel(v, es)}{v.kind !== "co" && v.percent ? ` · ${num(v.percent)}%` : ""}</p>
            <p>{T("Date", "Fecha")}: <b>{fmtDate(v.date, lang)}</b></p>
            <p>{T("Ref", "Ref")}: <b>{v.estNumber || e.number}</b></p>
            {paid && <span className="stamp">{T("PAID", "PAGADA")}{v.paidDate ? ` · ${fmtDate(v.paidDate, lang)}` : ""}</span>}
          </div>
        </header>
        <section className="two">
          <div><h3>{T("PREPARED FOR", "PREPARADO PARA")}</h3><p><b>{e.clientName || "—"}</b></p><p>{e.address}</p><p>{[e.phone, e.email].filter(Boolean).join(" · ")}</p></div>
          <div><h3>{T("PROJECT", "PROYECTO")}</h3>{spec && <p>{spec}</p>}{company.area && <p className="muted">{company.area}</p>}</div>
        </section>

        {v.kind === "co" ? (
          <table>
            <thead><tr><th>{T("Description", "Descripción")}</th><th className="r">{T("Amount", "Importe")}</th></tr></thead>
            <tbody><tr><td><b>{d.coDesc}</b>{d.coApproved && <div className="sub">{T("Approved by ", "Aprobado por ")}{d.coApproved.name}{d.coApproved.date ? `, ${fmtDate(d.coApproved.date, lang)}` : ""}</div>}</td><td className="r">{money(v.amount)}</td></tr></tbody>
          </table>
        ) : (
          <table>
            <thead><tr><th>{T("Description", "Descripción")}</th><th className="r">{T("Qty", "Cant.")}</th><th className="r">{T("Rate", "Precio")}</th><th className="r">{T("Amount", "Importe")}</th></tr></thead>
            <tbody>{d.lines.length === 0 ? <tr><td colSpan={4} className="sub">—</td></tr>
              : d.lines.map((l, i) => <tr key={i}><td>{l.label}</td><td className="r">{l.qty} {l.unit}</td><td className="r">{money(l.rate)}</td><td className="r">{money(l.amount)}</td></tr>)}</tbody>
          </table>
        )}

        <div className="totals">
          {d.totals.map((r, i) => (
            <div key={i} className={r.tone || ""}><span>{r.label}</span><b>{r.amount === undefined ? "" : r.amount < 0 ? "− " + money(-r.amount) : money(r.amount)}</b></div>))}
        </div>

        <section className="pay">
          <h3>{T("HOW TO PAY", "CÓMO PAGAR")}</h3>
          {s.payZelle ? (
            <div className="zelle">
              <div><b>Zelle</b>{s.payZelleName && <small>{s.payZelleName}</small>}<span>{s.payZelle}</span></div>
              <b className="due">{money(v.amount)}</b>
            </div>
          ) : <p className="muted">{T("Payment details are on your estimate, or ask us.", "Los datos de pago están en su presupuesto, o pregúntenos.")}</p>}
          {s.payNote && <p className="note">{s.payNote}</p>}
          {paid && <p className="paidnote">✓ {T("Payment received. Thank you!", "Pago recibido. ¡Gracias!")}</p>}
        </section>

        {scope.length > 0 && <section><h3>{T("SCOPE OF WORK", "ALCANCE DEL TRABAJO")}</h3>
          {scope.map((g, i) => <div key={i} className="grp">{g.head && <h4>{g.head}</h4>}<ul>{g.items.map((x, j) => <li key={j}>{x}</li>)}</ul></div>)}</section>}
        {terms.length > 0 && <section><h3>{T("TERMS", "TÉRMINOS")}</h3><ul>{terms.map((x, i) => <li key={i}>{x}</li>)}</ul></section>}
        {notes && v.kind !== "co" && <section><h3>{T("NOTES", "NOTAS")}</h3><p>{notes}</p></section>}
        {safeImgSrc(d.coApproved?.img) && <section className="sign"><div><img className="sig" src={safeImgSrc(d.coApproved?.img)} alt="" /><span>{T("Accepted", "Aceptado")} — {d.coApproved?.name}</span></div><div><b className="sd">{fmtDate(d.coApproved?.date, lang)}</b><span>{T("Date", "Fecha")}</span></div></section>}
        <footer><span>{[company.name, company.phone, company.website].filter(Boolean).join(" · ")}</span><span>{T("Thank you for your business.", "Gracias por su preferencia.")}</span></footer>
      </article>
    </div>
  );
}
