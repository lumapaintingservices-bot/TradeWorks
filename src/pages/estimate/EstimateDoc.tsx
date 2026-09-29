import { payMethodsOf } from "../../lib/payMethods";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { EstimateSheet } from "../../components/DocSheet";
import { useEstimates, useSettings } from "../../data/hooks";
import { servicesLine } from "../../lib/estimate";
import "./doc.css";

/** Client-facing estimate: always light, in the CLIENT's language and the contractor's branding, printable to PDF. Route: /estimates/:id/doc */
export default function EstimateDoc() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const { company } = useAuth();
  const { rows } = useEstimates();
  const { settings: s } = useSettings();
  const e = rows.find((r) => r.id === id);
  const [pick, setPick] = useState<"en" | "es" | "">("");
  useEffect(() => { document.documentElement.classList.remove("tw-dark"); }, []);
  if (!e || !company) return null;

  const q = sp.get("lang");
  const lang: "en" | "es" = pick || (q === "es" || q === "en" ? q : "") || e.docLang || "en";
  const T = (a: string, b: string) => (lang === "es" ? b : a);
  const compact = sp.get("compact") === "1";
  return (
    <div className="doc-wrap">
      <div className="docbar no-print"><div className="docbar-in">
        <div className="seg">{(["en", "es"] as const).map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setPick(l)}>{l === "en" ? "English" : "Español"}</button>)}</div>
        <span className="num">{e.number}</span>
        <label className="chk"><input type="checkbox" checked={compact} onChange={(ev) => setSp((p) => { const n = new URLSearchParams(p); ev.target.checked ? n.set("compact", "1") : n.delete("compact"); return n; }, { replace: true })} />{T("Compact (fit one page)", "Compacto (una página)")}</label>
        <span className="sp" />
        <button className="btn pri" onClick={() => window.print()}>{T("Print / Save as PDF", "Imprimir / Guardar PDF")}</button>
      </div></div>
      <EstimateSheet e={e} s={s} lang={lang} compact={compact} biz={company} services={servicesLine(e, s, lang)}
        pay={{ zelle: s.payZelle || "", zelleName: s.payZelleName || "", note: s.payNote || "", methods: payMethodsOf(s.payMethods) }} />
    </div>
  );
}
