import { useMemo, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useClients, useCollection, useEstimates, useSettings } from "../../data/hooks";
import type { Rec } from "../../data/repo";
import { useChatMe } from "../../data/teamChat";
import { useWorkerOptions } from "../../data/workers";
import { useT } from "../../i18n";
import { todayISO, uid } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import { cleanNote, colName, colsOf, dropIndex, dueState, filterNotes, notesIn, orderAt, PRIOS, prioOf, sideCol } from "../../lib/notes";
import type { Note, NoteCol, NotePrio } from "../../lib/types";
import { useUi } from "../../store/ui";
import { Badge } from "../../ui/Badge";
import { EmptyState } from "../../ui/EmptyState";
import { Icon } from "../../ui/Icon";
import { ColumnsEditor, NoteEditor } from "./NoteEditor";
import "./notes.css";

const ini = (name: string) => (name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "?").toUpperCase();
const LS_VIEW = "tw.notesView";
const readView = (): "board" | "list" => { try { return localStorage.getItem(LS_VIEW) === "list" ? "list" : "board"; } catch { return "board"; } };

/**
 * Notes board (owners / admins): ideas, reminders and to-dos in columns you name yourself (idea from the studio-admin Kanban).
 * Drag a card to another column or place (computer), or use ‹ › on the card (phone). Board / List views, search, priority filter.
 */
