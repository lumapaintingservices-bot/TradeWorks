import { useEffect, useRef } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { setTop } from "../../data/repo";
import { useClients, useEstimates, useInvoices, useSettings, useTasks } from "../../data/hooks";
import { calendarEvents, icsCalendar } from "../../lib/calendar";
import { useUi } from "../../store/ui";

/** Base address of the deployed calendar Worker (see workers/README.md). Empty until it is deployed. */
export const WORKER_BASE: string = String(import.meta.env.VITE_CAL_FEED_URL || "").trim().replace(/\/+$/, "");
export const feedUrl = (token: string) => (WORKER_BASE && token ? `${/^https?:\/\//i.test(WORKER_BASE) ? WORKER_BASE : "https://" + WORKER_BASE}/${token}.ics` : "");

/** Call once inside the app shell. While settings.calOn && settings.calToken, keeps calfeed/{token} = { owner, ics } current. */
export function useCalendarFeedSync() {
  const { company } = useAuth();
  const lang = useUi((s) => s.lang);
  const { settings } = useSettings();
  const { rows: estimates } = useEstimates();
  const { rows: tasks } = useTasks();
  const { rows: invoices } = useInvoices();
  const { rows: clients } = useClients();
  const last = useRef("");
  const token = settings.calOn ? settings.calToken || "" : "";
  const cid = company?.id, cname = company?.name;

  useEffect(() => { last.current = ""; }, [token]); // new link -> always write once

  useEffect(() => {
    if (!token || !cid) return;
    const h = window.setTimeout(() => {
      const ics = icsCalendar(calendarEvents({ estimates, tasks, invoices, clients, settings, lang }), (cname ? cname + " · " : "") + "TradeWorks");
      const sig = ics.replace(/DTSTAMP:[^\r]+\r\n/g, "");
      if (last.current === sig) return;
      last.current = sig;
      setTop("calfeed", token, { owner: cid, ics }).catch(() => { last.current = ""; });
    }, 1500);
    return () => window.clearTimeout(h);
  }, [token, cid, cname, estimates, tasks, invoices, clients, settings, lang]);
}
