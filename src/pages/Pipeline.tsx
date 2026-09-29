import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClients, useEstimates, useInvoices, useSettings } from "../data/hooks";
import { useT } from "../i18n";
import { calcEstimate, uid } from "../lib/estimate";
import { archivedLeads, dayOf, daysBetween, jobStatus, leadClients, todayISO } from "../lib/followups";
import { fmtDate } from "../lib/format";
import { leadSummary } from "../lib/leads";
import { waUrl } from "../lib/messages";
import { money, num } from "../lib/money";
import type { Client, EstStatus, Estimate } from "../lib/types";
import { useUi } from "../store/ui";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { statusLabel } from "../ui/StatusBadge";
import { FollowUpList } from "./FollowUps";
import "./Pipeline.css";

type Stage = "lead" | "Draft" | "Sent" | "Viewed" | "Accepted" | "Deposit Paid" | "Paid in Full";
const STAGES: { k: Stage; en: string; es: string }[] = [
  { k: "lead", en: "Leads", es: "Leads" },
  { k: "Draft", en: "Draft", es: "Borrador" },
  { k: "Sent", en: "Sent", es: "Enviado" },
  { k: "Viewed", en: "Viewed", es: "Visto" },
  { k: "Accepted", en: "Accepted", es: "Aceptado" },
  { k: "Deposit Paid", en: "Deposit paid", es: "Depósito pagado" },
  { k: "Paid in Full", en: "Paid", es: "Pagado" },
];
const FALLBACK_SOURCES = ["Thumbtack", "Google", "Referral", "Instagram", "Nextdoor", "Facebook", "Repeat client", "Walk-by / sign", "Other"];
const ms = (v: unknown): number => {
  if (!v) return 0;
  if (typeof v === "string") { const n = Date.parse(v); return isNaN(n) ? 0 : n; }
  const o = v as { toMillis?: () => number; seconds?: number };
  return typeof o.toMillis === "function" ? o.toMillis() : typeof o.seconds === "number" ? o.seconds * 1000 : 0;
};
type Archivable = Client & { archivedAt?: string };

