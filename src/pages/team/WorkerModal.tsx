import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { backend } from "../../auth/backend";
import { inviteWorker, type InviteMail } from "../../data/workers";
import { sendInviteEmail } from "../../data/inviteMail";
import { useT } from "../../i18n";
import { workerAvatarPath } from "../../lib/avatar";
import { uid } from "../../lib/estimate";
import { waLink } from "../../lib/format";
import { squareImage } from "../../lib/image";
import { num } from "../../lib/money";
import { canInviteRole, inviteMessage, isEmail, normEmail, type WorkerAccess } from "../../lib/roles";
import { deleteImage, putImage } from "../../lib/storage";
import { rolePicks } from "../../lib/team";
import { normalizeTrade } from "../../lib/trades";
import type { Worker } from "../../lib/types";
import { useUi } from "../../store/ui";
import { AvatarPicker } from "../../ui/AvatarPicker";
import { Badge } from "../../ui/Badge";
import { ask } from "../../ui/confirm";
import { Icon } from "../../ui/Icon";
import { Modal } from "../../ui/Modal";
import { NumInput } from "../../ui/NumInput";
import { PhoneInput } from "../../ui/PhoneInput";

/**
 * Add / edit a worker in one place: photo, name, phone, pay, role (quick picks for the trade) and app access. An e-mail here
 * invites them to the app as a worker linked to this record (TradeWorks e-mails it; if that can't happen, the message to send
 * by WhatsApp shows here). In the app a worker sees only their jobs, tasks and hours, never prices.
 */