export default function Notes() {
  const t = useT();
  const lang = useUi((s) => s.lang), es = lang === "es";
  const toast = useUi((s) => s.toast);
  const { rows, loading, save, remove } = useCollection<Note & Rec>("notes");
  const { settings, update } = useSettings();
  const { rows: estimates } = useEstimates();
  const { rows: clients } = useClients();
  const workers = useWorkerOptions();
  const me = useChatMe();
  const cols = colsOf(settings.noteCols);
  const today = todayISO();

  const [q, setQ] = useState("");
  const [prio, setPrio] = useState<NotePrio | "all">("all");
  const [view, setViewS] = useState(readView);
  const setView = (v: "board" | "list") => { setViewS(v); try { localStorage.setItem(LS_VIEW, v); } catch { /* private mode */ } };
  const [edit, setEdit] = useState<{ note: Note; isNew: boolean } | null>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ col: string; index: number } | null>(null);
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const all = rows as Note[];
  const shown = useMemo(() => filterNotes(all, q, prio), [all, q, prio]);
  const filtered = !!q.trim() || prio !== "all";
  const counts = useMemo(() => Object.fromEntries(cols.map((c) => [c.id, notesIn(all, c.id, cols).length])), [all, cols]);
  const workerName = (id?: string) => (id ? workers.find((w) => w.id === id)?.name || "" : "");

  const put = (n: Note) => save(cleanNote(n, cols) as Note & Rec).catch(() => toast(t("Couldn't save. Check your connection.", "No se pudo guardar. Revisa tu conexión.")));
  const newNote = (col = cols[0].id) => setEdit({ isNew: true, note: { id: uid("n"), title: "", text: "", col, order: 0, prio: "", by: me.name } });
  const onSave = (n: Note) => {
    const old = all.find((x) => x.id === n.id);
    // new notes, and notes moved to another column, go to the top of their column
    const order = !old || old.col !== n.col ? orderAt(notesIn(all.filter((x) => x.id !== n.id), n.col, cols), 0) : n.order;
    put({ ...n, order });
    setEdit(null);
  };
  /** ‹ › on a card: to the end of the next column on that side. `from` = the column it shows in. */
  const moveSide = (n: Note, from: string, dir: -1 | 1) => {
    const to = sideCol(cols, from, dir);
    if (!to) return;
    const list = notesIn(all.filter((x) => x.id !== n.id), to, cols);
    put({ ...n, col: to, order: orderAt(list, list.length) });
  };

  /* ---------- drag & drop (computer) ---------- */
  const visibleIn = (col: string, without?: string) => notesIn(shown, col, cols).filter((n) => n.id !== without);
  const onDragOver = (col: string) => (ev: DragEvent) => {
    if (!drag) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    const box = colRefs.current[col];
    const mids = box ? [...box.querySelectorAll<HTMLElement>(".nb-card:not(.dragging)")].map((c) => { const r = c.getBoundingClientRect(); return r.top + r.height / 2; }) : [];
    const index = dropIndex(mids, ev.clientY);
    if (over?.col !== col || over.index !== index) setOver({ col, index });
  };
  const onDrop = (col: string) => (ev: DragEvent) => {
    ev.preventDefault();
    const n = all.find((x) => x.id === drag);
    const index = over?.col === col ? over.index : visibleIn(col, drag || "").length;
    setDrag(null); setOver(null);
    if (!n) return;
    put({ ...n, col, order: orderAt(visibleIn(col, n.id), index) });
  };
  const endDrag = () => { setDrag(null); setOver(null); };

  const card = (n: Note, c: NoteCol) => {
    const p = prioOf(n.prio), ds = dueState(n.due, today), who = workerName(n.workerId);
    const left = sideCol(cols, c.id, -1), right = sideCol(cols, c.id, 1);
    return (
      <div key={n.id} className={"nb-card" + (drag === n.id ? " dragging" : "")} draggable
        onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", n.id); ev.dataTransfer.effectAllowed = "move"; setDrag(n.id); }} onDragEnd={endDrag}
        onClick={() => setEdit({ note: n, isNew: false })} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === "Enter") setEdit({ note: n, isNew: false }); }}>
        {(p || n.due) && <div className="nb-top">
          {p && <Badge tone={p.tone} size="sm" dot>{es ? p.es : p.en}</Badge>}
          {n.due && <span className={"nb-due " + ds}><Icon name="calendar" size={13} />{ds === "today" ? t("Today", "Hoy") : fmtDate(n.due, lang)}</span>}
        </div>}
        {n.title && <b className="nb-title">{n.title}</b>}
        {n.text && <p className="nb-text">{n.text}</p>}
        {(n.estId || who) && <div className="nb-meta">
          {n.estId && <Link className="nb-job" to={`/estimates/${n.estId}`} onClick={(ev) => ev.stopPropagation()} title={n.jobLabel}><Icon name="briefcase" size={13} />{n.jobLabel || t("Job", "Trabajo")}</Link>}
          {who && <span className="nb-who" title={who}><i>{ini(who)}</i>{who.split(" ")[0]}</span>}
        </div>}
        <div className="nb-mv" onClick={(ev) => ev.stopPropagation()}>
          <button disabled={!left} onClick={() => moveSide(n, c.id, -1)} aria-label={t("Move to the previous column", "Mover a la columna anterior")}>‹</button>
          <button disabled={!right} onClick={() => moveSide(n, c.id, 1)} aria-label={t("Move to the next column", "Mover a la columna siguiente")}>›</button>
        </div>
      </div>
    );
  };

  return (
    <div className="page nb-page">
      <div className="page-h">
        <div><h1>{t("Notes", "Notas")}</h1><p>{t("Ideas, reminders and to-dos for the business. Only owners and admins see them.", "Ideas, recordatorios y pendientes del negocio. Solo los dueños y administradores las ven.")}</p></div>
        <button className="btn pri" onClick={() => newNote()}><Icon name="plus" size={16} />{t("New note", "Nota nueva")}</button>
      </div>

      <div className="toolbar nb-bar">
        <input placeholder={t("Search notes…", "Buscar notas…")} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="pills">
          <button className={"pill" + (prio === "all" ? " on" : "")} onClick={() => setPrio("all")}>{t("All", "Todas")}</button>
          {PRIOS.map((p) => <button key={p.id} className={"pill" + (prio === p.id ? " on" : "")} onClick={() => setPrio(p.id)}>{es ? p.es : p.en}</button>)}
        </div>
        <span className="sp" />
        <div className="seg nb-view">
          <button className={view === "board" ? "on" : ""} onClick={() => setView("board")}>{t("Board", "Tablero")}</button>
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>{t("List", "Lista")}</button>
        </div>
        <button className="btn sm" onClick={() => setColsOpen(true)}>{t("Columns", "Columnas")}</button>
      </div>

      {!loading && all.length === 0 ? (
        <div className="card"><EmptyState icon="note" title={t("No notes yet", "Todavía no hay notas")}
          text={t("Jot down ideas, things to buy, calls to make… and move them across the board as you go.", "Apunta ideas, cosas por comprar, llamadas pendientes… y muévelas en el tablero según avances.")}>
          <button className="btn pri" onClick={() => newNote()}>{t("Write the first note", "Escribir la primera nota")}</button></EmptyState></div>
      ) : view === "board" ? (
        <div className="nb-board">
          {cols.map((c) => {
            const list = notesIn(shown, c.id, cols);
            const ghost = over?.col === c.id ? over.index : -1;
            const cards = list.filter((n) => n.id !== drag || ghost < 0);
            return (
              <section key={c.id} className={"nb-col" + (c.id === "done" ? " done" : "") + (over?.col === c.id ? " over" : "")}
                onDragOver={onDragOver(c.id)} onDrop={onDrop(c.id)}
                onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setOver((o) => (o?.col === c.id ? null : o)); }}>
                <div className="nb-colh">
                  <b>{colName(c, es)}</b><span>{filtered ? `${list.length}/${counts[c.id] || 0}` : counts[c.id] || 0}</span>
                  <button className="nb-add" onClick={() => newNote(c.id)} aria-label={t("Add a note here", "Agregar una nota aquí")} title={t("Add a note here", "Agregar una nota aquí")}><Icon name="plus" size={16} /></button>
                </div>
                <div className="nb-cards" ref={(el) => { colRefs.current[c.id] = el; }}>
                  {cards.map((n, i) => [ghost === i && <div key="ghost" className="nb-ghost" />, card(n, c)])}
                  {ghost >= cards.length && <div className="nb-ghost" />}
                  {list.length === 0 && ghost < 0 && <div className="nb-empty">{filtered ? t("Nothing matches", "Nada coincide") : t("Drop notes here", "Suelta notas aquí")}</div>}
                </div>
                <button className="nb-add-row" onClick={() => newNote(c.id)}><Icon name="plus" size={15} />{t("Add note", "Agregar nota")}</button>
              </section>
            );
          })}
        </div>
      ) : (
        <ListView notes={shown} cols={cols} es={es} lang={lang} today={today} workerName={workerName} onOpen={(n) => setEdit({ note: n, isNew: false })} />
      )}

      {edit && <NoteEditor note={edit.note} isNew={edit.isNew} cols={cols} estimates={estimates} clients={clients} workers={workers}
        onSave={onSave} onClose={() => setEdit(null)} onDelete={() => { remove(edit.note.id); setEdit(null); toast(t("Note deleted.", "Nota borrada.")); }} />}
      {colsOpen && <ColumnsEditor cols={cols} counts={counts} onClose={() => setColsOpen(false)}
        onSave={(c) => { update({ noteCols: c }); setColsOpen(false); toast(t("Columns saved.", "Columnas guardadas.")); }} />}
    </div>
  );
}

