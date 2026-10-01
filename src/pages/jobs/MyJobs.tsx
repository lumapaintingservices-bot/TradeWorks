import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { tickCrew } from "../../data/crew";
import { useClock, useCrewJobs, useJobChats, useTasks } from "../../data/hooks";
import { useChatMe } from "../../data/teamChat";
import { useT } from "../../i18n";
import { cleanDone, crewDates, crewEnd, jobDayNo, mapsUrl, myJobsSplit, onSite } from "../../lib/crew";
import { todayISO } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import type { CrewJob } from "../../lib/types";
import { useUi } from "../../store/ui";
import { EmptyState } from "../../ui/EmptyState";
import { Icon } from "../../ui/Icon";
import { WorkerPhotos } from "../team/WorkerPhotos";
import "./jobs.css";
import { Badge } from "../../ui/Badge";

type T = ReturnType<typeof useT>;
const range = (j: Pick<CrewJob, "start" | "days">, lang: string) => {
  if (!j.start) return "";
  const end = crewEnd(j);
  return fmtDate(j.start, lang as "en" | "es") + (end !== j.start ? " – " + fmtDate(end, lang as "en" | "es") : "");
};
function whenLabel(j: CrewJob, today: string, t: T, lang: string) {
  if (!j.start) return t("Not scheduled yet", "Sin fecha todavía");
  if (onSite(j, today)) return j.days > 1 ? t(`Today · day ${jobDayNo(j, today)} of ${j.days}`, `Hoy · día ${jobDayNo(j, today)} de ${j.days}`) : t("Today", "Hoy");
  if (j.start > today) return t("Starts ", "Empieza ") + fmtDate(j.start, lang as "en" | "es");
  return t("Finished ", "Terminó ") + fmtDate(crewEnd(j), lang as "en" | "es");
}
const doneCount = (j: CrewJob) => { const d = cleanDone(j.done, j.checklist); return { done: Object.keys(d).length, total: j.checklist.length }; };

/** Worker home (/jobs): the jobs they are on the crew of. Owners and admins see jobs in Estimates. */
export function MyJobs() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const { role, workerId } = useAuth();
  const { rows, loading } = useCrewJobs();
  const today = todayISO();
  const split = useMemo(() => myJobsSplit(rows, workerId || "", today), [rows, workerId, today]);
  if (role !== "worker") return <Navigate to="/estimates" replace />;
  const none = !loading && !split.today.length && !split.upcoming.length && !split.unscheduled.length && !split.recent.length;
  const sec = (title: string, list: CrewJob[]) => list.length > 0 && (
    <section className="mj-sec"><h2>{title}</h2><div className="mj-list">{list.map((j) => <JobCard key={j.id} j={j} today={today} t={t} lang={lang} />)}</div></section>);
  return (
    <div className="page mj-page">
      <div className="page-h"><div><h1>{t("My jobs", "Mis trabajos")}</h1><p>{t("Where to go, what to do, and the checklist.", "A dónde ir, qué hacer y la lista de tareas.")}</p></div></div>
      {!workerId ? (
        <div className="card"><EmptyState icon="briefcase" title={t("Ask your boss to link your worker record to your account", "Pídele a tu jefe que vincule tu registro de trabajador a tu cuenta")}
          text={t("Once it is linked, the jobs you are on show here.", "Cuando esté vinculado, aquí verás los trabajos donde estás.")} /></div>
      ) : none ? (
        <div className="card"><EmptyState icon="briefcase" title={t("No jobs yet", "Todavía no hay trabajos")}
          text={t("When your boss puts you on a job's crew, it shows here with the address, dates and checklist.", "Cuando tu jefe te ponga en el equipo de un trabajo, aparecerá aquí con la dirección, las fechas y la lista.")}>
          <Link className="btn" to="/calendar">{t("See my tasks", "Ver mis tareas")}</Link></EmptyState></div>
      ) : (
        <>
          {sec(t("Today", "Hoy"), split.today)}
          {sec(t("Coming up", "Próximos"), split.upcoming)}
          {sec(t("Not scheduled yet", "Sin fecha todavía"), split.unscheduled)}
          {sec(t("Recent", "Recientes"), split.recent)}
        </>
      )}
    </div>
  );
}

function JobCard({ j, today, t, lang }: { j: CrewJob; today: string; t: T; lang: string }) {
  const c = doneCount(j);
  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
  const isToday = onSite(j, today);
  return (
    <Link to={"/jobs/" + j.id} className={"card mj-card" + (isToday ? " today" : "")}>
      <div className="mj-l1"><b>{j.jobLabel}</b><Badge tone={isToday ? "acc" : "gray"} icon={isToday ? "pin" : "calendar"} size="sm">{whenLabel(j, today, t, lang)}</Badge></div>
      {j.address && <div className="mj-l2"><Icon name="pin" size={15} />{j.address}</div>}
      <div className="mj-l2"><Icon name="calendar" size={15} />{range(j, lang) || t("Your boss will set the dates", "Tu jefe pondrá las fechas")}</div>
      {c.total > 0 && <div className="mj-prog"><i style={{ width: pct + "%" }} /><span>{c.done}/{c.total}</span></div>}
    </Link>
  );
}

