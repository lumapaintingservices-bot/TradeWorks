import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useClients, useEstimates, useExpenses, useInvoices, useSettings } from "../data/hooks";
import { useT } from "../i18n";
import { calcEstimate, jobTypeLabel, jobTypeOf } from "../lib/estimate";
import { clientJobs, clientPhotos, clientTiles, colorsUsed, contactLine, referralLink, referralMessage, referredClients } from "../lib/clientProfile";
import { jobStatus, todayISO } from "../lib/followups";
import { EXP_METHODS, METHOD_ES } from "../lib/expenses";
import { markRewardPaid, programOn, referralRows, rewardAmount, rewardExpense } from "../lib/referrals";
import type { Client } from "../lib/types";
import { fmtDate, initials } from "../lib/format";
import { digitsOnly, waUrl } from "../lib/messages";
import { money } from "../lib/money";
import { useUi } from "../store/ui";
import { deleteJobPhoto } from "../data/teamPhotos";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { StatusBadge } from "../ui/StatusBadge";
import { ClientForm } from "./ClientForm";
import "./ClientProfile.css";
import { Badge } from "../ui/Badge";
import { ask } from "../ui/confirm";

export default function ClientProfile() {
  const t = useT();
  const nav = useNavigate();
  const { id = "" } = useParams();
  const lang = useUi((s) => s.lang);
  const toast = useUi((s) => s.toast);
  const { company } = useAuth();
  const { rows: clients, loading, save } = useClients();
  const { rows: ests } = useEstimates();
  const { rows: invoices } = useInvoices();
  const { settings } = useSettings();
  const [editing, setEditing] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const client = clients.find((c) => c.id === id);
  const jobs = useMemo(() => clientJobs(ests, id), [ests, id]);
  const tiles = useMemo(() => clientTiles(jobs, invoices, settings), [jobs, invoices, settings]);
  const refs = useMemo(() => referredClients(clients, id), [clients, id]);
  const refRows = useMemo(() => referralRows(clients, ests, invoices, settings).filter((r) => r.referrer.id === id), [clients, ests, invoices, settings, id]);
  const refOn = programOn(settings);
  const { save: saveExpense, remove: removeExpense } = useExpenses();
  const [reward, setReward] = useState("");
  const rewardFriend = clients.find((c) => c.id === reward);
  /** Takes a given reward back (and the marketing expense it logged). */
  const undoReward = async (friend: Client) => {
    if (!await ask(t("Mark this reward as not given?", "¿Marcar esta recompensa como no entregada?"))) return;
    if (friend.refReward?.expenseId) await removeExpense(friend.refReward.expenseId).catch(() => {});
    await save({ ...friend, refReward: undefined });
  };
  const colors = useMemo(() => colorsUsed(jobs), [jobs]);
  const photos = useMemo(() => clientPhotos(jobs), [jobs]);
  const delPhoto = async (p: (typeof photos)[number]) => {
    const e = ests.find((x) => x.id === p.estId);
    if (!e || !company || !await ask(t("Delete this photo? It is removed from the job too.", "¿Borrar esta foto? También se quita del trabajo."))) return;
    try { await deleteJobPhoto(company.id, e, p); toast(t("Photo deleted.", "Foto borrada.")); }
    catch { toast(t("Couldn't delete. Try again.", "No se pudo borrar. Intenta otra vez.")); }
  };
  const referrer = client?.referredBy ? clients.find((c) => c.id === client.referredBy) : undefined;

  /* ---- notes: autosave (debounced), flushed when leaving the page ---- */
  const [note, setNote] = useState("");
  const noteFor = useRef("");
  const dirty = useRef(false);
  const latest = useRef({ client, note, save });
  latest.current = { client, note, save };
  useEffect(() => {
    if (client && noteFor.current !== client.id) { noteFor.current = client.id; dirty.current = false; setNote(client.note || ""); }
  }, [client]);
  useEffect(() => {
    if (!dirty.current) return;
    const h = setTimeout(() => { dirty.current = false; const l = latest.current; if (l.client) void l.save({ ...l.client, note: l.note }); }, 700);
    return () => clearTimeout(h);
  }, [note]);
  useEffect(() => () => { if (dirty.current) { dirty.current = false; const l = latest.current; if (l.client) void l.save({ ...l.client, note: l.note }); } }, []);

  if (!client) {
    return (
      <div className="page">
        <div className="card"><div className="card-b cp-empty">
          <p className="muted">{loading ? "…" : t("Client not found.", "Cliente no encontrado.")}</p>
          <Link className="btn" to="/clients">← {t("Clients", "Clientes")}</Link>
        </div></div>
      </div>
    );
  }

  const es = lang === "es";
  const link = company ? referralLink(location.origin, company.id, client.id) : "";
  const clientLang = client.lang === "es" ? "es" : "en";
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast(t("Copied.", "Copiado.")); }
    catch { toast(t("Select the link and copy it.", "Selecciona el link y cópialo.")); }
  };
  const sub2 = [client.source ? t("Source: ", "Origen: ") + client.source : ""].filter(Boolean).join(" · ");

  return (
    <div className="page cp">
      <div className="cp-head">
        <div className="cp-who">
          <span className="cp-av">{initials(client.name)}</span>
          <div className="cp-name">
            <h1>{client.name || "—"}</h1>
            {contactLine(client) && <p className="muted">{contactLine(client)}</p>}
            {(sub2 || referrer) && (
              <p className="muted">{sub2}{sub2 && referrer ? " · " : ""}{referrer && <>{t("referred by ", "referido por ")}<Link to={`/clients/${referrer.id}`}>{referrer.name}</Link></>}</p>
            )}
          </div>
        </div>
        <div className="cp-btns">
          <Link className="btn" to="/clients">← {t("Clients", "Clientes")}</Link>
          {client.phone && <a className="btn cp-wa" target="_blank" rel="noopener noreferrer" href={waUrl(client.phone)}>WhatsApp</a>}
          {client.phone && <a className="btn" href={`tel:${digitsOnly(client.phone)}`}>{t("Call", "Llamar")}</a>}
          <button className="btn" onClick={() => setEditing(true)}>{t("Edit", "Editar")}</button>
          <button className="btn pri" onClick={() => nav(`/estimates?new=1&client=${client.id}`)}><Icon name="plus" />{t("New estimate", "Nuevo presupuesto")}</button>
        </div>
      </div>

      <div className="cp-tiles">
        <div className="card cp-tile"><span>{t("Jobs", "Trabajos")}</span><b>{tiles.jobs}</b></div>
        <div className="card cp-tile"><span>{t("Won", "Ganado")}</span><b>{money(tiles.won)}</b></div>
        <div className="card cp-tile"><span>{t("Paid", "Pagado")}</span><b>{money(tiles.paid)}</b></div>
        <div className="card cp-tile"><span>{t("Owes", "Debe")}</span><b>{money(tiles.owes)}</b></div>
      </div>

      <section className="card cp-sec">
        <div className="card-h"><h2>{t("Jobs", "Trabajos")}</h2></div>
        <div className="card-b">
          {jobs.length === 0 ? <p className="muted">{t("No estimates yet.", "Todavía no hay presupuestos.")}</p> : (
            <div className="cp-jobs">{jobs.map((e) => (
              <button key={e.id} className="cp-job" onClick={() => nav(`/estimates/${e.id}`)}>
                <span className="cp-job-nm"><b>{e.number} · {jobTypeLabel(jobTypeOf(e), es)}</b><span className="muted">{fmtDate(e.date, lang)}</span></span>
                <StatusBadge status={jobStatus(e, invoices)} />
                <span className="cp-job-amt">{money(calcEstimate(e, settings).total)}</span>
              </button>))}
            </div>
          )}
        </div>
      </section>

      <div className="cp-two">
        <section className="card">
          <div className="card-h"><h2>{t("Notes", "Notas")}</h2></div>
          <div className="card-b">
            <textarea rows={5} value={note} onChange={(e) => { dirty.current = true; setNote(e.target.value); }}
              placeholder={t("Gate code, pets, who decides, preferred days…", "Código del portón, mascotas, quién decide, días preferidos…")} />
          </div>
        </section>
        <section className="card">
          <div className="card-h"><h2>{t("Referrals", "Referidos")}</h2></div>
          <div className="card-b">
            <p className="muted cp-hint">{t("Their personal link — anyone who uses it is saved as referred by this client.", "Su link personal — quien lo use queda como referido de este cliente.")}</p>
            <div className="cp-ref">
              <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={t("Referral link", "Link de referidos")} />
              <button className="btn sm" onClick={copy}>{t("Copy", "Copiar")}</button>
              {client.phone && <a className="btn sm cp-wa" target="_blank" rel="noopener noreferrer" href={waUrl(client.phone, referralMessage(link, clientLang))}>{t("Send by WhatsApp", "Enviar por WhatsApp")}</a>}
            </div>
            <div className="cp-refs">
              <div className="cp-refs-h">{t("Referred by this client", "Referidos por este cliente")} · {refs.length}</div>
              {refs.length === 0 ? <p className="muted">{t("Nobody yet.", "Nadie todavía.")}</p> : refs.map((r) => {
                const row = refRows.find((x) => x.friend.id === r.id), rw = r.refReward;
                return (
                  <div key={r.id} className="cp-refrow">
                    <span className="cp-ref-who"><Link to={`/clients/${r.id}`}>{r.name}</Link>
                      <span className="muted">{fmtDate(dayOf(r.createdAt), lang)}</span>
                      {row && <Badge tone={row.status === "paid" ? "green" : row.status === "won" ? "blue" : "gray"} dot>
                        {row.status === "paid" ? t("Job paid", "Trabajo pagado") : row.status === "won" ? t("Job won", "Trabajo ganado") : t("Lead", "Lead")}</Badge>}</span>
                    <span className="cp-ref-rw">
                      {rw ? <><span className="muted">✓ {t("Reward given", "Recompensa entregada")} · {money(rw.amount)} · {fmtDate(rw.paidAt, lang)}</span>
                          <button className="link-btn" onClick={() => undoReward(r)}>{t("Undo", "Deshacer")}</button></>
                        : row?.reward === "earned" && refOn ? <button className="btn sm pri" onClick={() => setReward(r.id)}>{t("Give reward", "Entregar recompensa")}</button>
                        : refOn ? <span className="muted">{t("Reward when their job is paid", "Recompensa cuando paguen su trabajo")}</span> : null}
                    </span>
                  </div>);
              })}
            </div>
          </div>
        </section>
      </div>

      {colors.length > 0 && (
        <section className="card cp-sec">
          <div className="card-h"><h2>{t("Colors & products used", "Colores y productos usados")}</h2></div>
          <div className="cp-colors">{colors.map((c, i) => (
            <Link key={i} className="cp-color" to={`/estimates/${c.estId}`}><span className="muted">{c.number}</span><span>{c.text}</span></Link>))}
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <section className="card cp-sec">
          <div className="card-h"><h2>{t("Photos", "Fotos")}</h2></div>
          <div className="card-b"><div className="cp-ph">{photos.slice(0, 24).map((p) => (
            <div key={p.estId + p.id} className="cp-phw">
              <button className="cp-phb" onClick={() => setZoom(p.url)} title={[p.number, p.by ? "📷 " + p.by : "", p.caption].filter(Boolean).join(" · ")}>
                <img src={p.url} alt={p.caption || p.number} loading="lazy" /></button>
              <button className="cp-phx" aria-label={t("Delete photo", "Borrar foto")} title={t("Delete photo", "Borrar foto")} onClick={() => delPhoto(p)}>×</button>
              {p.by && <Badge variant="overlay" size="sm" className="cp-phby">{p.by}</Badge>}
            </div>))}
          </div></div>
        </section>
      )}

      {rewardFriend && <RewardModal referrer={client} friend={rewardFriend} amount={rewardAmount(settings)} onClose={() => setReward("")}
        onSave={async (amount, method, date, asExpense) => {
          let expenseId: string | undefined;
          if (asExpense && amount > 0) { expenseId = "x-ref-" + rewardFriend.id; await saveExpense(rewardExpense(expenseId, client, rewardFriend, amount, date, method) as never); }
          await save(markRewardPaid(rewardFriend, amount, date, method, expenseId) as never);
          setReward(""); toast(t("Reward saved", "Recompensa guardada"));
        }} />}
      {editing && <ClientForm client={client} exists onClose={() => setEditing(false)} onDeleted={() => nav("/clients")} />}
      {zoom && <Modal title={t("Photo", "Foto")} onClose={() => setZoom(null)} wide><img className="cp-zoom" src={zoom} alt="" /></Modal>}
    </div>
  );
}

