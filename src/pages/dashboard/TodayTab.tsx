import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMetricsCtx } from "../../data/metrics";
import { useTasks } from "../../data/hooks";
import { useT } from "../../i18n";
import { calcEstimate, jobWhat } from "../../lib/estimate";
import { fmtTime, taskSort } from "../../lib/calendar";
import { addDaysISO, fmtWhen, leadClients, todayISO } from "../../lib/followups";
import { fmtDate } from "../../lib/format";
import { invoiceSummary, jobStatus, nameOf, wonSummary } from "../../lib/metrics";
import { money, num } from "../../lib/money";
import type { EstStatus, Task } from "../../lib/types";
import { useUi } from "../../store/ui";
import { Icon } from "../../ui/Icon";
import { StatusBadge } from "../../ui/StatusBadge";
import { FollowUpList } from "../FollowUps";
import "./dashboard.css";

/** Job status list of the "Jobs status" card (prototype JOB_ST, plus Viewed which the app tracks separately). */
const JOB_ST: { k: EstStatus; en: string; es: string; ic: string }[] = [
  { k: "Draft", en: "Draft", es: "Borrador", ic: "estimates" },
  { k: "Sent", en: "Sent", es: "Enviado", ic: "send" },
  { k: "Viewed", en: "Viewed", es: "Visto", ic: "user" },
  { k: "Accepted", en: "Accepted", es: "Aceptado", ic: "check" },
  { k: "Deposit Paid", en: "Deposit paid", es: "Depósito pagado", ic: "wallet" },
  { k: "Paid in Full", en: "Paid in full", es: "Pagado completo", ic: "dollar" },
  { k: "Declined", en: "Declined", es: "Rechazado", ic: "alert" },
];
const TAB_SOURCES = 4;

