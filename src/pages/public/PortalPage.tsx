import { payMethodsOf } from "../../lib/payMethods";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { EstimateSheet } from "../../components/DocSheet";
import { patchTop, subscribeTop } from "../../data/repo";
import { calcEstimate, payPlanOn } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import { planAmounts } from "../../lib/invoices";
import { money, num } from "../../lib/money";
import { clientTotal, effective, isOwnerSigned, isSelectable, modelSettings, type PortalDoc, type PortalModel } from "../../lib/portal";
import { mailtoHref, safeImgSrc, safeUrl } from "../../lib/safeUrl";
import { nl2list, scopeGroups } from "../../lib/scope";
import { SignaturePad, type PadHandle } from "../../ui/SignaturePad";
import "./portal.css";

/** Copy of the prototype's client page (PT). */
const PT = {
  en: {
    estFor: "Estimate for", total: "Total", signedBy: "Accepted by {0} on {1}", sentSign: "Signed. {0} will confirm shortly.",
    options: "Options you can add", optHint: "Tap an option to add or remove it. Your total updates right away.", optLocked: "This estimate is signed. To change an option, send us a message.",
    changes: "Changes to approve", coBtn: "Review and sign", coDone: "Signed, waiting for confirmation",
    summary: "Summary", subtotal: "Subtotal", total2: "Total", approved: "Approved changes", withChanges: "Total with changes", pay: "How you pay",
    included: "What's included", terms: "Terms", fullDoc: "See the full estimate document", yourPhotos: "Photos of your project", ourWork: "Our recent work", moreUs: "See more of our work",
    site: "Our website", reviewsBtn: "Google reviews", kBefore: "Before", kAfter: "After", kDetail: "Detail",
    sign: "Accept and sign", signHint: "Type your full name and sign with your finger.", yourName: "Your full name", clear: "Clear", accept: "Accept estimate",
    need: "Type your name and sign first.", thanks: "Thank you! Your project is confirmed. We will contact you to set the start date.",
    chat: "Questions?", chatHint: "Write us here. We usually answer the same day.", send: "Send", ph: "Write a message", call: "Call",
    offline: "No connection. Try again.", you: "You", navOpt: "Options", navSign: "Sign", navChat: "Questions", navPhotos: "Photos", ctaBtn: "Review & sign", daysKpi: "Days on site", validKpi: "Valid until",
    upgrade: "Upgrade", depositL: "Deposit", balanceL: "Balance on the final day", close: "Close", padHint: "Sign with your finger", padName: "Name of the person signing", padOk: "Sign", padNeed: "Add a signature and a name first.", change: "Change #",
    copy: "Copy", zelleH: "Pay your deposit with Zelle", depFor: "Deposit to book your date", paidThanks: "Thank you! We'll confirm your payment shortly.", sent: "I sent the Zelle",
    firstDayL: "After the first day of work", schedH: "Your payments", schedHint: "We'll send you each invoice with a payment link when it's due. Nothing to pay now.",
    depH: "Pay the deposit", payDep: "Pay the deposit", payWays: "On the next page you choose how to pay.", depSoon: "Your deposit payment link is on its way — it will show here in a few minutes. We'll also send it to you.", depPaid: "Deposit received. Thank you!",
    bank: (d: string) => `Open your bank app → Zelle → send ${d} to the address above.`, notFound: "This link is no longer active. Please contact us.",
  },
  es: {
    estFor: "Presupuesto para", total: "Total", signedBy: "Aceptado por {0} el {1}", sentSign: "Firmado. {0} lo confirmará en breve.",
    options: "Opciones que puede agregar", optHint: "Toque una opción para agregarla o quitarla. El total cambia al momento.", optLocked: "Este presupuesto ya está firmado. Para cambiar una opción, envíenos un mensaje.",
    changes: "Cambios por aprobar", coBtn: "Revisar y firmar", coDone: "Firmado, esperando confirmación",
    summary: "Resumen", subtotal: "Subtotal", total2: "Total", approved: "Cambios aprobados", withChanges: "Total con cambios", pay: "Cómo se paga",
    included: "Qué incluye", terms: "Términos", fullDoc: "Ver el documento completo", yourPhotos: "Fotos de su proyecto", ourWork: "Nuestros trabajos recientes", moreUs: "Vea más de nuestro trabajo",
    site: "Nuestro sitio web", reviewsBtn: "Reseñas en Google", kBefore: "Antes", kAfter: "Después", kDetail: "Detalle",
    sign: "Aceptar y firmar", signHint: "Escriba su nombre completo y firme con el dedo.", yourName: "Su nombre completo", clear: "Borrar", accept: "Aceptar presupuesto",
    need: "Escriba su nombre y firme primero.", thanks: "¡Gracias! Su proyecto está confirmado. Le escribimos para fijar la fecha de inicio.",
    chat: "¿Preguntas?", chatHint: "Escríbanos aquí. Normalmente respondemos el mismo día.", send: "Enviar", ph: "Escriba un mensaje", call: "Llamar",
    offline: "Sin conexión. Inténtalo de nuevo.", you: "Usted", navOpt: "Opciones", navSign: "Firmar", navChat: "Preguntas", navPhotos: "Fotos", ctaBtn: "Revisar y firmar", daysKpi: "Días en su casa", validKpi: "Válido hasta",
    upgrade: "Mejora", depositL: "Depósito", balanceL: "Saldo el último día", close: "Cerrar", padHint: "Firme con el dedo", padName: "Nombre de quien firma", padOk: "Firmar", padNeed: "Falta la firma o el nombre.", change: "Cambio #",
    copy: "Copiar", zelleH: "Pague su depósito por Zelle", depFor: "Depósito para reservar su fecha", paidThanks: "¡Gracias! Confirmaremos su pago en breve.", sent: "Ya envié el Zelle",
    firstDayL: "Al terminar el primer día de trabajo", schedH: "Sus pagos", schedHint: "Le enviaremos cada factura con su enlace de pago cuando toque. No tiene que pagar nada ahora.",
    depH: "Pague el depósito", payDep: "Pagar depósito", payWays: "En la siguiente página elige cómo pagar.", depSoon: "Su enlace para pagar el depósito viene en camino: aparecerá aquí en unos minutos. También se lo enviaremos.", depPaid: "Depósito recibido. ¡Gracias!",
    bank: (d: string) => `Abra la app de su banco → Zelle → envíe ${d} a la dirección de arriba.`, notFound: "Este link ya no está activo. Por favor contáctenos.",
  },
};
const now = () => new Date().toISOString();
const addDays = (iso: string, days: number) => { const p = String(iso).split("-"); const d = new Date(num(p[0]), num(p[1]) - 1, num(p[2])); d.setDate(d.getDate() + num(days)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const initialsOf = (s: string) => { const w = String(s || "").replace(/\(.*?\)/g, "").trim().split(/\s+/).filter((x) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(x.charAt(0))); return ((w[0] || "?").charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : "")).toUpperCase(); };
export const TwMark = () => <svg className="tw-mark" viewBox="0 0 200 200" aria-hidden="true"><rect width="200" height="200" rx="40" fill="#1a1a2e" /><path d="M100 40 L150 68 L150 132 L100 160 L50 132 L50 68 Z" stroke="#fff" strokeWidth="12" strokeLinejoin="round" fill="none" /><circle cx="100" cy="100" r="18" fill="#fff" /></svg>;

/** Public client link: /p/:token. Light theme, contractor's branding, EN/ES. Never writes owner data. */
export default function PortalPage() {
  const { token = "" } = useParams();
  const [doc, setDoc] = useState<PortalDoc | null | undefined>(undefined);
  const [lang, setLang] = useState<"en" | "es" | "">("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState("");
  const pad = useRef<PadHandle>(null);
  const coPad = useRef<PadHandle>(null);
  const [coId, setCoId] = useState("");
  const [coName, setCoName] = useState("");
  const [zoom, setZoom] = useState<{ url: string; cap: string } | null>(null);
  const [nav, setNav] = useState("");
  const [ctaHide, setCtaHide] = useState(true);
  const viewed = useRef(false);
  const msgsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.documentElement.classList.remove("tw-dark"); }, []);
  useEffect(() => subscribeTop<PortalDoc>("portal", token, setDoc), [token]);
  useEffect(() => { // one "opened" mark per visit
    if (doc && !viewed.current) { viewed.current = true; patchTop("portal", token, { append: { "client.views": now() } }).catch(() => {}); }
  }, [doc, token]);
  useEffect(() => { const b = msgsRef.current; if (b) b.scrollTop = b.scrollHeight; }, [doc?.client?.chat?.length]);

  const m = useMemo<PortalModel | null>(() => { try { return doc ? (JSON.parse(doc.data) as PortalModel) : null; } catch { return null; } }, [doc?.data]);
  const L = (lang || m?.e.docLang || "en") as "en" | "es";
  const P = PT[L], es = L === "es";
  const c = doc?.client || {};
  const ownerSigned = m ? isOwnerSigned(m) : false, signed = !!c.sign || ownerSigned;
  // deposit at signing: only when the contractor asks for it (links published before this existed: no deposit box)
  const depAtSign = !!m?.s.deposit?.atSign, depPay = m?.s.deposit?.pay || null;
  useEffect(() => { if (doc && m) document.title = `${m.s.business.name} — ${m.e.number || ""}`; }, [doc, m]);

  // the top bar shows where you are; the bottom bar offers "Review & sign" until the signing part is on screen
  useEffect(() => {
    if (!m) return;
    const upd = () => {
      const bar = document.querySelector(".pt-top"), off = (bar ? bar.getBoundingClientRect().bottom : 50) + 24;
      let cur = "";
      document.querySelectorAll<HTMLElement>(".pt-top [data-go]").forEach((b) => { const t = document.getElementById(b.dataset.go || ""); if (t && t.getBoundingClientRect().top <= off) cur = b.dataset.go || ""; });
      setNav(cur);
      const sg = document.getElementById("ptSignSec");
      if (sg) { const r = sg.getBoundingClientRect(); setCtaHide(signed || (r.top < window.innerHeight - 40 && r.bottom > 0) || window.scrollY < 120); }
    };
    let tick = false;
    const on = () => { if (!tick) { tick = true; requestAnimationFrame(() => { tick = false; upd(); }); } };
    window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    const t = setTimeout(upd, 60);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); clearTimeout(t); };
  }, [m, signed]);

  if (doc === undefined) return <div className="pt-msg-page" />;
  if (!doc || !m) return <div className="pt-msg-page"><h2>This link isn't active</h2><p>Este enlace no está activo</p></div>;

  const e = m.e, b = m.s.business, s = m.s;
  const eff = effective(m, c), calcS = modelSettings(m), t = calcEstimate(eff, calcS);
  const say = (x: string) => { setToast(x); setTimeout(() => setToast(""), 2600); };
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const offline = () => say(P.offline);

  const toggle = (id: string, cur: boolean) => { if (signed) return; patchTop("portal", token, { set: { [`client.picks.${id}`]: !cur } }).catch(offline); };
  const accept = () => {
    if (!name.trim() || !pad.current?.dirty()) { say(P.need); return; }
    patchTop("portal", token, { set: { "client.sign": { name: name.trim(), img: pad.current.data(), at: now(), total: clientTotal(m, c) } } }).then(() => say(P.thanks)).catch(offline);
  };
  const send = () => { const x = msg.trim(); if (!x) return; setMsg(""); patchTop("portal", token, { append: { "client.chat": { from: "client", text: x, at: now() } } }).catch(() => { setMsg(x); offline(); }); };
  const approveCo = () => {
    if (!coName.trim() || !coPad.current?.dirty()) { say(P.padNeed); return; }
    const id = coId;
    patchTop("portal", token, { set: { [`client.coSign.${id}`]: { name: coName.trim(), img: coPad.current.data(), at: now() } } }).then(() => setCoId("")).catch(offline);
  };
  const copy = (x: string) => { navigator.clipboard?.writeText(x).catch(() => {}); };

  const opts = (e.upgrades || []).filter(isSelectable);
  const cos = (e.changeOrders || []).filter((x) => x.status !== "signed");
  const coSigned = (e.changeOrders || []).filter((x) => x.status === "signed");
  const coOpen = cos.find((x) => x.id === coId);
  const p = s.pricing;
  const lineDesc = (l: (typeof t.lines)[number]) => {
    const it = l.item as { desc: string; descEs: string } | undefined;
    if (l.kind === "custom" && it) return es ? it.descEs || it.desc : it.desc;
    if (l.kind === "upgrade" && it) return es ? it.descEs || it.desc : it.desc || it.descEs;
    if (l.kind === "door") return (e.frameMode || "included") === "included" ? (es ? p.doorLabelEs || p.doorLabel : p.doorLabel) : es ? p.doorLabelNoFrameEs || p.doorLabelNoFrame || p.doorLabelEs : p.doorLabelNoFrame || p.doorLabel;
    if (l.kind === "drawer") return es ? p.drawerLabelEs || p.drawerLabel : p.drawerLabel;
    if (l.kind === "frame") return es ? p.frameLabelEs || p.frameLabel : p.frameLabel;
    return es ? p.boxLabelEs || p.boxLabel : p.boxLabel;
  };
  const lines = t.lines.filter((l) => !(l.kind === "custom" && (l.item as { hidden?: boolean }).hidden)).map((l) => {
    const it = l.item as { unit?: string; desc?: string; descEs?: string } | undefined;
    const d = lineDesc(l);
    return { desc: d || "—", qty: Math.round(l.qty * 100) / 100, unit: l.kind === "custom" ? it?.unit || "" : "", sub: l.kind === "door" ? (es ? e.specEs || e.spec || "" : e.spec || "") : l.kind === "upgrade" ? P.upgrade : "", rate: l.rate, amount: l.amount, skip: l.kind === "custom" && !d && !l.qty };
  }).filter((l) => !l.skip);
  const payRows = payPlanOn(eff)
    ? planAmounts(eff, t.total).map((a, i) => ({ label: `${es ? eff.payPlan[i].labelEs || eff.payPlan[i].label : eff.payPlan[i].label} (${num(eff.payPlan[i].pct)}%)`, amount: a }))
    : [{ label: `${depAtSign ? P.depositL : P.firstDayL} (${num(t.depositPct)}%)`, amount: t.deposit }, { label: P.balanceL, amount: t.balance }];
  const scope = nl2list(es ? e.scopeEs || e.scopeEn : e.scopeEn || e.scopeEs), terms = nl2list(es ? e.termsEs || e.termsEn : e.termsEn || e.termsEs);
  const groups = scopeGroups(scope);
  const K: Record<string, string> = { before: P.kBefore, after: P.kAfter, detail: P.kDetail };
  const photos = e.showPhotos ? (e.photos || []).filter((x) => safeImgSrc(x.url)) : [];
  const showcase = (s.showcase || []).filter((x) => safeImgSrc(x.url));
  const site = safeUrl(s.websiteUrl), insta = safeUrl(s.instagramUrl), reviews = safeUrl(s.reviewUrl);
  const nm = String(b.name || ""), parts = nm.split(" "), short = parts[0], rest = parts.slice(1).join(" ");
  const zelle = s.payZelle || b.phone || "";
  const wa = (b.phone || "").replace(/\D/g, "");
  const chat = c.chat || [];
  const coT = coSigned.reduce((a, x) => a + num(x.amount), 0);
  const signedLine = (tpl: string, who: string, date: string) => tpl.replace("{0}", who).replace("{1}", date);
  const fmtWhen = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleString(es ? "es-US" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };
  const brand = /^#[0-9a-f]{6}$/i.test(b.brandColor || "") ? b.brandColor : "";
  const style = (brand && brand.toLowerCase() !== "#ef6a2c" ? { "--acc": brand, "--acc-soft": `color-mix(in srgb, ${brand} 12%, #fff)`, "--acc-ink": `color-mix(in srgb, ${brand} 78%, #000)` } : {}) as React.CSSProperties;
  const dep = calcEstimate(e, calcS).deposit;
  const docE = { ...e, signature: null };

  return (
    <div className="pt" style={style}>
      <header className="pt-top">
        {opts.length > 0 && <button data-go="ptOpt" className={nav === "ptOpt" ? "on" : ""} onClick={() => go("ptOpt")}>{P.navOpt}</button>}
        <button data-go="ptSum" className={nav === "ptSum" ? "on" : ""} onClick={() => go("ptSum")}>{P.summary}</button>
        {photos.length > 0 && <button data-go="ptPhotos" className={nav === "ptPhotos" ? "on" : ""} onClick={() => go("ptPhotos")}>{P.navPhotos}</button>}
        <button data-go="ptSignSec" className={nav === "ptSignSec" ? "on" : ""} onClick={() => go("ptSignSec")}>{P.navSign}</button>
        <button data-go="ptChatSec" className={nav === "ptChatSec" ? "on" : ""} onClick={() => go("ptChatSec")}>{P.navChat}</button>
      </header>
      <div className={"pt-cta" + (ctaHide ? " hide" : "")} id="ptCta"><div><span>{P.total}</span><b id="ptCtaTotal">{money(t.total)}</b></div><button className="btn pri" onClick={() => go("ptSignSec")}>{P.ctaBtn}</button></div>
      <div className="pt-in">
        <div id="ptMain">
          <section className="pt-hero">
            <div className="pt-cv-top">
              {safeImgSrc(b.logoUrl) && <img src={safeImgSrc(b.logoUrl)} alt="" />}
              <span className="pt-cv-logo">{short}</span>{rest && <span className="pt-cv-tag">{rest}</span>}
              <div className="pt-lang">{(["en", "es"] as const).map((l) => <button key={l} className={L === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
            </div>
            <div className="pt-client"><div className="pt-av">{initialsOf(e.clientName)}</div>
              <div style={{ minWidth: 0 }}><div className="pt-k">{P.estFor}</div><h1>{e.clientName || ""}</h1>
                {e.address && <div className="pt-addr">{e.address}</div>}
                <div className="pt-meta">{e.number || ""} · {fmtDate(e.date, L)}</div></div></div>
            <div className="pt-kpis">
              <div><span>{P.total}</span><b id="ptHeroTotal">{money(t.total)}</b></div>
              <div><span>{payRows[0]?.label}</span><b>{money(payRows[0]?.amount || 0)}</b></div>
              <div><span>{P.daysKpi}</span><b>{num(e.days) || "—"}</b></div>
              <div><span>{P.validKpi}</span><b className="pt-kd">{fmtDate(addDays(e.date, e.validDays), L)}</b></div>
            </div>
            {ownerSigned ? <div className="pt-status ok">{signedLine(P.signedBy, e.signature?.name || "", fmtDate(e.signature?.date, L))}</div>
              : signed ? <div className="pt-status ok">{signedLine(P.sentSign, b.name || "", "")}</div> : null}
          </section>

          {opts.length > 0 && <section className="pt-sec" id="ptOpt"><h2>{P.options}</h2><p className="pt-hint">{signed ? P.optLocked : P.optHint}</p>
            {opts.map((u) => { const on = (u.id in (c.picks || {}) && !ownerSigned) ? !!c.picks![u.id] : !!u.included, d = es ? u.descEs || u.desc : u.desc || u.descEs; return (
              <button key={u.id} className={"pt-opt" + (on ? " on" : "")} disabled={signed} aria-pressed={on} onClick={() => toggle(u.id, on)}>
                <span className="pt-ck" aria-hidden="true">{on ? "✓" : ""}</span>
                <span className="pt-od">{d}{num(u.qty) > 1 && <small>{num(u.qty)} × {money(u.rate)}</small>}</span>
                <span className="pt-op num">+{money(num(u.qty) * num(u.rate))}</span></button>); })}
          </section>}

          {cos.length > 0 && <section className="pt-sec"><h2>{P.changes}</h2>
            {cos.map((x) => { const done = !!c.coSign?.[x.id || ""]; return (
              <div className="pt-co" key={x.id}><div><b>#{x.n}</b> {es ? x.descEs || x.desc : x.desc || x.descEs}</div>
                <div className="row" style={{ marginTop: 8 }}><b className="num">{money(x.amount)}</b><div style={{ marginLeft: "auto" }} />
                  {done ? <span className="pt-done">{P.coDone}</span> : <button className="btn pri sm" onClick={() => { setCoId(x.id || ""); setCoName(e.clientName || ""); }}>{P.coBtn}</button>}</div></div>); })}
          </section>}

          <section className="pt-sec" id="ptSum"><h2>{P.summary}</h2>
            <div className="pt-lines">{lines.map((l, i) => (
              <div className="pt-line" key={i}><span>{l.desc}{(l.qty || l.sub) ? <small>{l.qty || ""}{l.unit ? " " + l.unit : ""}{l.sub ? (l.qty ? " · " : "") + l.sub : ""}</small> : null}</span><span className="num">{money(l.amount)}</span></div>))}</div>
            <div className="pt-tot">
              {(t.discAmt > 0 || eff.taxEnabled || t.materialsAdded > 0) && <div className="pt-line"><span>{P.subtotal}</span><span className="num">{money(t.subtotal)}</span></div>}
              {t.discAmt > 0 && <div className="pt-line pt-credit"><span>{es ? t.discLabelEs : t.discLabel}</span><span className="num">−{money(t.discAmt)}</span></div>}
              {eff.taxEnabled && <div className="pt-line"><span>{es ? s.tax.labelEs || s.tax.label : s.tax.label} {num(eff.taxRate)}%</span><span className="num">{money(t.taxAmt)}</span></div>}
              <div className="pt-line pt-big"><span>{P.total2}</span><span className="num">{money(t.total)}</span></div>
              {coSigned.map((x) => <div className="pt-line" key={x.id}><span>{P.approved} #{x.n}<small>{es ? x.descEs || x.desc : x.desc || x.descEs}</small></span><span className="num">{money(x.amount)}</span></div>)}
              {coSigned.length > 0 && <div className="pt-line pt-big"><span>{P.withChanges}</span><span className="num">{money(t.total + coT)}</span></div>}
            </div>
            <h3 className="pt-h3">{P.pay}</h3>
            <div className="pt-lines">{payRows.map((r, i) => <div className="pt-line" key={i}><span>{r.label}</span><span className="num">{money(r.amount)}</span></div>)}</div>
          </section>

          {scope.length > 0 && <section className="pt-sec"><h2>{P.included}</h2>
            {!groups.some((g) => g.head) ? <ul className="pt-ul">{scope.map((x, i) => <li key={i}>{x}</li>)}</ul>
              : <div className="pt-scope">{groups.map((g, i) => { const ul = g.items.length ? <ul className="pt-ul">{g.items.map((x, j) => <li key={j}>{x}</li>)}</ul> : null;
                return g.day ? <div className="pt-day" key={i}><span className="pt-day-n">{g.day}</span><div className="pt-day-b"><div className="pt-day-t">{g.title}</div>{ul}</div></div>
                  : <Fragment key={i}>{g.head && <div className="pt-scope-h">{g.head}</div>}{ul}</Fragment>; })}</div>}
            {terms.length > 0 && <><h3 className="pt-h3">{P.terms}</h3><ul className="pt-ul pt-small">{terms.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
          </section>}

          {photos.length > 0 && <section className="pt-sec" id="ptPhotos"><h2>{P.yourPhotos}</h2>
            <div className="pt-gal">{photos.map((x) => { const cap = [K[x.kind] || "", x.caption || ""].filter(Boolean).join(" — "); return (
              <figure key={x.id} onClick={() => setZoom({ url: x.url!, cap })}><img src={safeImgSrc(x.url)} alt={cap || P.yourPhotos} loading="lazy" />{cap && <figcaption>{cap}</figcaption>}</figure>); })}</div></section>}

          {(showcase.length > 0 || site || insta || reviews) && <section className="pt-sec" id="ptWork"><h2>{showcase.length ? P.ourWork : P.moreUs}</h2>
            {showcase.length > 0 && <div className="pt-gal">{showcase.map((x) => (
              <figure key={x.id} onClick={() => setZoom({ url: x.url, cap: x.caption || "" })}><img src={safeImgSrc(x.url)} alt={x.caption || P.ourWork} loading="lazy" />{x.caption && <figcaption>{x.caption}</figcaption>}</figure>))}</div>}
            {(site || insta || reviews) && <div className="pt-links">
              {site && <a className="btn" href={site} target="_blank" rel="noopener noreferrer">{P.site} ↗</a>}
              {insta && <a className="btn" href={insta} target="_blank" rel="noopener noreferrer">Instagram ↗</a>}
              {reviews && <a className="btn" href={reviews} target="_blank" rel="noopener noreferrer">★ {P.reviewsBtn} ↗</a>}</div>}
          </section>}

          <section className="pt-sec"><details className="pt-doc"><summary>{P.fullDoc}</summary><div className="pt-docin">
            <EstimateSheet e={docE as typeof e} s={calcS} lang={L} biz={b} services={(es ? s.services?.es : s.services?.en) || ""} pay={{ zelle: s.payZelle, zelleName: s.payZelleName, note: s.payNote, methods: payMethodsOf(s.payMethods) }} />
          </div></details></section>
        </div>

        <section className="pt-sec" id="ptSignSec">
          <h2>{P.sign}</h2>
          {ownerSigned ? <div className="pt-signed"><div className="pt-script">{e.signature?.name}</div><p>{signedLine(P.signedBy, e.signature?.name || "", fmtDate(e.signature?.date, L))}</p><p>{P.thanks}</p></div>
            : c.sign ? <div className="pt-signed">{safeImgSrc(c.sign.img) && <img src={safeImgSrc(c.sign.img)} alt="" />}<p><b>{c.sign.name}</b></p><p>{P.thanks}</p></div>
            : <>
              <p className="pt-hint">{P.signHint}</p>
              <label className="f"><span>{P.yourName}</span><input type="text" id="ptName" autoComplete="name" value={name} onChange={(ev) => setName(ev.target.value)} /></label>
              <SignaturePad ref={pad} className="pt-pad pt-pad-top" height={180} />
              <div className="row" style={{ marginTop: 10 }}><button className="btn sm" onClick={() => pad.current?.clear()}>{P.clear}</button><div style={{ marginLeft: "auto" }} />
                <button className="btn pri" id="ptAccept" onClick={accept}>{P.accept} · <span className="num" id="ptSignTotal">{money(t.total)}</span></button></div>
            </>}
          {signed && (!depAtSign
            ? <div className="pt-pay"><h3>{P.schedH}</h3>
              {payRows.map((r, i) => <div key={i} className="pt-amt"><span>{r.label}</span><b>{money(r.amount)}</b></div>)}
              <p className="pt-hint" style={{ marginTop: 4 }}>{P.schedHint}</p></div>
            : depPay?.paid ? <div className="pt-pay"><h3>{P.depositL}</h3><p className="pt-paid">✓ {P.depPaid}</p></div>
            : <div className="pt-pay"><h3>{P.depH}</h3>
              <div className="pt-amt"><span>{P.depFor}</span><b>{money(depPay?.amount ?? dep)}</b></div>
              {depPay?.token
                ? <><a className="btn pri" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} href={"/pay/" + depPay.token}>{P.payDep} · {money(depPay.amount)}</a>
                  <p className="pt-hint" style={{ marginTop: 6 }}>{P.payWays}</p></>
                : <p className="pt-hint" style={{ marginTop: 4 }}>{P.depSoon}</p>}
              {s.payNote && <p className="pt-hint">{s.payNote}</p>}</div>)}
        </section>

        <section className="pt-sec" id="ptChatSec"><h2>{P.chat}</h2><p className="pt-hint">{P.chatHint}</p>
          <div className="pt-msgs" ref={msgsRef}>{chat.map((x, i) => <div key={i} className={"pt-msg" + (x.from === "client" ? " me" : "")}>{x.text}<small>{x.from === "client" ? P.you : b.name || ""}, {fmtWhen(x.at)}</small></div>)}</div>
          <div className="pt-send"><input type="text" value={msg} placeholder={P.ph} onChange={(ev) => setMsg(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && send()} /><button className="btn pri" onClick={send}>{P.send}</button></div>
        </section>

        <footer className="pt-foot">
          {b.phone && <><a className="btn" href={`tel:${wa}`}>{P.call}</a><a className="btn wa" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}
          {mailtoHref(b.email) && <a className="btn" href={mailtoHref(b.email)}>{b.email}</a>}
          <div className="pt-fine">{b.name || ""}{b.area ? ` · ${b.area}` : ""}</div><div className="tw-pow"><TwMark />Powered by TradeWorks</div>
        </footer>
      </div>

      {coOpen && <div className="pt-modal" onMouseDown={(ev) => ev.target === ev.currentTarget && setCoId("")}>
        <div className="pt-modal-card" role="dialog" aria-modal aria-label={`${P.change}${coOpen.n}`}>
          <div className="pt-modal-h"><h2>{P.change}{coOpen.n}</h2><button className="btn sm" onClick={() => setCoId("")}>{P.close}</button></div>
          <div className="pt-modal-b">
            <div style={{ fontSize: 14, marginBottom: 10 }}>{es ? coOpen.descEs || coOpen.desc : coOpen.desc || coOpen.descEs} — <b>{money(coOpen.amount)}</b></div>
            <SignaturePad ref={coPad} className="pt-pad" height={180} />
            <div className="row" style={{ marginTop: 8 }}><button className="btn sm" onClick={() => coPad.current?.clear()}>{P.clear}</button><span className="muted" style={{ fontSize: 12.5 }}>{P.padHint}</span></div>
            <label className="f" style={{ marginTop: 12 }}><span>{P.padName}</span><input type="text" value={coName} onChange={(ev) => setCoName(ev.target.value)} /></label>
            <div className="row" style={{ marginTop: 14 }}><button className="btn pri" onClick={approveCo}>{P.padOk}</button></div>
          </div></div></div>}
      {zoom && <div className="plight" role="dialog" aria-modal onClick={() => setZoom(null)}><img src={safeImgSrc(zoom.url)} alt="" />{zoom.cap && <div className="cap">{zoom.cap}</div>}</div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
