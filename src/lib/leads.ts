import type { Client } from "./types";

/** Answers of the public questionnaire (lead form), see docs/04-data-model.md leads/{id}. */
export type LeadDetails = {
  v?: number; types?: string[];
  cab?: { doors?: number; drawers?: number; countMe?: boolean; island?: string; style?: string; current?: string; extras?: string[] } | null;
  intr?: { rooms?: string[]; bedrooms?: number; bathrooms?: number; surfaces?: string[]; size?: string } | null;
  ext?: { stories?: string; surfaces?: string[] } | null;
  other?: string; tierCab?: string; tierWall?: string; when?: string; date?: string; contact?: string; src?: string; ref?: string;
};
export type Lead = {
  id: string; owner?: string; name?: string; phone?: string; email?: string; city?: string; address?: string; service?: string;
  message?: string; heard?: string; lang?: string; photos?: string[]; details?: LeadDetails | null; at?: string; page?: string; imported?: boolean;
};

/** The questionnaire answers as short readable pieces (port of leadSummary). */
export function leadSummary(d: LeadDetails | null | undefined, lang: "en" | "es" = "en"): string[] {
  if (!d) return [];
  const es = lang === "es", out: string[] = [];
  const L = (en: string, sp: string) => (es ? sp : en);
  const pick = (m: Record<string, string>, k?: string) => (k ? m[k] : undefined);
  if (d.cab) {
    const c = d.cab, doors = c.doors || 0, drw = c.drawers || 0;
    out.push(c.countMe ? L("cabinets: count them for me", "gabinetes: contarlos nosotros")
      : L(`${doors} ${doors === 1 ? "door" : "doors"}, ${drw} ${drw === 1 ? "drawer" : "drawers"}`, `${doors} ${doors === 1 ? "puerta" : "puertas"}, ${drw} ${drw === 1 ? "cajón" : "cajones"}`));
    if (c.island === "yes") out.push(L("island", "isla"));
    if (c.style === "two") out.push(L("two-tone", "dos tonos"));
    const cur = pick({ wood: L("now: stained wood", "ahora: madera"), painted: L("now: painted", "ahora: pintados"), laminate: L("now: laminate", "ahora: laminado") }, c.current);
    if (cur) out.push(cur);
    const ex: Record<string, string> = { hardware: L("new handles", "jaladeras nuevas"), inside: L("inside boxes", "interior de gabinetes"), counters: L("countertops", "encimeras") };
    (c.extras || []).forEach((x) => { if (ex[x]) out.push(ex[x]); });
  }
  if (d.intr) {
    const r = d.intr;
    const rm: Record<string, string> = { whole: L("whole home", "toda la casa"), living: L("living", "sala"), dining: L("dining", "comedor"), kitchen: L("kitchen walls", "cocina"),
      bedrooms: (r.bedrooms || 1) + L(" bedrooms", " habitaciones"), bathrooms: (r.bathrooms || 1) + L(" baths", " baños"), hall: L("halls", "pasillos"), office: L("office", "oficina") };
    const rooms = (r.rooms || []).map((x) => rm[x]).filter(Boolean);
    if (rooms.length) out.push("interior: " + rooms.join(", "));
    const sf: Record<string, string> = { walls: L("walls", "paredes"), ceilings: L("ceilings", "techos"), trim: L("trim", "molduras"), doors: L("doors", "puertas"), accent: L("accent wall", "pared de acento") };
    const surf = (r.surfaces || []).map((x) => sf[x]).filter(Boolean);
    if (surf.length) out.push(surf.join(", "));
    const sz = pick({ condo: "condo", s: "<1,500 ft²", m: "1,500–2,500 ft²", l: ">2,500 ft²" }, r.size);
    if (sz) out.push(sz);
  }
  if (d.ext) {
    const x = d.ext, st = pick({ one: L("1 story", "1 piso"), two: L("2 stories", "2 pisos"), town: "townhouse" }, x.stories);
    const m: Record<string, string> = { stucco: L("stucco", "estuco"), trim: L("trim & fascia", "molduras y fascia"), soffit: L("soffits", "sofitos"), door: L("front door", "puerta principal"), garage: L("garage door", "garaje"), fence: L("fence", "cerca"), wash: L("pressure wash", "lavado a presión") };
    const xs = (x.surfaces || []).map((k) => m[k]).filter(Boolean);
    out.push("exterior" + (st ? " " + st : "") + (xs.length ? ": " + xs.join(", ") : ""));
  }
  if (d.other) out.push(String(d.other).slice(0, 80));
  const tier: Record<string, string> = { premium: "Premium", pro: L("Professional", "Profesional"), top: L("Top of the line", "Lo mejor"), standard: L("Standard", "Estándar"), recommend: L("wants a recommendation", "quiere recomendación") };
  if (d.tierCab && tier[d.tierCab]) out.push(L("cabinet finish: ", "acabado gabinetes: ") + tier[d.tierCab]);
  if (d.tierWall && tier[d.tierWall]) out.push(L("wall paint: ", "pintura paredes: ") + tier[d.tierWall]);
  const wh = pick({ asap: L("ASAP", "lo antes posible"), w2: L("within 2 weeks", "en 2 semanas"), month: L("this month", "este mes"), m3: L("in 1–3 months", "en 1–3 meses"), pricing: L("just pricing", "solo cotizando") }, d.when);
  if (wh) out.push(L("when: ", "cuándo: ") + wh + (d.date ? ` (${d.date})` : ""));
  const ct = pick({ text: L("prefers text", "prefiere mensaje"), call: L("prefers a call", "prefiere llamada"), whatsapp: L("prefers WhatsApp", "prefiere WhatsApp"), email: L("prefers email", "prefiere correo") }, d.contact);
  if (ct) out.push(ct);
  return out;
}

export const leadClientId = (leadId: string) => "c-web-" + leadId;

/**
 * Builds the client for a web lead (port of webLeadImport). Returns null when a client with the
 * deterministic id "c-web-{leadId}" already exists, so importing twice never duplicates.
 * `photos` are the already-stored photo refs to attach.
 */
export function leadToClient(lead: Lead, existingClients: { id: string }[], photos: Client["photos"] = []): Client | null {
  const cid = leadClientId(lead.id);
  if (existingClients.some((c) => c.id === cid)) return null;
  const det = lead.details && typeof lead.details === "object" ? lead.details : null;
  const msg = String(lead.message || "").trim();
  const note = [lead.service, lead.city, det ? leadSummary(det, "en").join(" · ") : "", msg].filter(Boolean).join(" — ");
  const ref = det?.ref ? String(det.ref) : "";
  return {
    id: cid, name: String(lead.name || "").slice(0, 100), phone: String(lead.phone || ""), email: String(lead.email || ""),
    address: String(lead.address || lead.city || ""),
    source: ref ? "Referral" : det?.src ? String(det.src) : "Website" + (lead.heard ? ` (${lead.heard})` : ""),
    lang: lead.lang === "es" ? "es" : "en",
    referredBy: ref && existingClients.some((c) => c.id === ref) ? ref : "",
    note, lead: true, createdAt: String(lead.at || new Date().toISOString()).slice(0, 10),
    photos,
    web: { id: lead.id, service: lead.service || "", city: lead.city || "", message: msg, heard: lead.heard || "", at: lead.at || "", details: (det ?? undefined) as unknown as NonNullable<Client["web"]>["details"] },
  };
}
