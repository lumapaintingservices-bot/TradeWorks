import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { patchTop, subscribeTop } from "../../data/repo";
import { fmtDate } from "../../lib/format";
import { money } from "../../lib/money";
import type { PayDoc, PayModel } from "../../lib/paylink";
import { isTrustedRedirect, mailtoHref, safeImgSrc, safeUrl } from "../../lib/safeUrl";
import { PayMethods } from "./PayMethods";
import { TwMark } from "./PortalPage";
import "./portal.css";
import { privacyPath } from "../../lib/legal";

const now = () => new Date().toISOString();
const initialsOf = (s: string) => { const w = String(s || "").trim().split(/\s+/).filter(Boolean); return ((w[0] || "?").charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : "")).toUpperCase(); };

/**
 * Public invoice payment page: /pay/:token. Same look as the client link (portal.css), contractor's branding, EN/ES.
 * The client may say "I paid", or pay by card / bank on Stripe when the company connected its Stripe account (m.online).
 */
export default function PayPage() {
  const { token = "" } = useParams();
  const [doc, setDoc] = useState<PayDoc | null | undefined>(undefined);
  const [lang, setLang] = useState<"en" | "es" | "">("");
  const [toast, setToast] = useState("");
  const [ctaHide, setCtaHide] = useState(true);
  const [paying, setPaying] = useState(false);
  const [params] = useSearchParams();
  const back0 = params.get("paid") === "1"; // just came back from the Stripe page
  const viewed = useRef(false);

  useEffect(() => { document.documentElement.classList.remove("tw-dark"); }, []);
  useEffect(() => subscribeTop<PayDoc>("paylink", token, setDoc), [token]);
  useEffect(() => { // one "opened" mark per visit
    if (doc && !viewed.current) { viewed.current = true; patchTop("paylink", token, { append: { "client.views": now() } }).catch(() => {}); }
  }, [doc, token]);

  const m = useMemo<PayModel | null>(() => { try { return doc?.data ? (JSON.parse(doc.data) as PayModel) : null; } catch { return null; } }, [doc?.data]);
  const claim = doc?.client?.paid;
  const online = doc?.online;
  const paidNow = !!m && (m.inv.paid || online?.status === "paid");
  const onItsWay = !paidNow && online?.status === "processing";
  const back = back0 && online?.status !== "failed";
  const open = !!m && !back && !paidNow && !onItsWay && !claim && (m.methods.length > 0 || !!m.online);
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
  const payOnline = async () => {
    setPaying(true);
    try {
      const res = await fetch("/api/pay/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, lang: L }) });
      const j = (await res.json().catch(() => ({}))) as { url?: string };
      if (!res.ok || !j.url || !isTrustedRedirect(j.url, location.origin)) throw new Error(String(res.status));
      location.assign(j.url); // Stripe's own secure page
    } catch {
      setPaying(false);
      say(T("We couldn't open the card payment. Please try again, or use another way to pay.", "No pudimos abrir el pago con tarjeta. Intente otra vez o use otra forma de pago."));
    }
  };

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
            <div><span>{paidNow ? T("Paid", "Pagado") : T("Amount due", "Monto a pagar")}</span><b>{money(v.amount)}</b></div>
            <div><span>{T("Invoice", "Factura")}</span><b className="pt-kd">{es ? v.titleEs : v.titleEn}</b></div>
          </div>
          {paidNow ? <div className="pt-status ok">✓ {T("Paid", "Pagada")}{v.paidDate ? ` · ${fmtDate(v.paidDate, L)}` : ""} — {T("thank you!", "¡gracias!")}</div>
            : onItsWay ? <div className="pt-status ok">✓ {T("Your bank payment is on its way. It usually takes 3–5 business days.", "Su pago bancario está en camino. Normalmente tarda de 3 a 5 días hábiles.")}</div>
            : back && !claim ? <div className="pt-status">{T("Thank you! We're confirming your payment…", "¡Gracias! Estamos confirmando su pago…")}</div>
            : claim ? <div className="pt-status ok">✓ {T(`You told us you paid by ${claim.method}.`, `Nos dijo que pagó por ${claim.method}.`)}</div> : null}
          {online?.status === "failed" && !paidNow && <div className="pt-status">{T("Your last bank payment didn't go through. Please try again or choose another way to pay.", "Su último pago bancario no se completó. Intente otra vez o escoja otra forma de pago.")}</div>}
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

        {!paidNow && !onItsWay && !back && <section className="pt-sec" id="ptPaySec"><h2>{T("How to pay", "Cómo pagar")}</h2>
          {m.online && !claim && <div className="pt-card">
            <button className="btn pri" disabled={paying} onClick={payOnline}>{paying ? T("Opening…", "Abriendo…") : T(`Pay ${money(v.amount)} by card or bank`, `Pagar ${money(v.amount)} con tarjeta o banco`)}</button>
            <small>🔒 {T("Secure payment on Stripe. The money goes straight to ", "Pago seguro con Stripe. El dinero va directo a ")}{b.name}.</small>
            {m.methods.length > 0 && <div className="pt-or"><span>{T("or pay another way", "o pague de otra forma")}</span></div>}
          </div>}
          {m.methods.length === 0 ? (!m.online && <p className="pt-hint">{T("We'll send you the payment details.", "Le enviaremos los datos de pago.")}</p>) : <>
            <p className="pt-hint">{T(`Choose any option. Please add “${memo}” as the memo.`, `Escoja cualquier opción. Ponga “${memo}” como nota, por favor.`)}</p>
            <div className="pt-amt"><span>{T("Amount due", "Monto a pagar")}</span><b className="num">{money(v.amount)}</b></div>
            <PayMethods methods={m.methods} amount={v.amount} memo={memo} es={es} claimed={claim?.method} say={say}
              onClaim={(method, note) => patchTop("paylink", token, { set: { "client.paid": { method, at: now(), note } } })} />
            {m.note && <p className="pt-hint" style={{ marginTop: 12 }}>{m.note}</p>}
          </>}
        </section>}

        {paidNow && m.refer && safeUrl(m.refer.url) && <section className="pt-sec" id="ptRefer"><h2>{T("Know someone who needs work done?", "¿Conoce a alguien que necesite un trabajo?")}</h2>
          <p className="pt-hint">{T(`Share your personal link. When your friend's project is done, you get ${m.refer.rewardEn}.`, `Comparta su link personal. Cuando el proyecto de su amigo termine, usted recibe ${m.refer.rewardEs}.`)}</p>
          <div className="pt-links">
            <a className="btn wa" href={`https://wa.me/?text=${encodeURIComponent(T(`I recommend ${b.name}: `, `Te recomiendo a ${b.name}: `) + m.refer.url)}`} target="_blank" rel="noopener noreferrer">{T("Share by WhatsApp", "Compartir por WhatsApp")}</a>
            <a className="btn" href={`sms:?&body=${encodeURIComponent(T(`I recommend ${b.name}: `, `Te recomiendo a ${b.name}: `) + m.refer.url)}`}>SMS</a>
            <button className="btn" onClick={() => { navigator.clipboard?.writeText(m.refer!.url).then(() => say(T("Link copied.", "Link copiado."))).catch(() => say(m.refer!.url)); }}>{T("Copy link", "Copiar link")}</button>
          </div>
        </section>}

        <footer className="pt-foot">
          {b.phone && <><a className="btn" href={`tel:${wa}`}>{T("Call", "Llamar")}</a><a className="btn wa" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}
          {mailtoHref(b.email) && <a className="btn" href={mailtoHref(b.email)}>{b.email}</a>}
          {paidNow && reviews && <a className="btn" href={reviews} target="_blank" rel="noopener noreferrer">★ {T("Leave us a review", "Déjenos una reseña")} ↗</a>}
          <div className="pt-fine">{b.name || ""}{b.area ? ` · ${b.area}` : ""}{doc.owner ? <> · <a className="pt-priv" href={privacyPath(doc.owner, L)} target="_blank" rel="noopener noreferrer">{T("Privacy policy", "Política de privacidad")}</a></> : null}</div><div className="tw-pow"><TwMark />Powered by TradeWorks</div>
        </footer>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
