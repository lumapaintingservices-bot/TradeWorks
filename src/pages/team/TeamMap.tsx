import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useT } from "../../i18n";
import { todayISO } from "../../lib/estimate";
import { fmtMi, geocode, geoQuery, mapJobs, needsGeo, siteOf, whereIs, type Loc, type Site, type Where } from "../../lib/geo";
import type { ClockRec, Estimate, HourEntry, Invoice, Worker } from "../../lib/types";
import { useUi } from "../../store/ui";
import type { MapPoint } from "./LeafletMap";
import "./map.css";

const LeafletMap = lazy(() => import("./LeafletMap"));
const STALE_MS = 30 * 60_000; // no fresh position for 30 min: shown grey ("last seen")

// the free geocoder allows one request per second: every lookup from this page waits its turn
let lastGeo = 0;
const inFlight = new Set<string>();
async function pacedGeocode(q: string) {
  const wait = lastGeo + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeo = Date.now();
  return geocode(q);
}

type Props = {
  workers: Worker[]; clocks: ClockRec[]; hours: HourEntry[]; ests: Estimate[]; invoices: Pick<Invoice, "estId" | "status">[];
  label: (e: Estimate) => string; patchEst: (id: string, f: Partial<Estimate>) => Promise<unknown>; now: number;
};

/**
 * Team > "Where the team is": a map with this week's job sites and the workers who are clocked in, plus each one's status
 * (on site / how far from the nearest job / no location) and today's clock-ins and outs. Positions come from the workers'
 * phones (src/lib/geo.ts); job sites are looked up once per address and saved on the estimate.
 */
