/**
 * Notes board (pure logic): columns, order inside a column, drag & drop positions, search and due dates.
 * Notes live in companies/{cid}/notes (owners / admins only); the columns in settings.noteCols.
 */
import type { Note, NoteCol, NotePrio } from "./types";

export const DEFAULT_NOTE_COLS: NoteCol[] = [{ id: "ideas", name: "" }, { id: "todo", name: "" }, { id: "doing", name: "" }, { id: "done", name: "" }];
const BUILT_IN: Record<string, [string, string]> = { ideas: ["Ideas", "Ideas"], todo: ["To do", "Por hacer"], doing: ["Doing", "Haciendo"], done: ["Done", "Hecho"] };
export const MAX_NOTE_COLS = 8;

export const PRIOS: { id: NotePrio; en: string; es: string; tone: "red" | "amber" | "gray" }[] = [
  { id: "high", en: "High", es: "Alta", tone: "red" }, { id: "med", en: "Medium", es: "Media", tone: "amber" }, { id: "low", en: "Low", es: "Baja", tone: "gray" },
];
export const prioOf = (p: NotePrio | undefined) => PRIOS.find((x) => x.id === p);

/** The board's columns: the saved ones (bad entries dropped, ids unique), or the defaults. */
export function colsOf(saved: NoteCol[] | undefined): NoteCol[] {
  const seen = new Set<string>();
  const ok = (saved || []).filter((c) => c && typeof c.id === "string" && c.id && !seen.has(c.id) && (seen.add(c.id), true))
    .map((c) => ({ id: c.id, name: typeof c.name === "string" ? c.name.slice(0, 40) : "" }));
  return ok.length ? ok.slice(0, MAX_NOTE_COLS) : DEFAULT_NOTE_COLS;
}

/** A column's name: what the owner typed, else the built-in name, else "Column". */
export function colName(c: NoteCol, es: boolean): string {
  if (c.name.trim()) return c.name.trim();
  const b = BUILT_IN[c.id];
  return b ? b[es ? 1 : 0] : es ? "Columna" : "Column";
}

/** Notes of one column, in order. A note whose column was deleted shows in the first column. */
export function notesIn(notes: Note[], col: string, cols: NoteCol[]): Note[] {
  const first = cols[0]?.id, known = new Set(cols.map((c) => c.id));
  return notes.filter((n) => (known.has(n.col) ? n.col : first) === col).sort(byOrder);
}
export const byOrder = (a: Note, b: Note) => (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id));

/** The order number that puts a note at position `index` of `list` (a column's notes in order, without the note being moved). */
export function orderAt(list: Pick<Note, "order">[], index: number): number {
  const i = Math.max(0, Math.min(index, list.length));
  const prev = list[i - 1]?.order, next = list[i]?.order;
  if (prev === undefined && next === undefined) return 1000;
  if (prev === undefined) return (next as number) - 1000;
  if (next === undefined) return prev + 1000;
  return (prev + next) / 2;
}

/** Where a dragged note lands: before the first card whose middle is below the pointer (`mids` = cards' vertical middles). */
export function dropIndex(mids: number[], y: number): number {
  const i = mids.findIndex((m) => y < m);
  return i === -1 ? mids.length : i;
}

/** The column to the left / right of `col` (for the ‹ › buttons), or null at the edge. */
export function sideCol(cols: NoteCol[], col: string, dir: -1 | 1): string | null {
  const i = Math.max(0, cols.findIndex((c) => c.id === col));
  return cols[i + dir]?.id ?? null;
}

/** Search (title, text, job) and priority filter. */
export function filterNotes(notes: Note[], q: string, prio: NotePrio | "all"): Note[] {
  const s = q.trim().toLowerCase();
  return notes.filter((n) => (prio === "all" || n.prio === prio) && (!s || [n.title, n.text, n.jobLabel].some((x) => String(x || "").toLowerCase().includes(s))));
}

/** "late" before today, "today", "soon" within 3 days, "" otherwise / no date. */
export function dueState(due: string | undefined, today: string): "late" | "today" | "soon" | "" {
  if (!due) return "";
  if (due < today) return "late";
  if (due === today) return "today";
  const d = (Date.parse(due + "T00:00:00") - Date.parse(today + "T00:00:00")) / 864e5;
  return d <= 3 ? "soon" : "";
}

/** A new column id that is not taken. */
export function newColId(cols: NoteCol[]): string {
  let i = cols.length + 1;
  while (cols.some((c) => c.id === "c" + i)) i++;
  return "c" + i;
}

/** Clean a note before saving: trimmed text, a known column, a valid priority. */
export function cleanNote(n: Note, cols: NoteCol[]): Note {
  const col = cols.some((c) => c.id === n.col) ? n.col : cols[0].id;
  const out: Note = { ...n, title: n.title.trim().slice(0, 200), text: n.text.replace(/\s+$/, "").slice(0, 5000), col, prio: prioOf(n.prio) ? n.prio : "" };
  for (const k of ["due", "estId", "jobLabel", "workerId"] as const) if (!out[k]) delete out[k];
  return out;
}