export function WorkerModal({ worker, access, takenEmails, hasRecords, onSave, onDelete, onInvited, onClose }: {
  worker?: Worker; access: WorkerAccess; takenEmails: string[]; hasRecords(id: string): boolean;
  onSave(w: Worker): Promise<void>; onDelete(w: Worker): Promise<void>; onInvited(): void; onClose(): void;
}) {
  const t = useT(), toast = useUi((s) => s.toast), lang = useUi((s) => s.lang);
  const { company, user, role, isPlatformAdmin } = useAuth();
  const isNew = !worker;
  const [w, setW] = useState<Worker>(() => worker || { id: uid("w"), name: "", phone: "", role: "", rate: 0, active: true });
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  // after an invitation whose e-mail did not go out: the message to send yourself
  const [share, setShare] = useState<{ email: string; mail: InviteMail; note?: string } | null>(null);
  const [newPhoto, setNewPhoto] = useState<string | "remove" | null>(null); // stored only on Save
  const shown = newPhoto === "remove" ? null : newPhoto || w.photo?.url || null;
  const mayInvite = !!company && !!user && canInviteRole(role, "worker", isPlatformAdmin);
  const picks = rolePicks(normalizeTrade(company?.trade), lang);

  const run = async (fn: () => Promise<void>) => { if (saving) return; setSaving(true); try { await fn(); } catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Intenta otra vez.")); } finally { setSaving(false); } };
  const mailNote = (mail: InviteMail, note?: string) => mail === "demo" ? t("Demo mode: no e-mail is sent.", "Modo demo: no se manda correo.")
    : note === "not-setup" ? t("E-mail isn't set up yet.", "El correo todavía no está configurado.") : note || "";

  const save = () => {
    const name = w.name.trim();
    if (!name) { toast(t("Write the name.", "Escribe el nombre.")); return; }
    const e = normEmail(email);
    if (e && !isEmail(e)) { toast(t("Check the e-mail address.", "Revisa el correo.")); return; }
    if (e && takenEmails.includes(e)) { toast(t("That e-mail already has access to your company.", "Ese correo ya tiene acceso a tu empresa.")); return; }
    return run(async () => {
      const next: Worker = { ...w, name, phone: (w.phone || "").trim(), role: (w.role || "").trim(), rate: num(w.rate), ...(e ? { email: e } : {}) };
      const old = worker?.photo;
      if (newPhoto === "remove") next.photo = null;
      else if (newPhoto && company) next.photo = await putImage(workerAvatarPath(company.id, w.id, uid("a")), newPhoto);
      await onSave(next);
      if (newPhoto && old?.path && old.path !== next.photo?.path) deleteImage(old.path);
      if (!e || !mayInvite) { onClose(); return; }
      let r: Awaited<ReturnType<typeof inviteWorker>>;
      try { r = await inviteWorker({ company: company!, user: user!, email: e, workerId: next.id, lang }); }
      catch { toast(t("Saved, but the invitation could not be created. That e-mail may have an invitation from another company.", "Guardado, pero no se pudo crear la invitación. Ese correo quizá tiene una invitación de otra empresa.")); onClose(); return; }
      onInvited();
      if (r.mail === "sent") { toast(t(`Saved. Invitation e-mailed to ${e}`, `Guardado. Invitación enviada por correo a ${e}`)); onClose(); return; }
      setW(next); setShare({ email: e, mail: r.mail, note: r.note });
    });
  };
  const resend = () => access.state === "invited" && run(async () => {
    try { const r = await sendInviteEmail(access.email, lang); toast(r === "sent" ? t(`Invitation e-mailed to ${access.email}`, `Invitación enviada por correo a ${access.email}`) : mailNote(r)); }
    catch (err) { const m = String((err as Error).message || ""); toast(t("The e-mail could not be sent: ", "No se pudo mandar el correo: ") + mailNote("error", m)); }
  });
  const cancelInvite = async () => {
    if (access.state !== "invited" || !await ask(t(`Cancel the invitation for ${access.email}?`, `¿Cancelar la invitación de ${access.email}?`))) return;
    run(async () => { await backend.deleteInvite(access.email); onInvited(); toast(t("Invitation cancelled.", "Invitación cancelada.")); });
  };
  const del = () => run(async () => {
    if (hasRecords(w.id)) {
      if (!await ask(t("This worker has hours or payments. Mark as inactive instead? They lose access to the app. (Cancel keeps everything as is.)", "Este trabajador tiene horas o pagos. ¿Marcarlo como inactivo? Pierde el acceso a la app. (Cancelar deja todo igual.)"), { ok: t("Mark inactive", "Marcar inactivo") })) return;
      await onSave({ ...w, active: false }); onClose();
      return;
    }
    if (!await ask(t("Delete this worker? If they use the app, they lose access right away.", "¿Borrar este trabajador? Si usa la app, pierde el acceso de inmediato."))) return;
    await onDelete(w);
  });

  if (share) {
    const msg = company ? inviteMessage({ companyName: company.name, role: "worker", email: share.email }, lang, location.origin) : "";
    const copy = async () => { try { await navigator.clipboard.writeText(msg); toast(t("Copied", "Copiado")); } catch { toast(t("Select the text and copy it", "Selecciona el texto y cópialo")); } };
    return (
      <Modal title={t(`${w.name} is invited`, `${w.name} está invitado`)} onClose={onClose}>
        <p className="wm-sent">✓ {t(`Saved. The invitation for ${share.email} is ready.`, `Guardado. La invitación para ${share.email} está lista.`)}</p>
        <p className="muted wm-hint">{t("The e-mail did not go out", "El correo no salió")}{mailNote(share.mail, share.note) ? ` (${mailNote(share.mail, share.note)})` : ""}. {t("Send them this message yourself:", "Mándale tú este mensaje:")}</p>
        <textarea className="wm-msg" readOnly rows={6} value={msg} onFocus={(e) => e.currentTarget.select()} />
        <div className="tm-actions">
          {w.phone && <a className="btn pri" href={waLink(w.phone) + "?text=" + encodeURIComponent(msg)} target="_blank" rel="noreferrer">WhatsApp</a>}
          <button className={"btn" + (w.phone ? "" : " pri")} onClick={copy}><Icon name="copy" size={16} />{t("Copy message", "Copiar mensaje")}</button>
          <button className="btn" onClick={onClose}>{t("Done", "Listo")}</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={isNew ? t("New worker", "Trabajador nuevo") : t("Edit worker", "Editar trabajador")} onClose={onClose}>
      <div className="tm-photo"><AvatarPicker name={w.name || "?"} src={shown} confirmRemove={false} disabled={saving}
        onFile={async (f) => setNewPhoto(await squareImage(f))} onRemove={() => setNewPhoto("remove")} /></div>
      <label className="f">{t("Name", "Nombre")}<input autoFocus={!w.name} value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></label>
      <div className="grid2">
        <label className="f">{t("Phone", "Teléfono")}<PhoneInput value={w.phone || ""} onChange={(v) => setW({ ...w, phone: v })} /></label>
        <label className="f">{t("Pay per hour ($)", "Pago por hora ($)")}<NumInput step="0.5" value={num(w.rate)} onChange={(n) => setW({ ...w, rate: n })} /></label>
      </div>
      <label className="f wm-role">{t("Role", "Rol")}<input value={w.role || ""} onChange={(e) => setW({ ...w, role: e.target.value })} placeholder={t("Painter, helper, sprayer…", "Pintor, ayudante, sprayador…")} /></label>
      <div className="wm-picks" role="group" aria-label={t("Quick picks", "Opciones rápidas")}>
        {picks.map((p) => <button key={p} type="button" className={"pill" + ((w.role || "").trim().toLowerCase() === p.toLowerCase() ? " on" : "")} onClick={() => setW({ ...w, role: p })}>{p}</button>)}
      </div>

      {mayInvite && (
        <div className="wm-access">
          <div className="wm-ah"><Icon name="phone" size={16} /><b>{t("TradeWorks app", "App de TradeWorks")}</b>
            {access.state === "app" && <Badge tone="green" size="sm" icon="check">{t("Uses the app", "Usa la app")}</Badge>}
            {access.state === "invited" && <Badge tone="amber" size="sm" icon="mail">{t("Invited", "Invitado")}</Badge>}</div>
          {access.state === "app" ? <p className="muted wm-hint">{t(`Signs in as ${access.email}. They see their jobs, tasks and hours, never prices.`, `Entra como ${access.email}. Ve sus trabajos, tareas y horas, nunca precios.`)}</p>
            : access.state === "invited" ? <>
              <p className="muted wm-hint">{t(`Waiting for ${access.email} to create their account and tap Join.`, `Esperando a que ${access.email} cree su cuenta y toque Unirme.`)}</p>
              <div className="wm-abtns">
                <button type="button" className="btn sm" disabled={saving} onClick={resend}><Icon name="send" size={14} />{t("E-mail again", "Enviar otra vez")}</button>
                <button type="button" className="btn sm" disabled={saving} onClick={cancelInvite}>{t("Cancel invitation", "Cancelar invitación")}</button>
              </div></>
            : <>
              <label className="f wm-email">{t("E-mail (to invite them)", "Correo (para invitarlo)")}
                <input type="email" inputMode="email" autoComplete="off" value={email} placeholder="carlos@gmail.com" onChange={(e) => setEmail(e.target.value)} /></label>
              <p className="muted wm-hint">{t("Optional. We e-mail them an invitation to the app: they see their jobs, tasks and hours (never prices) and clock in for their tasks.", "Opcional. Le mandamos por correo una invitación a la app: ve sus trabajos, tareas y horas (nunca precios) y marca entrada en sus tareas.")}</p></>}
        </div>
      )}

      <label className="wm-sw"><input type="checkbox" role="switch" className="sw" checked={w.overtime !== false} onChange={(e) => setW({ ...w, overtime: e.target.checked })} />
        <span>{t("Overtime pay", "Pago de horas extra")}<small>{w.overtime !== false
          ? t("1.5× for the hours past 40 in a week (Monday to Sunday), as the law requires for employees paid by the hour.", "1.5× por las horas pasadas las 40 en una semana (lunes a domingo), como exige la ley para empleados por hora.")
          : t("Off: a contractor or an exempt worker. Ask your accountant if you're not sure.", "Apagado: contratista o trabajador exento. Pregúntale a tu contador si no estás seguro.")}</small></span></label>
      {!isNew && company?.trackLocation && (
        <p className="muted wm-loc">📍 {t("Location while on the clock: ", "Ubicación mientras trabaja: ")}<b>{w.locConsent?.on ? t("allowed", "permitida") : w.locConsent ? t("not allowed", "no permitida") : t("not answered yet", "todavía no responde")}</b>
          {w.locConsent?.at ? " · " + new Date(w.locConsent.at).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
          <br />{t("Only they can answer, on their phone. It is never saved without a yes.", "Solo él o ella puede responder, en su teléfono. Nunca se guarda sin un sí.")}</p>)}
      {!isNew && <label className="tm-check"><input type="checkbox" checked={w.active !== false} onChange={(e) => setW({ ...w, active: e.target.checked })} /> {t("Active (shows when logging hours)", "Activo (sale al anotar horas)")}</label>}
      <div className="tm-actions">
        <button className="btn pri" disabled={saving} onClick={save}>{email.trim() && access.state === "none" ? t("Save and invite", "Guardar e invitar") : t("Save", "Guardar")}</button>
        {!isNew && <button className="btn danger" disabled={saving} onClick={del}>{t("Delete", "Borrar")}</button>}
      </div>
    </Modal>
  );
}
