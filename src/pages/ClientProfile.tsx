import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useClients, useEstimates, useInvoices, useSettings } from "../data/hooks";
import { useT } from "../i18n";
import { calcEstimate, jobTypeLabel, jobTypeOf } from "../lib/estimate";
import { clientJobs, clientPhotos, clientTiles, colorsUsed, contactLine, referralLink, referralMessage, referredClients } from "../lib/clientProfile";
import { jobStatus } from "../lib/followups";
import { fmtDate, initials } from "../lib/format";
import { digitsOnly, waUrl } from "../lib/messages";
import { money } from "../lib/money";
import { useUi } from "../store/ui";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { StatusBadge } from "../ui/StatusBadge";
import { ClientForm } from "./ClientForm";
import "./ClientProfile.css";

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
  const colors = useMemo(() => colorsUsed(jobs), [jobs]);
  const photos = useMemo(() => clientPhotos(jobs), [jobs]);
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
              {refs.length === 0 ? <p className="muted">{t("Nobody yet.", "Nadie todavía.")}</p> : refs.map((r) => (
                <div key={r.id} className="cp-refrow">
                  <Link to={`/clients/${r.id}`}>{r.name}</Link>
                  <span className="muted">{fmtDate(dayOf(r.createdAt), lang)}</span>
                </div>))}
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
            <button key={p.estId + p.id} className="cp-phb" onClick={() => setZoom(p.url)} title={p.caption || p.number}>
              <img src={p.url} alt={p.caption || p.number} loading="lazy" /></button>))}
          </div></div>
        </section>
      )}

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
