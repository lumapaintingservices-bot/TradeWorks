import type { CSSProperties, ReactNode } from "react";
import { clientCanSee } from "../lib/jobPhotos";
import { depositAtSignOf } from "../lib/deposit";
import { calcEstimate } from "../lib/estimate";
import { fmtDate } from "../lib/format";
import { invKindLabel, planAmounts, type InvoiceRec } from "../lib/invoices";
import { money, num } from "../lib/money";
import { PAY_METHODS, payMethodsOf } from "../lib/payMethods";
import { safeImgSrc } from "../lib/safeUrl";
import { isScopeHead, nl2list } from "../lib/scope";
import type { Estimate, Settings } from "../lib/types";
import "./DocSheet.css";

/** The printable client documents (estimate, invoice, change-order invoice): a port of the prototype's estimateSheet /
    invoiceSheet / changeInvoiceSheet. Always light, always in the CLIENT's language, with the contractor's branding. */

export type SheetBiz = { name: string; phone: string; email?: string; website: string; area: string; logoUrl: string; brandColor: string; address?: string; hours?: string; hoursEs?: string };
/** `handles`: printable Venmo / Cash App / PayPal / check lines (src/lib/paylink.ts payHandleLines); `payUrl`: the invoice's payment link. */
export type PayInfo = { zelle: string; zelleName: string; note: string; methods?: string[]; handles?: string[]; payUrl?: string };
type Lang = "en" | "es";
type Base = { e: Estimate; s: Settings; biz: SheetBiz; lang: Lang; compact?: boolean; pay: PayInfo; services: string; sigImg?: string };

const L = {
  en: {
    estimate: "Estimate", invoice: "Invoice", preparedFor: "Prepared for", project: "Project", date: "Date", validUntil: "Valid until", ref: "Estimate ref",
    desc: "Description", qty: "Qty", rate: "Rate", amount: "Amount", subtotal: "Subtotal", total: "Total", scope: "Scope of work", terms: "Terms & conditions", notes: "Notes",
    upgrades: "Optional upgrades", upgradeNote: "Not included in the total above. Tell me which ones you want and I will update the estimate.",
    materials: "Materials", materialsTotal: "Materials total", workSubtotal: "Work subtotal", notIncluded: "Not included",
    materialsIncludedNote: "Already included in the prices above — itemised here at your request, at no extra charge.",
    materialsAddedNote: "On this estimate materials are billed separately and are counted in the subtotal below.",
    payment: "Payment methods", depositDue: "Deposit due day 1", depositSign: "Deposit due at signing", balanceDue: "Balance due final day", dueNow: "Amount due now",
    jobTotal: "Job total", lessDeposit: "Less deposit invoiced", accepted: "Accepted by (client signature)", sigDate: "Date", paid: "PAID",
    thanks: "Thank you for your business.", depositInv: "Deposit invoice", balanceInv: "Balance invoice", fullInv: "Invoice", photos: "Project photos",
    allIncluded: "All materials included", clientPaint: "Paint & primer provided by the client", clientAll: "Materials provided by the client",
    upgrade: "Upgrade", approvedBy: "Approved by ", framesNo: "Cabinet frames — not painted", boxesNo: "Cabinet boxes — not painted",
    before: "Before", after: "After", detail: "Detail", projectPhoto: "Project photo", gone: "This invoice is no longer linked to an estimate.",
  },
  es: {
    estimate: "Presupuesto", invoice: "Factura", preparedFor: "Preparado para", project: "Proyecto", date: "Fecha", validUntil: "Válido hasta", ref: "Ref. presupuesto",
    desc: "Descripción", qty: "Cant.", rate: "Precio", amount: "Importe", subtotal: "Subtotal", total: "Total", scope: "Alcance del trabajo", terms: "Términos y condiciones", notes: "Notas",
    upgrades: "Mejoras opcionales", upgradeNote: "No están incluidas en el total de arriba. Dígame cuáles quiere y actualizo el presupuesto.",
    materials: "Materiales", materialsTotal: "Total de materiales", workSubtotal: "Subtotal del trabajo", notIncluded: "No incluye",
    materialsIncludedNote: "Ya están incluidos en los precios de arriba — se detallan aquí a su solicitud, sin costo adicional.",
    materialsAddedNote: "En este presupuesto los materiales se cobran por separado y están contados en el subtotal de abajo.",
    payment: "Formas de pago", depositDue: "Depósito — primer día", depositSign: "Depósito — al firmar", balanceDue: "Saldo — último día", dueNow: "Monto a pagar",
    jobTotal: "Total del trabajo", lessDeposit: "Menos depósito facturado", accepted: "Aceptado por (firma del cliente)", sigDate: "Fecha", paid: "PAGADO",
    thanks: "Gracias por su confianza.", depositInv: "Factura de depósito", balanceInv: "Factura de saldo", fullInv: "Factura", photos: "Fotos del proyecto",
    allIncluded: "Todos los materiales incluidos", clientPaint: "Pintura y primer los aporta el cliente", clientAll: "Materiales aportados por el cliente",
    upgrade: "Mejora", approvedBy: "Aprobado por ", framesNo: "Marcos de gabinete — no se pintan", boxesNo: "Cajas de gabinete — no se pintan",
    before: "Antes", after: "Después", detail: "Detalle", projectPhoto: "Foto del proyecto", gone: "Esta factura ya no está vinculada a un presupuesto.",
  },
};
type Tx = (typeof L)["en"];

