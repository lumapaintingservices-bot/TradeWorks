import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useEstimates, useSettings } from "../../data/hooks";
import { calcEstimate, servicesLine, jobTypeOf } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import { money, num } from "../../lib/money";
import { nl2list, scopeGroups } from "../../lib/scope";
import "./doc.css";

/** Client-facing estimate: always light, in the contractor's brand color, printable to PDF. */
export default function EstimateDoc() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const { company } = useAuth();
  const { rows } = useEstimates();
  const { settings: s } = useSettings();
  const e = rows.find((r) => r.id === id);
  const [lang, setLang] = useState<"en" | "es">((sp.get("lang") as "en" | "es") || "en");
  useEffect(() => { if (e && !sp.get("lang")) setLang(e.docLang || "en"); }, [e?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.documentElement.classList.remove("tw-dark"); }, []);
  if (!e || !company) return null;

  const es = lang === "es", T = (a: string, b: string) => (es ? b : a);
  const compact = sp.get("compact") === "1";
  const tot = calcEstimate(e, s);
  const cabLabel = (k: "door" | "drawer" | "frame" | "box") => {
    const p = s.pricing;
    if (k === "door") return es ? (e.frameMode === "included" ? p.doorLabelEs : p.doorLabelNoFrameEs) : e.frameMode === "included" ? p.doorLabel : p.doorLabelNoFrame;
    if (k === "drawer") return es ? p.drawerLabelEs : p.drawerLabel;
    if (k === "frame") return es ? p.frameLabelEs : p.frameLabel;
    return es ? p.boxLabelEs : p.boxLabel;
  };
  const hiddenAmt = tot.lines.filter((l) => l.kind === "custom" && (l.item as { hidden?: boolean }).hidden).reduce((a, l) => a + l.amount, 0);
  const rowsOut = tot.lines.filter((l) => !(l.kind === "custom" && (l.item as { hidden?: boolean }).hidden)).map((l) => {
    const it = l.item as { desc: string; descEs: string; unit?: string } | undefined;
    const label = it ? (es ? it.descEs || it.desc : it.desc || it.descEs) : cabLabel(l.kind as "door");
    return { label, qty: l.qty, unit: it?.unit || "", rate: l.rate, amount: l.amount };
  });
  const scope = scopeGroups(nl2list(es ? e.scopeEs : e.scopeEn));
  const terms = nl2list(es ? e.termsEs : e.termsEn);
  const spec = es ? e.specEs || e.spec : e.spec || e.specEs;
  const services = servicesLine(e, s, lang) || (jobTypeOf(e) === "cabinets" ? "" : "");
  const valid = e.validDays ? fmtDate(new Date(new Date(e.date + "T12:00:00").getTime() + e.validDays * 864e5).toISOString().slice(0, 10), lang) : "";

  return (
    <div className="doc-wrap" style={{ ["--brand" as string]: company.brandColor || "#EF6A2C" }}>
      <div className="doc-bar no-print">
        <div className="seg">{(["en", "es"] as const).map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
        <label className="chk"><input type="checkbox" checked={compact} onChange={(ev) => setSp((p) => { const n = new URLSearchParams(p); ev.target.checked ? n.set("compact", "1") : n.delete("compact"); return n; }, { replace: true })} />{T("Compact", "Compacto")}</label>
        <button className="btn pri" onClick={() => window.print()}>{T("Print / Save PDF", "Imprimir / Guardar PDF")}</button>
      </div>
      <article className={"doc" + (compact ? " compact" : "")}>
        <header>
          <div className="who">
            {company.logoUrl ? <img src={company.logoUrl} alt="" /> : <span className="mk">{company.name.slice(0, 2).toUpperCase()}</span>}
            <div><h1>{company.name}</h1><p>{[company.phone, company.email, company.website].filter(Boolean).join(" · ")}</p>{company.area && <p>{company.area}</p>}</div>
          </div>
          <div className="meta"><h2>{T("ESTIMATE", "PRESUPUESTO")}</h2><p><b>{e.number}</b></p><p>{fmtDate(e.date, lang)}</p>{valid && <p>{T("Valid until ", "Válido hasta ")}{valid}</p>}</div>
        </header>
        <section className="two">
          <div><h3>{T("PREPARED FOR", "PREPARADO PARA")}</h3><p><b>{e.clientName}</b></p><p>{e.address}</p><p>{e.phone}</p><p>{e.email}</p></div>
          <div><h3>{T("PROJECT", "PROYECTO")}</h3>{services && <p>{services}</p>}{spec && <p className="muted">{spec}</p>}
            {(num(e.doors) > 0 || num(e.drawers) > 0) && <p className="muted">{es ? `${num(e.doors)} puertas · ${num(e.drawers)} cajones` : `${num(e.doors)} doors · ${num(e.drawers)} drawers`}</p>}</div>
        </section>
        <table>
          <thead><tr><th>{T("Description", "Descripción")}</th><th className="r">{T("Qty", "Cant.")}</th><th className="r">{T("Rate", "Precio")}</th><th className="r">{T("Amount", "Importe")}</th></tr></thead>
          <tbody>
            {rowsOut.map((r, i) => <tr key={i}><td>{r.label}</td><td className="r">{Math.round(r.qty * 100) / 100} {r.unit}</td><td className="r">{money(r.rate)}</td><td className="r">{money(r.amount)}</td></tr>)}
            {hiddenAmt > 0 && <tr><td>{T("Additional work", "Trabajo adicional")}</td><td className="r">1</td><td className="r">{money(hiddenAmt)}</td><td className="r">{money(hiddenAmt)}</td></tr>}
            {tot.materialsAdded > 0 && <tr><td>{T("Materials", "Materiales")}</td><td className="r">1</td><td className="r">{money(tot.materialsAdded)}</td><td className="r">{money(tot.materialsAdded)}</td></tr>}
          </tbody>
        </table>
        <div className="totals">
          <div><span>{T("Subtotal", "Subtotal")}</span><b>{money(tot.subtotal)}</b></div>
          {tot.discAmt > 0 && <div><span>{es ? tot.discLabelEs : tot.discLabel}</span><b>− {money(tot.discAmt)}</b></div>}
          {tot.taxAmt > 0 && <div><span>{T("Tax", "Impuesto")} ({e.taxRate}%)</span><b>{money(tot.taxAmt)}</b></div>}
          <div className="grand"><span>{T("Total", "Total")}</span><b>{money(tot.total)}</b></div>
          {e.payPlanOn && e.payPlan.length >= 2
            ? e.payPlan.map((p, i) => <div key={i} className="dim"><span>{es ? p.labelEs || p.label : p.label} ({num(p.pct)}%)</span><b>{money(Math.round(tot.total * num(p.pct)) / 100)}</b></div>)
            : <><div className="dim"><span>{T(`Deposit (${tot.depositPct}%)`, `Depósito (${tot.depositPct}%)`)}</span><b>{money(tot.deposit)}</b></div><div className="dim"><span>{T("Balance", "Saldo")}</span><b>{money(tot.balance)}</b></div></>}
        </div>
        {tot.optional.length > 0 && <section><h3>{T("OPTIONAL ADD-ONS", "EXTRAS OPCIONALES")}</h3>
          {tot.optional.map((u) => <div className="opt" key={u.id}><span>{es ? u.descEs || u.desc : u.desc || u.descEs}</span><b>{money(num(u.qty) * num(u.rate))}</b></div>)}</section>}
        {scope.length > 0 && <section><h3>{T("SCOPE OF WORK", "ALCANCE DEL TRABAJO")}</h3>
          {scope.map((g, i) => <div key={i} className="grp">{g.head && <h4>{g.head}</h4>}<ul>{g.items.map((x, j) => <li key={j}>{x}</li>)}</ul></div>)}</section>}
        {terms.length > 0 && <section><h3>{T("TERMS", "TÉRMINOS")}</h3><ul>{terms.map((x, i) => <li key={i}>{x}</li>)}</ul></section>}
        {e.notes && <section><h3>{T("NOTES", "NOTAS")}</h3><p>{e.notes}</p></section>}
        <section className="sign"><div><span>{T("Client signature", "Firma del cliente")}</span></div><div><span>{T("Date", "Fecha")}</span></div></section>
      </article>
    </div>
  );
}
