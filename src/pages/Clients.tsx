import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClients, useEstimates } from "../data/hooks";
import { useT } from "../i18n";
import { uid } from "../lib/estimate";
import { initials } from "../lib/format";
import type { Client } from "../lib/types";
import { useUi } from "../store/ui";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { LeadInbox } from "./LeadInbox";

const blank = (lang: "en" | "es"): Client => ({ id: uid("c"), name: "", phone: "", email: "", address: "", source: "", lang, note: "" });

export default function Clients() {
  const t = useT();
  const nav = useNavigate();
  const lang = useUi((s) => s.lang);
  const toast = useUi((s) => s.toast);
  const { rows, save, remove } = useClients();
  const { rows: ests } = useEstimates();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Client | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((c) => !c.archived && (!s || [c.name, c.phone, c.email, c.address].some((x) => (x || "").toLowerCase().includes(s))))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, q]);
  const jobs = (id: string) => ests.filter((e) => e.clientId === id).length;
  const leadBadge = (c: Client) => (c.lead && !jobs(c.id) ? <span className="badge b-blue" style={{ marginLeft: 8 }}>{t("Lead", "Prospecto")}</span> : null);

  return (
    <div className="page">
      <div className="page-h">
        <div><h1>{t("Clients", "Clientes")}</h1><p>{t(`${list.length} clients`, `${list.length} clientes`)}</p></div>
        <button className="btn pri" onClick={() => setEdit(blank(lang))}><Icon name="plus" />{t("New client", "Nuevo cliente")}</button>
      </div>
      <LeadInbox />
      {rows.filter((c) => !c.archived).length === 0 ? (
        <div className="card"><EmptyState icon="clients" title={t("No clients yet", "Aún no hay clientes")}
          text={t("Add a client, or create an estimate and the client is saved for you.", "Agrega un cliente, o crea un presupuesto y el cliente se guarda solo.")}>
          <button className="btn pri" onClick={() => setEdit(blank(lang))}>{t("Add client", "Agregar cliente")}</button></EmptyState></div>
      ) : (
        <>
          <div className="toolbar"><input placeholder={t("Search clients…", "Buscar clientes…")} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="card only-desk tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{t("Client", "Cliente")}</th><th>{t("Phone", "Teléfono")}</th><th>{t("Email", "Correo")}</th><th>{t("Address", "Dirección")}</th><th className="r">{t("Jobs", "Trabajos")}</th></tr></thead>
              <tbody>{list.map((c) => (
                <tr key={c.id} className="click" onClick={() => setEdit(c)}>
                  <td><b>{c.name}</b>{leadBadge(c)}</td><td>{c.phone}</td><td>{c.email}</td><td>{c.address}</td><td className="r">{jobs(c.id)}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="cards only-phone">{list.map((c) => (
            <div key={c.id} className="ec" onClick={() => setEdit(c)}>
              <div className="l1"><span>{c.name}{leadBadge(c)}</span><span className="muted">{jobs(c.id)}</span></div>
              <div className="l2"><span>{c.phone || c.email || initials(c.name)}</span></div>
            </div>))}</div>
        </>
      )}
      {edit && (
        <Modal title={rows.some((r) => r.id === edit.id) ? t("Edit client", "Editar cliente") : t("New client", "Nuevo cliente")} onClose={() => setEdit(null)}>
          <label className="f">{t("Name", "Nombre")}<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></label>
          <div className="grid2">
            <label className="f">{t("Phone", "Teléfono")}<input value={edit.phone} inputMode="tel" onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
            <label className="f">{t("Email", "Correo")}<input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
          </div>
          <label className="f">{t("Address", "Dirección")}<input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></label>
          <div className="grid2">
            <label className="f">{t("Language", "Idioma")}<select value={edit.lang} onChange={(e) => setEdit({ ...edit, lang: e.target.value as "en" | "es" })}><option value="en">English</option><option value="es">Español</option></select></label>
            <label className="f">{t("Where they found you", "Cómo te encontró")}<input value={edit.source} onChange={(e) => setEdit({ ...edit, source: e.target.value })} /></label>
          </div>
          <label className="f">{t("Notes", "Notas")}<textarea rows={3} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
          <div className="onb-foot">
            {rows.some((r) => r.id === edit.id) ? (
              <button className="btn danger" onClick={async () => { if (confirm(t("Delete this client? Their estimates stay.", "¿Eliminar este cliente? Sus presupuestos se quedan."))) { await save({ ...edit, archived: true }); setEdit(null); toast(t("Client removed", "Cliente eliminado")); } }}>{t("Delete", "Eliminar")}</button>
            ) : <span />}
            <span style={{ display: "flex", gap: 8 }}>
              <button className="btn" disabled={!edit.name.trim()} onClick={async () => { await save(edit); nav(`/estimates?new=1&client=${edit.id}`); }}>{t("Save & new estimate", "Guardar y presupuestar")}</button>
              <button className="btn pri" disabled={!edit.name.trim()} onClick={async () => { await save(edit); setEdit(null); toast(t("Saved", "Guardado")); }}>{t("Save", "Guardar")}</button>
            </span>
          </div>
        </Modal>
      )}
    </div>
  );
}
