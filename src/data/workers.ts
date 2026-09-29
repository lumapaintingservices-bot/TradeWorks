import { useMemo } from "react";
import { useWorkers } from "./hooks";

/** Active workers as {id, name}, sorted by name (Firestore returns documents by id, so order is fixed here). For assignee selects. */
export function useWorkerOptions(): { id: string; name: string }[] {
  const { rows } = useWorkers();
  return useMemo(
    () => rows.filter((w) => w.active !== false).map((w) => ({ id: w.id, name: w.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  );
}