export default function Pipeline() {
  const t = useT();
  const nav = useNavigate();
  const lang = useUi((s) => s.lang);
  const toast = useUi((s) => s.toast);
  const { rows: clients, save: saveClient, remove: removeClient } = useClients();
  const { rows: estimates, save: saveEst } = useEstimates();
  const { rows: invoices } = useInvoices();
  const { settings } = useSettings();
  const [newLead, setNewLead] = useState<Client | null>(null);
  const [removedOpen, setRemovedOpen] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const today = todayISO();

  const leads = useMemo(() => leadClients(clients, estimates).sort((a, b) => ms(b.createdAt) - ms(a.createdAt) || String(b.createdAt).localeCompare(String(a.createdAt))), [clients, estimates]);
  const removed = useMemo(() => archivedLeads(clients, estimates), [clients, estimates]);
  const cols = useMemo(() => {
    const by: Record<string, Estimate[]> = {};
    STAGES.forEach((s) => { by[s.k] = []; });
    estimates.forEach((e) => { const st = jobStatus(e, invoices); (by[st] || by.Draft).push(e); }); // Declined sits in Draft, like the prototype
    Object.values(by).forEach((l) => l.sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt)));
    return by;
  }, [estimates, invoices]);
  const totalOf = (e: Estimate) => calcEstimate(e, settings).total;

  async function move(e: Estimate, to: EstStatus) {
    const text = t("Moved to", "Movido a") + " " + statusLabel(to, lang === "es");
    await saveEst({ ...e, status: to, sentAt: to === "Sent" && !e.sentAt ? today : e.sentAt, activity: [...(e.activity || []), { at: new Date().toISOString(), text }].slice(-100) } as never);
  }
  async function drop(c: Client) {
    if (!confirm(t(`Take ${c.name} off the pipeline? The client stays saved.`, `¿Quitar a ${c.name} del embudo? El cliente queda guardado.`))) return;
    await saveClient({ ...c, archived: true, archivedAt: new Date().toISOString() } as never);
    toast(t("Removed. You can put it back from “Removed leads”.", "Quitado. Lo puedes regresar desde “Leads quitados”."));
  }
  const jump = (i: number) => boardRef.current?.children[i]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });

  function estCard(e: Estimate, stage: Stage) {
    const st = jobStatus(e, invoices), declined = st === "Declined";
    const ref = st === "Sent" || st === "Viewed" ? e.sentAt || e.date : dayOf(e.updatedAt) || e.date;
    const days = daysBetween(ref, today), views = (e.portalViews || []).length;
    const chips: { c: string; x: string }[] = [];
    if (declined) chips.push({ c: "bad", x: t("Declined", "Rechazado") });
    if (e.portal?.token) chips.push(views ? { c: "ok", x: t(`Viewed ${views}×`, `Visto ${views}×`) } : { c: "", x: t("Link not opened", "Enlace sin abrir") });
    if (e.signature) chips.push({ c: "ok", x: t("Signed", "Firmado") });
    if (num(e.chatUnread)) chips.push({ c: "bad", x: t("New message", "Mensaje nuevo") });
    if ((e.changeOrders || []).some((c) => c.status !== "signed")) chips.push({ c: "warn", x: t("Change pending", "Cambio pendiente") });
    const order: EstStatus[] = ["Draft", "Sent", "Accepted"];
    const idx = st === "Viewed" ? 1 : order.indexOf(st);
    const back: EstStatus | null = idx > 0 ? (st === "Viewed" ? "Sent" : order[idx - 1]) : null;
    const fwd: EstStatus | null = idx >= 0 && idx < 2 ? order[idx + 1] : null;
    const stop = (fn: () => void) => (ev: React.MouseEvent) => { ev.stopPropagation(); fn(); };
    return (
      <div key={e.id} className={"pipe-card" + (declined ? " declined" : "")} onClick={() => nav(`/estimates/${e.id}`)}>
        <div className="pipe-t"><b>{clients.find((c) => c.id === e.clientId)?.name || e.clientName || t("Unnamed client", "Cliente sin nombre")}</b><span className="num">{money(totalOf(e))}</span></div>
        <div className="pipe-s">{e.number}{e.leadSource ? `, ${e.leadSource}` : ""}, {days} d</div>
        {chips.length > 0 && <div className="pipe-chips">{chips.map((c, i) => <span key={i} className={"pipe-chip " + c.c}>{c.x}</span>)}</div>}
        {declined ? (
          <div className="pipe-act end"><button className="pipe-mv" style={{ width: "auto" }} onClick={stop(() => move(e, "Sent"))}>{t("Reopen", "Reabrir")}</button></div>
        ) : idx >= 0 && stage !== "Paid in Full" ? (
          <div className="pipe-act end">
            {back && <button className="pipe-mv" title={t("Move back", "Mover atrás")} onClick={stop(() => move(e, back))}>‹</button>}
            <button className="pipe-mv" title={t("Mark declined", "Marcar rechazado")} onClick={stop(() => move(e, "Declined"))}>✕</button>
            {fwd && <button className="pipe-mv" title={t("Move forward", "Mover adelante")} onClick={stop(() => move(e, fwd))}>›</button>}
          </div>
        ) : null}
      </div>
    );
  }

  function leadCard(c: Client) {
    const d = daysBetween(dayOf(c.createdAt) || today, today), w = c.web;
    const summary = w?.details ? leadSummary(w.details, lang).join(" · ") : "";
    const msg = String(w?.message || "");
    return (
      <div key={c.id} className="pipe-card lead">
        <div className="pipe-t"><b>{c.name || t("Unnamed client", "Cliente sin nombre")}</b><span className="d">{d} d</span></div>
        <div className="pipe-s">{[c.phone, c.source].filter(Boolean).join(", ") || "—"}</div>
        {w && <div className="pipe-x svc">{w.service || ""}{w.city ? ` · ${w.city}` : ""}{(c.photos || []).length ? ` · ${(c.photos || []).length} ${(c.photos || []).length === 1 ? t("photo", "foto") : t("photos", "fotos")}` : ""}</div>}
        {summary && <div className="pipe-x">{summary}</div>}
        {msg && <div className="pipe-x">{msg.slice(0, 140)}{msg.length > 140 ? "…" : ""}</div>}
        {!w && c.note && <div className="pipe-x">{c.note.slice(0, 140)}</div>}
        <div className="pipe-act">
          {c.phone && <a className="btn sm wa" href={waUrl(c.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          <button className="btn sm pri" onClick={() => nav(`/estimates?new=1&client=${c.id}`)}>{t("Estimate", "Cotizar")}</button>
          <button className="btn sm" title={t("Not interested", "No le interesa")} aria-label={t("Not interested", "No le interesa")} onClick={() => drop(c)}>✕</button>
        </div>
      </div>
    );
  }

  const blankLead = (): Client => ({ id: uid("c"), name: "", phone: "", email: "", address: "", source: "", lang, note: "", lead: true, createdAt: today });
  const sources = settings.leadSources?.length ? settings.leadSources : FALLBACK_SOURCES;

  return (
    <div className="page">
      <div className="page-h">
        <div><h1>{t("Pipeline", "Embudo de ventas")}</h1>
          <p>{t("Every job in its stage. When the client signs on the link, it moves to Accepted by itself.", "Cada trabajo en su etapa. Cuando el cliente firma en el enlace, pasa solo a Aceptado.")}</p></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {removed.length > 0 && <button className="btn" onClick={() => setRemovedOpen(true)}>{t(`Removed leads (${removed.length})`, `Leads quitados (${removed.length})`)}</button>}
          <button className="btn pri" onClick={() => setNewLead(blankLead())}><Icon name="plus" />{t("New lead", "Lead nuevo")}</button>
        </div>
      </div>

      <FollowUpList limit={5} />

      <div className="pipe-jump" role="tablist">
        {STAGES.map((s, i) => {
          const n = s.k === "lead" ? leads.length : cols[s.k].length;
          return <button key={s.k} className="pill" onClick={() => jump(i)}>{t(s.en, s.es)} · {n}</button>;
        })}
      </div>
      <div className="pipe-board" ref={boardRef}>
        {STAGES.map((s) => {
          const list = s.k === "lead" ? [] : cols[s.k];
          const n = s.k === "lead" ? leads.length : list.length;
          const sum = list.reduce((a, e) => a + totalOf(e), 0);
          return (
            <div className="pipe-col" key={s.k}>
              <div className={"pipe-h " + s.k.replace(/ /g, "")}><b>{t(s.en, s.es)}</b><span>{n}{sum ? ` · ${money(sum)}` : ""}</span></div>
              <div className="pipe-cards">
                {n === 0 ? <div className="pipe-empty">{t("Empty", "Vacío")}</div> : s.k === "lead" ? leads.map(leadCard) : list.map((e) => estCard(e, s.k))}
              </div>
            </div>
          );
        })}
      </div>

      {newLead && (
        <Modal title={t("New lead", "Lead nuevo")} onClose={() => setNewLead(null)}>
          <label className="f">{t("Name", "Nombre")}<input value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })} autoFocus /></label>
          <div className="grid2">
            <label className="f">{t("Phone", "Teléfono")}<input type="tel" inputMode="tel" value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} /></label>
            <label className="f">{t("Email", "Correo")}<input type="email" value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} /></label>
            <label className="f">{t("Where they came from", "De dónde llegó")}
              <select value={newLead.source} onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}><option value="" />{sources.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
            <label className="f">{t("Their language", "Su idioma")}
              <select value={newLead.lang} onChange={(e) => setNewLead({ ...newLead, lang: e.target.value as "en" | "es" })}><option value="es">Español</option><option value="en">English</option></select></label>
          </div>
          <label className="f">{t("Address", "Dirección")}<input value={newLead.address} onChange={(e) => setNewLead({ ...newLead, address: e.target.value })} /></label>
          <label className="f">{t("What they want", "Qué quiere")}<input value={newLead.note} placeholder={t("Kitchen cabinets, white", "Gabinetes de cocina, blancos")} onChange={(e) => setNewLead({ ...newLead, note: e.target.value })} /></label>
          <button className="btn pri" onClick={async () => {
            if (!newLead.name.trim()) { toast(t("Write the name.", "Escribe el nombre.")); return; }
            await saveClient({ ...newLead, name: newLead.name.trim() });
            setNewLead(null); toast(t("Lead saved.", "Lead guardado."));
          }}>{t("Save lead", "Guardar lead")}</button>
        </Modal>
      )}

      {removedOpen && (
        <Modal title={t("Removed leads", "Leads quitados")} onClose={() => setRemovedOpen(false)}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>{t("Leads you took off the pipeline with ✕. Put one back if it was a mistake.", "Leads que quitaste del embudo con ✕. Regrésalo si fue un error.")}</div>
          {removed.length === 0 ? <div className="pipe-empty">{t("Nothing removed.", "Nada quitado.")}</div> : (
            <div className="pipe-rm">
              {removed.map((c) => (
                <div className="row" key={c.id}>
                  <div><b>{c.name || "—"}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{[c.phone, c.source, (c as Archivable).archivedAt ? t("removed ", "quitado ") + fmtDate(dayOf((c as Archivable).archivedAt), lang) : ""].filter(Boolean).join(" · ")}</div></div>
                  <div className="btns">
                    <button className="btn sm pri" onClick={async () => { await saveClient({ ...c, archived: false } as never); toast(t(`${c.name} is back in Leads.`, `${c.name} regresó a Leads.`)); }}>{t("Put back", "Regresar")}</button>
                    <button className="btn sm danger" onClick={async () => { if (confirm(t(`Delete ${c.name} for good? This can't be undone.`, `¿Borrar a ${c.name} para siempre? No se puede deshacer.`))) { await removeClient(c.id); toast(t("Deleted.", "Borrado.")); } }}>{t("Delete", "Borrar")}</button>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <button className="btn sm danger" onClick={async () => {
                  if (!confirm(t(`Delete all ${removed.length} removed leads for good? This can't be undone.`, `¿Borrar los ${removed.length} leads quitados para siempre? No se puede deshacer.`))) return;
                  for (const c of removed) await removeClient(c.id);
                  setRemovedOpen(false); toast(t("Removed leads cleared.", "Leads quitados borrados."));
                }}>{t("Delete all for good", "Borrar todos para siempre")}</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
