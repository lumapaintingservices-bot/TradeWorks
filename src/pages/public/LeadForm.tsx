import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getTop, setTop } from "../../data/repo";
import type { LeadDetails } from "../../lib/leads";
import { safeImgSrc, safeUrl } from "../../lib/safeUrl";
import "./LeadForm.css";

/** Public lead questionnaire: /request?c={companyId}&src=thumbtack&ref={clientId}. Always light, contractor-branded. */
type Pub = { name?: string; phone?: string; website?: string; instagram?: string; reviews?: string; logoUrl?: string; brandColor?: string };
type Lang = "en" | "es";
type Pair = [string, string];
const MAX_PHOTOS = 5;
const STEPS = ["intro", "types", "details", "tier", "when", "photos", "contact"] as const;
const TYPES = ["cabinets", "vanity", "interior", "exterior", "other"] as const;
const SVC_EN: Record<string, string> = { cabinets: "Kitchen cabinets", vanity: "Bathroom vanity", interior: "Interior painting", exterior: "Exterior painting", other: "Other" };
const SRC_MAP: Record<string, string> = { referral: "Referral", ref: "Referral", thumbtack: "Thumbtack", tt: "Thumbtack", google: "Google", gbp: "Google", instagram: "Instagram", ig: "Instagram", facebook: "Facebook", fb: "Facebook", nextdoor: "Nextdoor", website: "Website", web: "Website" };

/** Finish levels: generic wording (each contractor explains their own products at the estimate). */
const TIERS = {
  cabinets: [
    { id: "premium", en: ["Premium", "A smooth, durable, factory-like finish. Our most popular choice."] as Pair, es: ["Premium", "Acabado liso y resistente, como de fábrica. El más pedido."] as Pair, tag: true },
    { id: "pro", en: ["Professional", "A harder surface with a furniture-grade feel."] as Pair, es: ["Profesional", "Superficie más dura, con acabado de mueble fino."] as Pair, tag: false },
    { id: "top", en: ["Top of the line", "Maximum hardness and resistance, built for heavy daily use."] as Pair, es: ["Lo mejor de lo mejor", "Máxima dureza y resistencia, hecho para uso diario intenso."] as Pair, tag: false },
  ],
  walls: [
    { id: "standard", en: ["Standard", "Quality paint with a clean, even finish. Great for rentals and quick refreshes."] as Pair, es: ["Estándar", "Pintura de calidad con acabado limpio y parejo. Ideal para alquileres y retoques rápidos."] as Pair, tag: false },
    { id: "premium", en: ["Premium", "Richer color, better coverage and a washable finish."] as Pair, es: ["Premium", "Color más rico, mejor cubrimiento y acabado lavable."] as Pair, tag: true },
    { id: "top", en: ["Top of the line", "The best lines available, built to last years longer."] as Pair, es: ["Lo mejor de lo mejor", "Las mejores líneas disponibles, hechas para durar años más."] as Pair, tag: false },
  ],
};

