import { useMemo, useState } from "react";
import { useT } from "../../i18n";
import { jobLabelOf } from "../../lib/crew";
import { colName, MAX_NOTE_COLS, newColId, PRIOS } from "../../lib/notes";
import type { Client, Estimate, Note, NoteCol } from "../../lib/types";
import { useUi } from "../../store/ui";
import { Modal } from "../../ui/Modal";
import { ask } from "../../ui/confirm";

/** Write or edit one note: title, text, column, priority, due date, linked job, person in charge. */
export function NoteEditor({ note, isNew, cols, estimates, clients, workers, onSave, onDelete, onClose }: {
  note: Note; isNew: boolean; cols: NoteCol[]; estimates: Estimate[]; clients: Client[]; workers: { id: string; name: string }[];
  onSave(n: Note): void; onDelete(): void; onClose(): void;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang), es = lang === "es";
  const [d, setD] = useState<Note>(note);
  const set = (p: Partial<Note>) => setD((x) => ({ ...x, ...p }));
  const jobs = useMemo(() => [...estimates].sort((a, b) => String(b.number).localeCompare(String(a.number), undefined, { numeric: true }))
    .map((e) => ({ id: e.id, label: jobLabelOf(e, clients, lang) })), [estimates, clients, lang]);
  const empty = !d.title.trim() && !d.text.trim();
  const save = () => { if (!empty) onSave(d); };

  return (
    <Modal title={isNew ? t("New note", "Nota nueva") : t("Edit note", "Editar nota")} onClose={onClose}>
      <div className="nb-ed" onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); }}>
        <label className="f">{t("Title", "Título")}<input autoFocus value={d.title} maxLength={200} placeholder={t("Buy more tape", "Comprar más cinta")} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="f">{t("Note", "Nota")}<textarea rows={6} value={d.text} maxLength={5000} placeholder={t("Write anything…", "Escribe lo que quieras…")} onChange={(e) => set({ text: e.target.value })} /></label>
        <div className="grid2">
          <label className="f">{t("Column", "Columna")}<select value={d.col} onChange={(e) => set({ col: e.target.value })}>{cols.map((c) => <option key={c.id} value={c.id}>{colName(c, es)}</option>)}</select></label>
          <label className="f">{t("Due date", "Fecha límite")}<input type="date" value={d.due || ""} onChange={(e) => set({ due: e.target.value })} /></label>
        </div>
        <div className="f nb-prio-f">{t("Priority", "Prioridad")}
          <div className="seg nb-prio">
            <button type="button" className={!d.prio ? "on" : ""} onClick={() => set({ prio: "" })}>{t("None", "Ninguna")}</button>
            {[...PRIOS].reverse().map((p) => <button type="button" key={p.id} className={(d.prio === p.id ? "on " : "") + "p-" + p.id} onClick={() => set({ prio: p.id })}>{es ? p.es : p.en}</button>)}
          </div>
        </div>
        <div className="grid2">
          <label className="f">{t("Job (optional)", "Trabajo (opcional)")}
            <select value={d.estId || ""} onChange={(e) => { const j = jobs.find((x) => x.id === e.target.value); set({ estId: j?.id || "", jobLabel: j?.label || "" }); }}>
              <option value="">{t("No job", "Sin trabajo")}</option>
              {d.estId && !jobs.some((j) => j.id === d.estId) && <option value={d.estId}>{d.jobLabel || d.estId}</option>}
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
            </select></label>
          <label className="f">{t("Person in charge (optional)", "Encargado (opcional)")}
            <select value={d.workerId || ""} onChange={(e) => set({ workerId: e.target.value })}>
              <option value="">{t("Nobody", "Nadie")}</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select></label>
        </div>
        <div className="nb-ed-act">
          {!isNew && <button className="btn danger" onClick={async () => { if (await ask(t("Delete this note?", "¿Borrar esta nota?"))) onDelete(); }}>{t("Delete", "Borrar")}</button>}
          <span className="sp" />
          <button className="btn" onClick={onClose}>{t("Cancel", "Cancelar")}</button>
          <button className="btn pri" disabled={empty} onClick={save}>{t("Save", "Guardar")}</button>
        </div>
      </div>
    </Modal>
  );
}

/** Rename, add, reorder and remove the board's columns. */
export function ColumnsEditor({ cols, counts, onSave, onClose }: { cols: NoteCol[]; counts: Record<string, number>; onSave(c: NoteCol[]): void; onClose(): void }) {
  const t = useT();
  const es = useUi((s) => s.lang) === "es";
  const [list, setList] = useState<NoteCol[]>(cols);
  const move = (i: number, dir: -1 | 1) => setList((l) => { const n = [...l]; const j = i + dir; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const remove = async (i: number) => {
    const c = list[i], k = counts[c.id] || 0;
    if (k && !await ask(t(`“${colName(c, es)}” has ${k} note(s). They will move to the first column.`, `“${colName(c, es)}” tiene ${k} nota(s). Se pasarán a la primera columna.`))) return;
    setList((l) => l.filter((_, x) => x !== i));
  };
  return (
    <Modal title={t("Board columns", "Columnas del tablero")} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>{t("Rename them, change the order or add your own (up to 8).", "Cámbiales el nombre, el orden o agrega las tuyas (hasta 8).")}</p>
      <div className="nb-cols-ed">
        {list.map((c, i) => (
          <div key={c.id} className="nb-col-row">
            <input value={c.name} maxLength={40} placeholder={colName({ id: c.id, name: "" }, es)} aria-label={t("Column name", "Nombre de la columna")}
              onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <button className="btn sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("Move left", "Mover a la izquierda")}>‹</button>
            <button className="btn sm" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={t("Move right", "Mover a la derecha")}>›</button>
            <button className="btn sm danger" disabled={list.length <= 1} onClick={() => remove(i)} aria-label={t("Remove column", "Quitar columna")}>×</button>
          </div>))}
      </div>
      <button className="btn" disabled={list.length >= MAX_NOTE_COLS} onClick={() => setList((l) => [...l, { id: newColId(l), name: "" }])}>+ {t("Add column", "Agregar columna")}</button>
      <div className="nb-ed-act">
        <span className="sp" />
        <button className="btn" onClick={onClose}>{t("Cancel", "Cancelar")}</button>
        <button className="btn pri" onClick={() => onSave(list.map((c) => ({ id: c.id, name: c.name.trim() })))}>{t("Save", "Guardar")}</button>
      </div>
    </Modal>
  );
}