export default function TeamMap({ workers, clocks, hours, ests, invoices, label, patchEst, now }: Props) {
  const t = useT();
  const lang = useUi((s) => s.lang), toast = useUi((s) => s.toast);
  const { company, saveCompany } = useAuth();
  const on = !!company?.trackLocation;
  const today = todayISO();
  const jobs = useMemo(() => mapJobs(ests, invoices, today), [ests, invoices, today]);
  const sites = useMemo(() => jobs.map((e) => siteOf(e, label(e))).filter(Boolean) as Site[], [jobs, label]);
  const [lookup, setLookup] = useState(0); // addresses still being looked up

  // job sites: look each new address up once and save it on the estimate (a job not found is saved too, so it isn't asked again)
  const failed = useRef(false);
  useEffect(() => {
    const todo = on && !failed.current ? jobs.filter((e) => needsGeo(e) && !inFlight.has(e.id)) : [];
    setLookup(on && !failed.current ? jobs.filter(needsGeo).length : 0);
    let stop = false;
    (async () => {
      for (const e of todo) {
        if (stop) break;
        inFlight.add(e.id);
        try {
          const q = geoQuery(e), hit = await pacedGeocode(q);
          await patchEst(e.id, { geo: hit ? { q, ...hit } : { q } });
        } catch { failed.current = true; setLookup(0); break; } // offline / rate-limited: try again next time the page opens
        finally { inFlight.delete(e.id); }
      }
    })();
    return () => { stop = true; };
  }, [on, jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const wName = (id: string) => workers.find((w) => w.id === id)?.name || t("Worker", "Trabajador");
  const time = (iso: string) => new Date(iso).toLocaleTimeString(lang === "es" ? "es" : "en", { hour: "numeric", minute: "2-digit" });
  const ago = (iso: string) => {
    const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
    return m < 2 ? t("just now", "ahora") : m < 60 ? t(`${m} min ago`, `hace ${m} min`) : t(`${Math.floor(m / 60)} h ago`, `hace ${Math.floor(m / 60)} h`);
  };
  const whereText = (w: Where) => w.kind === "none" ? t("No location", "Sin ubicación")
    : w.kind === "on" ? t(`On site · ${w.site.label}`, `En el trabajo · ${w.site.label}`)
      : t(`${fmtMi(w.mi)} from ${w.site.label}`, `A ${fmtMi(w.mi)} de ${w.site.label}`);

  const working = useMemo(() => clocks.map((c) => {
    const pos: Loc | undefined = c.last || c.loc;
    const stale = !!pos && now - Date.parse(pos.at) > STALE_MS;
    return { c, pos, where: whereIs(pos, sites), stale };
  }), [clocks, sites, now]);
  const done = useMemo(() => hours.filter((h) => h.date === today && (h.inLoc || h.outLoc)), [hours, today]);

  const points: MapPoint[] = useMemo(() => [
    ...sites.map((s) => ({ id: "j" + s.id, lat: s.lat, lng: s.lng, kind: "job" as const, label: s.label, sub: s.address })),
    ...working.filter((x) => x.pos).map((x) => ({
      id: "w" + x.c.id, lat: x.pos!.lat, lng: x.pos!.lng, kind: "worker" as const, label: wName(x.c.id),
      sub: `${whereText(x.where)} · ${ago(x.pos!.at)}`, tone: x.stale ? "old" as const : x.where.kind === "on" ? "ok" as const : "warn" as const,
    })),
  ], [sites, working]); // eslint-disable-line react-hooks/exhaustive-deps

  const turn = async (v: boolean) => {
    if (!company) return;
    if (!v && !confirm(t("Stop saving your workers' location?", "¿Dejar de guardar la ubicación de tus trabajadores?"))) return;
    await saveCompany({ id: company.id, name: company.name, trackLocation: v });
    toast(v ? t("Location at clock-in is on.", "Ubicación al marcar entrada activada.") : t("Location is off.", "Ubicación apagada."));
  };

  if (!on) return (
    <section className="card tm-sec tm-map-off">
      <div className="card-h"><h2>{t("Where the team is", "Dónde está el equipo")}</h2></div>
      <p className="muted tm-hint">{t(
        "See on a map who is working and whether they clocked in at the job. When a worker clocks in or out on their phone, TradeWorks saves where they were, and refreshes it every few minutes while the app is open during the shift. Workers see a notice; nothing is saved when they are clocked out.",
        "Mira en un mapa quién está trabajando y si marcó entrada en el trabajo. Cuando un trabajador marca entrada o salida en su teléfono, TradeWorks guarda dónde estaba, y lo actualiza cada pocos minutos mientras la app esté abierta en su turno. Los trabajadores ven un aviso; no se guarda nada cuando no están trabajando.")}</p>
      <div style={{ padding: "0 20px 18px" }}><button className="btn pri" onClick={() => turn(true)}>{t("Turn on location at clock-in", "Activar ubicación al marcar entrada")}</button></div>
    </section>
  );

  return (
    <section className="card tm-sec">
      <div className="card-h"><h2>{t("Where the team is", "Dónde está el equipo")}</h2>
        <button className="btn sm" onClick={() => turn(false)}>{t("Turn off", "Apagar")}</button></div>
      <div className="tm-map-b">
        {points.length ? <Suspense fallback={<div className="tmap" />}><LeafletMap points={points} /></Suspense>
          : <p className="muted tm-empty">{lookup ? t("Finding your job sites on the map…", "Buscando tus trabajos en el mapa…")
            : t("Nobody is clocked in, and there are no jobs with an address this week.", "Nadie ha marcado entrada y no hay trabajos con dirección esta semana.")}</p>}
        {lookup > 0 && points.length > 0 && <p className="muted tm-map-note">{t(`Finding ${lookup} job site(s)…`, `Buscando ${lookup} trabajo(s)…`)}</p>}

        <h3 className="tm-map-h">{t("Working now", "Trabajando ahora")}</h3>
        {working.length === 0 ? <p className="muted tm-map-note">{t("Nobody is clocked in.", "Nadie ha marcado entrada.")}</p> : (
          <ul className="tm-map-list">{working.map(({ c, pos, where, stale }) => (
            <li key={c.id}>
              <span className={"tm-dot " + (!pos || stale ? "old" : where.kind === "on" ? "ok" : "warn")} />
              <div><b>{wName(c.id)}</b>
                <small>{t("In at ", "Entró a las ")}{time(c.at)}{pos ? ` · ${stale ? t("last seen ", "visto ") : t("updated ", "actualizado ")}${ago(pos.at)}` : ""}</small></div>
              <span className="tm-where">{whereText(where)}</span>
            </li>))}</ul>
        )}

        {done.length > 0 && <>
          <h3 className="tm-map-h">{t("Clocked out today", "Salieron hoy")}</h3>
          <ul className="tm-map-list">{done.map((h) => {
            const i = whereIs(h.inLoc, sites), o = whereIs(h.outLoc, sites);
            return (
              <li key={h.id}>
                <span className={"tm-dot " + (i.kind === "on" && o.kind === "on" ? "ok" : i.kind === "none" && o.kind === "none" ? "old" : "warn")} />
                <div><b>{wName(h.workerId)}</b><small>{h.hours} h</small></div>
                <span className="tm-where">{t("In: ", "Entrada: ")}{whereText(i)}<br />{t("Out: ", "Salida: ")}{whereText(o)}</span>
              </li>);
          })}</ul>
        </>}
        <p className="muted tm-map-note">{t("A web app can't follow a phone in the background: with TradeWorks closed, you see the last position.", "Una app web no puede seguir un teléfono en segundo plano: con TradeWorks cerrado, ves la última posición.")}</p>
      </div>
    </section>
  );
}