/** The prototype's documents are black-and-white with the LUMA orange left out; a contractor who picked their own color gets it. */
export function sheetStyle(brand?: string): CSSProperties {
  const c = /^#[0-9a-f]{6}$/i.test(brand || "") && brand!.toLowerCase() !== "#ef6a2c" ? brand! : "";
  return (c ? { "--brand": c, "--brand-soft": `color-mix(in srgb, ${c} 10%, #fff)`, "--brand-ink": `color-mix(in srgb, ${c} 70%, #000)` } : {}) as CSSProperties;
}

type DocLine = { desc: string; sub: string; qty: number; unit: string; rate: number; amount: number };
export function docLines(e: Estimate, s: Settings, lang: Lang): DocLine[] {
  const es = lang === "es", p = s.pricing, out: DocLine[] = [];
  const withFrame = (e.frameMode || "included") === "included";
  const doorDesc = withFrame ? (es ? p.doorLabelEs || p.doorLabel : p.doorLabel) : es ? p.doorLabelNoFrameEs || p.doorLabelNoFrame || p.doorLabelEs : p.doorLabelNoFrame || p.doorLabel;
  if (num(e.doors) > 0) out.push({ desc: doorDesc, sub: es ? e.specEs || e.spec || "" : e.spec || "", qty: num(e.doors), unit: "", rate: num(e.doorRate), amount: num(e.doors) * num(e.doorRate) });
  if (e.frameMode === "separate" && num(e.frames) > 0) out.push({ desc: es ? p.frameLabelEs || p.frameLabel : p.frameLabel, sub: "", qty: num(e.frames), unit: "", rate: num(e.frameRate), amount: num(e.frames) * num(e.frameRate) });
  if (e.boxMode === "separate" && num(e.boxes) > 0) out.push({ desc: es ? p.boxLabelEs || p.boxLabel : p.boxLabel, sub: "", qty: num(e.boxes), unit: "", rate: num(e.boxRate), amount: num(e.boxes) * num(e.boxRate) });
  if (num(e.drawers) > 0) out.push({ desc: es ? p.drawerLabelEs || p.drawerLabel : p.drawerLabel, sub: "", qty: num(e.drawers), unit: "", rate: num(e.drawerRate), amount: num(e.drawers) * num(e.drawerRate) });
  (e.items || []).forEach((it) => {
    if (it.hidden) return; // hidden from the client: the price stays in the total, the line does not show
    const d = es ? it.descEs || it.desc : it.desc;
    if (!d && !num(it.qty)) return;
    out.push({ desc: d || "—", sub: "", qty: num(it.qty), unit: it.unit || "", rate: num(it.rate), amount: num(it.qty) * num(it.rate) });
  });
  (e.upgrades || []).forEach((u) => {
    if (!u.included) return;
    const d = es ? u.descEs || u.desc : u.desc || u.descEs;
    if (!d && !num(u.rate)) return;
    out.push({ desc: d || "—", sub: es ? "Mejora" : "Upgrade", qty: num(u.qty), unit: "", rate: num(u.rate), amount: num(u.qty) * num(u.rate) });
  });
  return out;
}

