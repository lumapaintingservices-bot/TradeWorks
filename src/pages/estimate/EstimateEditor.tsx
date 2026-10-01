import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useJobExpenses } from "../../data/jobExpenses";
import { nextEstimateNumber, useClients, useEstimates, useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { calcEstimate, jobEconomics, uid } from "../../lib/estimate";
import { leadSourceList } from "../../lib/leadSources";
import { money } from "../../lib/money";
import { STATUSES, type Estimate } from "../../lib/types";
import { useUi } from "../../store/ui";
import { statusLabel } from "../../ui/StatusBadge";
import { subscribeTop } from "../../data/repo";
import { useTeamPhotosInto } from "../../data/teamPhotos";
import { portalApply, type PortalDoc } from "../../lib/portal";
import ChangeOrdersTab from "./ChangeOrdersTab";
import CostsTab from "./CostsTab";
import InvoicesTab from "./InvoicesTab";
import JobDayTab from "./JobDayTab";
import PhotosTab from "./PhotosTab";
import LinkTab, { publishPortal } from "./LinkTab";
import PricingTab from "./PricingTab";
import ScopeTab from "./ScopeTab";
import "./estimate.css";

const TABS = [
  ["pricing", "Pricing", "Precios", 0], ["scope", "Scope & notes", "Alcance y notas", 0], ["costs", "Costs & profit", "Costos y ganancia", 0],
  ["co", "Change orders", "Cambios", 0], ["inv", "Invoices", "Facturas", 0], ["link", "Link & chat", "Enlace y chat", 0],
  ["photos", "Photos", "Fotos", 0], ["jobday", "Job day", "Día de trabajo", 0],
] as const;

export default function EstimateEditor() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const lang = useUi((s) => s.lang);
  const toast = useUi((s) => s.toast);
  const { company } = useAuth();
  const { rows, loading, save, remove } = useEstimates();
  const { rows: clients, save: saveClient } = useClients();
  const { settings: s, update } = useSettings();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("pricing");
  const [e, setE] = useState<Estimate | null>(null);
  const [saved, setSaved] = useState<"saved" | "saving">("saved");
  const loadedId = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const eRef = useRef<Estimate | null>(null);
  eRef.current = e;
  const syncTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { // load once per estimate id
    const found = rows.find((r) => r.id === id);
    if (found && loadedId.current !== id) { loadedId.current = id!; setE(found); }
  }, [rows, id]);

  const commit = (next: Estimate) => {
    setSaved("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      let out = next;
      const nm = next.clientName.trim();
      if (!next.clientId && nm) { // ensureClient: a typed name becomes a client
        const cid = uid("c");
        await saveClient({ id: cid, name: nm, phone: next.phone, email: next.email, address: next.address, source: next.leadSource, lang: next.docLang, note: "" });
        out = { ...next, clientId: cid }; setE((cur) => (cur ? { ...cur, clientId: cid } : cur));
      } else if (next.clientId) {
        const c = clients.find((x) => x.id === next.clientId);
        if (c && (c.name !== nm || c.phone !== next.phone || c.email !== next.email || c.address !== next.address)) await saveClient({ ...c, name: nm || c.name, phone: next.phone, email: next.email, address: next.address });
      }
      await save(out); setSaved("saved");
    }, 500);
  };
  const set = (p: Partial<Estimate>) => setE((cur) => { if (!cur) return cur; const next = { ...cur, ...p }; commit(next); return next; });
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(syncTimer.current); }, []);

  // what the client does on the link (views, picks, signature, chat, Zelle claim) flows into this estimate
  const token = e?.portal?.token;
  useEffect(() => {
    if (!token) return;
    return subscribeTop<PortalDoc>("portal", token, (doc) => {
      const cur = eRef.current;
      if (!doc || !cur) return;
      const r = portalApply(cur, doc.client, lang);
      if (!r.changed) return;
      setE(r.e); commit(r.e);
      if (r.news) toast(r.news);
    });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // before / after photos workers take on their phones land on this job too (src/data/teamPhotos.ts)
  useTeamPhotosInto(e?.id, () => eRef.current?.photos, (photos) => set({ photos }));

  // keep the client's copy in step with edits (owner-only fields are stripped in portalSnapshot)
  useEffect(() => {
    if (!e?.portal || !company) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => { publishPortal(e, s, company).catch(() => {}); }, 800);
  }, [e, s, company]); // eslint-disable-line react-hooks/exhaustive-deps

  const listedMat = useJobExpenses(id || "", e);
  if (!e) return <div className="page">{loading ? null : <><p>{t("Estimate not found.", "No se encontró el presupuesto.")}</p><Link to="/estimates">{t("All estimates", "Todos los presupuestos")}</Link></>}</div>;
  const x = jobEconomics(e, s, listedMat), tot = x.t;
  const pickClient = (cid: string) => {
    const c = clients.find((k) => k.id === cid);
    if (c) set({ clientId: c.id, clientName: c.name, phone: c.phone, email: c.email, address: c.address, docLang: c.lang || e.docLang, leadSource: c.source || e.leadSource });
    else set({ clientId: "" });
  };

  const duplicate = async () => {
    const { number, n } = nextEstimateNumber(s, rows);
    const copy: Estimate = { ...JSON.parse(JSON.stringify(e)), id: uid("e"), number, status: "Draft", date: new Date().toISOString().slice(0, 10), createdAt: undefined };
    await save(copy); await update({ numbering: { ...s.numbering, nextEst: n + 1 } }); toast(t("Duplicated", "Duplicado")); nav(`/estimates/${copy.id}`);
  };
  const saveTemplate = async () => {
    const name = prompt(t("Name for this template", "Nombre para esta plantilla"), e.doors ? t(`Kitchen, ${e.doors} doors`, `Cocina de ${e.doors} puertas`) : t("My template", "Mi plantilla"));
    if (!name) return;
    const keep = ["jobType", "doors", "drawers", "frames", "boxes", "frameMode", "boxMode", "doorRate", "drawerRate", "frameRate", "boxRate", "spec", "specEs", "items", "upgrades", "days", "scopeEn", "scopeEs", "termsEn", "termsEs", "depositPct", "payPlanOn", "payPlan", "taxEnabled", "taxRate", "matBuyer"] as const;
    const data: Record<string, unknown> = {};
    keep.forEach((k) => { data[k] = JSON.parse(JSON.stringify(e[k] ?? null)); });
    (data.upgrades as Estimate["upgrades"]).forEach((u) => { u.byClient = false; });
    await update({ jobTemplates: [...s.jobTemplates, { id: uid("tpl"), name, data: data as Partial<Estimate> }] });
    toast(t("Template saved. It shows up when you start a new estimate.", "Plantilla guardada. Aparece cuando empiezas un presupuesto nuevo."));
  };
  const del = async () => { if (confirm(t("Delete this estimate? This can't be undone.", "¿Eliminar este presupuesto? No se puede deshacer."))) { await remove(e.id); nav("/estimates"); } };
  const props = { e, set, s, lang };

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <Link to="/estimates" className="back">← {t("All estimates", "Todos los presupuestos")}</Link>
          <h1>{e.number}</h1>
          <p>{saved === "saving" ? t("Saving…", "Guardando…") : t("Saved", "Guardado")} · {company?.name}</p>
        </div>
        <div className="actions">
          <select value={e.status} onChange={(ev) => set({ status: ev.target.value as Estimate["status"] })} aria-label="Status">
            {STATUSES.map((st) => <option key={st} value={st}>{statusLabel(st, lang === "es")}</option>)}</select>
          <Link className="btn" to={`/estimates/${e.id}/doc`} target="_blank">{t("Preview / PDF", "Vista previa / PDF")}</Link>
          <Link className="btn" to={`/estimates/${e.id}/work-order`} target="_blank">{t("Work order", "Orden de trabajo")}</Link>
          <Link className="btn" to={`/chats/${e.id}`}>{t("Team chat", "Chat del equipo")}</Link>
          <button className="btn" onClick={saveTemplate}>{t("Save as template", "Guardar como plantilla")}</button>
          <button className="btn" onClick={duplicate}>{t("Duplicate", "Duplicar")}</button>
          <button className="btn danger" onClick={del}>{t("Delete", "Eliminar")}</button>
        </div>
      </div>

      <div className="tiles">
        {(x.mode === "solo"
          ? [[t("Client price", "Precio al cliente"), money(tot.total), ""], [t("Your hours", "Tus horas"), x.h.total + " h", ""], [t("Materials", "Materiales"), money(x.mat), ""],
            [t("What you keep", "Lo que te queda"), money(x.profit), ""],
            [t("Earn per hour", "Ganas por hora"), x.h.total > 0 ? money(x.perHour) : "—", x.perHour >= x.targetHourly ? "good" : x.perHour >= x.targetHourly * 0.75 ? "mid" : "low"]]
          : [[t("Client price", "Precio al cliente"), money(tot.total), ""], [t("Labor hours", "Horas de trabajo"), x.h.total + " h", ""], [t("Your cost", "Tu costo"), money(x.cost), ""],
            [t("Profit", "Ganancia"), money(x.profit), ""],
            [t("Real margin", "Margen real"), Math.round(x.margin) + "%", x.margin >= x.target ? "good" : x.margin >= x.target - 15 ? "mid" : "low"]]
        ).map(([k, v, tone]) => (
          <div className={"tile card" + (tone ? " tone-" + tone : "")} key={k}><span>{k}</span><b>{v}</b></div>))}
      </div>

      <div className="ed-grid">
        <div className="stack">
          <div className="card"><div className="card-h"><h2>{t("Client", "Cliente")}</h2></div><div className="card-b">
            <label className="f">{t("Saved client", "Cliente guardado")}<select value={e.clientId} onChange={(ev) => pickClient(ev.target.value)}>
              <option value="">{t("New / not saved", "Nuevo / sin guardar")}</option>{clients.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="f">{t("Name", "Nombre")}<input value={e.clientName} onChange={(ev) => set({ clientName: ev.target.value })} /></label>
            <label className="f">{t("Phone", "Teléfono")}<input value={e.phone} inputMode="tel" onChange={(ev) => set({ phone: ev.target.value })} /></label>
            <label className="f">{t("Email", "Correo")}<input type="email" value={e.email} onChange={(ev) => set({ email: ev.target.value })} /></label>
            <label className="f">{t("Job address", "Dirección del trabajo")}<input value={e.address} onChange={(ev) => set({ address: ev.target.value })} /></label>
            <label className="f">{t("Document language", "Idioma del documento")}<select value={e.docLang} onChange={(ev) => set({ docLang: ev.target.value as "en" | "es" })}><option value="en">English</option><option value="es">Español</option></select></label>
          </div></div>
          <div className="card"><div className="card-h"><h2>{t("Schedule & source", "Calendario y origen")}</h2></div><div className="card-b">
            <div className="grid2">
              <label className="f">{t("Estimate date", "Fecha")}<input type="date" value={e.date} onChange={(ev) => set({ date: ev.target.value })} /></label>
              <label className="f">{t("Valid for (days)", "Válido por (días)")}<input type="number" min={0} value={e.validDays} onChange={(ev) => set({ validDays: Number(ev.target.value) || 0 })} /></label>
              <label className="f">{t("Start date", "Fecha de inicio")}<input type="date" value={e.startDate} onChange={(ev) => set({ startDate: ev.target.value })} /></label>
              <label className="f">{t("Days on site", "Días en sitio")}<input type="number" min={1} value={e.days} onChange={(ev) => set({ days: Number(ev.target.value) || 1 })} /></label>
            </div>
            <label className="f">{t("Where the lead came from", "De dónde vino el cliente")}<input list="tw-lead-sources" value={e.leadSource} onChange={(ev) => set({ leadSource: ev.target.value })} /><datalist id="tw-lead-sources">{leadSourceList(s).map((x) => <option key={x} value={x} />)}</datalist></label>
          </div></div>
          <div className="card"><div className="card-h"><h2>{t("Totals", "Totales")}</h2></div><div className="card-b">
            <div className="totline"><span>{t("Subtotal", "Subtotal")}</span><b>{money(tot.subtotal)}</b></div>
            {tot.discAmt > 0 && <div className="totline"><span>{lang === "es" ? tot.discLabelEs : tot.discLabel}</span><b>− {money(tot.discAmt)}</b></div>}
            {tot.taxAmt > 0 && <div className="totline"><span>{t("Tax", "Impuesto")} ({e.taxRate}%)</span><b>{money(tot.taxAmt)}</b></div>}
            <div className="totline big"><span>{t("Total", "Total")}</span><b>{money(tot.total)}</b></div>
            <div className="totline dim"><span>{t(`Deposit (${tot.depositPct}%)`, `Depósito (${tot.depositPct}%)`)}</span><b>{money(tot.deposit)}</b></div>
            <div className="totline dim"><span>{t("Balance", "Saldo")}</span><b>{money(tot.balance)}</b></div>
            {tot.optionalTotal > 0 && <div className="totline dim"><span>{t("Optional add-ons", "Extras opcionales")}</span><b>{money(tot.optionalTotal)}</b></div>}
          </div></div>
        </div>

        <div>
          <div className="tabs">{TABS.map(([k, en, es]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{t(en, es)}</button>)}</div>
          {tab === "pricing" && <PricingTab {...props} />}
          {tab === "scope" && <ScopeTab {...props} saveStandard={update} />}
          {tab === "costs" && <CostsTab {...props} />}
          {tab === "link" && <LinkTab {...props} />}
          {tab === "co" && <ChangeOrdersTab {...props} />}
          {tab === "inv" && <InvoicesTab {...props} />}
          {tab === "photos" && <PhotosTab {...props} />}
          {tab === "jobday" && <JobDayTab {...props} />}
          {TABS.filter(([k]) => k === tab && TABS.find(([kk]) => kk === k)![3] > 0).map(([k, en, es, ph]) => (
            <div className="card" key={k}><div className="es"><h3>{t(en, es)}</h3><p>{t(`This tab arrives in phase ${ph}.`, `Esta pestaña llega en la fase ${ph}.`)}</p></div></div>))}
        </div>
      </div>
    </div>
  );
}
