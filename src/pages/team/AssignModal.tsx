import { useMemo, useState } from "react";
import { useT } from "../../i18n";
import { addDaysISO, jobDates } from "../../lib/calendar";
import { assignees, assignLines, crewLangOf, dayDate, setAssign } from "../../lib/crew";
import { todayISO, uid } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import { checklistFor, itemsOfDay, newJobTask } from "../../lib/jobday";
import { num } from "../../lib/money";
import type { Estimate, Settings, Worker } from "../../lib/types";
import { useUi } from "../../store/ui";
import { AvatarGroup } from "../../ui/Avatar";
import { Combobox } from "../../ui/Combobox";
import { DatePicker } from "../../ui/DatePicker";
import { Icon } from "../../ui/Icon";
import { Modal } from "../../ui/Modal";
import { NumInput } from "../../ui/NumInput";

/**
 * Team > "Assign work" for one worker, without leaving the page: pick the job, its dates, and which lines of its checklist this
 * worker does (each worker can do different lines). Saving puts them on the job's crew; their phone shows the job, the lines
 * on their days, and they clock in for one of them. "Other task" opens the quick task window (a one-off task on a day).
 */
export function AssignModal({ worker, workers, jobs, settings, jobLabel, startJob, onSave, onOtherTask, onClose }: {
  worker: Worker; workers: Worker[]; jobs: Estimate[]; settings: Settings; jobLabel(e: Estimate): string; startJob?: string;
  onSave(estId: string, patch: Partial<Estimate>): Promise<void>; onOtherTask(): void; onClose(): void;
}) {
  const t = useT(), lang = useUi((s) => s.lang), toast = useUi((s) => s.toast);
  const today = todayISO();
  const [estId, setEstId] = useState(startJob || "");
  const e0 = jobs.find((e) => e.id === estId);
  // a working copy of what changes on the job: dates, who does what, new lines
  const [draft, setDraft] = useState<Partial<Estimate>>({});
  const e = e0 ? { ...e0, ...draft } as Estimate : undefined;
  const [newLine, setNewLine] = useState("");
  const [newDay, setNewDay] = useState(1);
  const [saving, setSaving] = useState(false);
  const pickJob = (id: string) => { setEstId(id); setDraft({}); setNewLine(""); setNewDay(1); };

  const cl = useMemo(() => (e ? checklistFor(e, crewLangOf(settings)) : null), [e, settings]);
  const wid = worker.id;
  const crew = e ? [...new Set([...(e.crew || []), wid])] : [wid];
  const nameOf = (id: string) => workers.find((w) => w.id === id)?.name || "";
  const photoOf = (id: string) => workers.find((w) => w.id === id)?.photo?.url;
  const mine = (key: string) => !!e && assignees(e.assign, key, crew).includes(wid);
  const set = (p: Partial<Estimate>) => setDraft((d) => ({ ...d, ...p }));
  const toggle = (keys: string[], on: boolean) => e && set({ assign: setAssign(e.assign, keys, wid, on) });
  const count = cl ? cl.items.filter((x) => mine(x.key)).length : 0;
  const changed = Object.keys(draft).length > 0 || (!!e && !(e.crew || []).includes(wid));

  const opts = useMemo(() => jobs.map((j) => {
    const d = jobDates(j);
    return { value: j.id, label: jobLabel(j), sub: d.length ? fmtDate(d[0], lang) + (d.length > 1 ? " – " + fmtDate(d[d.length - 1], lang) : "") : t("No date yet", "Sin fecha todavía") };
  }), [jobs, jobLabel, lang, t]);

  const addLine = () => {
    if (!e || !newLine.trim()) return;
    const jt = newJobTask(newDay, newLine, uid("jt"));
    set({ jobTasks: [...(e.jobTasks || []), jt], assign: assignLines(e.assign, ["c_" + jt.id], [wid]) });
    setNewLine("");
  };
  const save = async () => {
    if (!e || saving) return;
    setSaving(true);
    try {
      await onSave(e.id, { ...draft, crew });
      toast(count
        ? t(`${worker.name}: ${count} task${count === 1 ? "" : "s"} on ${e.number}`, `${worker.name}: ${count} tarea${count === 1 ? "" : "s"} en ${e.number}`)
        : t(`${worker.name} is on the crew of ${e.number}`, `${worker.name} está en el equipo de ${e.number}`));
      onClose();
    } catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Intenta otra vez.")); setSaving(false); }
  };

  const others = e ? (e.crew || []).filter((id) => id !== wid && nameOf(id)) : [];
  return (
    <Modal wide title={t(`Assign work to ${worker.name}`, `Asignar trabajo a ${worker.name}`)} onClose={onClose}>
      <div className="as-tabs" role="tablist">
        <button type="button" role="tab" aria-selected className="on"><Icon name="briefcase" size={16} />{t("Tasks of a job", "Tareas de un trabajo")}</button>
        <button type="button" role="tab" aria-selected={false} onClick={onOtherTask}><Icon name="plus" size={16} />{t("Other task", "Otra tarea")}</button>
      </div>

      <label className="f">{t("Job", "Trabajo")}
        <Combobox value={estId} onChange={pickJob} placeholder={t("Search jobs…", "Buscar trabajos…")} options={opts} /></label>
      {!jobs.length && <p className="muted">{t("No jobs yet: accepted and sent estimates show here.", "Todavía no hay trabajos: aquí salen los presupuestos aceptados y enviados.")}</p>}

      {e && cl && <>
        <div className="grid2">
          <label className="f">{t("Start date", "Fecha de inicio")}<DatePicker value={e.startDate || ""} onChange={(v) => set({ startDate: v })} clearable placeholder={t("Pick a day", "Elige un día")} /></label>
          <label className="f">{t("Days on site", "Días en el trabajo")}<NumInput step="1" min={1} value={Math.max(1, num(e.days) || 1)} onChange={(n) => set({ days: Math.max(1, Math.round(n) || 1) })} /></label>
        </div>
        {!e.startDate && <p className="as-warn"><Icon name="alert" size={16} />{t("No start date yet: the tasks show on their phone as “not scheduled” until you pick one.", "Sin fecha de inicio: las tareas salen en su teléfono como “sin fecha” hasta que elijas una.")}</p>}
        {others.length > 0 && <p className="muted as-crew"><AvatarGroup people={others.map((id) => ({ name: nameOf(id), src: photoOf(id) }))} max={5} size="xs" />{t("Also on this job: ", "También en este trabajo: ")}{others.map(nameOf).join(", ")}</p>}

        <div className="as-list">
          {Array.from({ length: cl.days }, (_, i) => i + 1).map((d) => {
            const items = itemsOfDay(cl, d);
            if (!items.length) return null;
            const date = dayDate({ start: e.startDate || "", days: Math.max(1, num(e.days) || 1) }, d);
            const all = items.every((x) => mine(x.key));
            return (
              <div key={d} className="as-day">
                <label className="as-dh">
                  <input type="checkbox" checked={all} onChange={(ev) => toggle(items.map((x) => x.key), ev.target.checked)} aria-label={t(`All of day ${d}`, `Todo el día ${d}`)} />
                  <span>{t("Day", "Día")} {d}{date ? " · " + fmtDate(date, lang) : ""}{cl.titles[d] ? " · " + cl.titles[d] : ""}</span>
                </label>
                {items.map((x) => {
                  const who = assignees(e.assign, x.key, crew).filter((id) => id !== wid);
                  const on = mine(x.key);
                  return (
                    <label key={x.key} className={"as-it" + (on ? " on" : "")}>
                      <input type="checkbox" checked={on} onChange={(ev) => toggle([x.key], ev.target.checked)} />
                      <span className="as-tx">{x.text}</span>
                      {who.length > 0 ? <AvatarGroup people={who.map((id) => ({ name: nameOf(id) || t("Worker", "Trabajador"), src: photoOf(id) }))} max={3} size="xs" />
                        : !on && <span className="as-crewtag">{t("whole crew", "todo el equipo")}</span>}
                    </label>);
                })}
              </div>);
          })}
        </div>
        <div className="as-add">
          <input value={newLine} onChange={(ev) => setNewLine(ev.target.value)} placeholder={t(`+ A new task for ${worker.name}`, `+ Una tarea nueva para ${worker.name}`)}
            onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); addLine(); } }} />
          {cl.days > 1 && <select value={newDay} onChange={(ev) => setNewDay(num(ev.target.value) || 1)} aria-label={t("Day", "Día")}>
            {Array.from({ length: cl.days }, (_, i) => i + 1).map((d) => { const dd = e.startDate ? addDaysISO(e.startDate, Math.min(d, Math.max(1, num(e.days) || 1)) - 1) : ""; return <option key={d} value={d}>{t("Day", "Día")} {d}{dd ? " · " + fmtDate(dd, lang) : ""}</option>; })}</select>}
          <button type="button" className="btn sm" disabled={!newLine.trim()} onClick={addLine}>{t("Add", "Agregar")}</button>
        </div>
        <p className="muted as-foot">{t("Lines marked “whole crew” are for everyone on the job until you give them to someone.", "Las líneas con “todo el equipo” son para todos en el trabajo hasta que se las des a alguien.")}</p>
      </>}

      <div className="tm-actions as-actions">
        <button className="btn pri" disabled={!e || saving || !changed} onClick={save}>
          {e ? (count ? t(`Save · ${count} task${count === 1 ? "" : "s"}`, `Guardar · ${count} tarea${count === 1 ? "" : "s"}`) : t("Save", "Guardar")) : t("Pick a job", "Elige un trabajo")}</button>
        {e && e.startDate && e.startDate < today && jobDates(e).every((d) => d < today) && <span className="muted as-past">{t("This job's dates are in the past.", "Las fechas de este trabajo ya pasaron.")}</span>}
      </div>
    </Modal>
  );
}
