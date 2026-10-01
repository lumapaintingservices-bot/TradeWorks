import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { tickCrew } from "../../data/crew";
import { useCrewJobs, useSettings, useWorkers } from "../../data/hooks";
import { patchRec } from "../../data/repo";
import { useT } from "../../i18n";
import { jobTypeOf, uid } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import { checklistFor, itemsOfDay, newJobTask, progress, setChecked, shoppingText, whatsappShareUrl } from "../../lib/jobday";
import type { ColorRow } from "../../lib/types";
import { useUi } from "../../store/ui";
import type { TabProps } from "./types";
import { CrewCard } from "./CrewCard";
import { AssignPicker, type CrewPerson } from "./AssignPicker";
import { assignCounts, assignLines, assignees, crewLangOf, dayDate, isForWorker, setAssign } from "../../lib/crew";
import { Avatar } from "../../ui/Avatar";
import { ask } from "../../ui/confirm";
import "./jobday.css";

const COLOR_FIELDS = ["area", "brand", "color", "sheen", "code"] as const;

/**
 * Job day tab: checklist from the scope (by day) + your tasks, who does each line, colors & products, shopping list.
 * The checklist is in the company's crew language (settings.crewLang), so it is the very same list the crew sees on their phones.
 */
export default function JobDayTab({ e, set, s, lang }: TabProps) {
  const t = useT();
  const toast = useUi((x) => x.toast);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const { update: updateSettings } = useSettings();
  const clLang = crewLangOf(s);
  const cl = useMemo(() => checklistFor(e, clLang), [e.scopeEn, e.scopeEs, e.days, e.jobType, e.jobTasks, clLang]); // eslint-disable-line react-hooks/exhaustive-deps
  const check = e.check || {};
  const pr = progress(cl, check);
  const colors = e.colors || [];
  const shop = useMemo(() => shoppingText(e, s, lang), [e, s, lang]);
  const shopHasLines = shop.split("\n").length > 1;

  // a job with a crew: their copy holds the ticks (they tick on their phones), so a tick here goes there too
  const { company, user } = useAuth();
  const { rows: crewDocs } = useCrewJobs();
  const crewDoc = crewDocs.find((d) => d.id === e.id);
  // who does each line: the crew of this job (Crew card above)
  const { rows: workers } = useWorkers();
  const crewIds = (e.crew || []).filter(Boolean);
  const crew: CrewPerson[] = crewIds.map((id) => { const w = workers.find((x) => x.id === id); return { id, name: w?.name || t("Worker", "Trabajador"), photo: w?.photo?.url }; });
  const [who, setWho] = useState(""); // show only one worker's lines ("" = everyone)
  const showFor = crewIds.includes(who) ? who : "";
  const keys = cl.items.map((x) => x.key);
  const counts = assignCounts(e.assign, keys, crewIds);
  const mineCount = (id: string) => cl.items.filter((x) => isForWorker(e.assign, x.key, crewIds, id)).length;
  const lineOn = (key: string) => assignees(e.assign, key, crewIds);
  const dayOn = (d: number) => { const ks = itemsOfDay(cl, d).map((x) => x.key); return crewIds.filter((id) => ks.length > 0 && ks.every((k) => lineOn(k).includes(id))); };
  const toggleLine = (keys: string[], id: string, on: boolean) => set({ assign: setAssign(e.assign, keys, id, on) });
  const startDay = (d: number) => dayDate({ start: e.startDate || "", days: Math.max(1, Number(e.days) || 1) }, d);

  const tick = (key: string, on: boolean) => {
    if (company && crewDoc?.checklist.some((x) => x.key === key)) tickCrew(company.id, crewDoc, key, on, user?.name || company.name || "").catch(() => toast(t("Couldn't save. Try again.", "No se pudo guardar. Intenta otra vez.")));
    set({ check: setChecked(e.check, key, on) });
  };
  const addTask = (day: number) => {
    const text = (drafts[day] || "").trim();
    if (!text) return;
    const jt = newJobTask(day, text, uid("jt"));
    // while one worker's lines are shown, the new line is theirs
    set({ jobTasks: [...(e.jobTasks || []), jt], ...(showFor ? { assign: assignLines(e.assign, ["c_" + jt.id], [showFor]) } : {}) });
    setDrafts((d) => ({ ...d, [day]: "" }));
  };
  const delTask = (id: string) => { const { ["c_" + id]: _gone, ...rest } = e.assign || {}; set({ jobTasks: (e.jobTasks || []).filter((x) => x.id !== id), assign: rest }); };
  const resetChecks = async () => {
    if (!await ask(t("Clear all the ticks on this checklist?", "¿Quitar todas las marcas de esta lista?"))) return;
    if (company && crewDoc) patchRec(company.id, "crewjobs", crewDoc.id, { done: {}, doneBy: {} }).catch(() => {});
    set({ check: {} });
  };

  const setColor = (i: number, f: keyof ColorRow, v: string) => set({ colors: colors.map((c, j) => (j === i ? { ...c, [f]: v } : c)) });
  const addColor = () => set({ colors: [...colors, { area: jobTypeOf(e) === "cabinets" ? t("Cabinets", "Gabinetes") : "", brand: "", color: "", sheen: "", code: "" }] });
  const delColor = (i: number) => set({ colors: colors.filter((_, j) => j !== i) });
  const colLabels: Record<(typeof COLOR_FIELDS)[number], string> = {
    area: t("Area", "Área"), brand: t("Brand / product", "Marca / producto"), color: t("Color", "Color"), sheen: t("Sheen", "Brillo"), code: t("Code / lot", "Código / lote"),
  };

  const copy = () => {
    const done = () => toast(t("Copied.", "Copiado."));
    if (navigator.clipboard) navigator.clipboard.writeText(shop).then(done, () => toast(t("Couldn't copy — select the text.", "No se pudo copiar — selecciona el texto.")));
    else toast(t("Couldn't copy — select the text.", "No se pudo copiar — selecciona el texto."));
  };

  return (
    <div className="stack">
      <CrewCard e={e} set={set} />
      <div className="card">
        <div className="card-h"><h2>{t("Job day", "Día de trabajo")}</h2>
          <span className="muted" style={{ fontSize: 12 }}>{t("checklist · colors · shopping list", "lista · colores · compras")}</span></div>
        <div className="card-b">
          <div className="jd-top">
            <div><b>{pr.pct}%</b> {t("done", "hecho")} · {pr.done}/{pr.total}</div>
            <div className="jd-bar" role="progressbar" aria-valuenow={pr.pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: pr.pct + "%" }} /></div>
          </div>
          <p className="muted jd-hint">{t("Built from this estimate's scope of work, day by day. Add your own tasks under any day.", "Armado con el alcance de este presupuesto, día por día. Agrega tus propias tareas en cualquier día.")}
            {" "}{crew.length > 0 ? t("Tap “Whole crew” on a line to pick who does it: each worker sees only their lines (and the whole crew's).", "Toca “Todo el equipo” en una línea para elegir quién la hace: cada trabajador ve solo sus líneas (y las de todo el equipo).") : ""}</p>
          <label className="jd-lang">{t("Your crew sees this list in", "Tu equipo ve esta lista en")}
            <select value={clLang} onChange={(ev) => updateSettings({ crewLang: ev.target.value as "en" | "es" })} aria-label={t("Checklist language (all jobs)", "Idioma de la lista (todos los trabajos)")}>
              <option value="es">Español</option><option value="en">English</option></select>
            <span className="muted">{t("(all jobs)", "(todos los trabajos)")}</span></label>
          {crew.length > 0 && (
            <div className="pills jd-who" role="group" aria-label={t("Show the lines of", "Ver las líneas de")}>
              <button type="button" className={"pill" + (!showFor ? " on" : "")} onClick={() => setWho("")}>{t("Everyone", "Todos")}</button>
              {crew.map((p) => (
                <button key={p.id} type="button" className={"pill jd-who-p" + (showFor === p.id ? " on" : "")} onClick={() => setWho(p.id)}
                  title={t(`${counts[p.id] || 0} lines just for ${p.name}`, `${counts[p.id] || 0} líneas solo para ${p.name}`)}>
                  <Avatar name={p.name} src={p.photo} size="xs" />{p.name} <b>{mineCount(p.id)}</b></button>))}
            </div>)}
          <div className="jd-list">
            {Array.from({ length: cl.days }, (_, i) => i + 1).map((d) => {
              const items = itemsOfDay(cl, d).filter((x) => !showFor || isForWorker(e.assign, x.key, crewIds, showFor));
              const date = startDay(d);
              return (
              <div key={d} className="jd-list">
                <div className="jd-dayrow">
                  <div className="jd-day">{t("Day", "Día")} {d}{date ? <> · <span>{fmtDate(date, lang)}</span></> : null}{cl.titles[d] ? <> · <span>{cl.titles[d]}</span></> : null}</div>
                  {crew.length > 0 && itemsOfDay(cl, d).length > 0 && (
                    <AssignPicker day crew={crew} selected={dayOn(d)} onClear={() => set({ assign: assignLines(e.assign, itemsOfDay(cl, d).map((x) => x.key), []) })}
                      onToggle={(id) => toggleLine(itemsOfDay(cl, d).map((x) => x.key), id, !dayOn(d).includes(id))} />)}
                </div>
                {items.map((x) => {
                  const at = check[x.key];
                  return (
                    <div key={x.key} className={"jd-it" + (at ? " on" : "")}>
                      <label className="jd-l">
                        <input type="checkbox" checked={!!at} onChange={(ev) => tick(x.key, ev.target.checked)} />
                        <span>{x.text}</span>
                      </label>
                      {at && <em>{fmtDate(isNaN(Date.parse(at)) ? String(at).slice(0, 10) : new Date(at).toLocaleDateString("en-CA"), lang)}{crewDoc?.doneBy?.[x.key] ? " · " + crewDoc.doneBy[x.key] : ""}</em>}
                      {crew.length > 0 && <AssignPicker crew={crew} selected={lineOn(x.key)} onClear={() => set({ assign: assignLines(e.assign, [x.key], []) })}
                        onToggle={(id) => toggleLine([x.key], id, !lineOn(x.key).includes(id))} />}
                      {x.custom && <button type="button" className="jd-x" title={t("Remove", "Quitar")} aria-label={t("Remove", "Quitar")} onClick={() => delTask(x.id!)}>×</button>}
                    </div>
                  );
                })}
                <div className="jd-add">
                  <input value={drafts[d] || ""} placeholder={showFor ? t(`+ Add a task for ${crew.find((p) => p.id === showFor)?.name} on day ${d}`, `+ Agregar tarea para ${crew.find((p) => p.id === showFor)?.name} el día ${d}`) : t(`+ Add a task for day ${d}`, `+ Agregar tarea al día ${d}`)}
                    onChange={(ev) => setDrafts((x) => ({ ...x, [d]: ev.target.value }))}
                    onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); addTask(d); } }} />
                  <button type="button" className="btn sm" onClick={() => addTask(d)} disabled={!(drafts[d] || "").trim()}>{t("Add", "Agregar")}</button>
                </div>
              </div>
            ); })}
          </div>
          {pr.done > 0 && <div className="jd-tools"><button type="button" className="btn sm" onClick={resetChecks}>{t("Clear ticks", "Quitar marcas")}</button></div>}
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h2>{t("Colors & products used", "Colores y productos usados")}</h2></div>
        <div className="card-b">
          <p className="muted jd-sub">{t("So a touch-up next year uses the exact same paint.", "Para que un retoque el próximo año use exactamente la misma pintura.")}</p>
          {colors.length > 0 && <div className="jd-crow head" aria-hidden>{COLOR_FIELDS.map((f) => <span key={f}>{colLabels[f]}</span>)}<span /></div>}
          {colors.map((c, i) => (
            <div className="jd-crow" key={i}>
              {COLOR_FIELDS.map((f) => <input key={f} value={c[f] || ""} placeholder={colLabels[f]} aria-label={colLabels[f]} onChange={(ev) => setColor(i, f, ev.target.value)} />)}
              <button type="button" className="jd-x" title={t("Remove", "Quitar")} aria-label={t("Remove", "Quitar")} onClick={() => delColor(i)}>×</button>
            </div>
          ))}
          <div className="jd-tools" style={{ marginTop: colors.length ? 4 : 0 }}><button type="button" className="btn sm" onClick={addColor}>{t("+ Color", "+ Color")}</button></div>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h2>{t("Shopping list", "Lista de compras")}</h2>
          <Link className="btn sm" to={`/estimates/${e.id}/work-order`} target="_blank">{t("Work order", "Orden de trabajo")}</Link></div>
        <div className="card-b">
          <pre className="jd-shop">{shop}</pre>
          {!shopHasLines && <p className="muted jd-sub" style={{ marginTop: 10 }}>{t("Add doors, drawers or wall work in Pricing to get the gallons and supplies.", "Agrega puertas, cajones o trabajo de paredes en Precios para ver galones y materiales.")}</p>}
          <div className="jd-tools">
            <button type="button" className="btn" onClick={copy}>{t("Copy", "Copiar")}</button>
            <a className="btn wa" target="_blank" rel="noopener noreferrer" href={whatsappShareUrl(shop)}>WhatsApp</a>
          </div>
        </div>
      </div>
    </div>
  );
}
