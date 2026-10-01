import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useClients, useEstimates, useInvoices, useJobChats, useTasks, useTeamMsgs, useWorkers } from "../../data/hooks";
import { removeRec, saveRec, type Rec } from "../../data/repo";
import { Lightbox } from "../../components/Lightbox";
import { UploadList, useUploadQueue } from "../../components/UploadQueue";
import { shrinkImage } from "../../lib/image";
import { deleteFolder, deleteImage, putImage } from "../../lib/storage";
import { uid } from "../../lib/estimate";
import { sendTeamMsg, useChatMe, useChatSeen } from "../../data/teamChat";
import { useT } from "../../i18n";
import { clientNameOf } from "../../lib/calendar";
import { todayISO } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import { jobStatus } from "../../lib/jobStatus";
import { MSG_MAX, chatPhotoPath, defaultMembers, isUnread, isWorkerKey, latestAt, localDay, msgDays, sortChats } from "../../lib/teamChat";
import type { Estimate, JobChat, TeamMsg } from "../../lib/types";
import { useUi } from "../../store/ui";
import { EmptyState } from "../../ui/EmptyState";
import { Icon } from "../../ui/Icon";
import { Modal } from "../../ui/Modal";
import "./chat.css";
import { Badge } from "../../ui/Badge";

const WON = ["Sent", "Viewed", "Accepted", "Deposit Paid", "Paid in Full"];
const hhmm = (iso: string, lang: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString(lang === "es" ? "es" : "en", { hour: "numeric", minute: "2-digit" }); };
const initials = (s: string) => (s.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "?").toUpperCase();

/**
 * Job team chats (/chats, /chats/:id): one group chat per job with the owner / admins and the workers added to it.
 * Phone: the list, then the chat full screen. Desktop: list on the left, the open chat on the right.
 */
export default function Chats() {
  const t = useT();
  const { id } = useParams();
  const { isBoss } = useChatMe();
  const [pick, setPick] = useState(false);
  return (
    <div className={"page chat-page" + (id ? " has-thread" : "")}>
      <div className="page-h chat-h"><div><h1>{t("Chats", "Chats")}</h1>
        <p>{isBoss ? t("One chat per job with the workers on it.", "Un chat por trabajo con los trabajadores de ese trabajo.") : t("Your job chats with your boss and coworkers.", "Tus chats de trabajo con tu jefe y compañeros.")}</p></div>
        {isBoss && <button className="btn pri" onClick={() => setPick(true)}><Icon name="plus" size={18} />{t("New chat", "Nuevo chat")}</button>}
      </div>
      <div className="chat-wrap">
        <ChatList active={id} onNew={isBoss ? () => setPick(true) : undefined} />
        {id ? <ChatThread key={id} chatId={id} /> : <div className="card chat-none"><EmptyState icon="chat" title={t("Pick a chat", "Elige un chat")} text={t("Messages show here.", "Aquí se ven los mensajes.")} /></div>}
      </div>
      {pick && <NewChatModal onClose={() => setPick(false)} />}
    </div>
  );
}

function ChatList({ active, onNew }: { active?: string; onNew?: () => void }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const { rows, loading } = useJobChats();
  const me = useChatMe();
  const { seen } = useChatSeen();
  const chats = useMemo(() => sortChats(rows), [rows]);
  const when = (iso?: string) => !iso ? "" : localDay(iso) === todayISO() ? hhmm(iso, lang) : fmtDate(localDay(iso), lang);
  return (
    <div className="card chat-list">
      {!loading && chats.length === 0 ? (
        <EmptyState icon="chat" title={t("No chats yet", "Todavía no hay chats")}
          text={onNew ? t("Start one for a job and add the workers on it.", "Empieza uno para un trabajo y agrega a sus trabajadores.") : t("When your boss adds you to a job chat, it shows here.", "Cuando tu jefe te agregue a un chat de trabajo, aparecerá aquí.")}
         >{onNew && <button className="btn pri" onClick={onNew}>{t("New chat", "Nuevo chat")}</button>}</EmptyState>
      ) : chats.map((c) => {
        const unread = isUnread(c, seen[c.id], me.key);
        return (
          <Link key={c.id} to={"/chats/" + c.id} className={"chat-row" + (c.id === active ? " on" : "") + (unread ? " new" : "")}>
            <span className="chat-av"><Icon name="chat" size={18} /></span>
            <span className="chat-row-t">
              <span className="l1"><b>{c.jobLabel}</b><small>{when(c.last?.at)}</small></span>
              <span className="l2"><span>{c.last ? (c.last.by === me.key ? t("You: ", "Tú: ") : c.last.name + ": ") + c.last.text : t("No messages yet", "Sin mensajes todavía")}</span>
                {c.closed ? <Badge variant="outline" size="sm">{t("Closed", "Cerrado")}</Badge> : unread ? <i className="chat-dot" aria-label={t("New", "Nuevo")} /> : null}</span>
            </span>
          </Link>);
      })}
    </div>
  );
}