/** One job for its crew (/jobs/:id): directions, dates, notes, checklist to tick, colors, photos, chat, time clock. */
export function JobDetail() {
  const t = useT();
  const { id = "" } = useParams();
  const lang = useUi((s) => s.lang), toast = useUi((s) => s.toast);
  const { role, workerId, company } = useAuth();
  const me = useChatMe();
  const { rows, loading } = useCrewJobs();
  const { rows: chats } = useJobChats();
  const { rows: tasks } = useTasks();
  const { rows: clocks } = useClock();
  const today = todayISO();
  const j = rows.find((x) => x.id === id && (x.crew || []).includes(workerId || ""));
  if (role !== "worker") return <Navigate to={"/estimates/" + id} replace />;
  if (loading) return <div className="page" />;
  if (!j) return (
    <div className="page"><div className="card"><EmptyState icon="briefcase" title={t("This job isn't available", "Este trabajo no está disponible")}
      text={t("You may have been taken off its crew.", "Puede que te hayan quitado del equipo de este trabajo.")}><Link className="btn" to="/jobs">{t("My jobs", "Mis trabajos")}</Link></EmptyState></div></div>);

  const done = cleanDone(j.done, j.checklist);
  const days = Math.max(j.days, ...j.checklist.map((x) => x.day), 1);
  const todayNo = jobDayNo(j, today);
  const hasChat = chats.some((c) => c.id === j.id);
  const dates = crewDates(j);
  const tick = (key: string, on: boolean) => {
    if (!company) return;
    tickCrew(company.id, j, key, on, me.name).catch(() => toast(t("Couldn't save. Check your connection.", "No se pudo guardar. Revisa tu conexión.")));
  };
  const coworkers = j.crewNames.filter((n, i) => n && j.crew[i] !== workerId);

  return (
    <div className="page mj-page">
      <Link to="/jobs" className="mj-back">‹ {t("My jobs", "Mis trabajos")}</Link>
      <div className="page-h mj-h"><div><h1>{j.jobLabel}</h1><p><Badge tone={onSite(j, today) ? "acc" : "gray"} icon={onSite(j, today) ? "pin" : "calendar"}>{whenLabel(j, today, t, lang)}</Badge>{j.start ? " · " + range(j, lang) : ""}</p></div></div>

      <div className="mj-actions">
        {j.address && <a className="btn pri" href={mapsUrl(j.address)} target="_blank" rel="noreferrer"><Icon name="pin" size={18} />{t("Directions", "Cómo llegar")}</a>}
        <Link className="btn" to="/team"><Icon name="clock" size={18} />{t("Time clock", "Reloj")}</Link>
        {hasChat && <Link className="btn" to={"/chats/" + j.id}><Icon name="chat" size={18} />{t("Team chat", "Chat del equipo")}</Link>}
      </div>

      <section className="card mj-info">
        {j.address && <div className="mj-row"><Icon name="pin" size={18} /><div><small>{t("Address", "Dirección")}</small><b>{j.address}</b></div></div>}
        <div className="mj-row"><Icon name="user" size={18} /><div><small>{t("Client", "Cliente")}</small><b>{j.client}</b></div></div>
        <div className="mj-row"><Icon name="calendar" size={18} /><div><small>{t("Days on site", "Días en el trabajo")}</small>
          <b>{dates.length ? dates.map((d) => fmtDate(d, lang)).join(" · ") : t("Not scheduled yet", "Sin fecha todavía")}</b></div></div>
        <div className="mj-row"><Icon name="team" size={18} /><div><small>{t("Crew", "Equipo")}</small><b>{[t("You", "Tú"), ...coworkers].join(", ")}</b></div></div>
      </section>

      {j.note && <section className="card mj-note"><div className="card-h"><h2>{t("Notes from your boss", "Notas de tu jefe")}</h2></div><p>{j.note}</p></section>}

      {j.checklist.length > 0 && (
        <section className="card mj-check">
          <div className="card-h"><h2>{t("Checklist", "Lista de tareas")}</h2><span className="muted">{Object.keys(done).length}/{j.checklist.length}</span></div>
          <div className="mj-days">{Array.from({ length: days }, (_, i) => i + 1).map((d) => {
            const items = j.checklist.filter((x) => x.day === d);
            if (!items.length) return null;
            return (
              <div key={d} className={"mj-day" + (todayNo === d ? " now" : "")}>
                <div className="mj-dh">{t("Day", "Día")} {d}{j.titles[String(d)] ? " · " + j.titles[String(d)] : ""}{todayNo === d && <Badge tone="acc" size="sm">{t("Today", "Hoy")}</Badge>}</div>
                {items.map((x) => {
                  const at = done[x.key], by = j.doneBy?.[x.key];
                  return (
                    <label key={x.key} className={"mj-it" + (at ? " on" : "")}>
                      <input type="checkbox" checked={!!at} onChange={(ev) => tick(x.key, ev.target.checked)} />
                      <span>{x.text}</span>
                      {at && <em>{by ? by + " · " : ""}{fmtDate(new Date(at).toLocaleDateString("en-CA"), lang)}</em>}
                    </label>);
                })}
              </div>);
          })}</div>
        </section>
      )}

      {j.colors.length > 0 && (
        <section className="card mj-colors"><div className="card-h"><h2>{t("Colors & products", "Colores y productos")}</h2></div>
          <div className="mj-clist">{j.colors.map((c, i) => (
            <div key={i} className="mj-color"><b>{c.area || t("Area", "Área")}</b><span>{[c.brand, c.color, c.sheen, c.code].filter(Boolean).join(" · ")}</span></div>))}</div>
        </section>
      )}

      {workerId && <WorkerPhotos workerId={workerId} tasks={tasks} clock={clocks.find((c) => c.id === workerId)} fixedJob={{ estId: j.estId, label: j.jobLabel }} />}
    </div>
  );
}
