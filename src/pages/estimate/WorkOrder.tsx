import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useEstimates, useSettings } from "../../data/hooks";
import { SheetHead, sheetStyle } from "../../components/DocSheet";
import { crewDays, shoppingText, workOrderRows, workSchedule } from "../../lib/jobday";
import { fmtDate } from "../../lib/format";
import { num } from "../../lib/money";
import { isScopeHead, nl2list } from "../../lib/scope";
import { applyTheme, useUi } from "../../store/ui";
import "../../components/DocSheet.css";
import "./doc.css";
import "./jobday.css";

/**
 * Crew-facing work order: no prices. Same sheet as the client documents (components/DocSheet.css): always light, black and
 * white unless the contractor picked a brand color, printable to PDF. The checklist is the estimate's own scope, as written.
 */
export default function WorkOrder() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { company } = useAuth();
  const { rows, loading, save } = useEstimates();
  const { settings: s } = useSettings();
  const uiLang = useUi((x) => x.lang);
  const e = rows.find((r) => r.id === id);
  const [lang, setLang] = useState<"en" | "es">(sp.get("lang") === "es" ? "es" : sp.get("lang") === "en" ? "en" : uiLang);
  const [showHours, setShowHours] = useState(true);
  const [showPhotos, setShowPhotos] = useState(true);
  const [notes, setNotes] = useState<string | null>(null); // crew notes typed here, saved after a pause
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const eRef = useRef(e);
  eRef.current = e;

  useEffect(() => { // documents are always light; give the app its theme back when leaving
    document.documentElement.classList.remove("tw-dark");
    return () => applyTheme(useUi.getState().theme);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const T = (a: string, b: string) => (lang === "es" ? b : a);
  const scope = useMemo(() => (e ? nl2list(lang === "es" ? e.scopeEs || e.scopeEn : e.scopeEn || e.scopeEs) : []), [e, lang]);
  if (!e || !company) return <div className="doc-wrap"><p style={{ maxWidth: 820, margin: "40px auto" }}>{loading ? "" : T("Estimate not found.", "No se encontró el presupuesto.")} {!loading && <Link to="/estimates">{T("All estimates", "Todos los presupuestos")}</Link>}</p></div>;

  const es = lang === "es";
  const wo = workOrderRows(e, s, lang);
  const sch = workSchedule(e);
  const spec = es ? e.specEs || e.spec : e.spec || e.specEs;
  const shop = shoppingText(e, s, lang);
  const hasShop = shop.split("\n").length > 1;
  const colors = (e.colors || []).filter((c) => c.area || c.brand || c.color || c.sheen || c.code);
  const photos = (e.photos || []).filter((p) => p.url);
  const kind: Record<string, string> = { before: T("Before", "Antes"), after: T("After", "Después"), detail: T("Detail", "Detalle") };
  const crew = notes ?? e.crewNotes ?? "";
  const editNotes = (v: string) => {
    setNotes(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { const cur = eRef.current; if (cur) save({ ...cur, crewNotes: v }); }, 600);
  };
  const tel = (e.phone || "").replace(/[^\d+]/g, "");

  return (
    <div className="doc-wrap">
      <div className="docbar no-print"><div className="docbar-in">
        <Link className="btn" to={`/estimates/${e.id}`}>← {T("Back", "Atrás")}</Link>
        <div className="seg">{(["en", "es"] as const).map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l === "en" ? "English" : "Español"}</button>)}</div>
        <span className="num">{e.number}</span>
        <label className="chk"><input type="checkbox" checked={showHours} onChange={(ev) => setShowHours(ev.target.checked)} />{T("Show hours", "Mostrar horas")}</label>
        {photos.length > 0 && <label className="chk"><input type="checkbox" checked={showPhotos} onChange={(ev) => setShowPhotos(ev.target.checked)} />{T("Show photos", "Mostrar fotos")}</label>}
        <span className="sp" />
        <button className="btn pri" onClick={() => window.print()}>{T("Print / Save PDF", "Imprimir / Guardar PDF")}</button>
      </div></div>

      <div className="sheet wo" style={sheetStyle(company.brandColor)}>
        <SheetHead biz={company} docType={T("Work order", "Orden de trabajo")} docNo={e.number} meta={<>
          <div style={{ marginTop: 6 }}>{T("Start", "Inicio")}: <b>{sch.start ? fmtDate(sch.start, lang) : "—"}</b></div>
          {sch.end && <div>{T("Ends", "Termina")}: <b>{fmtDate(sch.end, lang)}</b></div>}
          <div>{T("Days on site", "Días en el sitio")}: <b>{Math.max(1, num(e.days) || 1)}</b></div></>} />

        <div className="sheet-grid">
          <div><div className="sheet-lbl">{T("Client", "Cliente")}</div><div className="sheet-strong">{e.clientName || "—"}</div>
            {e.address && <><a className="wo-link" href={"https://maps.google.com/?q=" + encodeURIComponent(e.address)} target="_blank" rel="noreferrer">{e.address}</a><br /></>}
            {e.phone && (tel ? <a className="wo-link" href={"tel:" + tel}>{e.phone}</a> : e.phone)}</div>
          <div><div className="sheet-lbl">{T("Product and finish", "Producto y acabado")}</div><div className="sheet-strong">{spec || "—"}</div>
            {showHours && <>{T("Hours assigned", "Horas asignadas")}: <b>{Math.round(wo.total * 10) / 10} h</b> · {T("days with ", "días con ")}{Math.max(1, num(s.production.crewSize))}{T(" people", " personas")}: <b>{crewDays(wo.total, s)}</b></>}</div>
        </div>

        <table className="doct">
          <thead><tr><th>{T("Work", "Trabajo")}</th><th className="r">{T("Qty", "Cant.")}</th>{showHours && <th className="r">{T("Hours", "Horas")}</th>}</tr></thead>
          <tbody>{wo.rows.map((r, i) => (
            <tr key={i}><td><div className="doct-desc">{r.what}</div>{r.sub && <div className="doct-sub">{r.sub}</div>}</td>
              <td className="n r">{r.qty}</td>{showHours && <td className="n r">{r.hrs ? r.hrs.toFixed(1) + " h" : ""}</td>}</tr>))}</tbody>
        </table>

        {scope.length > 0 && <div className="doc-sec"><h4>{T("Checklist — scope of work", "Lista — alcance del trabajo")}</h4>
          <ul className="wo-ck">{scope.map((x, i) => isScopeHead(x)
            ? <li key={i} className="wo-ck-h">{String(x).replace(/:$/, "")}</li>
            : <li key={i}><span className="wo-box" aria-hidden />{x}</li>)}</ul></div>}

        {colors.length > 0 && <div className="doc-sec"><h4>{T("Colors & products", "Colores y productos")}</h4>
          <table className="doct mat">
            <thead><tr><th>{T("Area", "Área")}</th><th>{T("Brand / product", "Marca / producto")}</th><th>{T("Color", "Color")}</th><th>{T("Sheen", "Brillo")}</th><th>{T("Code / lot", "Código / lote")}</th></tr></thead>
            <tbody>{colors.map((c, i) => <tr key={i}><td>{c.area}</td><td>{c.brand}</td><td>{c.color}</td><td>{c.sheen}</td><td>{c.code}</td></tr>)}</tbody>
          </table></div>}

        {hasShop && <div className="doc-sec"><h4>{T("Shopping list", "Lista de compras")}</h4><div className="doc-notes">{shop}</div></div>}

        {e.notes && <div className="doc-sec"><h4>{T("Job notes", "Notas del trabajo")}</h4><div className="doc-notes">{e.notes}</div></div>}

        <div className="doc-sec"><h4>{T("Notes for the crew", "Notas para la cuadrilla")}</h4>
          <textarea className="no-print wo-notes-in" rows={3} value={crew} onChange={(ev) => editNotes(ev.target.value)}
            placeholder={T("Gate code, where to park, dog in the yard…", "Código del portón, dónde parquear, perro en el patio…")} />
          <div className="doc-notes print-only">{crew}</div></div>

        {showPhotos && photos.length > 0 && <div className="doc-sec doc-photos"><h4>{T("Photos", "Fotos")}</h4>
          <div className="pg">{photos.map((p) => { const cap = [kind[p.kind] || "", p.caption].filter(Boolean).join(" — "); return (
            <figure key={p.id}><img src={p.url} alt={cap} />{cap && <figcaption>{cap}</figcaption>}</figure>); })}</div></div>}
      </div>
    </div>
  );
}
