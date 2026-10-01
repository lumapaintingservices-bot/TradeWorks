import { describe, expect, it } from "vitest";
import { cleanNote, colName, colsOf, DEFAULT_NOTE_COLS, dropIndex, dueState, filterNotes, newColId, notesIn, orderAt, sideCol } from "./notes";
import type { Note } from "./types";

const n = (id: string, col: string, order: number, more: Partial<Note> = {}): Note => ({ id, title: id, text: "", col, order, prio: "", ...more });

describe("notes board", () => {
  it("uses the default columns until the owner saves some", () => {
    expect(colsOf(undefined)).toEqual(DEFAULT_NOTE_COLS);
    expect(colsOf([])).toEqual(DEFAULT_NOTE_COLS);
    expect(colsOf([{ id: "a", name: "Calls" }, { id: "a", name: "dup" }, { id: "", name: "x" }])).toEqual([{ id: "a", name: "Calls" }]);
  });
  it("names columns in the app language unless renamed", () => {
    expect(colName({ id: "todo", name: "" }, true)).toBe("Por hacer");
    expect(colName({ id: "todo", name: "" }, false)).toBe("To do");
    expect(colName({ id: "todo", name: " Llamar " }, false)).toBe("Llamar");
    expect(colName({ id: "c5", name: "" }, true)).toBe("Columna");
  });
  it("lists a column in order and puts notes of a deleted column in the first one", () => {
    const cols = [{ id: "todo", name: "" }, { id: "done", name: "" }];
    const notes = [n("b", "todo", 2000), n("a", "todo", 1000), n("x", "gone", 500), n("d", "done", 1)];
    expect(notesIn(notes, "todo", cols).map((x) => x.id)).toEqual(["x", "a", "b"]);
    expect(notesIn(notes, "done", cols).map((x) => x.id)).toEqual(["d"]);
  });
  it("finds an order number between neighbours", () => {
    const list = [{ order: 1000 }, { order: 2000 }];
    expect(orderAt([], 0)).toBe(1000);
    expect(orderAt(list, 0)).toBe(0);
    expect(orderAt(list, 1)).toBe(1500);
    expect(orderAt(list, 2)).toBe(3000);
    expect(orderAt(list, 99)).toBe(3000);
  });
  it("drops before the first card whose middle is below the pointer", () => {
    expect(dropIndex([100, 200, 300], 50)).toBe(0);
    expect(dropIndex([100, 200, 300], 250)).toBe(2);
    expect(dropIndex([100, 200, 300], 400)).toBe(3);
    expect(dropIndex([], 10)).toBe(0);
  });
  it("moves left / right and stops at the edges", () => {
    expect(sideCol(DEFAULT_NOTE_COLS, "todo", 1)).toBe("doing");
    expect(sideCol(DEFAULT_NOTE_COLS, "ideas", -1)).toBeNull();
    expect(sideCol(DEFAULT_NOTE_COLS, "done", 1)).toBeNull();
  });
  it("searches title, text and job, and filters by priority", () => {
    const notes = [n("a", "todo", 1, { title: "Buy tape", prio: "high" }), n("b", "todo", 2, { text: "call Ana back", jobLabel: "EST-1 · Ana" }), n("c", "todo", 3, { prio: "low" })];
    expect(filterNotes(notes, "ana", "all").map((x) => x.id)).toEqual(["b"]);
    expect(filterNotes(notes, "", "high").map((x) => x.id)).toEqual(["a"]);
    expect(filterNotes(notes, "TAPE", "low")).toEqual([]);
  });
  it("tells late / today / soon", () => {
    expect(dueState("2026-09-29", "2026-09-30")).toBe("late");
    expect(dueState("2026-09-30", "2026-09-30")).toBe("today");
    expect(dueState("2026-10-03", "2026-09-30")).toBe("soon");
    expect(dueState("2026-10-10", "2026-09-30")).toBe("");
    expect(dueState(undefined, "2026-09-30")).toBe("");
  });
  it("makes unique column ids", () => {
    expect(newColId([{ id: "c2", name: "" }, { id: "x", name: "" }])).toBe("c3");
    expect(newColId([{ id: "c2", name: "" }])).toBe("c3");
  });
  it("cleans a note before saving", () => {
    const c = cleanNote(n("a", "nope", 1, { title: "  Hi  ", text: "x\n\n", prio: "urgent" as never, due: "", estId: "" }), DEFAULT_NOTE_COLS);
    expect(c).toEqual({ id: "a", title: "Hi", text: "x", col: "ideas", order: 1, prio: "" });
  });
});