function ChatThread({ chatId }: { chatId: string }) {
  const t = useT();
  const nav = useNavigate();
  const lang = useUi((s) => s.lang), toast = useUi((s) => s.toast);
  const { company } = useAuth();
  const me = useChatMe();
  const { rows: chats, loading, patch } = useJobChats();
  const chat = chats.find((c) => c.id === chatId);
  const { rows: msgs } = useTeamMsgs(chat ? chatId : "_none");
  const { rows: workers } = useWorkers();
  const { markSeen } = useChatSeen();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState(false);
  const [zoom, setZoom] = useState(-1);
  const photoIn = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // a photo: upload card with progress / retry, then the message
  const q = useUploadQueue<null>(async (file, _m, onProgress) => {
    if (!company) throw new Error("signed out");
    const id = uid("m");
    const path = chatPhotoPath(company.id, chatId, me.key, id);
    const { url } = await putImage(path, await shrinkImage(file, 1600, 0.8), onProgress);
    await sendTeamMsg(company.id, chatId, me, "", { url, path }, id);
  });
  const days = useMemo(() => msgDays(chat ? msgs : []), [msgs, chat]);

  // read: everything up to the newest message
  const newest = chat ? latestAt(msgs) || chat.last?.at || "" : "";
  useEffect(() => { if (newest) markSeen(chatId, newest); }, [newest, chatId]); // eslint-disable-line react-hooks/exhaustive-deps
  // stay at the bottom as messages come in
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length]);

  if (loading) return <div className="card chat-thread" />;
  if (!chat) return me.isBoss ? <StartChat estId={chatId} /> : (
    <div className="card chat-thread"><EmptyState icon="chat" title={t("This chat isn't available", "Este chat no está disponible")}
      text={t("Your boss may have removed you from it.", "Puede que tu jefe te haya quitado de este chat.")}><Link className="btn" to="/chats">{t("All chats", "Todos los chats")}</Link></EmptyState></div>);

  const workerName = (id: string) => workers.find((w) => w.id === id)?.name || t("Worker", "Trabajador");
  const who = me.isBoss
    ? (chat.members.length ? chat.members.map(workerName).join(", ") : t("No workers yet", "Sin trabajadores todavía"))
    : t(`You, your boss and ${Math.max(0, chat.members.length - 1)} coworker${chat.members.length - 1 === 1 ? "" : "s"}`, `Tú, tu jefe y ${Math.max(0, chat.members.length - 1)} compañero${chat.members.length - 1 === 1 ? "" : "s"}`);
  const send = async () => {
    if (sending || !text.trim() || !company) return;
    setSending(true);
    try { await sendTeamMsg(company.id, chatId, me, text); setText(""); }
    catch { toast(t("Couldn't send. Check your connection and try again.", "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.")); }
    finally { setSending(false); }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // computer: Enter sends, Shift+Enter = new line. Phone keyboards: the Enter key makes a new line, the button sends.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && matchMedia("(pointer: fine)").matches) { e.preventDefault(); send(); }
  };
  const dayName = (d: string) => d === todayISO() ? t("Today", "Hoy") : fmtDate(d, lang);
  const kindName = (k?: string) => (k === "before" ? t("Before", "Antes") : k === "after" ? t("After", "Después") : k === "detail" ? t("Detail", "Detalle") : "");
  const photos = days.flatMap((d) => d.msgs).filter((m) => m.photo?.url);
  // only the owner / admins delete: one message, or the whole chat
  const delMsg = async (m: TeamMsg) => {
    if (!company || !confirm(t("Delete this message for everyone?", "¿Borrar este mensaje para todos?"))) return;
    try {
      await removeRec(company.id, `jobchats/${chatId}/msgs`, m.id);
      if (m.photo?.path?.includes("/chats/")) deleteImage(m.photo.path); // a chat-only photo; job photos stay on the job
    } catch { toast(t("Couldn't delete. Try again.", "No se pudo borrar. Intenta otra vez.")); }
  };
  const delChat = async () => {
    if (!company || !confirm(t("Delete this whole chat and all its messages for everyone? This can't be undone.", "¿Borrar todo este chat y todos sus mensajes para todos? No se puede deshacer."))) return;
    try {
      for (const m of msgs) await removeRec(company.id, `jobchats/${chatId}/msgs`, m.id);
      await removeRec(company.id, "jobchats", chatId);
      deleteFolder(`companies/${company.id}/chats/${chatId}`);
      toast(t("Chat deleted.", "Chat borrado."));
      nav("/chats");
    } catch { toast(t("Couldn't delete. Try again.", "No se pudo borrar. Intenta otra vez.")); }
  };
  const setClosed = async (closed: boolean) => {
    try { await patch(chatId, { closed }); toast(closed ? t("Chat closed.", "Chat cerrado.") : t("Chat open again.", "Chat abierto de nuevo.")); }
    catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Intenta otra vez.")); }
  };

  return (
    <div className="card chat-thread">
      <div className="chat-top">
        <button className="btn sm chat-back" onClick={() => nav("/chats")} aria-label={t("All chats", "Todos los chats")}>‹</button>
        <div className="chat-top-t">
          {me.isBoss ? <Link to={"/estimates/" + chat.estId}><b>{chat.jobLabel}</b></Link> : <b>{chat.jobLabel}</b>}
          <small className="muted">{who}</small>
        </div>
        {me.isBoss && <div className="chat-top-a">
          <button className="btn sm" onClick={() => setMembers(true)}><Icon name="team" size={16} />{t("Members", "Miembros")} · {chat.members.length}</button>
          <button className="btn sm" onClick={() => setClosed(!chat.closed)}>{chat.closed ? t("Reopen", "Reabrir") : t("Close chat", "Cerrar chat")}</button>
          <button className="btn sm danger" onClick={delChat}>{t("Delete chat", "Borrar chat")}</button>
        </div>}
      </div>

      <div className="chat-msgs" ref={scroller}>
        {days.length === 0 && <p className="muted chat-first">{t("No messages yet. Say hi to the team 👋", "Todavía no hay mensajes. Saluda al equipo 👋")}</p>}
        {days.map((d) => (
          <div key={d.day}>
            <div className="chat-day"><span>{dayName(d.day)}</span></div>
            {d.msgs.map((m, i) => {
              const mine = m.by === me.key, prev = d.msgs[i - 1], sameAsPrev = prev && prev.by === m.by;
              return (
                <div key={m.id} className={"chat-msg" + (mine ? " mine" : "") + (sameAsPrev ? " cont" : "")}>
                  {!mine && !sameAsPrev && <span className="chat-name">{m.name || "—"}{!isWorkerKey(m.by) && <Badge tone="acc" size="sm">{t("Boss", "Jefe")}</Badge>}</span>}
                  <div className={"chat-bub" + (m.photo ? " has-ph" : "")}>
                    {m.photo?.url && <button type="button" className="chat-ph" onClick={() => setZoom(photos.indexOf(m))} aria-label={t("Open photo", "Abrir foto")}>
                      <img src={m.photo.url} alt="" loading="lazy" />{kindName(m.photo.kind) && <Badge variant="overlay" size="sm" className="chat-ph-tag">{kindName(m.photo.kind)}</Badge>}</button>}
                    {m.text && <span className="chat-txt">{m.text}</span>}<small>{hhmm(m.at, lang)}</small></div>
                  {me.isBoss && <button type="button" className="chat-del" onClick={() => delMsg(m)} aria-label={t("Delete message", "Borrar mensaje")} title={t("Delete message", "Borrar mensaje")}>×</button>}
                </div>);
            })}
          </div>))}
      </div>

      {chat.closed ? (
        <p className="chat-closed muted">{me.isBoss ? t("This chat is closed. Reopen it to write again.", "Este chat está cerrado. Reábrelo para escribir otra vez.") : t("This chat is closed.", "Este chat está cerrado.")}</p>
      ) : (
        <>
        {q.items.length > 0 && <div className="chat-ups"><UploadList q={q} /></div>}
        <div className="chat-comp">
          <button type="button" className="btn chat-attach" onClick={() => photoIn.current?.click()} aria-label={t("Send a photo", "Enviar una foto")} title={t("Send a photo", "Enviar una foto")}><Icon name="camera" size={18} /></button>
          <input ref={photoIn} type="file" accept="image/*" multiple hidden onChange={(ev) => { q.add(ev.target.files, null); ev.target.value = ""; }} />
          <textarea rows={1} value={text} maxLength={MSG_MAX} placeholder={t("Write a message…", "Escribe un mensaje…")} aria-label={t("Message", "Mensaje")}
            onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
          <button className="btn pri chat-send" disabled={sending || !text.trim()} onClick={send} aria-label={t("Send", "Enviar")} title={t("Send", "Enviar")}><Icon name="send" size={18} /></button>
        </div>
        </>
      )}
      <Lightbox index={zoom} onIndex={setZoom} onClose={() => setZoom(-1)}
        items={photos.map((m) => ({ url: m.photo!.url, cap: [m.name, kindName(m.photo!.kind), hhmm(m.at, lang)].filter(Boolean).join(" · ") }))} />
      {members && <MembersModal chat={chat} onClose={() => setMembers(false)} onSave={async (ids) => { await patch(chatId, { members: ids }); setMembers(false); toast(t("Members saved.", "Miembros guardados.")); }} />}
    </div>
  );
}