function ListView({ notes, cols, es, lang, today, workerName, onOpen }: {
  notes: Note[]; cols: NoteCol[]; es: boolean; lang: "en" | "es"; today: string; workerName(id?: string): string; onOpen(n: Note): void;
}) {
  const t = useT();
  const rows = cols.flatMap((c) => notesIn(notes, c.id, cols).map((n) => ({ n, c })));
  if (!rows.length) return <div className="card"><p className="muted" style={{ padding: 24, margin: 0 }}>{t("No notes match this search.", "Ninguna nota coincide con la búsqueda.")}</p></div>;
  const prio = (n: Note) => { const p = prioOf(n.prio); return p ? <Badge tone={p.tone} size="sm" dot>{es ? p.es : p.en}</Badge> : <span className="muted">—</span>; };
  const due = (n: Note) => n.due ? <span className={"nb-due " + dueState(n.due, today)}>{fmtDate(n.due, lang)}</span> : <span className="muted">—</span>;
  return (
    <>
      <div className="card only-desk tbl-wrap">
        <table className="tbl nb-tbl">
          <thead><tr><th>{t("Note", "Nota")}</th><th>{t("Column", "Columna")}</th><th>{t("Priority", "Prioridad")}</th><th>{t("Due", "Fecha")}</th><th>{t("Job", "Trabajo")}</th><th>{t("In charge", "Encargado")}</th></tr></thead>
          <tbody>{rows.map(({ n, c }) => (
            <tr key={n.id} className={"click" + (c.id === "done" ? " done" : "")} onClick={() => onOpen(n)}>
              <td><b>{n.title || n.text.split("\n")[0].slice(0, 80)}</b>{n.title && n.text && <div className="muted nb-tbl-x">{n.text.slice(0, 120)}</div>}</td>
              <td>{colName(c, es)}</td><td>{prio(n)}</td><td>{due(n)}</td>
              <td>{n.estId ? <Link to={`/estimates/${n.estId}`} onClick={(ev) => ev.stopPropagation()}>{n.jobLabel || t("Job", "Trabajo")}</Link> : <span className="muted">—</span>}</td>
              <td>{workerName(n.workerId) || <span className="muted">—</span>}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <div className="cards only-phone">{rows.map(({ n, c }) => (
        <div key={n.id} className={"ec nb-lcard" + (c.id === "done" ? " done" : "")} onClick={() => onOpen(n)}>
          <div className="l1"><span>{n.title || n.text.split("\n")[0].slice(0, 60)}</span>{prio(n)}</div>
          <div className="l2"><span>{colName(c, es)}{n.jobLabel ? " · " + n.jobLabel : ""}</span>{n.due && due(n)}</div>
        </div>))}</div>
    </>
  );
}
