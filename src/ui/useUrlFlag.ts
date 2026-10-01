import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Runs `fn(value)` when the address has `?name=value` (e.g. "?new=1" from Quick create, "?open=<id>" from Search), then takes the
 * flag out of the address so a reload or Back does not do it again. `ready` waits for the data the action needs.
 */
export function useUrlFlag(name: string, fn: (value: string) => void, ready = true) {
  const [sp, setSp] = useSearchParams();
  const v = sp.get(name);
  useEffect(() => {
    if (!v || !ready) return;
    fn(v);
    setSp((p) => { const n = new URLSearchParams(p); n.delete(name); return n; }, { replace: true });
  }, [v, ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
