import { useEffect, useRef } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useClock, useWorkers } from "../../data/hooks";
import { getLocation, locAllowed, shouldPing } from "../../lib/geo";

/**
 * Mounted in the Shell for workers: while they are clocked in and TradeWorks is open on screen, refresh their position on the
 * clock (clock/{workerId}.last) every few minutes, for the owner's team map. Nothing runs when the owner has not turned on
 * location at clock-in, when the worker has not said yes to it (Team page notice), when they are clocked out, or when the app
 * is in the background.
 */
export default function LocationPing() {
  const { company, workerId } = useAuth();
  return company?.trackLocation && workerId ? <Gate workerId={workerId} /> : null;
}
function Gate({ workerId }: { workerId: string }) {
  const { company } = useAuth();
  const { rows } = useWorkers(); // a worker reads only their own record
  return locAllowed(company?.trackLocation, rows.find((w) => w.id === workerId)) ? <Ping workerId={workerId} /> : null;
}

function Ping({ workerId }: { workerId: string }) {
  const { rows, patch } = useClock();
  const clock = rows.find((c) => c.id === workerId);
  const busy = useRef(false);
  const at = clock?.at, lastAt = clock?.last?.at;

  useEffect(() => {
    if (!at) return;
    const tick = async () => {
      if (busy.current || document.visibilityState !== "visible" || !shouldPing(clock?.last)) return;
      busy.current = true;
      try {
        const loc = await getLocation();
        if (loc) await patch(workerId, { last: loc });
      } catch { /* try again on the next tick */ } finally { busy.current = false; }
    };
    tick();
    const i = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(i); document.removeEventListener("visibilitychange", tick); };
  }, [at, lastAt, workerId]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
