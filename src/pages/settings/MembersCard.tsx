import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { backend } from "../../auth/backend";
import type { Invite, Member } from "../../auth/types";
import "../../auth/members.css";
import { useWorkers } from "../../data/hooks";
import { useMyPhoto } from "../../data/avatar";
import { useT } from "../../i18n";
import {
  can, canChangeRole, canInviteRole, canLinkWorker, canRemoveMember, denialText, inviteMessage, isEmail, normEmail, roleLabel, ROLES, type Role,
} from "../../lib/roles";
import { useUi } from "../../store/ui";
import { RoleBadge } from "../../auth/RoleBadge";
import { mailtoHref } from "../../lib/safeUrl";
import { sendInviteEmail } from "../../data/inviteMail";
import { ask } from "../../ui/confirm";
import { Avatar } from "../../ui/Avatar";

const ORDER: Record<Role, number> = { owner: 0, admin: 1, worker: 2 };

/**
 * Settings card "Team & access": who belongs to this company, their role, invites.
 * Owners manage everything; admins see the list and can invite / remove WORKERS (see src/lib/roles.ts). Workers see nothing.
 * The app cannot send e-mail, so an invite is a record plus a message the owner copies and sends (WhatsApp, text...).
 */
export default function MembersCard() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const toast = useUi((s) => s.toast);
  const { user, company, role, isPlatformAdmin } = useAuth();
  const { rows: workerRows } = useWorkers();
  const myPhoto = useMyPhoto().url;
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("worker");
  const [workerId, setWorkerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [share, setShare] = useState<Invite | null>(null);
  // what happened to the invitation e-mail (shown in the "Send this" box): sending, sent, or why not
  const [mail, setMail] = useState<{ email: string; state: "sending" | "sent" | "demo" | "error"; note?: string } | null>(null);
  const cid = company?.id;

  const load = useCallback(async () => {
    if (!cid) return;
    try {
      const [m, i] = await Promise.all([backend.listMembers(cid), backend.listInvites(cid).catch(() => [] as Invite[])]);
      setMembers(m.sort((a, b) => ORDER[a.role] - ORDER[b.role] || (a.name || a.email || "").localeCompare(b.name || b.email || "")));
      setInvites(i.sort((a, b) => a.email.localeCompare(b.email)));
    } catch { setMembers([]); }
  }, [cid]);
  useEffect(() => { setMembers(null); setShare(null); load(); }, [load]);

  const workers = useMemo(() => workerRows.filter((w) => w.active !== false).sort((a, b) => a.name.localeCompare(b.name)), [workerRows]);
  const workerName = (id?: string) => workerRows.find((w) => w.id === id)?.name || "";
  if (!company || !user || !can(role, "members.view")) return null;

  const me = { uid: user.uid, role: role as Role };
  const lite = (members || []).map((m) => ({ uid: m.uid, role: m.role }));
  const invitable = ROLES.filter((r) => canInviteRole(role, r, isPlatformAdmin));
  const tellDenied = (r: Parameters<typeof denialText>[0]) => toast(t(...denialText(r)));

  const message = (inv: Invite) => inviteMessage(inv, lang, location.origin);
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast(t("Copied", "Copiado")); }
    catch { toast(t("Select the text and copy it", "Selecciona el texto y cópialo")); }
  };

  /** TradeWorks e-mails the invitation (Resend, functions/api/invite/send.js); the message to copy stays as a fallback. */
  const emailInvite = async (inv: Invite) => {
    setShare(inv); setMail({ email: inv.email, state: "sending" });
    try {
      const r = await sendInviteEmail(inv.email, lang);
      setMail({ email: inv.email, state: r });
      if (r === "sent") toast(t(`Invitation e-mailed to ${inv.email}`, `Invitación enviada por correo a ${inv.email}`));
    } catch (e) {
      const m = String((e as Error).message || "");
      setMail({ email: inv.email, state: "error", note: m === "not-setup" ? t("E-mail isn't set up yet.", "El correo todavía no está configurado.") : m });
    }
  };

  const sendInvite = async () => {
    setErr("");
    const e = normEmail(email);
    if (!isEmail(e)) { setErr(t("Type a valid email address.", "Escribe un correo válido.")); return; }
    if (!canInviteRole(role, inviteRole, isPlatformAdmin)) { setErr(t("You cannot invite that role.", "No puedes invitar a ese rol.")); return; }
    if ((members || []).some((m) => normEmail(m.email) === e)) { setErr(t("That person is already in your team.", "Esa persona ya está en tu equipo.")); return; }
    setBusy(true);
    try {
      const inv: Invite = {
        email: e, companyId: company.id, companyName: company.name, role: inviteRole,
        ...(inviteRole === "worker" && workerId ? { workerId } : {}), invitedBy: user.uid, invitedByName: user.name || undefined,
      };
      await backend.saveInvite(inv);
      setEmail(""); setWorkerId("");
      await load();
      emailInvite(inv);
    } catch { setErr(t("Could not save the invite. That email may already have an invite from another company.", "No se pudo guardar la invitación. Ese correo quizá ya tiene una invitación de otra empresa.")); }
    finally { setBusy(false); }
  };
  const revoke = async (inv: Invite) => {
    if (!await ask(t(`Cancel the invite for ${inv.email}?`, `¿Cancelar la invitación de ${inv.email}?`))) return;
    try { await backend.deleteInvite(inv.email); if (share?.email === inv.email) setShare(null); await load(); toast(t("Invite cancelled", "Invitación cancelada")); }
    catch { toast(t("Could not cancel the invite.", "No se pudo cancelar la invitación.")); }
  };
  const changeRole = async (m: Member, newRole: Role) => {
    const v = canChangeRole({ actor: me, members: lite, targetUid: m.uid, newRole, primaryOwnerUid: company.ownerUid, isPlatformAdmin });
    if (!v.ok) return tellDenied(v.reason);
    try { await backend.updateMember(company.id, m.uid, { role: newRole, ...(newRole !== "worker" ? { workerId: null } : {}) }); await load(); toast(t("Role updated", "Rol actualizado")); }
    catch { toast(t("Could not change the role.", "No se pudo cambiar el rol.")); }
  };
  const linkWorker = async (m: Member, id: string) => {
    if (!canLinkWorker(role, m.role)) return;
    try { await backend.updateMember(company.id, m.uid, { workerId: id || null }); await load(); toast(t("Saved", "Guardado")); }
    catch { toast(t("Could not save.", "No se pudo guardar.")); }
  };
  const remove = async (m: Member) => {
    const v = canRemoveMember({ actor: me, members: lite, targetUid: m.uid, primaryOwnerUid: company.ownerUid });
    if (!v.ok) return tellDenied(v.reason);
    if (!await ask(t(`Remove ${m.name || m.email} from ${company.name}? They lose access right away.`, `¿Quitar a ${m.name || m.email} de ${company.name}? Pierde el acceso de inmediato.`))) return;
    try { await backend.removeMember(company.id, m.uid); await load(); toast(t("Removed", "Quitado")); }
    catch { toast(t("Could not remove.", "No se pudo quitar.")); }
  };

  return (
    <div className="card mb-card">
      <div className="card-h"><h2>{t("Team & access", "Equipo y acceso")}</h2><span className="muted" style={{ fontSize: 12.5 }}>{t("who can open this company", "quién puede abrir esta empresa")}</span></div>
      <div className="card-b">
        <div className="mb-note">
          <span aria-hidden>✉</span>
          <span>{t(
            "TradeWorks e-mails the invitation when you create it (and you can also send the message by WhatsApp or text). The person must create their account with that exact email; then they tap Join.",
            "TradeWorks manda la invitación por correo al crearla (y también puedes mandar el mensaje por WhatsApp o texto). La persona debe crear su cuenta con ese mismo correo y luego toca Unirme.")}</span>
        </div>

        <div className="mb-h" style={{ marginTop: 0 }}>{t("Members", "Miembros")}</div>
        <div className="mb-list">
          {members === null && <div className="mb-empty">{t("Loading...", "Cargando...")}</div>}
          {members?.map((m) => {
            const self = m.uid === user.uid;
            const canRole = role === "owner" && !self && m.uid !== company.ownerUid;
            const canRm = !self && canRemoveMember({ actor: me, members: lite, targetUid: m.uid, primaryOwnerUid: company.ownerUid }).ok;
            return (
              <div className="mb-row" key={m.uid}>
                <div className="mb-who">
                  <Avatar name={m.name || (self ? user.name : "") || m.email} src={self ? myPhoto : workerRows.find((w) => w.id === m.workerId)?.photo?.url} />
                  <div><b><span>{m.name || (self ? user.name : "") || m.email || t("(no name)", "(sin nombre)")}</span>{self && <span className="mb-you">{t("you", "tú")}</span>}</b>
                  <small>{m.email || (self ? user.email : "") || "—"}</small></div>
                </div>
                <div>
                  <div className="mb-lbl">{t("Role", "Rol")}</div>
                  {canRole
                    ? <select value={m.role} aria-label={t("Role", "Rol")} onChange={(e) => changeRole(m, e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{t(...roleLabel(r))}</option>)}</select>
                    : <RoleBadge role={m.role} />}
                </div>
                <div>
                  {m.role === "worker" ? <>
                    <div className="mb-lbl">{t("Worker record", "Ficha de trabajador")}</div>
                    {canLinkWorker(role, m.role)
                      ? <select value={m.workerId || ""} aria-label={t("Worker record", "Ficha de trabajador")} onChange={(e) => linkWorker(m, e.target.value)}>
                          <option value="">{t("Not linked", "Sin vincular")}</option>
                          {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                          {m.workerId && !workers.some((w) => w.id === m.workerId) && <option value={m.workerId}>{workerName(m.workerId) || m.workerId}</option>}
                        </select>
                      : <span className="muted">{workerName(m.workerId) || "—"}</span>}
                  </> : <span className="muted">—</span>}
                </div>
                <div className="mb-acts">{canRm && <button className="btn sm danger" onClick={() => remove(m)}>{t("Remove", "Quitar")}</button>}</div>
              </div>
            );
          })}
        </div>
        {role === "admin" && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{t("Admins can invite and remove workers. Only owners change roles.", "Los administradores pueden invitar y quitar trabajadores. Solo los dueños cambian roles.")}</p>}

        {invites.length > 0 && <>
          <div className="mb-h">{t("Waiting to join", "Esperando unirse")}</div>
          <div className="mb-list">
            {invites.map((inv) => (
              <div className="mb-row" key={inv.email}>
                <div className="mb-who"><b><span>{inv.email}</span></b><small>{t("Invite sent, not accepted yet", "Invitación enviada, aún sin aceptar")}</small></div>
                <div><div className="mb-lbl">{t("Role", "Rol")}</div><RoleBadge role={inv.role} /></div>
                <div>{inv.role === "worker" ? <span className="muted">{workerName(inv.workerId) || t("Not linked", "Sin vincular")}</span> : <span className="muted">—</span>}</div>
                <div className="mb-acts">
                  <button className="btn sm" disabled={mail?.email === inv.email && mail.state === "sending"} onClick={() => emailInvite(inv)}>{t("E-mail again", "Enviar otra vez")}</button>
                  <button className="btn sm" onClick={() => { setShare(share?.email === inv.email ? null : inv); setMail(null); }}>{t("Message", "Mensaje")}</button>
                  {(role === "owner" || inv.role === "worker") && <button className="btn sm danger" onClick={() => revoke(inv)}>{t("Cancel", "Cancelar")}</button>}
                </div>
              </div>
            ))}
          </div>
        </>}

        {share && (
          <div className="mb-share">
            {mail?.email === share.email && <p className={"mb-mail " + mail.state} role="status">{
              mail.state === "sending" ? t("Sending the invitation by e-mail…", "Enviando la invitación por correo…")
              : mail.state === "sent" ? "✓ " + t(`Invitation e-mailed to ${share.email}. You can also send them this message.`, `Invitación enviada por correo a ${share.email}. También puedes mandarle este mensaje.`)
              : mail.state === "demo" ? t("Demo mode: no e-mail is sent. Copy the message below.", "Modo demo: no se manda correo. Copia el mensaje de abajo.")
              : t(`The e-mail could not be sent (${mail.note}). Send this message yourself.`, `No se pudo mandar el correo (${mail.note}). Manda este mensaje tú mismo.`)}</p>}
            <h3>{t(`Or send this to ${share.email}`, `O envía esto a ${share.email}`)}</h3>
            <textarea readOnly rows={6} value={message(share)} onFocus={(e) => e.currentTarget.select()} />
            <div className="row">
              <button className="btn pri sm" onClick={() => copy(message(share))}>{t("Copy message", "Copiar mensaje")}</button>
              <a className="btn sm" href={`https://wa.me/?text=${encodeURIComponent(message(share))}`} target="_blank" rel="noreferrer">WhatsApp</a>
              <a className="btn sm" href={mailtoHref(share.email, `subject=${encodeURIComponent(t("Invitation to TradeWorks", "Invitación a TradeWorks"))}&body=${encodeURIComponent(message(share))}`) || undefined}>{t("Email app", "App de correo")}</a>
              <button className="btn sm" onClick={() => setShare(null)}>{t("Close", "Cerrar")}</button>
            </div>
          </div>
        )}

        <div className="mb-h">{t("Invite someone", "Invitar a alguien")}</div>
        <div className="mb-form">
          <label className="f">{t("Their email", "Su correo")}<input type="email" value={email} inputMode="email" autoComplete="off" onChange={(e) => { setEmail(e.target.value); setErr(""); }} placeholder="name@example.com" /></label>
          <label className="f">{t("Role", "Rol")}
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>{invitable.map((r) => <option key={r} value={r}>{t(...roleLabel(r))}</option>)}</select></label>
          {inviteRole === "worker"
            ? <label className="f">{t("Worker record", "Ficha de trabajador")}
                <select value={workerId} onChange={(e) => setWorkerId(e.target.value)}><option value="">{t("Not linked yet", "Sin vincular aún")}</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
            : <span />}
          <button className="btn pri" disabled={busy || !email.trim()} onClick={sendInvite}>{t("Create invite", "Crear invitación")}</button>
        </div>
        {err && <p className="err" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>{err}</p>}
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{t(
          "Worker: sees only the Calendar, Team (own hours, clock in/out) and language / theme. Admin: everything except roles and the owner. Owner: everything.",
          "Trabajador: solo ve Calendario, Equipo (sus horas, entrada/salida) e idioma / tema. Administrador: todo menos roles y el dueño. Dueño: todo.")}</p>
      </div>
    </div>
  );
}