/** YYYY-MM-DD of a stored timestamp (ISO string, Firestore Timestamp or Date). */
function dayOf(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  const o = v as { toDate?: () => Date; seconds?: number };
  const d = o.toDate ? o.toDate() : o.seconds ? new Date(o.seconds * 1000) : v instanceof Date ? v : null;
  if (!d || isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Give reward": what was given, how, when — and whether to log it as a marketing expense (source Referral). */
function RewardModal({ referrer, friend, amount, onClose, onSave }: {
  referrer: Client; friend: Client; amount: number; onClose(): void;
  onSave(amount: number, method: string, date: string, asExpense: boolean): Promise<void>;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const [amt, setAmt] = useState(String(amount));
  const [method, setMethod] = useState("");
  const [date, setDate] = useState(todayISO());
  const [asExpense, setAsExpense] = useState(true);
  const [busy, setBusy] = useState(false);
  const go = async () => { if (busy) return; setBusy(true); try { await onSave(Math.max(0, Number(amt) || 0), method, date || todayISO(), asExpense); } finally { setBusy(false); } };
  return (
    <Modal title={t("Give referral reward", "Entregar recompensa por referido")} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>{t(`${referrer.name} referred ${friend.name}, whose job is paid in full.`, `${referrer.name} recomendó a ${friend.name}, cuyo trabajo ya está pagado.`)}</p>
      <div className="grid2">
        <label className="f">{t("Value ($)", "Valor ($)")}<input type="number" min={0} step={5} inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
        <label className="f">{t("Date", "Fecha")}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      <label className="f">{t("How it was given", "Cómo se entregó")}
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">{t("Discount on their next job", "Descuento en su próximo trabajo")}</option>
          {EXP_METHODS.map((m) => <option key={m} value={m}>{lang === "es" ? METHOD_ES[m] || m : m}</option>)}
        </select></label>
      <label className="chk" style={{ marginBottom: 14 }}><input type="checkbox" checked={asExpense} onChange={(e) => setAsExpense(e.target.checked)} />
        {t("Also log it as a marketing expense (source: Referral)", "Anotarlo también como gasto de marketing (fuente: Referral)")}</label>
      <button className="btn pri" disabled={busy} onClick={go}>{t("Save", "Guardar")}</button>
    </Modal>
  );
}
