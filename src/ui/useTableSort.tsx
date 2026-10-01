import { useMemo, useState, type ReactNode } from "react";
import { nextSort, sortRows, type SortDir, type SortState } from "../lib/sort";
import { useUi } from "../store/ui";
import "./ui.css";

type Col<T> = { get(r: T): string | number | null | undefined; first?: SortDir };

/**
 * Sortable table headers (idea from shadcn's Data Table). `th("amount", "Amount", "r")` draws a header you can click;
 * `sorted` is the rows in that order (or as they came while no column is picked).
 */
export function useTableSort<T>(rows: T[], cols: Record<string, Col<T>>) {
  const [s, setS] = useState<SortState>(null);
  const es = useUi((x) => x.lang) === "es";
  const sorted = useMemo(() => (s && cols[s.key] ? sortRows(rows, cols[s.key].get, s.dir) : rows), [rows, s]); // eslint-disable-line react-hooks/exhaustive-deps
  const th = (key: string, label: ReactNode, className?: string) => {
    const on = s?.key === key ? s.dir : null;
    return (
      <th className={className} aria-sort={on === "asc" ? "ascending" : on === "desc" ? "descending" : undefined}>
        <button type="button" className={"th-sort" + (on ? " on" : "")} title={es ? "Ordenar" : "Sort"}
          onClick={() => setS((c) => nextSort(c, key, cols[key]?.first || "asc"))}>
          {label}<span className="th-ar" aria-hidden>{on === "asc" ? "↑" : on === "desc" ? "↓" : "↕"}</span>
        </button>
      </th>
    );
  };
  return { sorted, th, sort: s };
}