const svg = (d: string, s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;
const ICO: Record<string, string> = {
  cabinets: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 12h18M9.5 8v1.5M14.5 8v1.5M9.5 15v1.5M14.5 15v1.5"/>',
  vanity: '<path d="M4 11h16v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M12 11v9M9 15h.01M15 15h.01M8 11V8a4 4 0 0 1 8 0v3"/>',
  interior: '<rect x="4" y="3" width="13" height="6" rx="1.5"/><path d="M17 6h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-7v3"/><rect x="10" y="14" width="4" height="7" rx="1"/>',
  exterior: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  other: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
};

const digits = (s: string) => String(s || "").replace(/[^0-9]/g, "");
const toggle = (l: string[], v: string) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
const clampN = (v: number) => Math.max(0, Math.min(200, Math.round(v) || 0));

/** Downscale to ~1100px JPEG data URL; null when it can't be read or is still too big for a Firestore doc. */
function shrink(file: File): Promise<string | null> {
  return new Promise((res) => {
    if (!file || !/^image\//.test(file.type)) return res(null);
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, 1100 / Math.max(w, h));
      const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
      const x = c.getContext("2d")!; x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let out = c.toDataURL("image/jpeg", 0.7);
      if (out.length > 850000) out = c.toDataURL("image/jpeg", 0.5);
      res(out.length > 850000 ? null : out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}

/* ---------- small pieces ---------- */
const Opt = ({ on, title, sub, ico, tag, onClick }: { on: boolean; title: string; sub?: string; ico?: string; tag?: string; onClick: () => void }) => (
  <button type="button" className={`lf-opt${ico ? "" : " row"}${on ? " on" : ""}`} onClick={onClick}>
    {ico ? <><span className="ic">{svg(ICO[ico])}</span><b>{title}</b>{sub && <small>{sub}</small>}</>
      : <span className="txt"><b>{title}{tag && <span className="tag">{tag}</span>}</b>{sub && <small>{sub}</small>}</span>}
    <span className="ck">{on ? "✓" : ""}</span>
  </button>
);
const Chips = ({ opts, sel, multi, onPick }: { opts: Record<string, string>; sel: string | string[]; multi?: boolean; onPick: (k: string) => void }) => (
  <div className="lf-chips">{Object.keys(opts).map((k) => {
    const on = multi ? (sel as string[]).includes(k) : sel === k;
    return <button key={k} type="button" className={`lf-chip${on ? " on" : ""}`} onClick={() => onPick(k)}>{opts[k]}</button>;
  })}</div>
);
const Stepper = ({ v, off, onChange }: { v: number; off?: boolean; onChange: (n: number) => void }) => (
  <div className={`lf-stepper${off ? " off" : ""}`}>
    <button type="button" aria-label="-" onClick={() => onChange(clampN(v - 1))}>−</button>
    <input type="number" inputMode="numeric" min={0} max={200} value={v || 0} onChange={(e) => onChange(clampN(Number(e.target.value)))} />
    <button type="button" aria-label="+" onClick={() => onChange(clampN(v + 1))}>+</button>
  </div>
);
const Box = ({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) => (
  <div className="lf-box"><h3>{title}</h3>{sub && <p className="m">{sub}</p>}{children}</div>
);


type Form = {
  types: string[]; cab: { doors: number; drawers: number; countMe: boolean; island: string; style: string; current: string; extras: string[] };
  intr: { rooms: string[]; bedrooms: number; bathrooms: number; surfaces: string[]; size: string }; ext: { stories: string; surfaces: string[] };
  other: string; tierCab: string; tierWall: string; when: string; date: string; photos: string[]; message: string;
  name: string; phone: string; email: string; address: string; contact: string; heard: string;
};

export default function LeadForm() {
  const q = useMemo(() => new URLSearchParams(location.search), []);
  const cid = q.get("c") || "";
  const SRC = SRC_MAP[(q.get("src") || q.get("utm_source") || "").toLowerCase()] || "";
  const [pub, setPub] = useState<Pub | null | undefined>(undefined);
  const [lang, setLang] = useState<Lang>((q.get("lang") || navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [err, setErr] = useState("");
  const [f, setF] = useState<Form>({
    types: [], cab: { doors: 0, drawers: 0, countMe: false, island: "", style: "", current: "", extras: [] },
    intr: { rooms: [], bedrooms: 1, bathrooms: 1, surfaces: [], size: "" }, ext: { stories: "", surfaces: [] },
    other: "", tierCab: "", tierWall: "", when: "", date: "", photos: [], message: "",
    name: q.get("name") || "", phone: q.get("phone") || "", email: q.get("email") || "", address: "", contact: "text", heard: SRC,
  });
  const [hp, setHp] = useState("");
  const set = (p: Partial<Form>) => setF((o) => ({ ...o, ...p }));
  const t = (en: string, es: string) => (lang === "es" ? es : en);
  const one = (cur: string, v: string) => (cur === v ? "" : v);

  useEffect(() => {
    let live = true;
    if (!cid) { setPub(null); return; }
    getTop<Pub>("public", cid).then((d) => { if (live) setPub(d); }).catch(() => { if (live) setPub(null); });
    return () => { live = false; };
  }, [cid]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { if (pub?.name) document.title = `${t("Free estimate", "Presupuesto gratis")} — ${pub.name}`; }, [pub, lang]); // eslint-disable-line

  const brand = /^#[0-9a-f]{6}$/i.test(pub?.brandColor || "") ? pub!.brandColor! : "#EF6A2C";
  const style = { "--acc": brand } as React.CSSProperties;
  const isCab = f.types.includes("cabinets") || f.types.includes("vanity");
  const isWall = f.types.includes("interior") || f.types.includes("exterior");
  const total = STEPS.length - 1;
  const name = STEPS[step];
  const phone = pub?.phone || "";
  const site = safeUrl(pub?.website), insta = safeUrl(pub?.instagram), reviewsUrl = safeUrl(pub?.reviews); // user-entered links: only http(s) ever reaches an href

  if (pub === undefined) return <div className="lf" style={style}><div className="lf-wrap"><p className="lf-lead">…</p></div></div>;
  if (pub === null) return (
    <div className="lf" style={style}><div className="lf-wrap lf-done">
      <h1>{t("This link isn't active", "Este enlace no está activo")}</h1>
      <p>{t("Please ask the company for a new link to the request form.", "Pídele a la empresa un enlace nuevo del formulario de solicitud.")}</p>
    </div></div>
  );

  const go = (d: number) => { setErr(""); setStep((s) => Math.max(0, Math.min(STEPS.length - 1, s + d))); window.scrollTo(0, 0); };
  const next = () => {
    if (name === "types" && !f.types.length) { setErr(t("Pick at least one project.", "Escoja al menos un proyecto.")); return; }
    if (name === "contact") { void submit(); return; }
    go(1);
  };

  async function addPhotos(files: FileList | null) {
    const list = Array.from(files || []).slice(0, MAX_PHOTOS - f.photos.length);
    const out = (await Promise.all(list.map(shrink))).filter((u): u is string => !!u);
    setF((o) => ({ ...o, photos: [...o.photos, ...out].slice(0, MAX_PHOTOS) }));
  }

  async function submit() {
    if (hp) { setDone(true); return; } // robots fill the hidden field
    if (!f.name.trim() || digits(f.phone).length < 7) { setErr(t("Please add your name and a phone number.", "Por favor escriba su nombre y un teléfono.")); return; }
    setErr(""); setBusy(true);
    const id = crypto.randomUUID(), photoIds = f.photos.map(() => crypto.randomUUID());
    const has = (k: string) => f.types.includes(k);
    const details: LeadDetails = {
      v: 2, types: f.types.slice(0, 5),
      cab: isCab ? { doors: f.cab.countMe ? 0 : f.cab.doors, drawers: f.cab.countMe ? 0 : f.cab.drawers, countMe: !!f.cab.countMe, island: f.cab.island, style: f.cab.style, current: f.cab.current, extras: f.cab.extras.slice(0, 6) } : null,
      intr: has("interior") ? { rooms: f.intr.rooms.slice(0, 10), bedrooms: f.intr.rooms.includes("bedrooms") ? f.intr.bedrooms : 0, bathrooms: f.intr.rooms.includes("bathrooms") ? f.intr.bathrooms : 0, surfaces: f.intr.surfaces.slice(0, 8), size: f.intr.size } : null,
      ext: has("exterior") ? { stories: f.ext.stories, surfaces: f.ext.surfaces.slice(0, 8) } : null,
      other: has("other") ? f.other.trim().slice(0, 800) : "",
      tierCab: f.tierCab, tierWall: f.tierWall, when: f.when, date: f.date, contact: f.contact, src: SRC, ref: String(q.get("ref") || "").slice(0, 60),
    };
    try {
      // photos first, the request last (the rules check the request does not exist yet when a photo is created)
      for (let i = 0; i < photoIds.length; i++) await setTop(`leads/${id}/photos`, photoIds[i], { data: f.photos[i], at: new Date().toISOString() }, false);
      await setTop("leads", id, {
        owner: cid, name: f.name.trim().slice(0, 100), phone: f.phone.trim().slice(0, 30), email: f.email.trim().slice(0, 120),
        city: f.address.trim().slice(0, 80), address: f.address.trim().slice(0, 160),
        service: f.types.map((k) => SVC_EN[k]).join(", ").slice(0, 120) || "Other",
        message: f.message.trim().slice(0, 1500), heard: (SRC || f.heard || "").slice(0, 40), lang,
        photos: photoIds, details, at: new Date().toISOString(), page: String(location.href).slice(0, 200),
      }, false);
      setDone(true); window.scrollTo(0, 0);
    } catch (e) {
      console.error(e);
      setErr(t("We couldn't send it. Check your connection and try again", "No se pudo enviar. Revise su conexión e intente otra vez") + (phone ? t(", or call us at ", ", o llámenos al ") + phone : "") + ".");
    } finally { setBusy(false); }
  }

  const rec = (m: Record<string, [string, string]>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, t(v[0], v[1])]));
  const typeText: Record<string, Pair> = {
    cabinets: ["Kitchen cabinets", "Gabinetes de cocina"], vanity: ["Bathroom vanity", "Vanity del baño"], interior: ["Interior painting", "Pintura interior"], exterior: ["Exterior painting", "Pintura exterior"], other: ["Something else", "Otra cosa"],
  };
  const typeSub: Record<string, Pair> = {
    cabinets: ["Refinish / paint your kitchen cabinets", "Renovar / pintar los gabinetes de la cocina"], vanity: ["Refinish a bathroom vanity", "Renovar un vanity del baño"],
    interior: ["Walls, ceilings, trim, doors", "Paredes, techos, molduras, puertas"], exterior: ["Stucco, siding, trim, doors", "Estuco, siding, molduras, puertas"], other: ["Drywall, repairs, limewash, other", "Drywall, reparaciones, limewash, otro"],
  };
  const whens = rec({ asap: ["As soon as possible", "Lo antes posible"], w2: ["In the next 2 weeks", "En las próximas 2 semanas"], month: ["This month", "Este mes"], m3: ["In 1–3 months", "En 1–3 meses"], pricing: ["Just getting prices", "Solo estoy cotizando"] });
  const tierName = (arr: typeof TIERS.cabinets, id: string) => id === "recommend" ? t("Recommend the best for me", "Recomiéndenme el mejor") : arr.find((x) => x.id === id)?.[lang][0] || "";

  /* ---------- steps ---------- */
  const body: Record<(typeof STEPS)[number], () => ReactNode> = {
    intro: () => <>
      <div className="lf-hero"><h1>{t("Get your free estimate", "Pida su presupuesto gratis")}</h1>
        <p>{t("Answer a few quick questions about your project. It takes about 2 minutes — photos help us give you an accurate price faster.", "Responda unas preguntas rápidas sobre su proyecto. Toma unos 2 minutos — las fotos nos ayudan a darle un precio exacto más rápido.")}</p>
        <div className="lf-trust"><span>✓ {t("Free, no obligation", "Gratis, sin compromiso")}</span><span>English &amp; Español</span>{pub?.reviews && <span>★ {t("Customer reviews", "Reseñas de clientes")}</span>}</div></div>
      <div className="lf-how">{([["Tell us about it", "Cuéntenos", "Your project, finish and timing.", "Su proyecto, el acabado y cuándo lo quiere."], ["We review it", "Lo revisamos", "We price it from your answers and photos.", "Le ponemos precio con sus respuestas y fotos."], ["Get your estimate", "Reciba su presupuesto", "A clear written estimate you can accept online.", "Un presupuesto claro que puede aceptar en línea."]] as const).map((h, i) =>
        <div key={i}><i>{i + 1}</i><b>{t(h[0], h[1])}</b>{t(h[2], h[3])}</div>)}</div>
    </>,
    types: () => <>
      <h1>{t("What would you like done?", "¿Qué le gustaría hacer?")}</h1><p className="lf-lead">{t("Pick everything that applies.", "Escoja todo lo que aplique.")}</p>
      <div className="lf-grid">{TYPES.map((k) => <Opt key={k} ico={k} on={f.types.includes(k)} title={t(...typeText[k])} sub={t(...typeSub[k])} onClick={() => { setErr(""); set({ types: toggle(f.types, k) }); }} />)}</div>
    </>,
    details: () => {
      const c = f.cab, i = f.intr, x = f.ext;
      return <>
        <h1>{t("Tell us about your project", "Cuéntenos de su proyecto")}</h1><p className="lf-lead">{t("Rough numbers are perfectly fine.", "Números aproximados están perfectos.")}</p>
        {isCab && <>
          <Box title={t("Cabinets", "Gabinetes")} sub={t("Count the doors and drawer fronts — or let us count them.", "Cuente las puertas y los frentes de cajón — o deje que nosotros los contemos.")}>
            <div className="lf-count"><div className="lbl"><b>{t("Doors", "Puertas")}</b><small>{t("Every cabinet door, uppers and lowers", "Todas las puertas, arriba y abajo")}</small></div><Stepper v={c.doors} off={c.countMe} onChange={(n) => set({ cab: { ...c, doors: n } })} /></div>
            <div className="lf-count"><div className="lbl"><b>{t("Drawers", "Cajones")}</b><small>{t("Each drawer front", "Cada frente de cajón")}</small></div><Stepper v={c.drawers} off={c.countMe} onChange={(n) => set({ cab: { ...c, drawers: n } })} /></div>
            <label className="lf-toggle"><input type="checkbox" checked={c.countMe} onChange={(e) => set({ cab: { ...c, countMe: e.target.checked } })} /><span className="sw" /><span className="t">{t("I'm not sure — please count them for me", "No estoy seguro — cuéntenlos ustedes")}<small>{t("We'll count everything from your photos or at the visit.", "Los contamos con sus fotos o en la visita.")}</small></span></label>
          </Box>
          <div className="lf-box">
            <h3>{t("Is there an island?", "¿Hay isla?")}</h3><Chips opts={{ yes: t("Yes", "Sí"), no: t("No", "No") }} sel={c.island} onPick={(k) => set({ cab: { ...c, island: one(c.island, k) } })} />
            <h3 className="gap">{t("Color style", "Estilo de color")}</h3><Chips opts={rec({ one: ["One color", "Un solo color"], two: ["Two-tone (island or uppers in another color)", "Dos tonos (isla o gabinetes de arriba en otro color)"], unsure: ["Not sure yet", "Todavía no sé"] })} sel={c.style} onPick={(k) => set({ cab: { ...c, style: one(c.style, k) } })} />
            <h3 className="gap">{t("Current finish", "Acabado actual")}</h3><Chips opts={rec({ wood: ["Natural wood / stained", "Madera natural / teñida"], painted: ["Already painted", "Ya están pintados"], laminate: ["Laminate / thermofoil", "Laminado / thermofoil"], unsure: ["Not sure", "No sé"] })} sel={c.current} onPick={(k) => set({ cab: { ...c, current: one(c.current, k) } })} />
            <h3 className="gap">{t("Anything else?", "¿Algo más?")}</h3><Chips multi opts={rec({ hardware: ["New handles / pulls", "Jaladeras / manijas nuevas"], inside: ["Paint inside the cabinets", "Pintar el interior de los gabinetes"], counters: ["Countertop replacement", "Cambio de encimera"], nothing: ["Nothing else", "Nada más"] })} sel={c.extras}
              onPick={(k) => set({ cab: { ...c, extras: k === "nothing" ? (c.extras.includes("nothing") ? [] : ["nothing"]) : toggle(c.extras.filter((y) => y !== "nothing"), k) } })} />
          </div>
        </>}
        {f.types.includes("interior") && <Box title={t("Interior", "Interior")} sub={t("Which areas and surfaces?", "¿Qué áreas y superficies?")}>
          <h3 className="sm">{t("Rooms", "Cuartos")}</h3>
          <Chips multi opts={rec({ whole: ["Whole home", "Toda la casa"], living: ["Living room", "Sala"], dining: ["Dining room", "Comedor"], kitchen: ["Kitchen walls", "Paredes de la cocina"], bedrooms: ["Bedrooms", "Habitaciones"], bathrooms: ["Bathrooms", "Baños"], hall: ["Hallways / stairs", "Pasillos / escaleras"], office: ["Office", "Oficina"] })} sel={i.rooms} onPick={(k) => set({ intr: { ...i, rooms: toggle(i.rooms, k) } })} />
          {i.rooms.includes("bedrooms") && <div className="lf-count top"><div className="lbl"><b>{t("How many bedrooms?", "¿Cuántas habitaciones?")}</b></div><Stepper v={i.bedrooms} onChange={(n) => set({ intr: { ...i, bedrooms: n } })} /></div>}
          {i.rooms.includes("bathrooms") && <div className="lf-count"><div className="lbl"><b>{t("How many bathrooms?", "¿Cuántos baños?")}</b></div><Stepper v={i.bathrooms} onChange={(n) => set({ intr: { ...i, bathrooms: n } })} /></div>}
          <h3 className="sm gap">{t("Surfaces", "Superficies")}</h3>
          <Chips multi opts={rec({ walls: ["Walls", "Paredes"], ceilings: ["Ceilings", "Techos"], trim: ["Trim & baseboards", "Molduras y zócalos"], doors: ["Doors", "Puertas"], accent: ["Accent / limewash wall", "Pared de acento / limewash"] })} sel={i.surfaces} onPick={(k) => set({ intr: { ...i, surfaces: toggle(i.surfaces, k) } })} />
          <h3 className="sm gap">{t("Home size", "Tamaño de la casa")}</h3>
          <Chips opts={rec({ condo: ["Apartment / condo", "Apartamento / condo"], s: ["House under 1,500 sq ft", "Casa de menos de 1,500 pies²"], m: ["1,500 – 2,500 sq ft", "1,500 – 2,500 pies²"], l: ["Over 2,500 sq ft", "Más de 2,500 pies²"], unsure: ["Not sure", "No sé"] })} sel={i.size} onPick={(k) => set({ intr: { ...i, size: one(i.size, k) } })} />
        </Box>}
        {f.types.includes("exterior") && <Box title={t("Exterior", "Exterior")} sub={t("Tell us about the outside.", "Cuéntenos del exterior.")}>
          <h3 className="sm">{t("Home", "Casa")}</h3>
          <Chips opts={rec({ one: ["1 story", "1 piso"], two: ["2 stories", "2 pisos"], town: ["Townhouse", "Townhouse"], unsure: ["Not sure", "No sé"] })} sel={x.stories} onPick={(k) => set({ ext: { ...x, stories: one(x.stories, k) } })} />
          <h3 className="sm gap">{t("What should we paint?", "¿Qué pintamos?")}</h3>
          <Chips multi opts={rec({ stucco: ["Stucco walls", "Paredes de estuco"], trim: ["Trim & fascia", "Molduras y fascia"], soffit: ["Soffits", "Sofitos"], door: ["Front door", "Puerta principal"], garage: ["Garage door", "Puerta del garaje"], fence: ["Fence / walls", "Cerca / muros"], wash: ["Pressure washing", "Lavado a presión"] })} sel={x.surfaces} onPick={(k) => set({ ext: { ...x, surfaces: toggle(x.surfaces, k) } })} />
        </Box>}
        {f.types.includes("other") && <Box title={t("Something else", "Otra cosa")} sub={t("Describe what you need.", "Describa lo que necesita.")}>
          <textarea maxLength={800} value={f.other} onChange={(e) => set({ other: e.target.value })} placeholder={t("For example: patch two drywall holes in the hallway and paint the wall…", "Por ejemplo: resanar dos huecos de drywall en el pasillo y pintar la pared…")} />
        </Box>}
      </>;
    },
    tier: () => {
      const list = (arr: typeof TIERS.cabinets, sel: string, pick: (id: string) => void) => (
        <div className="lf-grid one">
          {arr.map((x) => <Opt key={x.id} on={sel === x.id} title={x[lang][0]} sub={x[lang][1]} tag={x.tag ? t("MOST CHOSEN", "EL MÁS ELEGIDO") : undefined} onClick={() => pick(one(sel, x.id))} />)}
          <Opt on={sel === "recommend"} title={t("Recommend the best for me", "Recomiéndenme el mejor")} sub={t("We'll suggest the right product at your estimate.", "Le sugerimos el producto ideal en su presupuesto.")} onClick={() => pick(one(sel, "recommend"))} />
        </div>);
      return <>
        <h1>{t("Which finish level do you prefer?", "¿Qué nivel de acabado prefiere?")}</h1>
        <p className="lf-lead">{t("Not sure? We'll recommend the best one for your home.", "¿No está seguro? Le recomendamos el mejor para su casa.")}</p>
        {isCab && <><h2>{t("For your cabinets", "Para sus gabinetes")}</h2>{list(TIERS.cabinets, f.tierCab, (v) => set({ tierCab: v }))}</>}
        {(isWall || (!isCab && f.types.includes("other"))) && <><h2>{t("For your walls & surfaces", "Para sus paredes y superficies")}</h2>{list(TIERS.walls, f.tierWall, (v) => set({ tierWall: v }))}</>}
      </>;
    },
    when: () => <>
      <h1>{t("When would you like it done?", "¿Para cuándo lo quiere?")}</h1><p className="lf-lead">{t("This helps us plan our calendar.", "Nos ayuda a planear el calendario.")}</p>
      <div className="lf-grid one">{Object.keys(whens).map((k) => <Opt key={k} on={f.when === k} title={whens[k]} onClick={() => set({ when: one(f.when, k) })} />)}</div>
      <div className="lf-box" style={{ marginTop: 14 }}><label className="lf-f"><span>{t("Preferred start date", "Fecha de inicio preferida")} <i>{t("(optional)", "(opcional)")}</i></span>
        <input type="date" value={f.date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => set({ date: e.target.value })} /></label></div>
    </>,
    photos: () => <>
      <h1>{t("Add photos", "Agregue fotos")}</h1><p className="lf-lead">{t("Photos let us price your project accurately without a visit.", "Con fotos le damos un precio exacto sin necesidad de visita.")}</p>
      <div className="lf-box"><div className="lf-photos">
        {f.photos.map((p, i) => <div className="ph" key={i}><img src={p} alt="" /><button type="button" aria-label="remove" onClick={() => set({ photos: f.photos.filter((_, j) => j !== i) })}>×</button></div>)}
        {f.photos.length < MAX_PHOTOS && <label className="add"><input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />{svg(ICO.cam, 24)}{t("Add photo", "Agregar foto")}</label>}
      </div>
        <div className="lf-tips">{[["One wide photo of the whole kitchen or room", "Una foto amplia de toda la cocina o el cuarto"], ["A close-up of a door or wall to see the current finish", "Una de cerca de una puerta o pared para ver el acabado actual"], ["Good light — open the blinds or turn on the lights", "Buena luz — abra las persianas o prenda las luces"]].map((x, i) => <div key={i}><i>●</i>{t(x[0], x[1])}</div>)}</div></div>
      <div className="lf-box"><label className="lf-f"><span>{t("Anything else we should know?", "¿Algo más que debamos saber?")} <i>{t("(optional)", "(opcional)")}</i></span>
        <textarea maxLength={1500} value={f.message} onChange={(e) => set({ message: e.target.value })} placeholder={t("Colors you have in mind, questions, access details…", "Colores que tiene en mente, preguntas, acceso a la casa…")} /></label></div>
    </>,
    contact: () => {
      const rows: Pair[] = [[t("Project", "Proyecto"), f.types.map((k) => t(...typeText[k])).join(", ") || "—"]];
      if (isCab) rows.push([t("Cabinets", "Gabinetes"), f.cab.countMe ? t("we'll count them", "los contamos nosotros") : `${f.cab.doors} ${t("doors", "puertas")} · ${f.cab.drawers} ${t("drawers", "cajones")}`]);
      const tiers = [f.tierCab && tierName(TIERS.cabinets, f.tierCab), f.tierWall && tierName(TIERS.walls, f.tierWall)].filter(Boolean);
      if (tiers.length) rows.push([t("Finish", "Acabado"), tiers.join(" / ")]);
      if (f.when) rows.push([t("When", "Cuándo"), whens[f.when] + (f.date ? " · " + f.date : "")]);
      rows.push([t("Photos", "Fotos"), String(f.photos.length)]);
      return <>
        <h1>{t("Where should we send your estimate?", "¿A dónde le enviamos el presupuesto?")}</h1><p className="lf-lead">{t("We'll contact you the way you prefer.", "Lo contactamos como usted prefiera.")}</p>
        <div className="lf-box fields">
          <div className="f2">
            <label className="lf-f"><span>{t("Full name", "Nombre completo")}</span><input type="text" autoComplete="name" maxLength={100} value={f.name} onChange={(e) => set({ name: e.target.value })} /></label>
            <label className="lf-f"><span>{t("Phone", "Teléfono")}</span><input type="tel" autoComplete="tel" maxLength={30} value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
          </div>
          <label className="lf-f"><span>{t("Email", "Correo")} <i>{t("(optional)", "(opcional)")}</i></span><input type="email" autoComplete="email" maxLength={120} value={f.email} onChange={(e) => set({ email: e.target.value })} /></label>
          <label className="lf-f"><span>{t("Project address", "Dirección del proyecto")}</span><input type="text" autoComplete="street-address" maxLength={160} placeholder={t("Street, city, ZIP", "Calle, ciudad, código postal")} value={f.address} onChange={(e) => set({ address: e.target.value })} /></label>
          <div className="lf-f"><span>{t("Best way to reach you", "¿Cómo prefiere que lo contactemos?")}</span>
            <Chips opts={rec({ text: ["Text", "Mensaje"], call: ["Call", "Llamada"], whatsapp: ["WhatsApp", "WhatsApp"], email: ["Email", "Correo"] })} sel={f.contact} onPick={(k) => set({ contact: k })} /></div>
          {!SRC && <label className="lf-f"><span>{t("How did you find us?", "¿Cómo nos encontró?")}</span>
            <select value={f.heard} onChange={(e) => set({ heard: e.target.value })}><option value="" />
              {Object.entries(rec({ Thumbtack: ["Thumbtack", "Thumbtack"], Google: ["Google", "Google"], Instagram: ["Instagram", "Instagram"], Facebook: ["Facebook", "Facebook"], Referral: ["A friend / referral", "Un amigo / referido"], Nextdoor: ["Nextdoor", "Nextdoor"], Other: ["Other", "Otro"] })).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
          <div className="lf-hp" aria-hidden="true"><label>Company<input type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label></div>
        </div>
        <h2>{t("Your request", "Su solicitud")}</h2>
        <div className="lf-box lf-sum">{rows.map((r, i) => <div key={i}><span>{r[0]}</span><b>{r[1]}</b></div>)}</div>
        <div className="lf-fine">{t(`By sending, you agree that ${pub?.name || "the company"} may contact you about your project by phone, text or email.`, `Al enviar, acepta que ${pub?.name || "la empresa"} lo contacte sobre su proyecto por teléfono, mensaje o correo.`)}</div>
      </>;
    },
  };

  const wa = "https://wa.me/1" + digits(phone);
  const stepLbl = [t("Project", "Proyecto"), t("Details", "Detalles"), t("Finish", "Acabado"), t("Timing", "Fecha"), t("Photos", "Fotos"), t("Contact", "Contacto")];
  const last = step === total;
  const parts = (pub.name || "").split(" ");

  return (
    <div className="lf" style={style}>
      <div className="lf-top"><div className="lf-top-in">
        <a className="lf-brand" href={site || undefined} target="_blank" rel="noopener noreferrer">
          {safeImgSrc(pub.logoUrl) && <img src={safeImgSrc(pub.logoUrl)} alt="" />}
          <div><b>{parts[0]}</b>{parts.length > 1 && <span>{parts.slice(1).join(" ")}</span>}</div>
        </a>
        <div className="lf-sp" />
        <div className="lf-lang">{(["en", "es"] as Lang[]).map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
      </div><div className="lf-prog"><i style={{ width: (done ? 100 : Math.round((step / total) * 100)) + "%" }} /></div></div>

      <div className="lf-wrap">
        {done ? (
          <div className="lf-done lf-fade"><div className="okc">✓</div><h1>{t("Thank you — we got your request!", "¡Gracias — recibimos su solicitud!")}</h1>
            <p>{t("We'll review your project and reach out soon with your free estimate. If it's urgent, call or message us.", "Revisaremos su proyecto y le escribiremos pronto con su presupuesto gratis. Si es urgente, llámenos o escríbanos.")}</p>
            {phone && <div className="lf-links"><a className="lf-btn" href={`tel:+1${digits(phone)}`}>{t("Call us", "Llámenos")}</a><a className="lf-btn wa" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>}
            <div className="lf-links" style={{ marginTop: 10 }}>
              {site && <a className="lf-btn" href={site} target="_blank" rel="noopener noreferrer">{t("See our work", "Vea nuestro trabajo")} ↗</a>}
              {insta && <a className="lf-btn" href={insta} target="_blank" rel="noopener noreferrer">Instagram ↗</a>}
              {reviewsUrl && <a className="lf-btn" href={reviewsUrl} target="_blank" rel="noopener noreferrer">★ {t("Reviews", "Reseñas")} ↗</a>}
            </div>
            <p style={{ marginTop: 22 }}><button type="button" className="lf-skip" onClick={() => { location.href = location.pathname + location.search; }}>{t("Send another request", "Enviar otra solicitud")}</button></p></div>
        ) : (
          <div className="lf-fade" key={step}>
            {step > 0 && <div className="lf-stepk">{t(`Step ${step} of ${total}`, `Paso ${step} de ${total}`)} · {stepLbl[step - 1]}</div>}
            {body[name]()}
            <div className="lf-err" role="alert">{err}</div>
          </div>
        )}
      </div>

      <div className="lf-foot">
        <div className="lf-powered"><svg width="14" height="14" viewBox="0 0 200 200"><rect width="200" height="200" rx="40" fill="#1a1a2e" /><path d="M100 40 L150 68 L150 132 L100 160 L50 132 L50 68 Z" stroke="#fff" strokeWidth="14" strokeLinejoin="round" fill="none" /><circle cx="100" cy="100" r="20" fill="#fff" /></svg>Powered by TradeWorks</div>
        {site && <a href={site} target="_blank" rel="noopener noreferrer">{site.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>}{site && phone && " · "}{phone && <a href={`tel:+1${digits(phone)}`}>{phone}</a>}
      </div>

      {!done && (
        <div className="lf-bar"><div className="lf-bar-in">
          {step > 0 && <button className="lf-btn" onClick={() => go(-1)}>{t("Back", "Atrás")}</button>}
          <button className={`lf-btn pri${last || step === 0 ? " acc" : ""}`} disabled={busy} onClick={next}>
            {step === 0 ? t("Start", "Empezar") + " →" : last ? (busy ? t("Sending…", "Enviando…") : t("Send my request", "Enviar mi solicitud")) : t("Continue", "Continuar") + " →"}
          </button>
        </div></div>
      )}
    </div>
  );
}
