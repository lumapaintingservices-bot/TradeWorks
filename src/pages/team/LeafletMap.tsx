import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = { id: string; lat: number; lng: number; kind: "job" | "worker"; label: string; sub?: string; tone?: "ok" | "warn" | "old" };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const initials = (s: string) => { const w = s.trim().split(/\s+/).filter(Boolean); return ((w[0]?.[0] || "?") + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase(); };

/**
 * OpenStreetMap map (Leaflet) with job sites (house pins) and workers (initials). Loaded on demand (React.lazy), so the map
 * library is only downloaded by owners who open the team map. Markers are HTML (no image files), text is escaped.
 */
export default function LeafletMap({ points, onPick }: { points: MapPoint[]; onPick?: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef("");
  const [tick, setTick] = useState(0); // bumped when the box is resized, to fit again

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([39.5, -98.35], 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    }).addTo(m);
    map.current = m; layer.current = L.layerGroup().addTo(m);
    // the box changes size (phone rotated, sidebar, window): redraw and fit the places again
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { m.invalidateSize(); fitted.current = ""; setTick((n) => n + 1); });
    ro?.observe(box.current);
    return () => { ro?.disconnect(); m.remove(); map.current = null; layer.current = null; fitted.current = ""; }; // a new map must fit again
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    for (const p of points) {
      const html = p.kind === "job"
        ? `<div class="tmap-job" title="${esc(p.label)}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor"/></svg></div>`
        : `<div class="tmap-w ${p.tone || ""}" title="${esc(p.label)}">${esc(initials(p.label))}</div>`;
      const icon = L.divIcon({ html, className: "tmap-pin", iconSize: p.kind === "job" ? [30, 30] : [34, 34], iconAnchor: p.kind === "job" ? [15, 15] : [17, 17] });
      const mk = L.marker([p.lat, p.lng], { icon, zIndexOffset: p.kind === "worker" ? 1000 : 0 })
        .bindPopup(`<b>${esc(p.label)}</b>${p.sub ? `<br><span>${esc(p.sub)}</span>` : ""}`);
      if (onPick) mk.on("click", () => onPick(p.id));
      mk.addTo(g);
    }
    // fit the view when the set of places changes (not on every position refresh, so the owner's zoom is kept)
    const key = points.map((p) => p.id).sort().join(",");
    if (points.length && key !== fitted.current) {
      fitted.current = key;
      if (points.length === 1) m.setView([points[0].lat, points[0].lng], 15);
      else m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [36, 36], maxZoom: 16 });
    }
  }, [points, onPick, tick]);

  return <div ref={box} className="tmap" role="region" aria-label="Map" />;
}
