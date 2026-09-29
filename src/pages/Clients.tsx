import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClients, useEstimates } from "../data/hooks";
import { useT } from "../i18n";
import { initials } from "../lib/format";
import type { Client } from "../lib/types";
import { useUi } from "../store/ui";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { ClientForm, blankClient } from "./ClientForm";
import { LeadInbox } from "./LeadInbox";

export default function Clients() {
  const t = useT();
  const nav = useNavigate();
  const lang = useUi((s) => s.lang);
  const { rows } = useClients();
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
        <button className="btn pri" onClick={() => setEdit(blankClient(lang))}><Icon name="plus" />{t("New client", "Nuevo cliente")}</button>
      </div>
      <LeadInbox />
      {rows.filter((c) => !c.archived).length === 0 ? (
        <div className="card"><EmptyState icon="clients" title={t("No clients yet", "Aún no hay clientes")}
          text={t("Add a client, or create an estimate and the client is saved for you.", "Agrega un cliente, o crea un presupuesto y el cliente se guarda solo.")}>
          <button className="btn pri" onClick={() => setEdit(blankClient(lang))}>{t("Add client", "Agregar cliente")}</button></EmptyState></div>
      ) : (
        <>
          <div className="toolbar"><input placeholder={t("Search clients…", "Buscar clientes…")} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="card only-desk tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{t("Client", "Cliente")}</th><th>{t("Phone", "Teléfono")}</th><th>{t("Email", "Correo")}</th><th>{t("Address", "Dirección")}</th><th className="r">{t("Jobs", "Trabajos")}</th></tr></thead>
              <tbody>{list.map((c) => (
                <tr key={c.id} className="click" onClick={() => nav(`/clients/${c.id}`)}>
                  <td><b>{c.name}</b>{leadBadge(c)}</td><td>{c.phone}</td><td>{c.email}</td><td>{c.address}</td><td className="r">{jobs(c.id)}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="cards only-phone">{list.map((c) => (
            <div key={c.id} className="ec" onClick={() => nav(`/clients/${c.id}`)}>
              <div className="l1"><span>{c.name}{leadBadge(c)}</span><span className="muted">{jobs(c.id)}</span></div>
              <div className="l2"><span>{c.phone || c.email || initials(c.name)}</span></div>
            </div>))}</div>
        </>
      )}
      {edit && <ClientForm client={edit} exists={rows.some((r) => r.id === edit.id)} onClose={() => setEdit(null)} />}
    </div>
  );
}
