import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useEstimates, useSettings } from "../../data/hooks";
import { crewDays, checklistFor, itemsOfDay, shoppingText, workOrderRows, workSchedule } from "../../lib/jobday";
import { fmtDate } from "../../lib/format";
import { num } from "../../lib/money";
import { applyTheme, useUi } from "../../store/ui";
import "./doc.css";
import "./jobday.css";

/** Crew-facing work order: no prices. Always light, in the contractor's brand color, printable to PDF. */
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
  const cl = useMemo(() => (e ? checklistFor(e, lang) : null), [e, lang]);
  if (!e || !company || !cl) return <div className="doc-wrap"><p style={{ maxWidth: 820, margin: "40px auto" }}>{loading ? "" : T("Estimate not found.", "No se encontró el presupuesto.")} {!loading && <Link to="/estimates">{T("All estimates", "Todos los presupuestos")}</Link>}</p></div>;

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
    <div className="doc-wrap" style={{ ["--brand" as string]: company.brandColor || "#EF6A2C" }}>
      <div className="doc-bar wo-bar no-print">
        <Link className="btn" to={`/estimates/${e.id}`}>← {T("Back", "Atrás")}</Link>
        <div className="seg">{(["en", "es"] as const).map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
        <label className="chk"><input type="checkbox" checked={showHours} onChange={(ev) => setShowHours(ev.target.checked)} />{T("Show hours", "Mostrar horas")}</label>
        {photos.length > 0 && <label className="chk"><input type="checkbox" checked={showPhotos} onChange={(ev) => setShowPhotos(ev.target.checked)} />{T("Show photos", "Mostrar fotos")}</label>}
        <span className="grow" />
        <button className="btn pri" onClick={() => window.print()}>{T("Print / Save PDF", "Imprimir / Guardar PDF")}</button>
      </div>

      <article className="doc wo">
        <header>
          <div className="who">
            {company.logoUrl ? <img src={company.logoUrl} alt="" /> : <span className="mk">{company.name.slice(0, 2).toUpperCase()}</span>}
            <div><h1>{company.name}</h1><p>{company.phone}</p></div>
          </div>
          <div className="meta"><h2>{T("WORK ORDER", "ORDEN DE TRABAJO")}</h2><p><b>{e.number}</b></p>
            <p>{T("Start", "Inicio")}: <b>{sch.start ? fmtDate(sch.start, lang) : "—"}</b></p>
            {sch.end && <p>{T("Ends", "Termina")}: <b>{fmtDate(sch.end, lang)}</b></p>}
            <p>{T("Days on site", "Días en el sitio")}: <b>{Math.max(1, num(e.days) || 1)}</b></p></div>
        </header>

        <section className="wo-cols">
          <div><h3>{T("CLIENT", "CLIENTE")}</h3><p><b>{e.clientName || "—"}</b></p>
            {e.address && <p><a href={"https://maps.google.com/?q=" + encodeURIComponent(e.address)} target="_blank" rel="noreferrer">{e.address}</a></p>}
            {e.phone && <p>{tel ? <a className="wo-tel" href={"tel:" + tel}>{e.phone}</a> : e.phone}</p>}</div>
          <div><h3>{T("PRODUCT AND FINISH", "PRODUCTO Y ACABADO")}</h3>{spec ? <p>{spec}</p> : <p className="muted">—</p>}
            {showHours && <p className="muted">{T("Hours assigned", "Horas asignadas")}: <b>{Math.round(wo.total * 10) / 10} h</b> · {T("days with ", "días con ")}{Math.max(1, num(s.production.crewSize))}{T(" people", " personas")}: <b>{crewDays(wo.total, s)}</b></p>}</div>
        </section>

        <section className="wo-sec">
          <table>
            <thead><tr><th>{T("Work", "Trabajo")}</th><th className="r">{T("Qty", "Cant.")}</th>{showHours && <th className="r">{T("Hours", "Horas")}</th>}</tr></thead>
            <tbody>{wo.rows.map((r, i) => (
              <tr key={i}><td>{r.what}{r.sub && <span className="wo-sub">{r.sub}</span>}</td><td className="r">{r.qty}</td>{showHours && <td className="r">{r.hrs ? r.hrs.toFixed(1) + " h" : ""}</td>}</tr>))}</tbody>
          </table>
        </section>

        <section className="wo-sec">
          <h3>{T("CHECKLIST", "LISTA DE TAREAS")}</h3>
          {Array.from({ length: cl.days }, (_, i) => i + 1).map((d) => {
            const its = itemsOfDay(cl, d);
            if (!its.length) return null;
            return (
              <div key={d}>
                <div className="wo-day">{T("Day", "Día")} {d}{cl.titles[d] ? <> · <span>{cl.titles[d]}</span></> : null}</div>
                <ul className="wo-ck">{its.map((x) => { const on = !!(e.check || {})[x.key]; return (
                  <li key={x.key} className={on ? "on" : ""}><span className="wo-box" aria-hidden>{on ? "✓" : ""}</span><span>{x.text}</span></li>); })}</ul>
              </div>);
          })}
        </section>

        {colors.length > 0 && (
          <section className="wo-sec"><h3>{T("COLORS & PRODUCTS", "COLORES Y PRODUCTOS")}</h3>
            <div className="wo-scroll"><table className="wo-colors">
              <thead><tr><th>{T("Area", "Área")}</th><th>{T("Brand / product", "Marca / producto")}</th><th>{T("Color", "Color")}</th><th>{T("Sheen", "Brillo")}</th><th>{T("Code / lot", "Código / lote")}</th></tr></thead>
              <tbody>{colors.map((c, i) => <tr key={i}><td>{c.area}</td><td>{c.brand}</td><td>{c.color}</td><td>{c.sheen}</td><td>{c.code}</td></tr>)}</tbody>
            </table></div></section>)}

        {hasShop && <section className="wo-sec"><h3>{T("SHOPPING LIST", "LISTA DE COMPRAS")}</h3><pre>{shop}</pre></section>}

        {e.notes && <section className="wo-sec"><h3>{T("JOB NOTES", "NOTAS DEL TRABAJO")}</h3><p className="wo-notes">{e.notes}</p></section>}

        <section className="wo-sec">
          <h3>{T("NOTES FOR THE CREW", "NOTAS PARA LA CUADRILLA")}</h3>
          <textarea className="no-print" rows={3} value={crew} onChange={(ev) => editNotes(ev.target.value)}
            placeholder={T("Gate code, where to park, dog in the yard…", "Código del portón, dónde parquear, perro en el patio…")} />
          <p className="wo-notes print-only">{crew}</p>
        </section>

        {showPhotos && photos.length > 0 && (
          <section className="wo-sec"><h3>{T("PHOTOS", "FOTOS")}</h3>
            <div className="wo-photos">{photos.map((p) => { const cap = [kind[p.kind] || "", p.caption].filter(Boolean).join(" — "); return (
              <figure key={p.id}><img src={p.url} alt={cap} />{cap && <figcaption>{cap}</figcaption>}</figure>); })}</div></section>)}
      </article>
    </div>
  );
}
