import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { InvoicePaper } from "./invoices/InvoicePaper";
import { useEstimates, useInvoices } from "../data/hooks";
import { asInv } from "../lib/invoices";
import "./estimate/doc.css";

/** Client-facing invoice: always light, in the CLIENT's language and the contractor's branding, printable to PDF. Route: /invoices/:id/doc */
export default function InvoiceDoc() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const { company } = useAuth();
  const { rows: invs, loading } = useInvoices();
  const { rows: ests } = useEstimates();
  const raw = invs.find((r) => r.id === id);
  const v = raw ? asInv(raw) : undefined;
  const e = v && ests.find((r) => r.id === v.estId);
  const [pick, setPick] = useState<"en" | "es" | "">("");
  useEffect(() => { document.documentElement.classList.remove("tw-dark"); }, []);
  if (!company) return null;

  const q = sp.get("lang");
  const lang: "en" | "es" = pick || (q === "es" || q === "en" ? q : "") || e?.docLang || "en";
  const T = (a: string, b: string) => (lang === "es" ? b : a);
  if (!v || !e) return <div className="doc-wrap"><p style={{ maxWidth: 820, margin: "60px auto", textAlign: "center", color: "#6B7280" }}>{loading ? "" : T("Invoice not found, or its estimate was deleted.", "No se encontró la factura, o se borró su presupuesto.")}</p></div>;

  const compact = sp.get("compact") === "1";
  return (
    <div className="doc-wrap">
      <div className="docbar no-print"><div className="docbar-in">
        <div className="seg">{(["en", "es"] as const).map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setPick(l)}>{l === "en" ? "English" : "Español"}</button>)}</div>
        <span className="num">{v.number}</span>
        <label className="chk"><input type="checkbox" checked={compact} onChange={(ev) => setSp((p) => { const n = new URLSearchParams(p); ev.target.checked ? n.set("compact", "1") : n.delete("compact"); return n; }, { replace: true })} />{T("Compact (fit one page)", "Compacto (una página)")}</label>
        <span className="sp" />
        <button className="btn pri" onClick={() => window.print()}>{T("Print / Save as PDF", "Imprimir / Guardar PDF")}</button>
      </div></div>
      <InvoicePaper v={v} e={e} lang={lang} compact={compact} />
    </div>
  );
}
