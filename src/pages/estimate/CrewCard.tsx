import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCrewJobs, useEstimates, useJobChats, useWorkers } from "../../data/hooks";
import { useT } from "../../i18n";
import { crewConflicts, dropFromAssign } from "../../lib/crew";
import { jobDates } from "../../lib/calendar";
import { fmtDate } from "../../lib/format";
import { progress } from "../../lib/jobday";
import type { Estimate } from "../../lib/types";
import { useUi } from "../../store/ui";
import { Icon } from "../../ui/Icon";
import { Avatar } from "../../ui/Avatar";


/**
 * Job day tab > Crew: who works this job. The crew sees it on their phone (My jobs): dates, address with directions,
 * these notes, the checklist (they tick it off), colors, photos and the team chat. Never prices.
 */
export function CrewCard({ e, set }: { e: Estimate; set(p: Partial<Estimate>): void }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const { rows: workers } = useWorkers();
  const { rows: ests } = useEstimates();
  const { rows: docs } = useCrewJobs();
  const { rows: chats } = useJobChats();
  const crew = e.crew || [];
  const doc = docs.find((d) => d.id === e.id);
  const active = workers.filter((w) => w.active !== false || crew.includes(w.id)).sort((a, b) => a.name.localeCompare(b.name));
  const conflicts = useMemo(() => crewConflicts(e, crew, ests), [e, crew, ests]);
  const days = jobDates(e);
  const nameOf = (id: string) => workers.find((w) => w.id === id)?.name || t("Worker", "Trabajador");
  // taken off the crew: their checklist lines go back to the others (or to the whole crew)
  const toggle = (id: string) => set(crew.includes(id) ? { crew: crew.filter((x) => x !== id), assign: dropFromAssign(e.assign, id) } : { crew: [...crew, id] });
  const pr = doc ? progress({ items: doc.checklist.map((x) => ({ ...x })), days: 0, titles: {} }, doc.done) : null;
  const hasChat = chats.some((c) => c.id === e.id);

  return (
    <div className="card crew-card">
      <div className="card-h"><h2><Icon name="team" size={18} /> {t("Crew", "Equipo del trabajo")}</h2>
        {crew.length > 0 && <Link className="btn sm" to={"/chats/" + e.id}><Icon name="chat" size={16} />{hasChat ? t("Team chat", "Chat del equipo") : t("Start team chat", "Empezar chat del equipo")}</Link>}</div>
      <div className="card-b crew-b">
        {active.length === 0 ? <p className="muted">{t("Add your workers in Team first.", "Primero agrega a tus trabajadores en Equipo.")} <Link to="/team">{t("Go to Team", "Ir a Equipo")}</Link></p> : (
          <div className="crew-chips" role="group" aria-label={t("Workers on this job", "Trabajadores en este trabajo")}>
            {active.map((w) => {
              const on = crew.includes(w.id);
              return <button key={w.id} type="button" className={"crew-chip" + (on ? " on" : "")} aria-pressed={on} onClick={() => toggle(w.id)}>
                <Avatar name={w.name} src={w.photo?.url} size="sm" badge={on ? "acc" : null} badgeIcon="check" />{w.name}</button>;
            })}
          </div>
        )}

        <div className="crew-when">
          {days.length ? <span><Icon name="calendar" size={16} />{fmtDate(days[0], lang)}{days.length > 1 ? " – " + fmtDate(days[days.length - 1], lang) : ""} · {t(`${days.length} day${days.length === 1 ? "" : "s"}`, `${days.length} día${days.length === 1 ? "" : "s"}`)}</span>
            : <span className="crew-warn"><Icon name="alert" size={16} />{t("No start date yet: set it in Pricing so the crew knows when to go.", "Sin fecha de inicio: ponla en Precios para que el equipo sepa cuándo ir.")}</span>}
          {e.address ? <span><Icon name="pin" size={16} />{e.address}</span> : <span className="crew-warn"><Icon name="alert" size={16} />{t("No address: add it so the crew gets directions.", "Sin dirección: agrégala para que el equipo tenga cómo llegar.")}</span>}
        </div>

        {conflicts.map((c, i) => (
          <p key={i} className="crew-warn crew-clash"><Icon name="alert" size={16} />
            {t(`${nameOf(c.workerId)} is also on `, `${nameOf(c.workerId)} también está en `)}<Link to={"/estimates/" + c.estId}>{c.number}</Link>
            {" " + t("on", "el") + " " + c.days.map((d) => fmtDate(d, lang)).join(", ")}.</p>))}

        <label className="f crew-note">{t("Notes for the crew", "Notas para el equipo")}
          <textarea rows={3} value={e.crewNote || ""} maxLength={2000} onChange={(ev) => set({ crewNote: ev.target.value })}
            placeholder={t("Gate code, parking, where the key is, what to watch out for…", "Código del portón, dónde estacionar, dónde está la llave, qué cuidar…")} /></label>

        {crew.length > 0 && (
          <p className="muted crew-foot">
            {doc ? <>✓ {t("On their phones in My jobs", "En sus teléfonos en Mis trabajos")}{pr && pr.total ? " · " + t(`checklist ${pr.done}/${pr.total}`, `lista ${pr.done}/${pr.total}`) : ""}</> : t("Sending to their phones…", "Enviando a sus teléfonos…")}
            {" · "}{t("They see dates, address, notes, checklist and colors — never prices.", "Ven fechas, dirección, notas, lista y colores — nunca precios.")}
          </p>)}
      </div>
    </div>
  );
}
