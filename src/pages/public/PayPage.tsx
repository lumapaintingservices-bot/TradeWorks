import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { patchTop, subscribeTop } from "../../data/repo";
import { fmtDate } from "../../lib/format";
import { money } from "../../lib/money";
import type { PayDoc, PayModel } from "../../lib/paylink";
import { mailtoHref, safeImgSrc, safeUrl } from "../../lib/safeUrl";
import { PayMethods } from "./PayMethods";
import { TwMark } from "./PortalPage";
import "./portal.css";

const now = () => new Date().toISOString();
const initialsOf = (s: string) => { const w = String(s || "").trim().split(/\s+/).filter(Boolean); return ((w[0] || "?").charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : "")).toUpperCase(); };

/** Public invoice payment page: /pay/:token. Same look as the client link (portal.css), contractor's branding, EN/ES. The client may only say "I paid". */
export default function PayPage() {
  const { token = "" } = useParams();
  const [doc, setDoc] = useState<PayDoc | null | undefined>(undefined);
  const [lang, setLang] = useState<"en" | "es" | "">("");
  const [toast, setToast] = useState("");
  const [ctaHide, setCtaHide] = useState(true);
  const viewed = useRef(false);

  useEffect(() => { document.documentElement.classList.remove("tw-dark"); }, []);
  useEffect(() => subscribeTop<PayDoc>("paylink", token, setDoc), [token]);
  useEffect(() => { // one "opened" mark per visit
    if (doc && !viewed.current) { viewed.current = true; patchTop("paylink", token, { append: { "client.views": now() } }).catch(() => {}); }
  }, [doc, token]);

  const m = useMemo<PayModel | null>(() => { try { return doc?.data ? (JSON.parse(doc.data) as PayModel) : null; } catch { return null; } }, [doc?.data]);
  const claim = doc?.client?.paid;
  const open = !!m && !m.inv.paid && !claim && m.methods.length > 0;
  useEffect(() => { if (m) document.title = `${m.business.name} — ${m.inv.number}`; }, [m]);
  // the bottom "Pay now" bar shows until the payment part is on screen
  useEffect(() => {
    if (!open) { setCtaHide(true); return; }
    const upd = () => { const sec = document.getElementById("ptPaySec"); if (sec) { const r = sec.getBoundingClientRect(); setCtaHide((r.top < window.innerHeight - 40 && r.bottom > 0) || window.scrollY < 80); } };
    let tick = false;
    const on = () => { if (!tick) { tick = true; requestAnimationFrame(() => { tick = false; upd(); }); } };
    window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    const t = setTimeout(upd, 60);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); clearTimeout(t); };
  }, [open]);

  if (doc === undefined) return <div className="pt-msg-page" />;
  if (!doc || !m) return <div className="pt-msg-page"><h2>This link isn't active</h2><p>Este enlace no está activo</p></div>;

  const L = (lang || m.lang || "en") as "en" | "es", es = L === "es", T = (a: string, b: string) => (es ? b : a);
  const b = m.business, v = m.inv, d = es ? m.sheet.es : m.sheet.en;
  const say = (x: string) => { setToast(x); setTimeout(() => setToast(""), 2600); };
  const memo = `${T("Invoice", "Factura")} ${v.number}`;
  const wa = (b.phone || "").replace(/\D/g, "");
  const nm = String(b.name || ""), parts = nm.split(" "), short = parts[0], rest = parts.slice(1).join(" ");
  const brand = /^#[0-9a-f]{6}$/i.test(b.brandColor || "") ? b.brandColor : "";
  const style = (brand && brand.toLowerCase() !== "#ef6a2c" ? { "--acc": brand, "--acc-soft": `color-mix(in srgb, ${brand} 12%, #fff)`, "--acc-ink": `color-mix(in srgb, ${brand} 78%, #000)` } : {}) as React.CSSProperties;
  const reviews = safeUrl(m.reviewUrl);
  const go = () => document.getElementById("ptPaySec")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="pt" style={style}>
      <div className={"pt-cta" + (ctaHide ? " hide" : "")}><div><span>{T("Amount due", "Monto a pagar")}</span><b>{money(v.amount)}</b></div><button className="btn pri" onClick={go}>{T("Pay now", "Pagar ahora")}</button></div>
      <div className="pt-in">
        <section className="pt-hero">
          <div className="pt-cv-top">
            {safeImgSrc(b.logoUrl) && <img src={safeImgSrc(b.logoUrl)} alt="" />}
            <span className="pt-cv-logo">{short}</span>{rest && <span className="pt-cv-tag">{rest}</span>}
            <div className="pt-lang">{(["en", "es"] as const).map((l) => <button key={l} className={L === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
          </div>
          <div className="pt-client"><div className="pt-av">{initialsOf(v.clientName)}</div>
            <div style={{ minWidth: 0 }}><div className="pt-k">{T("Invoice for", "Factura para")}</div><h1>{v.clientName || ""}</h1>
              {v.address && <div className="pt-addr">{v.address}</div>}
              <div className="pt-meta">{v.number} · {fmtDate(v.date, L)}{v.estNumber ? ` · ${T("Ref", "Ref")} ${v.estNumber}` : ""}</div></div></div>
          <div className="pt-kpis">
            <div><span>{v.paid ? T("Paid", "Pagado") : T("Amount due", "Monto a pagar")}</span><b>{money(v.amount)}</b></div>
            <div><span>{T("Invoice", "Factura")}</span><b className="pt-kd">{es ? v.titleEs : v.titleEn}</b></div>
          </div>
          {v.paid ? <div className="pt-status ok">✓ {T("Paid", "Pagada")}{v.paidDate ? ` · ${fmtDate(v.paidDate, L)}` : ""} — {T("thank you!", "¡gracias!")}</div>
            : claim ? <div className="pt-status ok">✓ {T(`You told us you paid by ${claim.method}.`, `Nos dijo que pagó por ${claim.method}.`)}</div> : null}
        </section>

        <section className="pt-sec"><h2>{T("Details", "Detalle")}</h2>
          <div className="pt-lines">
            {d.coDesc ? <div className="pt-line"><span>{d.coDesc}</span><span className="num">{money(v.amount)}</span></div>
              : d.lines.map((l, i) => <div className="pt-line" key={i}><span>{l.label}<small>{l.qty}{l.unit ? " " + l.unit : ""} × {money(l.rate)}</small></span><span className="num">{money(l.amount)}</span></div>)}
          </div>
          <div className="pt-tot">{d.totals.map((r, i) => (
            <div key={i} className={"pt-line" + (r.tone === "due" || r.tone === "grand" ? " pt-big" : r.tone === "credit" ? " pt-credit" : "")}>
              <span>{r.label}</span><span className="num">{r.amount === undefined ? "" : r.amount < 0 ? "−" + money(-r.amount) : money(r.amount)}</span></div>))}</div>
        </section>

        {!v.paid && <section className="pt-sec" id="ptPaySec"><h2>{T("How to pay", "Cómo pagar")}</h2>
          {m.methods.length === 0 ? <p className="pt-hint">{T("We'll send you the payment details.", "Le enviaremos los datos de pago.")}</p> : <>
            <p className="pt-hint">{T(`Choose any option. Please add “${memo}” as the memo.`, `Escoja cualquier opción. Ponga “${memo}” como nota, por favor.`)}</p>
            <div className="pt-amt"><span>{T("Amount due", "Monto a pagar")}</span><b className="num">{money(v.amount)}</b></div>
            <PayMethods methods={m.methods} amount={v.amount} memo={memo} es={es} claimed={claim?.method} say={say}
              onClaim={(method, note) => patchTop("paylink", token, { set: { "client.paid": { method, at: now(), note } } })} />
            {m.note && <p className="pt-hint" style={{ marginTop: 12 }}>{m.note}</p>}
          </>}
        </section>}

        <footer className="pt-foot">
          {b.phone && <><a className="btn" href={`tel:${wa}`}>{T("Call", "Llamar")}</a><a className="btn wa" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}
          {mailtoHref(b.email) && <a className="btn" href={mailtoHref(b.email)}>{b.email}</a>}
          {v.paid && reviews && <a className="btn" href={reviews} target="_blank" rel="noopener noreferrer">★ {T("Leave us a review", "Déjenos una reseña")} ↗</a>}
          <div className="pt-fine">{b.name || ""}{b.area ? ` · ${b.area}` : ""}</div><div className="tw-pow"><TwMark />Powered by TradeWorks</div>
        </footer>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
