import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClients } from "../data/hooks";
import { useT } from "../i18n";
import { uid } from "../lib/estimate";
import type { Client } from "../lib/types";
import { useUi } from "../store/ui";
import { Modal } from "../ui/Modal";

export const blankClient = (lang: "en" | "es"): Client => ({ id: uid("c"), name: "", phone: "", email: "", address: "", source: "", lang, note: "" });

/** New / edit client modal, shared by the Clients list and the client profile. */
export function ClientForm({ client, exists, onClose, onDeleted }: { client: Client; exists: boolean; onClose(): void; onDeleted?(): void }) {
  const t = useT();
  const nav = useNavigate();
  const toast = useUi((s) => s.toast);
  const { save } = useClients();
  const [edit, setEdit] = useState<Client>(client);
  return (
    <Modal title={exists ? t("Edit client", "Editar cliente") : t("New client", "Nuevo cliente")} onClose={onClose}>
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
        {exists ? (
          <button className="btn danger" onClick={async () => { if (confirm(t("Delete this client? Their estimates stay.", "¿Eliminar este cliente? Sus presupuestos se quedan."))) { await save({ ...edit, archived: true }); toast(t("Client removed", "Cliente eliminado")); onClose(); onDeleted?.(); } }}>{t("Delete", "Eliminar")}</button>
        ) : <span />}
        <span style={{ display: "flex", gap: 8 }}>
          <button className="btn" disabled={!edit.name.trim()} onClick={async () => { await save(edit); nav(`/estimates?new=1&client=${edit.id}`); }}>{t("Save & new estimate", "Guardar y presupuestar")}</button>
          <button className="btn pri" disabled={!edit.name.trim()} onClick={async () => { await save(edit); onClose(); toast(t("Saved", "Guardado")); }}>{t("Save", "Guardar")}</button>
        </span>
      </div>
    </Modal>
  );
}