/** Letterhead of every document (estimate, invoice, work order). */
export const SheetHead = ({ biz, docType, docNo, meta }: { biz: SheetBiz; docType: string; docNo: string; meta: ReactNode }) => {
  const logo = safeImgSrc(biz.logoUrl);
  return (
    <div className="sheet-h">
      <div className="sheet-logo">
        {logo ? <div className="sheet-mark haslogo"><img src={logo} alt={biz.name} /></div> : <div className="sheet-mark">{biz.name.slice(0, 2).toUpperCase()}</div>}
        <div className="sheet-biz">
          <div className="nm">{biz.name}</div>
          {biz.address}{biz.address && <br />}
          {[biz.phone, biz.email].filter(Boolean).join(" · ")}{(biz.phone || biz.email) && <br />}
          {biz.website}
        </div>
      </div>
      <div className="sheet-meta"><div className="doctype">{docType}</div><div className="docno">{docNo}</div>{meta}</div>
    </div>
  );
};
const Party = ({ T, e, project }: { T: Tx; e: Estimate; project: ReactNode }) => (
  <div className="sheet-grid">
    <div><div className="sheet-lbl">{T.preparedFor}</div><div className="sheet-strong">{e.clientName || "—"}</div>
      {e.address && <>{e.address}<br /></>}{e.phone}{e.phone && e.email ? " · " : ""}{e.email}</div>
    <div><div className="sheet-lbl">{T.project}</div>{project}</div>
  </div>
);
const Table = ({ T, lines }: { T: Tx; lines: DocLine[] }) => (
  <table className="doct"><thead><tr><th>{T.desc}</th><th className="r">{T.qty}</th><th className="r">{T.rate}</th><th className="r">{T.amount}</th></tr></thead>
    <tbody>{lines.length ? lines.map((l, i) => (
      <tr key={i}><td><div className="doct-desc">{l.desc}</div>{l.sub && <div className="doct-sub">{l.sub}</div>}</td>
        <td className="n r">{l.qty}{l.unit ? " " + l.unit : ""}</td><td className="n r">{money(l.rate)}</td><td className="n r">{money(l.amount)}</td></tr>
    )) : <tr><td colSpan={4} className="doct-sub">—</td></tr>}</tbody></table>
);
const Row = ({ label, v, cls = "" }: { label: string; v?: string; cls?: string }) => <div className={"doc-tot-row " + cls}><span>{label}</span><span className="v">{v}</span></div>;
const Totals = ({ children }: { children: ReactNode }) => <div className="doc-tot"><div className="doc-tot-in">{children}</div></div>;
const ScopeLis = ({ list }: { list: string[] }) => <>{list.map((x, i) => isScopeHead(x) ? <li key={i} className="scope-h">{String(x).replace(/:$/, "")}</li> : <li key={i}>{x}</li>)}</>;
const Sec = ({ title, children, cls = "" }: { title: string; children: ReactNode; cls?: string }) => <div className={"doc-sec " + cls}><h4>{title}</h4>{children}</div>;

