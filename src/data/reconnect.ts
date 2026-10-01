import { disableNetwork, enableNetwork } from "firebase/firestore";
import { useEffect } from "react";
import { db, hasFirebase } from "../lib/firebase";

/** After this long in the background, coming back forces a fresh connection. */
export const RECONNECT_AFTER_MS = 15_000;

/**
 * Phones (iPhone above all) put a page's connection to sleep in the background, and Firestore's live listeners may not
 * wake up by themselves: a worker would only see a new task after reloading. Coming back to the app after a while, the
 * network coming back, or the page being restored from the back / forward cache restarts Firestore's connection, so
 * every live list catches up within a second or two. Data already on screen stays (offline cache).
 */
export function useFirestoreReconnect() {
  useEffect(() => {
    if (!hasFirebase) return;
    let hiddenAt = 0, busy = false;
    const restart = async () => {
      if (busy) return;
      busy = true;
      try { await disableNetwork(db); await enableNetwork(db); } catch { /* next time */ } finally { busy = false; }
    };
    const onVisible = () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt >= RECONNECT_AFTER_MS) restart();
      hiddenAt = 0;
    };
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) restart(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", restart);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", restart);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);
}