/** Dashboard > Today: upcoming jobs, business flow, job status, where clients come from, follow-ups, activity and to-do. */
export default function TodayTab({ onTab }: { onTab?: (tab: string) => void } = {}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const es = lang === "es";
  const toast = useUi((s) => s.toast);
  const nav = useNavigate();
  const { ctx, loading } = useMetricsCtx();
  const { rows: tasks, save: saveTask } = useTasks();
  const today = todayISO(ctx.now);

  const st = useMemo(() => new Map(ctx.estimates.map((e) => [e.id, jobStatus(ctx, e)] as const)), [ctx]);
  const stOf = (id: string): EstStatus => (st.get(id) || "Draft") as EstStatus;

  /* upcoming: on site now or starting within 30 days, declined jobs never show */
  const upcoming = useMemo(() => {
    const until = addDaysISO(today, 30);
    return ctx.estimates.flatMap((e) => {
      if (!e.startDate || stOf(e.id) === "Declined") return [];
      const end = addDaysISO(e.startDate, Math.max(0, (num(e.days) || 1) - 1));
      if (end < today || e.startDate > until) return [];
      return [{ e, status: stOf(e.id), now: e.startDate <= today }];
    }).sort((a, z) => a.e.startDate.localeCompare(z.e.startDate)).slice(0, 8);
  }, [ctx, st, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const flow = useMemo(() => {
    let openJobs = 0, quoted = 0, sent = 0;
    const counts: Partial<Record<EstStatus, number>> = {};
    for (const e of ctx.estimates) {
      const s = stOf(e.id);
      counts[s] = (counts[s] || 0) + 1;
      if (s !== "Paid in Full" && s !== "Declined") openJobs++;
      if (s === "Sent" || s === "Viewed") sent++;
    }
    const won = wonSummary(ctx, "year"), inv = invoiceSummary(ctx);
    let collected = 0; for (const v of ctx.invoices) if (v.status === "Paid") collected += num(v.amount);
    for (const e of ctx.estimates) { const s = stOf(e.id); if (s === "Draft" || s === "Sent" || s === "Viewed") quoted += calcEstimate(e, ctx.settings).total; }
    return { counts, openJobs, quoted, sent, won, outstanding: inv.unpaid, collected, leads: leadClients(ctx.clients, ctx.estimates).length };
  }, [ctx, st]); // eslint-disable-line react-hooks/exhaustive-deps

  const sources = useMemo(() => {
    const m: Record<string, number> = {}; let tot = 0;
    for (const e of ctx.estimates) { const k = e.leadSource || t("Not set", "Sin anotar"); m[k] = (m[k] || 0) + 1; tot++; }
    return Object.keys(m).sort((a, z) => m[z] - m[a]).slice(0, 6).map((k) => ({ k, pct: Math.round((m[k] / (tot || 1)) * 100) }));
  }, [ctx.estimates, es]); // eslint-disable-line react-hooks/exhaustive-deps

  /* activity feed: newest 15 lines across all estimates */
  const feed = useMemo(() => {
    const all: { e: (typeof ctx.estimates)[number]; a: { at: string; text: string } }[] = [];
    for (const e of ctx.estimates) for (const a of e.activity || []) all.push({ e, a });
    return all.sort((x, z) => String(z.a.at).localeCompare(String(x.a.at))).slice(0, 15);
  }, [ctx.estimates]);

  /* to-do: not done, due today or late */
  const open = useMemo(() => tasks.filter((k) => !k.done), [tasks]);
  const due = useMemo(() => open.filter((k) => (k.date || today) <= today).sort((a, z) => String(a.date).localeCompare(String(z.date)) || taskSort(a, z)), [open, today]);
  const later = open.length - due.length;
  const toggle = async (k: Task) => { await saveTask({ ...k, done: true } as never); toast(t("Task done.", "Tarea lista.")); };
  const goTab = (n: number) => { if (onTab) return onTab("sources"); (document.querySelectorAll<HTMLButtonElement>(".tabs button")[n])?.click(); window.scrollTo(0, 0); };
  const dateLabel = (iso: string) => (iso === today ? t("Today", "Hoy") : iso === addDaysISO(today, 1) ? t("Tomorrow", "Mañana") : fmtDate(iso, lang));

  if (loading) return null;
  const day = (iso: string) => { const d = new Date(iso + "T12:00:00"), l = es ? "es-US" : "en-US"; return { d: d.toLocaleDateString(l, { day: "numeric" }), m: d.toLocaleDateString(l, { month: "short" }).replace(".", "") }; };
  const total = ctx.estimates.length || 1;
  const kp = (icon: string, label: string, val: string | number) => <div className="db-kp" key={label}><span><Icon name={icon} size={16} />{label}</span><b>{val}</b></div>;

  return (
    <>
      <div className="db-today">
        <div>
          <section className="card">
            <div className="card-h"><h2>{t("Upcoming jobs", "Próximos trabajos")}</h2>
              <Link className="btn sm" to="/calendar"><Icon name="calendar" size={16} />{t("Calendar", "Calendario")}</Link></div>
            {upcoming.length === 0 ? <div className="db-empty2">{t("No jobs on the calendar for the next 30 days.", "No hay trabajos en el calendario los próximos 30 días.")}</div> : (
              <>
                <div className="tbl-wrap only-desk">
                  <table className="tbl">
                    <thead><tr><th /><th>{t("Job", "Trabajo")}</th><th>{t("Status", "Estado")}</th><th>{t("Address", "Dirección")}</th><th>{t("Days", "Días")}</th><th>{t("No.", "Núm.")}</th></tr></thead>
                    <tbody>
                      {upcoming.map(({ e, status, now }) => { const dd = day(e.startDate); return (
                        <tr key={e.id} className="click" onClick={() => nav(`/estimates/${e.id}`)}>
                          <td className={"db-when" + (now ? " now" : "")}><b>{dd.d}</b><span>{dd.m}</span></td>
                          <td><div className="db-nm">{nameOf(ctx, e)}</div><div className="db-sm">{jobWhat(e, lang)}</div></td>
                          <td>{now ? <span className="badge b-teal"><i />{t("On site now", "En obra ahora")}</span> : <StatusBadge status={status} />}</td>
                          <td className="db-addr">{e.address || "—"}</td>
                          <td className="db-num">{num(e.days) || 1} {t("d", "d")}</td>
                          <td className="db-num"><u>{e.number}</u></td>
                        </tr>); })}
                    </tbody>
                  </table>
                </div>
                <div className="cards only-phone db-pad">
                  {upcoming.map(({ e, status, now }) => { const dd = day(e.startDate); return (
                    <button key={e.id} className="db-upc" onClick={() => nav(`/estimates/${e.id}`)}>
                      <span className={"db-when" + (now ? " now" : "")}><b>{dd.d}</b><span>{dd.m}</span></span>
                      <span className="mid">
                        <span className="l1"><b>{nameOf(ctx, e)}</b><span className="db-sm">{e.number}</span></span>
                        <span className="l2" style={{ display: "block" }}>{jobWhat(e, lang)}</span>
                        <span className="l3">{now ? <span className="badge b-teal"><i />{t("On site now", "En obra ahora")}</span> : <StatusBadge status={status} />}<span>{num(e.days) || 1} {t("d", "d")}</span></span>
                        {e.address && <span className="l2" style={{ display: "block", marginTop: 4 }}>{e.address}</span>}
                      </span>
                    </button>); })}
                </div>
              </>
            )}
          </section>

          <section className="card">
            <div className="card-h"><h2>{t("Business flow", "Flujo del negocio")}</h2></div>
            <div className="db-kps">
              {kp("inbox", t("New leads", "Leads nuevos"), flow.leads)}
              {kp("send", t("Estimates sent", "Presupuestos enviados"), flow.sent)}
              {kp("briefcase", t("Jobs in progress", "Trabajos en curso"), flow.openJobs)}
              {kp("estimates", t("Open quotes", "Presupuestos abiertos"), money(flow.quoted))}
              {kp("check", t("Work won", "Trabajo ganado") + " (" + t("this year", "este año") + ")", money(flow.won.total))}
              {kp("invoices", t("Outstanding", "Por cobrar"), money(flow.outstanding))}
              {kp("dollar", t("Collected", "Cobrado"), money(flow.collected))}
              {kp("clients", t("Accepted jobs", "Trabajos aceptados"), flow.won.n)}
            </div>
          </section>
        </div>

        <div>
          <section className="card">
            <div className="card-h"><h2>{t("Jobs status", "Estado de los trabajos")}</h2></div>
            <div className="db-stl">
              {JOB_ST.map((s) => { const n = flow.counts[s.k] || 0; return (
                <button key={s.k} className="db-st" onClick={() => nav("/pipeline")}>
                  <Icon name={s.ic} size={16} /><span>{es ? s.es : s.en}</span>
                  <b>{n} {n === 1 ? t("job", "trabajo") : t("jobs", "trabajos")}</b><em>{Math.round((n / total) * 100)}%</em>
                </button>); })}
            </div>
          </section>

          <section className="card">
            <div className="card-h"><h2>{t("Where clients come from", "De dónde vienen los clientes")}</h2></div>
            <div className="card-b">
              {sources.length ? sources.map((s) => (
                <div className="db-bar" key={s.k}><span title={s.k}>{s.k}</span><div><i style={{ width: Math.max(s.pct, 6) + "%" }}>{s.pct}%</i></div></div>
              )) : <div className="muted" style={{ fontSize: 13.5 }}>{t("Pick the source on each estimate and it shows up here.", "Escoge el origen en cada presupuesto y aparece aquí.")}</div>}
              <button className="btn" style={{ width: "100%", marginTop: 12 }} onClick={() => goTab(TAB_SOURCES)}>{t("View all", "Ver todo")}</button>
            </div>
          </section>
        </div>
      </div>

      <div className="db-cols">
        <FollowUpList limit={5} />
        <section className="card">
          <div className="card-h"><h2>{t("What your clients did", "Lo que hicieron tus clientes")}</h2></div>
          {feed.length ? (
            <div className="db-feed db-feed-more">
              {feed.map((x, i) => (
                <button key={x.e.id + i} onClick={() => nav(`/estimates/${x.e.id}`)}>
                  <b>{nameOf(ctx, x.e)}</b> {String(x.a.text).charAt(0).toLowerCase() + String(x.a.text).slice(1)}
                  <small>{x.e.number}, {fmtWhen(x.a.at, lang)}</small>
                </button>))}
            </div>
          ) : <div className="db-empty2">{t("When clients open the link, pick options or sign, it shows up here.", "Cuando tus clientes abran el link, escojan opciones o firmen, aparece aquí.")}</div>}
        </section>
      </div>

      <section className="card db-sec">
        <div className="card-h">
          <div className="db-task-h" style={{ width: "100%" }}>
            <h2>{t("To do", "Por hacer")}</h2><span className="sp" />
            <span className="db-sm">{t(`${due.length} for today · ${later} later`, `${due.length} para hoy · ${later} después`)}</span>
            <Link className="btn sm" to="/calendar">{t("Open calendar", "Abrir calendario")}</Link>
          </div>
        </div>
        <div className="card-b">
          {due.length === 0 && <div className="muted" style={{ fontSize: 13.5 }}>{t("Nothing due today — you are clear.", "Nada para hoy — estás al día.")}</div>}
          {due.map((k) => {
            const job = k.estId ? ctx.estimates.find((e) => e.id === k.estId) : undefined, late = (k.date || today) < today;
            return (
              <div className="db-task" key={k.id}>
                <button className="db-check" aria-label={t("Mark done", "Marcar lista")} title={t("Mark done", "Marcar lista")} onClick={() => toggle(k)}>✓</button>
                <div className="tx">
                  <div className="tt">{k.title}</div>
                  <div className={"dd" + (late ? " late" : "")}>{dateLabel(k.date || today)}{k.time ? " · " + fmtTime(k.time) : ""}{late ? " · " + t("Late", "Atrasada") : ""}
                    {job && <> · <button className="lk" onClick={() => nav(`/estimates/${job.id}`)}>{job.number} · {nameOf(ctx, job)}</button></>}</div>
                </div>
              </div>);
          })}
        </div>
      </section>
    </>
  );
}
