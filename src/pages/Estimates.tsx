import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useClients, useEstimates, useSettings, nextEstimateNumber } from "../data/hooks";
import { useT } from "../i18n";
import { applyTypePreset, blankEstimate, calcEstimate, jobDetail, jobTypeLabel, jobTypesOf, JOB_TYPES, suggestTypeFor, uid } from "../lib/estimate";
import { fmtDate } from "../lib/format";
import { money, num } from "../lib/money";
import { STATUSES, type Estimate, type JobType } from "../lib/types";
import { useUi } from "../store/ui";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { StatusBadge, statusLabel } from "../ui/StatusBadge";
import { useTableSort } from "../ui/useTableSort";

export default function Estimates() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { rows, save } = useEstimates();
  const { rows: clients } = useClients();
  const { settings, update } = useSettings();
  const [q, setQ] = useState(""); const [st, setSt] = useState("all"); const [jt, setJt] = useState("all");

  const picking = sp.get("new") === "1";
  const clientId = sp.get("client") || "";
  const client = clients.find((c) => c.id === clientId);
  const closePicker = () => setSp({}, { replace: true });

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((e) => (st === "all" || e.status === st) && (jt === "all" || (e.jobType || "cabinets") === jt) &&
      (!s || [e.number, e.clientName, e.address].some((x) => (x || "").toLowerCase().includes(s))))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.number.localeCompare(a.number));
  }, [rows, q, st, jt]);
  // job types of the company's trade, plus any older estimate's type (e.g. after switching trade)
  const typeOptions = useMemo(() => {
    const base = jobTypesOf(settings.trade).map((j) => ({ id: j.id, en: j.en, es: j.es }));
    for (const r of rows) { const id = r.jobType || "cabinets"; if (!base.some((b) => b.id === id)) base.push({ id, en: jobTypeLabel(id), es: jobTypeLabel(id, true) }); }
    return base;
  }, [rows, settings.trade]);
  // the starter cabinet templates only make sense for painting; a trade shows just the templates of its own job types
  const templates = settings.jobTemplates.filter((tp) => jobTypesOf(settings.trade) === JOB_TYPES || jobTypesOf(settings.trade).some((j) => j.id === tp.data.jobType));
  const totalOf = (e: Estimate) => calcEstimate(e, settings).total;
  const sum = list.reduce((a, e) => a + totalOf(e), 0);

  async function create(type: JobType, tplId?: string) {
    const { number, n } = nextEstimateNumber(settings, rows);
    let e = blankEstimate(settings, number, lang);
    const tpl = tplId ? settings.jobTemplates.find((x) => x.id === tplId) : undefined;
    e = applyTypePreset(e, settings, (tpl?.data.jobType as JobType) || type);
    if (tpl) e = { ...e, ...JSON.parse(JSON.stringify(tpl.data)), id: e.id, number, jobType: e.jobType, status: "Draft" };
    if (client) {
      e = { ...e, clientId: client.id, clientName: client.name, address: client.address, phone: client.phone, email: client.email, docLang: client.lang || e.docLang, leadSource: client.source || "" };
    }
    await save(e);
    await update({ numbering: { ...settings.numbering, nextEst: n + 1 } });
    nav(`/estimates/${e.id}`);
  }
  const sug = suggestTypeFor(client, settings.trade);

  const { sorted, th } = useTableSort(list, { num: { get: (e) => e.number, first: "desc" }, client: { get: (e) => e.clientName }, date: { get: (e) => e.date, first: "desc" }, status: { get: (e) => e.status }, total: { get: (e) => totalOf(e), first: "desc" } });
  return (
    <div className="page">
      <div className="page-h">
        <div><h1>{t("Estimates", "Presupuestos")}</h1><p>{t(`${list.length} estimates · ${money(sum)}`, `${list.length} presupuestos · ${money(sum)}`)}</p></div>
        <button className="btn pri" onClick={() => setSp({ new: "1" })}><Icon name="plus" />{t("New estimate", "Nuevo presupuesto")}</button>
      </div>
      {rows.length === 0 ? (
        <div className="card"><EmptyState icon="estimates" title={t("No estimates yet", "Aún no hay presupuestos")} text={t("Create your first estimate and send your client a link to review and sign.", "Crea tu primer presupuesto y envía a tu cliente un enlace para revisar y firmar.")}>
          <button className="btn pri" onClick={() => setSp({ new: "1" })}>{t("Create first estimate", "Crear primer presupuesto")}</button></EmptyState></div>
      ) : (
        <>
          <div className="toolbar">
            <input placeholder={t("Search number, client, address…", "Buscar número, cliente, dirección…")} value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={st} onChange={(e) => setSt(e.target.value)}><option value="all">{t("All statuses", "Todos los estados")}</option>{STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s, lang === "es")}</option>)}</select>
            <select value={jt} onChange={(e) => setJt(e.target.value)}><option value="all">{t("All job types", "Todos los tipos")}</option>{typeOptions.map((j) => <option key={j.id} value={j.id}>{lang === "es" ? j.es : j.en}</option>)}</select>
          </div>
          <div className="card only-desk tbl-wrap">
            <table className="tbl">
              <thead><tr>{th("num", "#")}{th("client", t("Client", "Cliente"))}{th("date", t("Date", "Fecha"))}<th>{t("Job", "Trabajo")}</th>{th("status", t("Status", "Estado"))}{th("total", t("Total", "Total"), "r")}</tr></thead>
              <tbody>{sorted.map((e) => (
                <tr key={e.id} className="click" onClick={() => nav(`/estimates/${e.id}`)}>
                  <td><b>{e.number}</b></td>
                  <td><b>{e.clientName || t("No client", "Sin cliente")}</b><div className="muted" style={{ fontSize: 12.5 }}>{e.address}</div></td>
                  <td>{fmtDate(e.date, lang)}</td>
                  <td>{jobTypeLabel(e.jobType || "cabinets", lang === "es")}<div className="muted" style={{ fontSize: 12.5 }}>{jobDetail(e, lang)}</div></td>
                  <td><StatusBadge status={e.status} /></td><td className="r"><b>{money(totalOf(e))}</b></td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="cards only-phone">{sorted.map((e) => (
            <div key={e.id} className="ec" onClick={() => nav(`/estimates/${e.id}`)}>
              <div className="l1"><span>{e.clientName || t("No client", "Sin cliente")}</span><span>{money(totalOf(e))}</span></div>
              <div className="l2"><span>{e.number} · {fmtDate(e.date, lang)} · {jobTypeLabel(e.jobType || "cabinets", lang === "es")}</span><StatusBadge status={e.status} /></div>
            </div>))}</div>
        </>
      )}
      {picking && (
        <Modal title={t("New estimate", "Nuevo presupuesto")} onClose={closePicker}>
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{client ? `${client.name} · ` : ""}{t("What kind of job is it? Each one starts with its own spec, days, scope of work and terms.", "¿Qué tipo de trabajo es? Cada uno empieza con su propia especificación, días, alcance y términos.")}</p>
          <div className="jt-grid">{jobTypesOf(settings.trade).map((j) => (
            <button key={j.id} className={"jt-card" + (sug === j.id ? " sug" : "")} onClick={() => create(j.id)}>
              <b>{lang === "es" ? j.es : j.en}</b><span className="muted">{lang === "es" ? j.hint[1] : j.hint[0]}</span>
              {sug === j.id && <em>{t("From the request", "Según la solicitud")}</em>}
            </button>))}</div>
          {templates.length > 0 && <>
            <div style={{ margin: "16px 0 8px", fontWeight: 600, fontSize: 13 }}>{t("Or start from one of your templates", "O empieza desde una de tus plantillas")}</div>
            <div className="cards">{templates.map((tp) => (
              <button key={tp.id} className="btn" style={{ height: "auto", padding: "10px 14px", justifyContent: "space-between" }} onClick={() => create((tp.data.jobType as JobType) || "cabinets", tp.id)}>
                <b>{tp.name}</b><span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>{jobTypeLabel((tp.data.jobType as JobType) || "cabinets", lang === "es")}{num(tp.data.doors) ? ` · ${num(tp.data.doors)} ${t("doors", "puertas")}` : ""}</span>
              </button>))}</div></>}
        </Modal>
      )}
    </div>
  );
}
