/** Job day logic — port of the prototype's section 28 (jdKey, checklistFor, shoppingText) and the work-order rows (viewWorkOrder). */
import { addDaysISO } from "./calendar";
import { calcMaterials, jobTypeOf } from "./estimate";
import { num } from "./money";
import { nl2list, scopeGroups } from "./scope";
import { catalogHrs } from "./trades";
import type { Estimate, JobTask, PhotoRef, Settings } from "./types";

type Lang = "en" | "es";
const tt = (lang: Lang) => (en: string, es: string) => (lang === "es" ? es : en);

/** Stable key of a checklist line: same 31-hash as the prototype so checked items keep matching. */
export function jdKey(day: number | string, text: string): string {
  let h = 0;
  const t = String(text);
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return "s" + day + "_" + (h >>> 0).toString(36);
}

export type CheckItem = { day: number; text: string; key: string; custom?: boolean; id?: string };
export type Checklist = { items: CheckItem[]; days: number; titles: Record<number, string> };

/** Checklist from the estimate's own scope of work (Day 1…Day N), plus the custom tasks you added. */
export function checklistFor(e: Estimate, lang: Lang = "en"): Checklist {
  const T = tt(lang);
  const txt = (lang === "es" ? e.scopeEs || e.scopeEn : e.scopeEn || e.scopeEs) || "";
  const groups = scopeGroups(nl2list(txt));
  const days = Math.max(1, num(e.days) || 1);
  const out: CheckItem[] = [];
  const titles: Record<number, string> = {};
  let seq = 0;
  groups.forEach((g) => {
    if (!g.items.length) return;
    let d = g.day ? num(g.day) : 0;
    if (!d) { seq = Math.min(days, seq + 1); d = seq; } else seq = d;
    if (g.title && !titles[d]) titles[d] = String(g.title).replace(/^[\s\-–—:]+/, "");
    g.items.forEach((it) => out.push({ day: d, text: it, key: jdKey(d, it) }));
  });
  if (!out.length) {
    // no scope written yet: a sensible default for the job type
    const cab = jobTypeOf(e) === "cabinets";
    const def: [number, string][] = cab
      ? [[1, T("Protect floors & counters", "Proteger pisos y encimeras")], [1, T("Label & remove doors and drawers", "Etiquetar y quitar puertas y cajones")], [1, T("Clean & degrease", "Limpiar y desengrasar")],
        [2, T("Sand doors, drawers & frames", "Lijar puertas, cajones y marcos")], [2, T("Fill & caulk", "Resanar y sellar")], [3, T("Prime", "Primer")], [3, T("Sand primer smooth", "Lijar el primer")],
        [4, T("Finish coat 1", "Primera mano")], [4, T("Finish coat 2", "Segunda mano")], [5, T("Reinstall & align", "Reinstalar y alinear")], [5, T("Touch-ups & clean up", "Retoques y limpieza")],
        [5, T("Walkthrough with client", "Revisión con el cliente")]]
      : [[1, T("Protect & prep", "Proteger y preparar")], [1, T("Repairs & patching", "Reparaciones")], [2, T("Prime", "Primer")], [2, T("First coat", "Primera mano")],
        [3, T("Second coat", "Segunda mano")], [3, T("Clean up & walkthrough", "Limpieza y revisión")]];
    def.forEach((x) => { if (x[0] <= Math.max(days, 1) || cab) out.push({ day: x[0], text: x[1], key: jdKey(x[0], x[1]) }); });
  }
  (e.jobTasks || []).forEach((t) => out.push({ day: num(t.day) || 1, text: t.text, key: "c_" + t.id, custom: true, id: t.id }));
  let maxDay = days;
  out.forEach((x) => { if (x.day > maxDay) maxDay = x.day; });
  return { items: out, days: maxDay, titles };
}

/** Items of one day, in checklist order. */
export const itemsOfDay = (cl: Checklist, day: number) => cl.items.filter((x) => x.day === day);

