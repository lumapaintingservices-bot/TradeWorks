/**
 * Where the team is: the worker's phone location when they clock in / out (and every few minutes while TradeWorks is open
 * during the shift), compared with the job sites. Pure helpers plus two thin browser wrappers (getLocation, geocode).
 * A web page cannot track a phone in the background: with the app closed, the last known position stays.
 */
import { jobDates, jobStatus } from "./calendar";
import type { Estimate, HourEntry, Invoice, Worker } from "./types";

/** A position as stored on clock/{workerId} (loc = at clock-in, last = latest) and on hours entries (inLoc, outLoc). */
export type Loc = { lat: number; lng: number; acc: number; at: string };
export type Site = { id: string; label: string; address: string; lat: number; lng: number };
export type Where = { kind: "none" } | { kind: "on" | "away"; site: Site; mi: number };

/** Within this distance of a job's address (plus the phone's own accuracy, capped) counts as "on site". */
export const ON_SITE_MI = 0.25;
/** While clocked in and the app is open, the position is refreshed this often. */
export const PING_MS = 5 * 60_000;

/* ---------- the worker's consent and how long positions are kept ---------- */
/** Version of the location notice the worker answered (a new version asks again). */
export const LOC_CONSENT_V = "loc-2026-10-01";
/** Positions on hours entries (inLoc / outLoc) are removed after this many days (the owner's app does it, src/data/locRetention.ts). */
export const LOC_KEEP_DAYS = 90;
/** Has the worker answered the current notice? */
export const locAnswered = (w: Pick<Worker, "locConsent"> | null | undefined) => !!w?.locConsent && w.locConsent.v === LOC_CONSENT_V;
/** May the app save this worker's position? Only when the owner turned it on AND the worker said yes to the current notice. */
export const locAllowed = (trackLocation: boolean | undefined, w: Pick<Worker, "locConsent"> | null | undefined) => !!trackLocation && locAnswered(w) && !!w!.locConsent!.on;
/** Hours entries whose positions are past LOC_KEEP_DAYS (by the entry's day): their inLoc / outLoc must go. */
export const locExpired = (hours: HourEntry[], today: string) => {
  const d = new Date(today + "T12:00:00"); d.setDate(d.getDate() - LOC_KEEP_DAYS);
  const cut = d.toISOString().slice(0, 10);
  return hours.filter((h) => (h.inLoc || h.outLoc) && String(h.date || "") < cut);
};

const r5 = (n: number) => Math.round(n * 1e5) / 1e5; // ~1 m
export const toLoc = (c: { latitude: number; longitude: number; accuracy?: number }, at: string = new Date().toISOString()): Loc =>
  ({ lat: r5(c.latitude), lng: r5(c.longitude), acc: Math.round(Math.min(Math.max(Number(c.accuracy) || 0, 0), 100000)), at });

export const isLoc = (v: unknown): v is Loc => {
  const l = v as Loc;
  return !!l && typeof l.lat === "number" && typeof l.lng === "number" && Math.abs(l.lat) <= 90 && Math.abs(l.lng) <= 180;
};

/** Great-circle distance in miles. */
export function distMi(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The nearest job site, and whether the worker is on it. A poor GPS reading (accuracy in meters) widens the circle a little. */
export function whereIs(loc: Loc | null | undefined, sites: Site[]): Where {
  if (!isLoc(loc) || !sites.length) return { kind: "none" };
  let best: { site: Site; mi: number } | null = null;
  for (const s of sites) { const mi = distMi(loc, s); if (!best || mi < best.mi) best = { site: s, mi }; }
  const slack = Math.min(Number(loc.acc) || 0, 800) / 1609.34;
  return { kind: best!.mi <= ON_SITE_MI + slack ? "on" : "away", ...best! };
}

/** "350 ft" / "0.4 mi" / "12 mi". */
export function fmtMi(mi: number): string {
  if (mi < 0.1) return `${Math.max(10, Math.round((mi * 5280) / 10) * 10)} ft`;
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

/** Time to refresh the position: never sent yet, or older than PING_MS. */
export const shouldPing = (last: Loc | null | undefined, nowMs: number = Date.now()): boolean =>
  !isLoc(last) || !(nowMs - Date.parse(last.at) < PING_MS);

const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
/**
 * Jobs worth putting on the map: scheduled within 3 days of today (either side), not declined, with an address.
 * Their geocoded position lives on the estimate (`geo`), looked up once per address.
 */
export function mapJobs(estimates: Estimate[], invoices: Pick<Invoice, "estId" | "status">[], today: string): Estimate[] {
  const from = addDays(today, -3), to = addDays(today, 3);
  return estimates.filter((e) => String(e.address || "").trim() && e.startDate && jobStatus(e, invoices) !== "Declined"
    && jobDates(e).some((d) => d >= from && d <= to)).slice(0, 40);
}
/** The geocoder query for a job (its address), and whether the saved position is for that same address. */
export const geoQuery = (e: Pick<Estimate, "address">) => String(e.address || "").trim().replace(/\s+/g, " ");
export const needsGeo = (e: Pick<Estimate, "address" | "geo">) => !!geoQuery(e) && e.geo?.q !== geoQuery(e);
export const siteOf = (e: Estimate, label: string): Site | null =>
  e.geo && e.geo.q === geoQuery(e) && typeof e.geo.lat === "number" && typeof e.geo.lng === "number"
    ? { id: e.id, label, address: geoQuery(e), lat: e.geo.lat, lng: e.geo.lng } : null;

/* ------------------------------ browser wrappers ------------------------------ */

/** The phone's position now, or null (no permission, no GPS, timeout). Never throws. */
export function getLocation(timeoutMs = 10_000): Promise<Loc | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const done = setTimeout(() => resolve(null), timeoutMs + 1000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(done); resolve(toLoc(p.coords)); },
      () => { clearTimeout(done); resolve(null); },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/** Address -> position with OpenStreetMap's free geocoder (US only; the app calls it at most once a second). */
export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`;
  const res = await fetch(u, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("geocode " + res.status);
  const j = (await res.json()) as { lat: string; lon: string }[];
  const hit = j[0];
  return hit && isFinite(+hit.lat) && isFinite(+hit.lon) ? { lat: r5(+hit.lat), lng: r5(+hit.lon) } : null;
}
