import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { patchTop, subscribeTop } from "../../data/repo";
import { calcEstimate } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import { money, num } from "../../lib/money";
import { clientTotal, effective, isOwnerSigned, isSelectable, modelSettings, type PortalDoc, type PortalModel } from "../../lib/portal";
import { nl2list, scopeGroups } from "../../lib/scope";
import { SignaturePad, type PadHandle } from "../../ui/SignaturePad";
import "./portal.css";

const ES = (l: string) => l === "es";
const now = () => new Date().toISOString();

/** Public client link: /p/:token. Light theme, contractor's brand color, EN/ES. Never writes owner data. */
export default function PortalPage() {
  const { token = "" } = useParams();
  const [doc, setDoc] = useState<PortalDoc | null | undefined>(undefined);
  const [lang, setLang] = useState<"en" | "es" | "">("");
  const [name, setName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState("");
  const pad = useRef<PadHandle>(null);
  const coPad = useRef<PadHandle>(null);
  const [coId, setCoId] = useState("");
  const [coName, setCoName] = useState("");
  const [coDirty, setCoDirty] = useState(false);
  const [zoom, setZoom] = useState(-1);
  const viewed = useRef(false);
  const msgsEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { document.documentElement.classList.remove("tw-dark"); }, []);
  useEffect(() => subscribeTop<PortalDoc>("portal", token, setDoc), [token]);
  useEffect(() => { // one "opened" mark per visit
    if (doc && !viewed.current) { viewed.current = true; patchTop("portal", token, { append: { "client.views": now() } }).catch(() => {}); }
  }, [doc, token]);
  useEffect(() => { msgsEnd.current?.scrollIntoView({ block: "nearest" }); }, [doc?.client?.chat?.length]);

  const m = useMemo<PortalModel | null>(() => { try { return doc ? (JSON.parse(doc.data) as PortalModel) : null; } catch { return null; } }, [doc?.data]);
  if (doc === undefined) return <div className="pt-msg-page" />;
  if (!doc || !m) return <div className="pt-msg-page"><h2>This link isn't active</h2><p>Este enlace no está activo</p></div>;

  const L = lang || m.e.docLang || "en", es = ES(L), T = (a: string, b: string) => (es ? b : a);
  const c = doc.client || {}, e = m.e, b = m.s.business;
  const ownerSigned = isOwnerSigned(m), signed = !!c.sign || ownerSigned;
  const eff = effective(m, c), tot = calcEstimate(eff, modelSettings(m));
  const say = (t: string) => { setToast(t); setTimeout(() => setToast(""), 2600); };
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const toggle = (id: string, cur: boolean) => { if (signed) return; patchTop("portal", token, { set: { [`client.picks.${id}`]: !cur } }).catch(() => say(T("No connection. Try again.", "Sin conexión. Inténtalo de nuevo."))); };
  const accept = () => {
    if (!name.trim() || !pad.current?.dirty()) { say(T("Type your name and sign with your finger.", "Escriba su nombre y firme con el dedo.")); return; }
    patchTop("portal", token, { set: { "client.sign": { name: name.trim(), img: pad.current.data(), at: now(), total: clientTotal(m, c) } } })
      .then(() => say(T("Thank you! Your estimate is signed.", "¡Gracias! Su presupuesto está firmado."))).catch(() => say(T("No connection. Try again.", "Sin conexión. Inténtalo de nuevo.")));
  };
  const send = () => { const t = msg.trim(); if (!t) return; setMsg(""); patchTop("portal", token, { append: { "client.chat": { from: "client", text: t, at: now() } } }).catch(() => { setMsg(t); say(T("No connection. Try again.", "Sin conexión. Inténtalo de nuevo.")); }); };
  const approveCo = () => {
    if (!coName.trim() || !coPad.current?.dirty()) { say(T("Type your name and sign with your finger.", "Escriba su nombre y firme con el dedo.")); return; }
    const id = coId;
    patchTop("portal", token, { set: { [`client.coSign.${id}`]: { name: coName.trim(), img: coPad.current.data(), at: now() } } })
      .then(() => { setCoId(""); setCoDirty(false); say(T("Thank you! The change is approved.", "¡Gracias! El cambio está aprobado.")); })
      .catch(() => say(T("No connection. Try again.", "Sin conexión. Inténtalo de nuevo.")));
  };
  const copy = (t: string) => { navigator.clipboard?.writeText(t).then(() => say(T("Copied.", "Copiado."))).catch(() => say(t)); };

  const hiddenAmt = tot.lines.filter((l) => l.kind === "custom" && (l.item as { hidden?: boolean }).hidden).reduce((a, l) => a + l.amount, 0);
  const p = m.s.pricing;
  const label = (l: (typeof tot.lines)[number]) => {
    const it = l.item as { desc: string; descEs: string } | undefined;
    if (it) return es ? it.descEs || it.desc : it.desc || it.descEs;
    if (l.kind === "door") return es ? (e.frameMode === "included" ? p.doorLabelEs : p.doorLabelNoFrameEs) : e.frameMode === "included" ? p.doorLabel : p.doorLabelNoFrame;
    if (l.kind === "drawer") return es ? p.drawerLabelEs : p.drawerLabel;
    if (l.kind === "frame") return es ? p.frameLabelEs : p.frameLabel;
    return es ? p.boxLabelEs : p.boxLabel;
  };
  const opts = (e.upgrades || []).filter(isSelectable);
  const scope = scopeGroups(nl2list(es ? e.scopeEs : e.scopeEn)), terms = nl2list(es ? e.termsEs : e.termsEn);
  const spec = es ? e.specEs || e.spec : e.spec || e.specEs;
  const photos = e.showPhotos ? (e.photos || []).filter((x) => x.url) : [];
  const kindOf = (k: string) => (k === "before" ? T("Before", "Antes") : k === "after" ? T("After", "Después") : k === "detail" ? T("Detail", "Detalle") : "");
  const photoCap = (x: (typeof photos)[number]) => [kindOf(x.kind), x.caption].filter(Boolean).join(" — ");
  const zp = zoom >= 0 ? photos[zoom] : undefined;
  const chat = c.chat || [];
  const wa = (b.phone || "").replace(/\D/g, "");
  const deposit = tot.deposit;
  const paid = !!c.paid;
  const cos = e.changeOrders || [];
  const coDone = (x: (typeof cos)[number]) => x.status === "signed" || !!c.coSign?.[x.id || ""];
  const coApproved = cos.filter(coDone).reduce((a, x) => a + num(x.amount), 0);
  const coOpen = cos.find((x) => x.id === coId);

  return (
    <div className="pt" style={{ ["--brand" as string]: b.brandColor || "#EF6A2C" }}>
      <header className="pt-top">
        <div className="pt-nav">
          {opts.length > 0 && <button onClick={() => go("ptOpt")}>{T("Options", "Opciones")}</button>}
          <button onClick={() => go("ptSum")}>{T("Summary", "Resumen")}</button>
          {photos.length > 0 && <button onClick={() => go("ptPhotos")}>{T("Photos", "Fotos")}</button>}
          <button onClick={() => go("ptSign")}>{T("Sign", "Firmar")}</button>
          {cos.length > 0 && <button onClick={() => go("ptCo")}>{T("Changes", "Cambios")}</button>}
          <button onClick={() => go("ptChat")}>{T("Questions", "Preguntas")}</button>
        </div>
        <div className="seg">{(["en", "es"] as const).map((l) => <button key={l} className={L === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
      </header>
      {!signed && <div className="pt-cta"><div><span>{T("Total", "Total")}</span><b>{money(tot.total)}</b></div><button className="pt-btn" onClick={() => go("ptSign")}>{T("Review & sign", "Revisar y firmar")}</button></div>}

      <main className="pt-in">
        <section className="pt-hero">
          <div className="pt-brand">{b.logoUrl ? <img src={b.logoUrl} alt="" /> : <span className="pt-mk">{b.name.slice(0, 2).toUpperCase()}</span>}<b>{b.name}</b></div>
          <p className="pt-eyebrow">{T("Estimate", "Presupuesto")} {e.number} · {fmtDate(e.date, L)}</p>
          <h1>{T(`Hi ${(e.clientName || "").split(" ")[0]}, here is your estimate`, `Hola ${(e.clientName || "").split(" ")[0]}, este es su presupuesto`)}</h1>
          {(e.address) && <p className="pt-sub">{e.address}</p>}
          <div className="pt-total"><span>{T("Total", "Total")}</span><b>{money(tot.total)}</b></div>
          <p className="pt-sub">{T(`Deposit ${tot.depositPct}%: ${money(tot.deposit)} · Balance ${money(tot.balance)}`, `Depósito ${tot.depositPct}%: ${money(tot.deposit)} · Saldo ${money(tot.balance)}`)}</p>
          {signed && <span className="pt-ok">✓ {T("Signed", "Firmado")}</span>}
        </section>

        {opts.length > 0 && <section className="pt-sec" id="ptOpt">
          <h2>{T("Choose your options", "Escoja sus opciones")}</h2>
          <p className="pt-hint">{signed ? T("Options are locked after signing.", "Las opciones se bloquean al firmar.") : T("Tap to add or remove. The total updates right away.", "Toque para agregar o quitar. El total se actualiza al instante.")}</p>
          {opts.map((u) => { const on = !!u.included, amt = num(u.qty) * num(u.rate); return (
            <button key={u.id} className={"pt-opt" + (on ? " on" : "")} disabled={signed} onClick={() => toggle(u.id, on)} aria-pressed={on}>
              <span className="pt-chk">{on ? "✓" : ""}</span><span className="pt-opt-t">{es ? u.descEs || u.desc : u.desc || u.descEs}</span><b>{on ? "" : "+"}{money(amt)}</b>
            </button>); })}
        </section>}

        <section className="pt-sec" id="ptSum">
          <h2>{T("Summary", "Resumen")}</h2>
          {spec && <p className="pt-hint">{spec}</p>}
          {tot.lines.filter((l) => !(l.kind === "custom" && (l.item as { hidden?: boolean }).hidden)).map((l, i) => (
            <div className="pt-row" key={i}><span>{label(l)}<small>{Math.round(l.qty * 100) / 100} × {money(l.rate)}</small></span><b>{money(l.amount)}</b></div>))}
          {hiddenAmt > 0 && <div className="pt-row"><span>{T("Additional work", "Trabajo adicional")}</span><b>{money(hiddenAmt)}</b></div>}
          {tot.materialsAdded > 0 && <div className="pt-row"><span>{T("Materials", "Materiales")}</span><b>{money(tot.materialsAdded)}</b></div>}
          {tot.discAmt > 0 && <div className="pt-row"><span>{es ? tot.discLabelEs : tot.discLabel}</span><b>− {money(tot.discAmt)}</b></div>}
          {tot.taxAmt > 0 && <div className="pt-row"><span>{T("Tax", "Impuesto")}</span><b>{money(tot.taxAmt)}</b></div>}
          <div className="pt-row big"><span>{T("Total", "Total")}</span><b>{money(tot.total)}</b></div>
        </section>

        {photos.length > 0 && <section className="pt-sec" id="ptPhotos">
          <h2>{T("Photos of your project", "Fotos de su proyecto")}</h2>
          <div className="pt-gal">{photos.map((x, i) => (
            <figure key={x.id}><button type="button" onClick={() => setZoom(i)} aria-label={T("Zoom", "Ampliar")}><img src={x.url} alt={photoCap(x) || T("Project photo", "Foto del proyecto")} loading="lazy" /></button>
              {photoCap(x) && <figcaption>{photoCap(x)}</figcaption>}</figure>))}</div>
        </section>}

        {(m.s.showcase || []).length > 0 && <section className="pt-sec">
          <h2>{T("Our recent work", "Nuestro trabajo reciente")}</h2>
          <div className="pt-gal">{(m.s.showcase || []).map((x) => (
            <figure key={x.id}><img src={x.url} alt={x.caption || T("Recent work", "Trabajo reciente")} loading="lazy" />{x.caption && <figcaption>{x.caption}</figcaption>}</figure>))}</div>
        </section>}

        {scope.length > 0 && <section className="pt-sec"><h2>{T("What's included", "Qué incluye")}</h2>
          {scope.map((g, i) => g.day
            ? <div className="pt-day" key={i}><span className="pt-day-n">{g.day}</span><div><div className="pt-day-t">{g.title}</div><ul>{g.items.map((x, j) => <li key={j}>{x}</li>)}</ul></div></div>
            : <div key={i}>{g.head && <h3>{g.head}</h3>}<ul>{g.items.map((x, j) => <li key={j}>{x}</li>)}</ul></div>)}
        </section>}
        {terms.length > 0 && <section className="pt-sec"><h2>{T("Terms", "Términos")}</h2><ul>{terms.map((x, i) => <li key={i}>{x}</li>)}</ul></section>}

        <section className="pt-sec" id="ptSign">
          {!signed ? <>
            <h2>{T("Accept & sign", "Aceptar y firmar")}</h2>
            <p className="pt-hint">{T(`By signing you accept this estimate for ${money(tot.total)}.`, `Al firmar acepta este presupuesto por ${money(tot.total)}.`)}</p>
            <label className="pt-f">{T("Your full name", "Su nombre completo")}<input value={name} onChange={(ev) => setName(ev.target.value)} autoComplete="name" /></label>
            <div className="pt-f"><span>{T("Sign with your finger", "Firme con el dedo")}</span><SignaturePad ref={pad} onChange={setDirty} />
              <button className="pt-link" onClick={() => pad.current?.clear()} disabled={!dirty}>{T("Clear", "Borrar")}</button></div>
            <button className="pt-btn wide" onClick={accept}>{T("Accept & sign", "Aceptar y firmar")}</button>
          </> : <>
            <h2>✓ {T("Thank you!", "¡Gracias!")}</h2>
            <p className="pt-hint">{T("Your signed estimate is confirmed.", "Su presupuesto firmado está confirmado.")} {(ownerSigned ? e.signature!.name : c.sign?.name)}</p>
            <div className="pt-pay">
              <h3>{T("Pay your deposit with Zelle", "Pague su depósito con Zelle")}</h3>
              <div className="pt-dep"><span>{T("Deposit to book your date", "Depósito para reservar su fecha")}</span><b>{money(deposit)}</b></div>
              {m.s.payZelle ? <>
                <div className="pt-zelle"><div><b>Zelle</b>{m.s.payZelleName && <small>{m.s.payZelleName}</small>}<span>{m.s.payZelle}</span></div><button className="pt-btn ghost" onClick={() => copy(m.s.payZelle)}>{T("Copy", "Copiar")}</button></div>
                <p className="pt-hint">{T(`Open your bank app → Zelle → send ${money(deposit)} to the address above.`, `Abra la app de su banco → Zelle → envíe ${money(deposit)} a la dirección de arriba.`)} {m.s.payNote}</p>
                {paid ? <p className="pt-ok">✓ {T("Thanks! We'll confirm when it arrives.", "¡Gracias! Confirmaremos cuando llegue.")}</p>
                  : <button className="pt-btn wide" onClick={() => patchTop("portal", token, { set: { "client.paid": { method: "Zelle", at: now() } } }).then(() => say(T("Thanks! We'll confirm shortly.", "¡Gracias! Confirmaremos pronto.")))}>{T("I sent the Zelle", "Ya envié el Zelle")}</button>}
              </> : <p className="pt-hint">{T("We'll send you the payment details.", "Le enviaremos los datos de pago.")}</p>}
            </div>
          </>}
        </section>

        {cos.length > 0 && <section className="pt-sec" id="ptCo">
          <h2>{T("Change orders", "Órdenes de cambio")}</h2>
          <p className="pt-hint">{T("Extra work agreed after the estimate. Review each one and approve it with your signature.", "Trabajo extra acordado después del presupuesto. Revise cada uno y apruébelo con su firma.")}</p>
          {cos.map((x) => { const done = coDone(x), d = es ? x.descEs || x.desc : x.desc || x.descEs; return (
            <div className={"pt-co" + (done ? " on" : "")} key={x.id}>
              <div className="pt-co-h"><b>{T("Change", "Cambio")} #{x.n}</b><b>{money(x.amount)}</b></div>
              <p>{d}</p>
              {done ? <span className="pt-ok">✓ {T("Approved", "Aprobado")}{(x.signedName || c.coSign?.[x.id || ""]?.name) ? ` · ${x.signedName || c.coSign?.[x.id || ""]?.name}` : ""}</span>
                : <button className="pt-btn" onClick={() => { setCoId(x.id || ""); setCoName(""); setCoDirty(false); }}>{T("Review & approve", "Revisar y aprobar")}</button>}
            </div>); })}
          {coApproved > 0 && <div className="pt-row big"><span>{T("New contract total", "Nuevo total del contrato")}</span><b>{money(tot.total + coApproved)}</b></div>}
        </section>}

        <section className="pt-sec" id="ptChat">
          <h2>{T("Questions?", "¿Preguntas?")}</h2>
          <p className="pt-hint">{T("Write to us here — we'll answer as soon as we can.", "Escríbanos aquí — le respondemos lo antes posible.")}</p>
          <div className="pt-msgs">{chat.map((x, i) => <div key={i} className={"pt-bubble" + (x.from === "client" ? " me" : "")}>{x.text}<small>{x.from === "client" ? T("You", "Usted") : b.name} · {new Date(x.at).toLocaleString(es ? "es" : "en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></div>)}<div ref={msgsEnd} /></div>
          <div className="pt-send"><input value={msg} onChange={(ev) => setMsg(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && send()} placeholder={T("Type a message…", "Escriba un mensaje…")} /><button className="pt-btn" onClick={send}>{T("Send", "Enviar")}</button></div>
        </section>

        <footer className="pt-foot">
          <div className="pt-contact">
            {b.phone && <a className="pt-btn ghost" href={`tel:${wa}`}>{T("Call", "Llamar")}</a>}
            {b.phone && <a className="pt-btn wa" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">WhatsApp</a>}
            {b.email && <a className="pt-btn ghost" href={`mailto:${b.email}`}>{b.email}</a>}
            {m.s.reviewUrl && <a className="pt-btn ghost" href={m.s.reviewUrl} target="_blank" rel="noreferrer">{T("Reviews", "Reseñas")}</a>}
          </div>
          <p>{b.name}{b.area ? ` · ${b.area}` : ""}</p><p className="pt-pow">Powered by TradeWorks</p>
        </footer>
      </main>
      {coOpen && (
        <div className="pt-modal" onMouseDown={(ev) => ev.target === ev.currentTarget && setCoId("")}>
          <div className="pt-modal-card" role="dialog" aria-modal aria-label={T("Approve change", "Aprobar cambio")}>
            <div className="pt-co-h"><h2>{T("Change", "Cambio")} #{coOpen.n}</h2><button className="pt-link" onClick={() => setCoId("")}>{T("Close", "Cerrar")}</button></div>
            <p>{es ? coOpen.descEs || coOpen.desc : coOpen.desc || coOpen.descEs}</p>
            <div className="pt-dep"><span>{T("Extra cost", "Costo adicional")}</span><b>{money(coOpen.amount)}</b></div>
            <p className="pt-hint">{T(`By signing you approve this change for ${money(coOpen.amount)}.`, `Al firmar aprueba este cambio por ${money(coOpen.amount)}.`)}</p>
            <label className="pt-f">{T("Your full name", "Su nombre completo")}<input value={coName} onChange={(ev) => setCoName(ev.target.value)} autoComplete="name" /></label>
            <div className="pt-f"><span>{T("Sign with your finger", "Firme con el dedo")}</span><SignaturePad ref={coPad} onChange={setCoDirty} />
              <button className="pt-link" onClick={() => coPad.current?.clear()} disabled={!coDirty}>{T("Clear", "Borrar")}</button></div>
            <button className="pt-btn wide" onClick={approveCo}>{T("Approve change", "Aprobar cambio")}</button>
          </div>
        </div>)}
      {zp && (
        <div className="pt-zoom" role="dialog" aria-modal aria-label={T("Photo", "Foto")} onClick={() => setZoom(-1)}>
          <img src={zp.url} alt={photoCap(zp)} onClick={(ev) => ev.stopPropagation()} />
          <button type="button" className="x" aria-label={T("Close", "Cerrar")} onClick={() => setZoom(-1)}>×</button>
          {zoom > 0 && <button type="button" className="prev" aria-label={T("Previous", "Anterior")} onClick={(ev) => { ev.stopPropagation(); setZoom(zoom - 1); }}>‹</button>}
          {zoom < photos.length - 1 && <button type="button" className="next" aria-label={T("Next", "Siguiente")} onClick={(ev) => { ev.stopPropagation(); setZoom(zoom + 1); }}>›</button>}
          {photoCap(zp) && <div className="cap">{photoCap(zp)}</div>}
        </div>)}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