function Materials({ e, T, lang, t }: { e: Estimate; T: Tx; lang: Lang; t: ReturnType<typeof calcEstimate> }) {
  if (!e.showMaterials) return null;
  const rows = (e.materialsList || []).filter((x) => x.desc || x.descEs || num(x.rate) > 0);
  if (!rows.length) return null;
  return (
    <Sec title={T.materials}>
      <table className="doct mat"><thead><tr><th>{T.desc}</th><th className="r">{T.qty}</th><th className="r">{T.rate}</th><th className="r">{T.amount}</th></tr></thead>
        <tbody>{rows.map((x, i) => { const q = num(x.qty); return (
          <tr key={i}><td><div className="doct-desc">{(lang === "es" ? x.descEs || x.desc : x.desc || x.descEs) || "—"}</div></td>
            <td className="n r">{q}{x.unit ? " " + x.unit : ""}</td><td className="n r">{money(x.rate)}</td><td className="n r">{money(q * num(x.rate))}</td></tr>); })}</tbody></table>
      <div className="doc-tot" style={{ marginTop: 8 }}><div className="doc-tot-in"><div className="doc-tot-row grand" style={{ fontSize: 13 }}><span>{T.materialsTotal}</span><span className="v">{money(t.materialsTotal)}</span></div></div></div>
      <div className="doc-ups-note">{t.materialsAdded > 0 ? T.materialsAddedNote : T.materialsIncludedNote}</div>
    </Sec>
  );
}
const Exclusions = ({ e, T }: { e: Estimate; T: Tx }) => {
  const out = [e.frameMode === "none" && T.framesNo, e.boxMode === "none" && T.boxesNo].filter(Boolean) as string[];
  return out.length ? <Sec title={T.notIncluded}><ul className="scope">{out.map((x) => <li key={x}>{x}</li>)}</ul></Sec> : null;
};
const Payment = ({ T, pay, es }: { T: Tx; pay: PayInfo; es: boolean }) => {
  const lines = [pay.zelle && `Zelle: ${pay.zelle}${pay.zelleName ? " · " + pay.zelleName : ""}`, ...(pay.handles || []), pay.note,
    pay.payUrl && `${es ? "Pague en línea" : "Pay online"}: ${pay.payUrl}`].filter(Boolean);
  return (
    <Sec title={T.payment}><div className="pay-row">{payMethodsOf(pay.methods).map((k) => <span className="pay-chip" key={k}>{PAY_METHODS[k][es ? 1 : 0]}</span>)}</div>
      {lines.length > 0 && <div className="doc-notes">{lines.join("\n")}</div>}</Sec>
  );
};
const Photos = ({ e, T }: { e: Estimate; T: Tx }) => {
  const ph = e.showPhotos ? (e.photos || []).filter((x) => safeImgSrc(x.url) && clientCanSee(x)) : [];
  if (!ph.length) return null;
  const K: Record<string, string> = { before: T.before, after: T.after, detail: T.detail };
  return <Sec title={T.photos} cls="doc-photos"><div className="pg">{ph.map((x) => { const cap = [K[x.kind] || "", x.caption || ""].filter(Boolean).join(" — ");
    return <figure key={x.id}><img src={safeImgSrc(x.url)} alt={cap || T.projectPhoto} />{cap && <figcaption>{cap}</figcaption>}</figure>; })}</div></Sec>;
};
const Foot = ({ biz, right }: { biz: SheetBiz; right: string }) => <div className="sheet-foot"><span>{[biz.name, biz.phone, biz.website].filter(Boolean).join(" · ")}</span><span>{right}</span></div>;
const Sig = ({ T, lang, img, name, date }: { T: Tx; lang: Lang; img?: string; name?: string; date?: string }) => (
  <div className="sig">
    <div>{safeImgSrc(img) ? <img className="sig-img" src={safeImgSrc(img)} alt="" /> : <div className="sig-space" />}<div className="sig-line">{T.accepted}</div>{name && <div className="sig-typed">{name}</div>}</div>
    <div>{date ? <div className="sig-space" style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4, fontSize: 12 }}>{fmtDate(date, lang)}</div> : <div className="sig-space" />}<div className="sig-line">{T.sigDate}</div></div>
  </div>
);
const addDays = (iso: string, days: number) => { const p = String(iso).split("-"); const d = new Date(num(p[0]), num(p[1]) - 1, num(p[2])); d.setDate(d.getDate() + num(days)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function totalsRows(e: Estimate, s: Settings, T: Tx, lang: Lang, t: ReturnType<typeof calcEstimate>, jobTotal: string) {
  const es = lang === "es";
  return <>
    {t.materialsAdded > 0 && <><Row label={T.workSubtotal} v={money(t.workSubtotal)} /><Row label={T.materials} v={money(t.materialsAdded)} /></>}
    <Row label={T.subtotal} v={money(t.subtotal)} />
    {t.discAmt > 0 && <Row cls="credit" label={es ? t.discLabelEs : t.discLabel} v={"−" + money(t.discAmt)} />}
    {e.taxEnabled && <Row label={`${es ? s.tax.labelEs || s.tax.label || "Impuesto" : s.tax.label || "Tax"} ${num(e.taxRate)}%`} v={money(t.taxAmt)} />}
    <Row cls="grand" label={jobTotal} v={money(t.total)} />
  </>;
}
const scopeFor = (e: Estimate, lang: Lang, t: ReturnType<typeof calcEstimate>) => {
  let scope = nl2list(lang === "es" ? e.scopeEs || e.scopeEn : e.scopeEn || e.scopeEs);
  if (t.materialsAdded > 0) scope = scope.filter((x) => !/all materials included|todos los materiales incluidos|materiales incluidos/i.test(x)); // billed separately: don't also promise they are included
  return scope;
};

export function EstimateSheet({ e, s, biz, lang, compact, pay, services, sigImg }: Base) {
  const T = L[lang], es = lang === "es", t = calcEstimate(e, s), lines = docLines(e, s, lang);
  const scope = scopeFor(e, lang, t), terms = nl2list(es ? e.termsEs : e.termsEn), notes = es ? e.notes : e.notes;
  const planRows = e.payPlanOn && e.payPlan && e.payPlan.length >= 2 ? planAmounts(e, t.total).map((a, i) => ({ label: `${es ? e.payPlan[i].labelEs || e.payPlan[i].label : e.payPlan[i].label} (${num(e.payPlan[i].pct)}%)`, amount: a })) : null;
  return (
    <div className={"sheet" + (compact ? " compact" : "")} id="sheet" style={sheetStyle(biz.brandColor)}>
      <SheetHead biz={biz} docType={T.estimate} docNo={e.number} meta={<>
        <div style={{ marginTop: 6 }}>{T.date}: <b>{fmtDate(e.date, lang)}</b></div>
        <div>{T.validUntil}: <b>{fmtDate(addDays(e.date, e.validDays), lang)}</b></div></>} />
      <Party T={T} e={e} project={<>
        <div className="sheet-strong">{es ? e.specEs || e.spec : e.spec}</div>{services}<br />
        {(e.matBuyer === "client" || e.matBuyer === "paint") && <><b>{e.matBuyer === "client" ? T.clientAll : T.clientPaint}</b><br /></>}{biz.area}</>} />
      <Table T={T} lines={lines} />
      <Materials e={e} T={T} lang={lang} t={t} />
      <Totals>{totalsRows(e, s, T, lang, t, T.total)}
        {planRows ? planRows.map((r, i) => <Row key={i} label={r.label} v={money(r.amount)} />)
          : <><Row label={`${depositAtSignOf(e, s) ? T.depositSign : T.depositDue} (${num(t.depositPct)}%)`} v={money(t.deposit)} /><Row label={T.balanceDue} v={money(t.balance)} /></>}</Totals>
      {scope.length > 0 && <Sec title={T.scope}><ul className="scope"><ScopeLis list={scope} /></ul></Sec>}
      {terms.length > 0 && <Sec title={T.terms}><ul className="scope">{terms.map((x, i) => <li key={i}>{x}</li>)}</ul></Sec>}
      <Exclusions e={e} T={T} />
      {notes && <Sec title={T.notes}><div className="doc-notes">{notes}</div></Sec>}
      {t.optional.length > 0 && <Sec title={T.upgrades}><ul className="doc-ups">{t.optional.map((u) => { const q = num(u.qty); return (
        <li key={u.id}><span>{(es ? u.descEs || u.desc : u.desc || u.descEs) || "—"}{q > 1 && <> <span className="doct-sub">{q} × {money(u.rate)}</span></>}</span><span className="v">{money(q * num(u.rate))}</span></li>); })}</ul>
        <div className="doc-ups-note">{T.upgradeNote}</div></Sec>}
      <Payment T={T} pay={pay} es={es} />
      <Sig T={T} lang={lang} img={e.signature ? sigImg ?? e.signature.img : undefined} name={e.signature?.name} date={e.signature ? e.signature.date : undefined} />
      <Photos e={e} T={T} />
      <Foot biz={biz} right={(es ? biz.hoursEs || biz.hours : biz.hours) || ""} />
    </div>
  );
}

export function InvoiceSheet({ v, e, s, biz, lang, compact, pay, services }: Base & { v: InvoiceRec }) {
  const T = L[lang], es = lang === "es", b = (x: string) => <b>{x}</b>;
  const paid = v.status === "Paid", title = invKindLabel(v, es);
  const meta = <>
    {v.kind === "co" ? <div style={{ marginTop: 6 }}>{title}</div> : <div style={{ marginTop: 6 }}>{v.kind === "progress" ? title : v.kind === "deposit" ? T.depositInv : v.kind === "balance" ? T.balanceInv : T.fullInv}<> · {num(v.percent)}%</></div>}
    <div>{T.date}: {b(fmtDate(v.date, lang))}</div><div>{T.ref}: {b(v.estNumber || e.number)}</div>
    {paid && <div className="paid-stamp">{T.paid}</div>}</>;
  if (v.kind === "co") {
    const co = (e.changeOrders || []).find((c) => c.id === (v as unknown as { coId?: string }).coId || c.n === v.coN);
    const desc = co ? (es ? co.descEs || co.desc : co.desc || co.descEs) : title;
    return (
      <div className={"sheet" + (compact ? " compact" : "")} id="sheet" style={sheetStyle(biz.brandColor)}>
        <SheetHead biz={biz} docType={T.invoice} docNo={v.number} meta={meta} />
        <div className="sheet-grid"><div><div className="sheet-lbl">{T.preparedFor}</div><div className="sheet-strong">{e.clientName || "—"}</div>{e.address && <>{e.address}<br /></>}{e.phone}</div>
          <div><div className="sheet-lbl">{T.project}</div><div className="sheet-strong">{es ? e.specEs || e.spec : e.spec}</div>{biz.area}</div></div>
        <table className="doct"><thead><tr><th>{T.desc}</th><th className="r">{T.amount}</th></tr></thead>
          <tbody><tr><td><div className="doct-desc">{desc || title}</div>{co && co.signedName && <div className="doct-sub">{T.approvedBy}{co.signedName}, {fmtDate(co.signedAt, lang)}</div>}</td><td className="n r">{money(v.amount)}</td></tr></tbody></table>
        <Totals><Row cls="due" label={T.dueNow} v={money(v.amount)} /></Totals>
        <Payment T={T} pay={pay} es={es} />
        {co && co.sigImg && <Sig T={T} lang={lang} img={co.sigImg} name={co.signedName} date={co.signedAt || " "} />}
        <Foot biz={biz} right={T.thanks} />
      </div>
    );
  }
  const t = calcEstimate(e, s), lines = docLines(e, s, lang), scope = scopeFor(e, lang, t), terms = nl2list(es ? e.termsEs : e.termsEn), notes = es ? e.notes : e.notes;
  return (
    <div className={"sheet" + (compact ? " compact" : "")} id="sheet" style={sheetStyle(biz.brandColor)}>
      <SheetHead biz={biz} docType={T.invoice} docNo={v.number} meta={meta} />
      <Party T={T} e={e} project={<>
        <div className="sheet-strong">{es ? e.specEs || e.spec : e.spec}</div>
        {e.matBuyer === "client" ? T.clientAll : e.matBuyer === "paint" ? T.clientPaint : e.showMaterials && e.materialsMode === "added" ? services : T.allIncluded}<br />{biz.area}</>} />
      <Table T={T} lines={lines} />
      <Materials e={e} T={T} lang={lang} t={t} />
      <Totals>{totalsRows(e, s, T, lang, t, T.jobTotal)}
        {v.kind === "balance" && <Row cls="credit" label={`${T.lessDeposit} (${num(t.depositPct)}%)`} v={"−" + money(t.deposit)} />}
        {v.kind === "deposit" && <Row label={T.balanceDue} v={money(t.balance)} />}
        {v.kind === "progress" && <Row label={`${title} (${num(v.percent)}%) · ${num(v.stage) + 1} / ${num(v.stages) || 1}`} />}
        <Row cls="due" label={T.dueNow} v={money(v.amount)} /></Totals>
      {scope.length > 0 && <Sec title={T.scope}><ul className="scope"><ScopeLis list={scope} /></ul></Sec>}
      {terms.length > 0 && <Sec title={T.terms}><ul className="scope">{terms.map((x, i) => <li key={i}>{x}</li>)}</ul></Sec>}
      <Exclusions e={e} T={T} />
      {notes && <Sec title={T.notes}><div className="doc-notes">{notes}</div></Sec>}
      <Payment T={T} pay={pay} es={es} />
      <Photos e={e} T={T} />
      <Foot biz={biz} right={T.thanks} />
    </div>
  );
}
