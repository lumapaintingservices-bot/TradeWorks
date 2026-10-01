/** Table sorting (idea from shadcn's Data Table): click a column header to sort by it, again to flip the order. */
export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir } | null;
type Val = string | number | null | undefined;

/** Sorts a copy: numbers as numbers, text alphabetically with "EST-1002" after "EST-999"; empty values always last. */
export function sortRows<T>(rows: T[], get: (r: T) => Val, dir: SortDir): T[] {
  const m = dir === "asc" ? 1 : -1;
  const empty = (v: Val) => v === null || v === undefined || v === "" || (typeof v === "number" && !isFinite(v));
  return rows.map((r, i) => ({ r, i, v: get(r) })).sort((a, b) => {
    const ea = empty(a.v), eb = empty(b.v);
    if (ea || eb) return ea === eb ? a.i - b.i : ea ? 1 : -1;
    const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v), undefined, { numeric: true, sensitivity: "base" });
    return c * m || a.i - b.i;
  }).map((x) => x.r);
}

/** Header click: a new column starts with its natural order (text A→Z, numbers and dates biggest / newest first), then flips, then off. */
export function nextSort(cur: SortState, key: string, firstDir: SortDir): SortState {
  if (!cur || cur.key !== key) return { key, dir: firstDir };
  if (cur.dir === firstDir) return { key, dir: firstDir === "asc" ? "desc" : "asc" };
  return null;
}