/** Pick the workers of a job chat (owner / admin). */
function WorkerChecks({ value, onChange }: { value: string[]; onChange(ids: string[]): void }) {
  const t = useT();
  const { rows: workers } = useWorkers();
  const list = workers.filter((w) => w.active !== false || value.includes(w.id)).sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) return <p className="muted">{t("Add workers in Team first.", "Primero agrega trabajadores en Equipo.")}</p>;
  return (
    <div className="chat-checks">{list.map((w) => (
      <label key={w.id} className="chk"><input type="checkbox" checked={value.includes(w.id)} onChange={(e) => onChange(e.target.checked ? [...value, w.id] : value.filter((x) => x !== w.id))} />
        <span className="chat-av sm">{initials(w.name)}</span>{w.name}</label>))}
    </div>
  );
}

function MembersModal({ chat, onClose, onSave }: { chat: JobChat; onClose(): void; onSave(ids: string[]): Promise<void> }) {
  const t = useT(), toast = useUi((s) => s.toast);
  const [ids, setIds] = useState(chat.members);
  const [saving, setSaving] = useState(false);
  return (
    <Modal title={t("Who is in this chat", "Quién está en este chat")} onClose={onClose}>
      <p className="muted chat-hint">{t("You (and your admins) are always in it. Workers see the chat once their account is linked to their worker record.",
        "Tú (y tus administradores) siempre están. Los trabajadores ven el chat cuando su cuenta está vinculada a su ficha de trabajador.")}</p>
      <WorkerChecks value={ids} onChange={setIds} />
      <div className="tm-actions"><button className="btn pri" disabled={saving} onClick={async () => { setSaving(true); try { await onSave(ids); } catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Intenta otra vez.")); setSaving(false); } }}>{t("Save", "Guardar")}</button></div>
    </Modal>
  );
}

/** Owner opened /chats/{estId} for a job with no chat yet: pick the workers (those with tasks on it are ticked) and start it. */
function StartChat({ estId }: { estId: string }) {
  const t = useT();
  const lang = useUi((s) => s.lang), toast = useUi((s) => s.toast);
  const { company } = useAuth();
  const { rows: ests, loading } = useEstimates();
  const { rows: clients } = useClients();
  const { rows: tasks, loading: tasksLoading } = useTasks();
  const e = ests.find((x) => x.id === estId);
  const [ids, setIds] = useState<string[] | null>(null);
  // the job's crew + workers with tasks on it
  useEffect(() => { if (ids === null && !tasksLoading && e) setIds([...new Set([...(e.crew || []), ...defaultMembers(tasks, estId)])]); }, [tasks, tasksLoading, e, estId, ids]);
  const [saving, setSaving] = useState(false);
  if (loading) return <div className="card chat-thread" />;
  if (!e) return <div className="card chat-thread"><EmptyState icon="chat" title={t("Job not found", "No se encontró el trabajo")} text=""><Link className="btn" to="/chats">{t("All chats", "Todos los chats")}</Link></EmptyState></div>;
  const label = `${e.number} · ${clientNameOf(e, clients, lang)}`.slice(0, 120);
  const start = async () => {
    if (!company || saving) return;
    setSaving(true);
    try { await saveRec(company.id, "jobchats", { id: estId, estId, jobLabel: label, members: ids || [], closed: false } as JobChat & Rec); }
    catch { toast(t("Couldn't start the chat. Try again.", "No se pudo empezar el chat. Intenta otra vez.")); setSaving(false); }
  };
  return (
    <div className="card chat-thread chat-start">
      <div className="chat-top"><div className="chat-top-t"><b>{label}</b><small className="muted">{t("New team chat", "Nuevo chat del equipo")}</small></div></div>
      <div className="chat-start-b">
        <h3>{t("Who should be in this chat?", "¿Quién debe estar en este chat?")}</h3>
        <p className="muted chat-hint">{t("The job's crew and workers with tasks on it are already ticked.", "El equipo del trabajo y los trabajadores con tareas en él ya están marcados.")}</p>
        <WorkerChecks value={ids || []} onChange={setIds} />
        <button className="btn pri" disabled={saving} onClick={start}><Icon name="chat" size={18} />{t("Start chat", "Empezar chat")}</button>
      </div>
    </div>
  );
}

function NewChatModal({ onClose }: { onClose(): void }) {
  const t = useT();
  const nav = useNavigate();
  const lang = useUi((s) => s.lang);
  const { rows: ests } = useEstimates();
  const { rows: invoices } = useInvoices();
  const { rows: clients } = useClients();
  const { rows: chats } = useJobChats();
  const jobs = useMemo(() => ests.filter((e) => WON.includes(jobStatus(e, invoices)) && !chats.some((c) => c.id === e.id))
    .sort((a, b) => String(b.startDate || b.date || "").localeCompare(String(a.startDate || a.date || ""))).slice(0, 80), [ests, invoices, chats]);
  const [sel, setSel] = useState("");
  const label = (e: Estimate) => `${e.number} · ${clientNameOf(e, clients, lang)}`;
  return (
    <Modal title={t("New team chat", "Nuevo chat del equipo")} onClose={onClose}>
      {jobs.length === 0 ? <p className="muted">{t("Every sent or won job already has a chat.", "Todos los trabajos enviados o ganados ya tienen chat.")}</p> : (
        <>
          <label className="f">{t("Job", "Trabajo")}
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="">{t("Choose a job…", "Elige un trabajo…")}</option>
              {jobs.map((e) => <option key={e.id} value={e.id}>{label(e)}</option>)}
            </select></label>
          <div className="tm-actions"><button className="btn pri" disabled={!sel} onClick={() => { onClose(); nav("/chats/" + sel); }}>{t("Next", "Siguiente")}</button></div>
        </>
      )}
    </Modal>
  );
}