/** Done / total / percent (only lines that exist in the current checklist count). */
export function progress(cl: Checklist, check?: Record<string, string>): { done: number; total: number; pct: number } {
  const c = check || {};
  let done = 0;
  cl.items.forEach((x) => { if (c[x.key]) done++; });
  const total = cl.items.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** New `check` record with one line ticked (value = ISO timestamp) or unticked. */
export function setChecked(check: Record<string, string> | undefined, key: string, on: boolean, at = new Date().toISOString()): Record<string, string> {
  const n = { ...(check || {}) };
  if (on) n[key] = at; else delete n[key];
  return n;
}

export const newJobTask = (day: number | string, text: string, id: string): JobTask => ({ id, day: num(day) || 1, text: text.trim() });

const clientLabel = (e: Estimate, lang: Lang) => e.clientName || tt(lang)("Unnamed client", "Cliente sin nombre");
const colorLine = (c: { area: string; brand: string; color: string; sheen: string; code: string }) => [c.area, c.brand, c.color, c.sheen, c.code].filter((x) => x).join(" · ");

/** Plain-text shopping list (gallons to buy, primer, supplies, colors) to copy or send by WhatsApp. */
export function shoppingText(e: Estimate, s: Settings, lang: Lang = "en"): string {
  const T = tt(lang);
  const m = calcMaterials(e, s);
  const L: string[] = [T("Shopping list", "Lista de compras") + " — " + e.number + " · " + clientLabel(e, lang)];
  const gal = (label: string, g: number) => { if (num(g) > 0) L.push("• " + label + ": " + Math.ceil(num(g)) + " gal"); };
  gal(T("Primer", "Primer"), m.buyPrimer || m.primerGal);
  gal(T("Cabinet paint", "Pintura de gabinetes"), m.buyPaint || m.paintGal);
  gal(T("Wall paint", "Pintura de paredes"), m.buyWall || m.wallGal);
  gal(T("Wall primer", "Primer de paredes"), m.buyWallPrimer || m.wallPrimerGal);
  (m.supplyLines || []).forEach((l) => { if (num(l.units) > 0) L.push("• " + l.name + ": " + Math.round(num(l.units) * 10) / 10); });
  (e.colors || []).forEach((c) => { if (c.color || c.brand) L.push("🎨 " + colorLine(c)); });
  if (e.matBuyer === "client") L.push(T("(the client buys the materials)", "(el cliente compra los materiales)"));
  else if (e.matBuyer === "paint") L.push(T("(the client buys paint & primer)", "(el cliente compra pintura y primer)"));
  return L.join("\n");
}
export const whatsappShareUrl = (text: string) => "https://wa.me/?text=" + encodeURIComponent(text);

/* ---------- "Our recent work" (Settings.showcase) ---------- */
export const SHOWCASE_MAX = 8;
export type ShowcaseItem = { id: string; url: string; caption: string };

/** Caption used when an after photo is promoted: its caption (or the job type) plus the city part of the address, like the prototype. */
export function showcaseCaption(e: Estimate, ph: PhotoRef, jobLabel: string): string {
  const part = e.address ? String(e.address).split(",").slice(-2, -1)[0] : "";
  return (ph.caption || jobLabel) + (part && part.trim() ? " · " + part.trim() : "");
}
/** Adds photos to the front of the list (newest first) and trims to SHOWCASE_MAX. Photos already there (same id) are skipped. */
export function addShowcase(list: ShowcaseItem[] | undefined, add: ShowcaseItem[]): ShowcaseItem[] {
  const cur = [...(list || [])];
  add.forEach((x) => { if (x.url && !cur.some((y) => y.id === x.id)) cur.unshift(x); });
  return cur.slice(0, SHOWCASE_MAX);
}
export const removeShowcase = (list: ShowcaseItem[] | undefined, id: string): ShowcaseItem[] => (list || []).filter((x) => x.id !== id);

/* ---------- work order (crew sheet, no prices) ---------- */
export type WorkRow = { what: string; qty: string; hrs: number; sub?: string };
/** Rows of the work order, same lines as the prototype's viewWorkOrder. */
export function workOrderRows(e: Estimate, s: Settings, lang: Lang = "en"): { rows: WorkRow[]; total: number } {
  const es = lang === "es", p = s.production;
  const rows: WorkRow[] = [];
  let total = 0;
  const row = (what: string, qty: string | number, hrs: number, sub = "") => { total += num(hrs); rows.push({ what, qty: String(qty), hrs: num(hrs), sub }); };
  const doors = num(e.doors), drawers = num(e.drawers);
  if (doors) row(es ? "Puertas de gabinete" : "Cabinet doors", doors, doors * num(p.doorHrs), es ? "Quitar, marcar, lijar y pintar a pistola por los dos lados" : "Remove, label, sand and spray both sides");
  if (drawers) row(es ? "Frentes de cajón" : "Drawer fronts", drawers, drawers * num(p.drawerHrs));
  const fm = e.frameMode || "included", bm = e.boxMode || "included";
  if (fm === "separate") row(es ? "Marcos" : "Frames", num(e.frames) || "—", num(e.frames) * num(p.frameHrs));
  else if (fm === "none") row(es ? "Marcos: NO se pintan" : "Frames: NOT painted", "", 0);
  else row(es ? "Marcos: se pintan, van con las puertas" : "Frames: painted, together with the doors", "", 0);
  if (bm === "separate") row(es ? "Cajas" : "Boxes", num(e.boxes) || "—", num(e.boxes) * num(p.boxHrs));
  else if (bm === "none") row(es ? "Cajas: NO se pintan" : "Boxes: NOT painted", "", 0);
  else row(es ? "Cajas: se pintan, van con las puertas" : "Boxes: painted, together with the doors", "", 0);
  if (doors + drawers > 0) row(es ? "Preparar, tapar y limpiar" : "Set-up, masking and cleanup", "", num(p.setupHrs));
  (e.items || []).forEach((it) => {
    const d = es ? it.descEs || it.desc : it.desc || it.descEs;
    if (!d && !num(it.qty)) return;
    const lh = it.hrs !== undefined && it.hrs !== "" && it.hrs !== null ? num(it.hrs) : num(it.qty) * (catalogHrs(s, it.svc) || num((p.svcHrs || {})[it.svc || ""]));
    row(d || "—", (num(it.qty) + " " + (it.unit || "")).trim(), lh);
  });
  (e.upgrades || []).forEach((u) => {
    if (!u.included) return;
    row((es ? "Mejora: " : "Upgrade: ") + (es ? u.descEs || u.desc : u.desc || u.descEs), num(u.qty) || 1, 0);
  });
  (e.changeOrders || []).forEach((co) => {
    if (co.status !== "signed") return;
    row((es ? "Cambio #" : "Change #") + co.n + ": " + (es ? co.descEs || co.desc : co.desc || co.descEs), "", num(co.hours));
  });
  if (num(e.extraHrs)) row(es ? "Horas extra" : "Extra hours", "", num(e.extraHrs));
  return { rows, total };
}
/** First and last day on site (last = start + days − 1). */
export function workSchedule(e: Estimate): { start: string; end: string } {
  const start = e.startDate || "";
  return { start, end: start ? addDaysISO(start, Math.max(0, (num(e.days) || 1) - 1)) : "" };
}
/** Days of work for the hours assigned, in half days (crew size × hours/day), like the prototype. */
export function crewDays(total: number, s: Settings): number {
  const perDay = Math.max(1, num(s.production.crewSize)) * Math.max(1, num(s.production.hoursPerDay));
  return Math.ceil((total / perDay) * 2) / 2;
}
