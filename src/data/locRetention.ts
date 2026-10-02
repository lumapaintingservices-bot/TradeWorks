import { useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthProvider";
import { todayISO } from "../lib/estimate";
import { locExpired } from "../lib/geo";
import type { HourEntry } from "../lib/types";
import { useHours } from "./hooks";
import type { Rec } from "./repo";

/**
 * Owner / admin app (mounted in the Shell): workers' phone positions kept on hours entries (inLoc / outLoc) are removed once
 * they are older than LOC_KEEP_DAYS, as the location notice promises. The hours themselves stay. A few at a time, once per
 * app start; deleted entries too.
 */
export function useLocationRetention() {
  const { role } = useAuth();
  const on = role === "owner" || role === "admin";
  const { all, loading, save } = useHours();
  const ran = useRef(false);
  useEffect(() => {
    if (!on || loading || ran.current) return;
    const old = locExpired(all, todayISO()).slice(0, 100);
    ran.current = true;
    if (!old.length) return;
    (async () => {
      for (const h of old) {
        const { inLoc: _in, outLoc: _out, ...rest } = h;
        await save(rest as HourEntry & Rec).catch(() => { /* next app start */ });
      }
    })();
  }, [on, loading, all, save]);
}
