/**
 * Trade templates: what a company of each trade starts with (price questions, service catalog, scope, terms, job types,
 * request-form choices and dashboard hints). Every rate here is a STARTING PLACEHOLDER the contractor edits in
 * Settings -> Services & prices. Painting keeps the original built-in behavior (door/drawer prices, cabinet tools,
 * services.data.ts catalog, typePresets.data.ts job types), so it has no catalog/jobTypes/lead block here.
 */
import type { CatalogItem } from "./types";

export type Bi = { en: string; es: string };
export type Lines = { en: string[]; es: string[] };
export type PriceTarget = { item: string } | { pricing: "doorRate" | "drawerRate" };
export type PriceQuestion = { id: string; en: string; es: string; target: PriceTarget };
export type TradeJobType = {
  id: string; en: string; es: string; hint: [string, string]; days: number;
  spec: Bi; services: Bi; scope?: Lines; terms?: Lines;
};
export type LeadService = { id: string; en: string; es: string; subEn: string; subEs: string; icon: string; job: string };
export type LeadOption = { id: string; en: string; es: string };
export type LeadQuestion = {
  id: string; kind: "one" | "multi" | "count" | "text"; en: string; es: string; subEn?: string; subEs?: string;
  options?: LeadOption[]; placeholderEn?: string; placeholderEs?: string; only?: string[];
};
export type TradeLead = { title: Bi; sub: Bi; services: LeadService[]; questions: LeadQuestion[]; photoTips: [Bi, Bi, Bi]; messagePlaceholder: Bi };
export type TradeId = "painting" | "cleaning" | "electrical" | "plumbing" | "handyman" | "landscaping" | "custom";
export type Trade = {
  id: TradeId; en: string; es: string; hint: Bi;
  prices: PriceQuestion[];
  catalog: CatalogItem[];
  depositPct: number;
  scope: Lines; terms: Lines;
  jobTypes: TradeJobType[];
  /** null = painting's built-in request form. */
  lead: TradeLead | null;
  /** Dashboard KPI ids (src/lib/kpis.ts): the default cards while the company has not customized its dashboard. */
  kpis: string[];
  /** Extra trade KPI ids offered first in the "add a card" library, before the general ones. */
  kpiMore: string[];
  /** Cabinet controls (doors/drawers/frames/boxes, finish tiers) and the paint & supplies calculator. */
  cabinetTools: boolean;
};

const it = (id: string, en: string, es: string, unit: string, unitEs: string, rate: number, hrs?: number): CatalogItem =>
  hrs === undefined ? { id, en, es, unit, unitEs, rate } : { id, en, es, unit, unitEs, rate, hrs };
const B = (en: string, es: string): Bi => ({ en, es });
const one = (id: string, en: string, es: string): LeadOption => ({ id, en, es });

const GENERIC_TERMS_EN = "Prices hold through the validity date shown above.";
const GENERIC_TERMS_ES = "Los precios se mantienen hasta la fecha de vigencia indicada arriba.";
const DEPOSIT_EN = "A deposit books your date; the balance is due when the work is finished.";
const DEPOSIT_ES = "Un depósito reserva su fecha; el saldo se paga al terminar el trabajo.";

const PHOTO_TIPS: [Bi, Bi, Bi] = [
  B("One wide photo of the whole area", "Una foto amplia de toda el área"),
  B("A close-up of the problem or the item", "Una de cerca del problema o del objeto"),
  B("Good light — open the blinds or turn on the lights", "Buena luz — abra las persianas o prenda las luces"),
];

const PROPERTY = [one("house", "House", "Casa"), one("condo", "Apartment / condo", "Apartamento / condo"), one("commercial", "Business / commercial", "Negocio / comercial")];

const cleaning: Trade = {
  id: "cleaning", en: "Cleaning", es: "Limpieza", hint: B("Regular, deep and move-out cleaning", "Limpieza regular, profunda y de mudanza"),
  prices: [
    { id: "hour", en: "Price per hour ($)", es: "Precio por hora ($)", target: { item: "clean-hour" } },
    { id: "room", en: "Price per room ($)", es: "Precio por cuarto ($)", target: { item: "clean-room" } },
    { id: "sqft", en: "Price per sq ft ($)", es: "Precio por pie² ($)", target: { item: "clean-sqft" } },
  ],
  catalog: [
    it("clean-hour", "Cleaning — hourly", "Limpieza — por hora", "hr", "hora", 50, 1),
    it("clean-room", "Room cleaned (bedroom, bath, living area)", "Cuarto limpiado (habitación, baño, sala)", "room", "cuarto", 35, 0.75),
    it("clean-sqft", "Cleaning — by home size", "Limpieza — por tamaño de la casa", "sq ft", "pie²", 0.15, 0.0015),
    it("clean-deep", "Deep-clean add-on (baseboards, vents, detail work)", "Extra de limpieza profunda (zócalos, rejillas, detalles)", "job", "trabajo", 120, 2),
    it("clean-move", "Move-in / move-out clean", "Limpieza de mudanza (entrada / salida)", "job", "trabajo", 250, 4),
    it("clean-oven", "Inside oven or fridge", "Interior de horno o refrigerador", "ea", "c/u", 35, 0.5),
    it("clean-windows", "Interior windows", "Ventanas interiores", "ea", "c/u", 8, 0.15),
    it("clean-supplies", "Supplies & equipment fee", "Cargo por productos y equipo", "job", "trabajo", 15, 0),
  ],
  depositPct: 25,
  scope: {
    en: ["What's included:", "Kitchen: counters, sink, cabinet and appliance exteriors, floors.", "Bathrooms: toilets, tubs and showers, sinks, mirrors, floors.", "All rooms: dusting, vacuuming and mopping.", "Cleaning supplies and equipment are included.", "Not included unless listed: inside oven or fridge, interior windows, laundry."],
    es: ["Qué incluye:", "Cocina: encimeras, fregadero, exterior de gabinetes y electrodomésticos, pisos.", "Baños: inodoros, tinas y duchas, lavamanos, espejos, pisos.", "Todos los cuartos: sacudir, aspirar y trapear.", "Los productos y el equipo de limpieza están incluidos.", "No incluido salvo que se indique: interior de horno o refrigerador, ventanas interiores, lavandería."],
  },
  terms: {
    en: [DEPOSIT_EN, "Please make sure we can get into the home at the scheduled time.", "Something not right? Tell us within 24 hours and we'll come back and fix it at no charge.", "Please tell us about pets before we arrive.", "Cancel or reschedule at least 24 hours ahead to avoid a fee.", GENERIC_TERMS_EN],
    es: [DEPOSIT_ES, "Por favor asegúrese de que podamos entrar a la casa a la hora acordada.", "¿Algo no quedó bien? Avísenos dentro de 24 horas y volvemos a arreglarlo sin costo.", "Por favor avísenos si hay mascotas antes de llegar.", "Cancele o reprograme con al menos 24 horas de anticipación para evitar un cargo.", GENERIC_TERMS_ES],
  },
  jobTypes: [
    {
      id: "clean-std", en: "Regular cleaning", es: "Limpieza regular", hint: ["Weekly, bi-weekly or one-time", "Semanal, quincenal o una sola vez"], days: 1,
      spec: B("Standard cleaning · supplies included", "Limpieza estándar · productos incluidos"),
      services: B("Regular house cleaning — kitchen, bathrooms, floors, dusting", "Limpieza regular del hogar — cocina, baños, pisos, sacudido"),
    },
    {
      id: "clean-deep", en: "Deep cleaning", es: "Limpieza profunda", hint: ["Top-to-bottom, first-time or seasonal", "De arriba abajo, primera vez o de temporada"], days: 1,
      spec: B("Deep cleaning · supplies included", "Limpieza profunda · productos incluidos"),
      services: B("Deep cleaning — baseboards, vents, appliances, detail work", "Limpieza profunda — zócalos, rejillas, electrodomésticos, detalles"),
      scope: {
        en: ["What's included:", "Everything in a regular cleaning, plus:", "Baseboards, door frames, light switches and vents wiped by hand.", "Inside of the oven, fridge and microwave.", "Detailed scrubbing of tile, grout and fixtures.", "Cleaning supplies and equipment are included."],
        es: ["Qué incluye:", "Todo lo de una limpieza regular, y además:", "Zócalos, marcos de puertas, interruptores y rejillas limpiados a mano.", "Interior del horno, refrigerador y microondas.", "Fregado detallado de azulejos, lechada y accesorios.", "Los productos y el equipo de limpieza están incluidos."],
      },
    },
    {
      id: "clean-move", en: "Move-in / move-out", es: "Mudanza (entrada / salida)", hint: ["Empty home, ready for the next person", "Casa vacía, lista para el siguiente"], days: 1,
      spec: B("Move-in / move-out cleaning · supplies included", "Limpieza de mudanza · productos incluidos"),
      services: B("Move-in / move-out cleaning of an empty home", "Limpieza de mudanza de una casa vacía"),
      scope: {
        en: ["What's included:", "Cabinets and drawers cleaned inside and out.", "Inside of the oven, fridge and appliances.", "Bathrooms scrubbed and disinfected; floors vacuumed and mopped.", "Baseboards, doors and window sills wiped.", "The home must be empty of belongings and trash."],
        es: ["Qué incluye:", "Gabinetes y cajones limpios por dentro y por fuera.", "Interior del horno, refrigerador y electrodomésticos.", "Baños fregados y desinfectados; pisos aspirados y trapeados.", "Zócalos, puertas y marcos de ventanas limpiados.", "La casa debe estar vacía de pertenencias y basura."],
      },
    },
    {
      id: "clean-other", en: "Other cleaning", es: "Otra limpieza", hint: ["Office, post-construction, anything else", "Oficina, después de obra, lo que sea"], days: 1,
      spec: B("", ""), services: B("", ""),
    },
  ],
  lead: {
    title: B("Tell us about the cleaning", "Cuéntenos de la limpieza"), sub: B("Rough answers are perfectly fine.", "Respuestas aproximadas están perfectas."),
    services: [
      { id: "clean-std", en: "Regular cleaning", es: "Limpieza regular", subEn: "Weekly, bi-weekly or one-time", subEs: "Semanal, quincenal o una vez", icon: "sparkle", job: "clean-std" },
      { id: "clean-deep", en: "Deep cleaning", es: "Limpieza profunda", subEn: "Top-to-bottom detail clean", subEs: "Limpieza a fondo de arriba abajo", icon: "sparkle", job: "clean-deep" },
      { id: "clean-move", en: "Move-in / move-out", es: "Mudanza", subEn: "Empty home, ready for the next person", subEs: "Casa vacía, lista para el siguiente", icon: "home", job: "clean-move" },
      { id: "clean-office", en: "Office / business", es: "Oficina / negocio", subEn: "Offices, shops, common areas", subEs: "Oficinas, tiendas, áreas comunes", icon: "home", job: "clean-other" },
      { id: "other", en: "Something else", es: "Otra cosa", subEn: "Post-construction, events, other", subEs: "Después de obra, eventos, otro", icon: "other", job: "clean-other" },
    ],
    questions: [
      { id: "size", kind: "one", en: "Home size", es: "Tamaño de la casa", options: [one("studio", "Studio / 1 bedroom", "Estudio / 1 habitación"), one("2bd", "2 bedrooms", "2 habitaciones"), one("3bd", "3 bedrooms", "3 habitaciones"), one("4bd", "4+ bedrooms", "4 o más habitaciones"), one("unsure", "Not sure", "No sé")] },
      { id: "baths", kind: "count", en: "How many bathrooms?", es: "¿Cuántos baños?", only: ["clean-std", "clean-deep", "clean-move"] },
      { id: "freq", kind: "one", en: "How often?", es: "¿Con qué frecuencia?", options: [one("once", "One time", "Una vez"), one("weekly", "Weekly", "Semanal"), one("biweekly", "Every 2 weeks", "Cada 2 semanas"), one("monthly", "Monthly", "Mensual")], only: ["clean-std", "clean-office"] },
      { id: "pets", kind: "one", en: "Any pets at home?", es: "¿Hay mascotas en casa?", options: [one("no", "No pets", "Sin mascotas"), one("yes", "Yes", "Sí")] },
      { id: "extras", kind: "multi", en: "Add-ons", es: "Extras", options: [one("oven", "Inside oven", "Interior del horno"), one("fridge", "Inside fridge", "Interior del refrigerador"), one("windows", "Interior windows", "Ventanas interiores"), one("laundry", "Laundry", "Lavandería")] },
    ],
    photoTips: PHOTO_TIPS, messagePlaceholder: B("Access details, priorities, anything we should know…", "Acceso a la casa, prioridades, lo que debamos saber…"),
  },
  kpis: ["sales_won", "repeat_share", "revenue_per_hour", "jobs_per_week", "to_collect", "job_margin"],
  kpiMore: ["avg_ticket", "close_rate", "earn_per_hour", "hours_logged", "top_source_rev", "net_profit"],
  cabinetTools: false,
};

const electrical: Trade = {
  id: "electrical", en: "Electrical", es: "Electricidad", hint: B("Repairs, installs, panels and EV chargers", "Reparaciones, instalaciones, paneles y cargadores EV"),
  prices: [
    { id: "call", en: "Service-call fee ($)", es: "Cargo por visita de servicio ($)", target: { item: "elec-call" } },
    { id: "hour", en: "Hourly rate ($)", es: "Tarifa por hora ($)", target: { item: "elec-hour" } },
  ],
  catalog: [
    it("elec-call", "Service call / diagnostic fee", "Visita de servicio / diagnóstico", "ea", "c/u", 95, 1),
    it("elec-hour", "Electrician labor", "Mano de obra de electricista", "hr", "hora", 110, 1),
    it("elec-outlet", "Outlet or switch — install or replace", "Tomacorriente o interruptor — instalar o reemplazar", "ea", "c/u", 125, 0.75),
    it("elec-gfci", "GFCI outlet — install", "Tomacorriente GFCI — instalar", "ea", "c/u", 150, 0.75),
    it("elec-light", "Light fixture — install", "Lámpara — instalar", "ea", "c/u", 150, 1),
    it("elec-fan", "Ceiling fan — install", "Ventilador de techo — instalar", "ea", "c/u", 225, 1.5),
    it("elec-circuit", "New dedicated circuit", "Circuito dedicado nuevo", "ea", "c/u", 450, 3),
    it("elec-ev", "EV charger — install (Level 2)", "Cargador EV — instalar (Nivel 2)", "job", "trabajo", 650, 4),
    it("elec-panel", "Panel upgrade (200 A)", "Cambio de panel (200 A)", "job", "trabajo", 2800, 10),
    it("elec-permit", "Permit & inspection fee", "Permiso e inspección", "job", "trabajo", 150, 0),
  ],
  depositPct: 30,
  scope: {
    en: ["Scope of work:", "All electrical work is performed by a licensed electrician and built to code.", "Permits and inspections are pulled where required and listed on this estimate.", "Materials are listed on this estimate; anything not listed is quoted before we buy it.", "Work area is protected and cleaned up when we finish.", "Power is restored and every circuit is tested before we leave."],
    es: ["Alcance del trabajo:", "Todo el trabajo eléctrico lo realiza un electricista con licencia y cumple con el código.", "Los permisos e inspecciones se tramitan cuando se requieren y se indican en este presupuesto.", "Los materiales están indicados en este presupuesto; lo que no aparece se cotiza antes de comprarlo.", "El área de trabajo se protege y se limpia al terminar.", "Se restablece la energía y se prueba cada circuito antes de irnos."],
  },
  terms: {
    en: ["Licensed and insured. Permits and inspections are included only when listed.", "1-year warranty on workmanship; manufacturer warranty on materials and fixtures.", DEPOSIT_EN, "Hidden conditions (old or unsafe wiring, code violations found once walls are open) are quoted separately before we continue.", "Someone 18 or older must be home for the work, and the power may be off for part of the day.", GENERIC_TERMS_EN],
    es: ["Con licencia y seguro. Los permisos e inspecciones se incluyen solo si aparecen en la lista.", "Garantía de 1 año en mano de obra; garantía del fabricante en materiales y accesorios.", DEPOSIT_ES, "Condiciones ocultas (cableado viejo o inseguro, violaciones al código al abrir paredes) se cotizan aparte antes de continuar.", "Debe haber una persona mayor de 18 años en casa y la energía puede estar apagada parte del día.", GENERIC_TERMS_ES],
  },
  jobTypes: [
    { id: "elec-service", en: "Repair / troubleshooting", es: "Reparación / diagnóstico", hint: ["No power, tripping breakers, bad outlets", "Sin luz, breakers que saltan, tomacorrientes dañados"], days: 1, spec: B("Electrical repair · licensed electrician", "Reparación eléctrica · electricista con licencia"), services: B("Electrical repairs and troubleshooting", "Reparaciones y diagnóstico eléctrico") },
    { id: "elec-install", en: "Install fixtures & outlets", es: "Instalar lámparas y tomacorrientes", hint: ["Lights, fans, outlets, switches", "Lámparas, ventiladores, tomacorrientes, interruptores"], days: 1, spec: B("Fixture and outlet installation · to code", "Instalación de lámparas y tomacorrientes · según el código"), services: B("Installation of lights, fans, outlets and switches", "Instalación de lámparas, ventiladores, tomacorrientes e interruptores") },
    { id: "elec-panel", en: "Panel, rewiring & EV charger", es: "Panel, recableado y cargador EV", hint: ["Panel upgrades, new circuits, EV chargers", "Cambio de panel, circuitos nuevos, cargadores EV"], days: 2, spec: B("Panel / circuit work · permit and inspection", "Trabajo de panel / circuitos · permiso e inspección"), services: B("Panel upgrades, new circuits, rewiring and EV chargers", "Cambio de panel, circuitos nuevos, recableado y cargadores EV") },
    { id: "elec-other", en: "Other electrical job", es: "Otro trabajo eléctrico", hint: ["Anything else electrical", "Cualquier otro trabajo eléctrico"], days: 1, spec: B("", ""), services: B("", "") },
  ],
  lead: {
    title: B("Tell us about the electrical job", "Cuéntenos del trabajo eléctrico"), sub: B("Rough answers are perfectly fine.", "Respuestas aproximadas están perfectas."),
    services: [
      { id: "elec-repair", en: "Repair / troubleshooting", es: "Reparación / diagnóstico", subEn: "No power, tripping breaker, dead outlet", subEs: "Sin luz, breaker que salta, tomacorriente muerto", icon: "bolt", job: "elec-service" },
      { id: "elec-install", en: "Lights, fans & outlets", es: "Lámparas, ventiladores y tomacorrientes", subEn: "Install or replace fixtures and switches", subEs: "Instalar o reemplazar lámparas e interruptores", icon: "bolt", job: "elec-install" },
      { id: "elec-panel", en: "Panel or rewiring", es: "Panel o recableado", subEn: "Panel upgrade, new circuits, old wiring", subEs: "Cambio de panel, circuitos nuevos, cableado viejo", icon: "bolt", job: "elec-panel" },
      { id: "elec-ev", en: "EV charger", es: "Cargador EV", subEn: "Level 2 charger at home", subEs: "Cargador de Nivel 2 en casa", icon: "plug", job: "elec-panel" },
      { id: "other", en: "Something else", es: "Otra cosa", subEn: "Anything else electrical", subEs: "Cualquier otro trabajo eléctrico", icon: "other", job: "elec-other" },
    ],
    questions: [
      { id: "property", kind: "one", en: "Type of property", es: "Tipo de propiedad", options: PROPERTY },
      { id: "safety", kind: "one", en: "Is anything unsafe right now (burning smell, sparks, hot outlets)?", es: "¿Hay algo inseguro ahora (olor a quemado, chispas, tomacorrientes calientes)?", options: [one("no", "No", "No"), one("yes", "Yes — please call me first", "Sí — llámenme primero")], only: ["elec-repair"] },
      { id: "count", kind: "count", en: "How many lights, fans or outlets?", es: "¿Cuántas lámparas, ventiladores o tomacorrientes?", only: ["elec-install"] },
      { id: "panelAge", kind: "one", en: "Age of the electrical panel", es: "Antigüedad del panel eléctrico", options: [one("new", "Under 10 years", "Menos de 10 años"), one("mid", "10–30 years", "10–30 años"), one("old", "Over 30 years", "Más de 30 años"), one("unsure", "Not sure", "No sé")], only: ["elec-panel"] },
      { id: "details", kind: "text", en: "Describe what you need", es: "Describa lo que necesita", placeholderEn: "For example: the kitchen outlets stop working when the microwave runs…", placeholderEs: "Por ejemplo: los tomacorrientes de la cocina dejan de funcionar cuando se usa el microondas…" },
    ],
    photoTips: [B("A photo of the panel, fixture or outlet", "Una foto del panel, la lámpara o el tomacorriente"), B("A wide photo of the area", "Una foto amplia del área"), B("Good light — turn on the lights", "Buena luz — prenda las luces")],
    messagePlaceholder: B("Access details, best time to call, anything we should know…", "Acceso, mejor hora para llamar, lo que debamos saber…"),
  },
  kpis: ["sales_won", "jobs_won", "avg_ticket", "mat_margin", "quote_to_win_days", "to_collect"],
  kpiMore: ["close_rate", "job_margin", "profit_after_mat", "earn_per_hour", "top_source_rev", "net_profit"],
  cabinetTools: false,
};

const plumbing: Trade = {
  id: "plumbing", en: "Plumbing", es: "Plomería", hint: B("Leaks, drains, fixtures and water heaters", "Fugas, drenajes, accesorios y calentadores"),
  prices: [
    { id: "call", en: "Service-call fee ($)", es: "Cargo por visita de servicio ($)", target: { item: "plum-call" } },
    { id: "hour", en: "Hourly rate ($)", es: "Tarifa por hora ($)", target: { item: "plum-hour" } },
  ],
  catalog: [
    it("plum-call", "Service call / diagnostic fee", "Visita de servicio / diagnóstico", "ea", "c/u", 89, 1),
    it("plum-hour", "Plumber labor", "Mano de obra de plomero", "hr", "hora", 105, 1),
    it("plum-faucet", "Faucet — replace", "Grifo — reemplazar", "ea", "c/u", 225, 1.5),
    it("plum-toilet", "Toilet — replace", "Inodoro — reemplazar", "ea", "c/u", 325, 2),
    it("plum-drain", "Drain clearing", "Destape de drenaje", "ea", "c/u", 175, 1.5),
    it("plum-disposal", "Garbage disposal — install", "Triturador de basura — instalar", "ea", "c/u", 275, 1.5),
    it("plum-leak", "Leak repair", "Reparación de fuga", "ea", "c/u", 250, 2),
    it("plum-heater", "Water heater — replace (40–50 gal)", "Calentador de agua — reemplazar (40–50 gal)", "job", "trabajo", 1500, 4),
    it("plum-permit", "Permit fee", "Permiso", "job", "trabajo", 100, 0),
  ],
  depositPct: 30,
  scope: {
    en: ["Scope of work:", "All plumbing work is performed by a licensed plumber and built to code.", "Permits are pulled where required and listed on this estimate.", "Parts and materials are listed on this estimate; anything not listed is quoted before we buy it.", "We shut off and restore water, test for leaks and protect floors while we work.", "Old parts and debris are hauled away."],
    es: ["Alcance del trabajo:", "Todo el trabajo de plomería lo realiza un plomero con licencia y cumple con el código.", "Los permisos se tramitan cuando se requieren y se indican en este presupuesto.", "Las piezas y materiales están indicados en este presupuesto; lo que no aparece se cotiza antes de comprarlo.", "Cerramos y restablecemos el agua, probamos que no haya fugas y protegemos los pisos mientras trabajamos.", "Las piezas viejas y los escombros se retiran."],
  },
  terms: {
    en: ["Licensed and insured. Permits are included only when listed.", "1-year warranty on workmanship; manufacturer warranty on parts and fixtures.", DEPOSIT_EN, "Hidden conditions (corroded or damaged pipes, rot, code issues found once walls or floors are open) are quoted separately before we continue.", "Water will be shut off for part of the day; someone 18 or older must be home.", GENERIC_TERMS_EN],
    es: ["Con licencia y seguro. Los permisos se incluyen solo si aparecen en la lista.", "Garantía de 1 año en mano de obra; garantía del fabricante en piezas y accesorios.", DEPOSIT_ES, "Condiciones ocultas (tuberías corroídas o dañadas, podredumbre, problemas de código al abrir paredes o pisos) se cotizan aparte antes de continuar.", "El agua estará cerrada parte del día; debe haber una persona mayor de 18 años en casa.", GENERIC_TERMS_ES],
  },
  jobTypes: [
    { id: "plum-service", en: "Leak, clog or repair", es: "Fuga, obstrucción o reparación", hint: ["Leaks, drains, running toilets", "Fugas, drenajes, inodoros con fuga"], days: 1, spec: B("Plumbing repair · licensed plumber", "Reparación de plomería · plomero con licencia"), services: B("Plumbing repairs — leaks, clogs and drains", "Reparaciones de plomería — fugas, obstrucciones y drenajes") },
    { id: "plum-install", en: "Fixtures & appliances", es: "Accesorios y aparatos", hint: ["Faucets, toilets, disposals, sinks", "Grifos, inodoros, trituradores, fregaderos"], days: 1, spec: B("Fixture installation · to code", "Instalación de accesorios · según el código"), services: B("Installation of faucets, toilets, sinks and disposals", "Instalación de grifos, inodoros, fregaderos y trituradores") },
    { id: "plum-heater", en: "Water heater", es: "Calentador de agua", hint: ["Replace or install, tank or tankless", "Reemplazo o instalación, de tanque o sin tanque"], days: 1, spec: B("Water heater replacement · permit and haul-away", "Cambio de calentador de agua · permiso y retiro del anterior"), services: B("Water heater replacement and installation", "Cambio e instalación de calentadores de agua") },
    { id: "plum-other", en: "Other plumbing job", es: "Otro trabajo de plomería", hint: ["Repipe, sewer, anything else", "Retubería, alcantarillado, lo que sea"], days: 1, spec: B("", ""), services: B("", "") },
  ],
  lead: {
    title: B("Tell us about the plumbing job", "Cuéntenos del trabajo de plomería"), sub: B("Rough answers are perfectly fine.", "Respuestas aproximadas están perfectas."),
    services: [
      { id: "plum-leak", en: "Leak or clog", es: "Fuga u obstrucción", subEn: "Leaking pipe, slow drain, backed-up sink", subEs: "Tubo con fuga, drenaje lento, fregadero tapado", icon: "drop", job: "plum-service" },
      { id: "plum-fixture", en: "Faucet, toilet or fixtures", es: "Grifo, inodoro o accesorios", subEn: "Install or replace", subEs: "Instalar o reemplazar", icon: "drop", job: "plum-install" },
      { id: "plum-heater", en: "Water heater", es: "Calentador de agua", subEn: "No hot water, replace or install", subEs: "Sin agua caliente, reemplazar o instalar", icon: "drop", job: "plum-heater" },
      { id: "plum-pipe", en: "Pipes or sewer line", es: "Tuberías o alcantarillado", subEn: "Repipe, sewer, main line", subEs: "Retubería, alcantarillado, línea principal", icon: "drop", job: "plum-other" },
      { id: "other", en: "Something else", es: "Otra cosa", subEn: "Anything else plumbing", subEs: "Cualquier otro trabajo de plomería", icon: "other", job: "plum-other" },
    ],
    questions: [
      { id: "property", kind: "one", en: "Type of property", es: "Tipo de propiedad", options: PROPERTY },
      { id: "where", kind: "multi", en: "Where is it?", es: "¿Dónde está?", options: [one("kitchen", "Kitchen", "Cocina"), one("bath", "Bathroom", "Baño"), one("laundry", "Laundry", "Lavandería"), one("outdoor", "Outdoors", "Exterior"), one("garage", "Garage / utility", "Garaje / servicio")] },
      { id: "active", kind: "one", en: "Is water leaking right now?", es: "¿Hay agua saliendo ahora?", options: [one("no", "No", "No"), one("yes", "Yes — urgent", "Sí — urgente")], only: ["plum-leak", "plum-pipe"] },
      { id: "heater", kind: "one", en: "Type of water heater", es: "Tipo de calentador", options: [one("tank", "Tank", "De tanque"), one("tankless", "Tankless", "Sin tanque"), one("unsure", "Not sure", "No sé")], only: ["plum-heater"] },
      { id: "details", kind: "text", en: "Describe what you need", es: "Describa lo que necesita", placeholderEn: "For example: the kitchen faucet drips and the shutoff valve is stuck…", placeholderEs: "Por ejemplo: el grifo de la cocina gotea y la llave de paso está trabada…" },
    ],
    photoTips: [B("A photo of the leak, fixture or heater", "Una foto de la fuga, el accesorio o el calentador"), B("A wide photo of the area", "Una foto amplia del área"), B("Good light — turn on the lights", "Buena luz — prenda las luces")],
    messagePlaceholder: B("Access details, best time to call, anything we should know…", "Acceso, mejor hora para llamar, lo que debamos saber…"),
  },
  kpis: ["sales_won", "jobs_won", "avg_ticket", "mat_margin", "quote_to_win_days", "to_collect"],
  kpiMore: ["close_rate", "job_margin", "profit_after_mat", "earn_per_hour", "top_source_rev", "net_profit"],
  cabinetTools: false,
};

const handyman: Trade = {
  id: "handyman", en: "Handyman", es: "Mantenimiento", hint: B("Small repairs, mounting, assembly and odd jobs", "Reparaciones pequeñas, montaje, ensamblaje y trabajos varios"),
  prices: [
    { id: "hour", en: "Hourly rate ($)", es: "Tarifa por hora ($)", target: { item: "hand-hour" } },
    { id: "min", en: "Minimum charge per visit ($)", es: "Cobro mínimo por visita ($)", target: { item: "hand-min" } },
  ],
  catalog: [
    it("hand-hour", "Handyman labor", "Mano de obra de mantenimiento", "hr", "hora", 65, 1),
    it("hand-min", "Minimum visit charge (first 2 hours)", "Cobro mínimo por visita (primeras 2 horas)", "job", "trabajo", 130, 2),
    it("hand-mount", "TV mounting", "Montaje de TV", "ea", "c/u", 120, 1.25),
    it("hand-furn", "Furniture assembly", "Ensamblaje de muebles", "ea", "c/u", 75, 1),
    it("hand-shelf", "Shelf or curtain rod — install", "Repisa o barra de cortina — instalar", "ea", "c/u", 65, 0.75),
    it("hand-drywall", "Drywall patch (small)", "Resane de drywall (pequeño)", "ea", "c/u", 150, 1.5),
    it("hand-door", "Door — hang or adjust", "Puerta — colgar o ajustar", "ea", "c/u", 135, 1.5),
    it("hand-caulk", "Caulk / re-seal", "Sellado con caulk", "lin ft", "pie lineal", 3, 0.03),
    it("hand-haul", "Haul-away / disposal", "Retiro de escombros", "job", "trabajo", 95, 1),
  ],
  depositPct: 25,
  scope: {
    en: ["Scope of work:", "The tasks listed in this estimate, done neatly and to a professional standard.", "Tools and standard fasteners are included; materials are listed or purchased with your approval.", "Work area is protected and cleaned up when we finish.", "Anything found along the way that needs more work is quoted before we continue."],
    es: ["Alcance del trabajo:", "Las tareas indicadas en este presupuesto, hechas con cuidado y a nivel profesional.", "Las herramientas y los sujetadores estándar están incluidos; los materiales se indican o se compran con su aprobación.", "El área de trabajo se protege y se limpia al terminar.", "Si encontramos algo que requiera más trabajo, se cotiza antes de continuar."],
  },
  terms: {
    en: ["Hourly work is billed with a 2-hour minimum per visit.", "Materials you ask us to buy are billed at cost plus a small handling fee, with receipts.", DEPOSIT_EN, "Work added after the estimate is approved is quoted separately in writing.", "30-day warranty on workmanship.", GENERIC_TERMS_EN],
    es: ["El trabajo por hora se cobra con un mínimo de 2 horas por visita.", "Los materiales que nos pida comprar se cobran al costo más un pequeño cargo por gestión, con recibos.", DEPOSIT_ES, "El trabajo agregado después de aprobar el presupuesto se cotiza por separado y por escrito.", "Garantía de 30 días en mano de obra.", GENERIC_TERMS_ES],
  },
  jobTypes: [
    { id: "hand-hourly", en: "Hourly / small repairs", es: "Por hora / reparaciones pequeñas", hint: ["A list of small jobs, billed by the hour", "Una lista de trabajos pequeños, por hora"], days: 1, spec: B("Handyman services · billed by the hour", "Servicios de mantenimiento · por hora"), services: B("Small repairs, mounting and assembly", "Reparaciones pequeñas, montaje y ensamblaje") },
    { id: "hand-project", en: "Fixed-price project", es: "Proyecto a precio fijo", hint: ["A defined project with one price", "Un proyecto definido con un solo precio"], days: 1, spec: B("Handyman project · fixed price", "Proyecto de mantenimiento · precio fijo"), services: B("Home repair and improvement projects", "Proyectos de reparación y mejora del hogar") },
    { id: "hand-other", en: "Other job", es: "Otro trabajo", hint: ["Anything else", "Lo que sea"], days: 1, spec: B("", ""), services: B("", "") },
  ],
  lead: {
    title: B("Tell us about the job", "Cuéntenos del trabajo"), sub: B("A list of tasks is perfect.", "Una lista de tareas es perfecta."),
    services: [
      { id: "hand-small", en: "Small repairs", es: "Reparaciones pequeñas", subEn: "Fix, patch, replace, tighten", subEs: "Arreglar, resanar, reemplazar, apretar", icon: "other", job: "hand-hourly" },
      { id: "hand-mount", en: "Mounting & assembly", es: "Montaje y ensamblaje", subEn: "TVs, shelves, furniture, curtains", subEs: "TVs, repisas, muebles, cortinas", icon: "other", job: "hand-hourly" },
      { id: "hand-drywall", en: "Drywall & touch-ups", es: "Drywall y retoques", subEn: "Holes, cracks, small paint touch-ups", subEs: "Huecos, grietas, pequeños retoques de pintura", icon: "home", job: "hand-project" },
      { id: "hand-doors", en: "Doors, windows & trim", es: "Puertas, ventanas y molduras", subEn: "Hang, adjust, caulk, replace", subEs: "Colgar, ajustar, sellar, reemplazar", icon: "home", job: "hand-project" },
      { id: "other", en: "Something else", es: "Otra cosa", subEn: "Anything not listed", subEs: "Cualquier otra cosa", icon: "other", job: "hand-other" },
    ],
    questions: [
      { id: "property", kind: "one", en: "Type of property", es: "Tipo de propiedad", options: PROPERTY },
      { id: "tasks", kind: "count", en: "About how many tasks?", es: "¿Cuántas tareas más o menos?" },
      { id: "materials", kind: "one", en: "Materials", es: "Materiales", options: [one("mine", "I have them", "Yo los tengo"), one("yours", "Please buy them", "Compren ustedes"), one("unsure", "Not sure", "No sé")] },
      { id: "details", kind: "text", en: "List the tasks", es: "Lista de tareas", placeholderEn: "For example: mount a 55\" TV, fix a squeaky door, patch two holes…", placeholderEs: "Por ejemplo: montar un TV de 55\", arreglar una puerta que rechina, resanar dos huecos…" },
    ],
    photoTips: PHOTO_TIPS, messagePlaceholder: B("Access details, best time to call, anything we should know…", "Acceso, mejor hora para llamar, lo que debamos saber…"),
  },
  kpis: ["sales_won", "jobs_won", "avg_ticket", "hours_logged", "earn_per_hour", "to_collect"],
  kpiMore: ["close_rate", "job_margin", "revenue_per_hour", "mat_margin", "top_source_rev", "net_profit"],
  cabinetTools: false,
};

const landscaping: Trade = {
  id: "landscaping", en: "Landscaping", es: "Jardinería", hint: B("Lawn care, clean-ups, planting and trees", "Cuidado de césped, limpiezas, siembra y árboles"),
  prices: [
    { id: "visit", en: "Price per visit ($)", es: "Precio por visita ($)", target: { item: "land-visit" } },
    { id: "sqft", en: "Price per sq ft ($)", es: "Precio por pie² ($)", target: { item: "land-sqft" } },
    { id: "hour", en: "Hourly rate ($)", es: "Tarifa por hora ($)", target: { item: "land-hour" } },
  ],
  catalog: [
    it("land-visit", "Lawn maintenance visit (mow, edge, blow)", "Visita de mantenimiento de césped (cortar, bordear, soplar)", "visit", "visita", 65, 1.25),
    it("land-sqft", "Sod installation", "Instalación de césped (sod)", "sq ft", "pie²", 1.25, 0.005),
    it("land-hour", "Landscaping labor", "Mano de obra de jardinería", "hr", "hora", 55, 1),
    it("land-mulch", "Mulch — supply and spread", "Mulch — suministro y colocación", "cu yd", "yd³", 85, 1),
    it("land-hedge", "Hedge / shrub trimming", "Poda de setos y arbustos", "lin ft", "pie lineal", 4, 0.05),
    it("land-tree", "Tree trimming (small tree)", "Poda de árbol (pequeño)", "ea", "c/u", 250, 3),
    it("land-cleanup", "Yard clean-up (leaves, debris)", "Limpieza del jardín (hojas, escombros)", "job", "trabajo", 250, 4),
    it("land-irr", "Sprinkler repair", "Reparación de aspersores", "ea", "c/u", 120, 1),
    it("land-haul", "Debris haul-away", "Retiro de escombros", "job", "trabajo", 120, 1.5),
  ],
  depositPct: 30,
  scope: {
    en: ["Scope of work:", "The services and areas listed in this estimate.", "Recurring service: same crew, same day each visit; you're billed per visit or monthly as agreed.", "One-time project: work is completed in the days shown, weather permitting.", "Clippings and debris from the work are cleaned up and removed unless noted."],
    es: ["Alcance del trabajo:", "Los servicios y áreas indicados en este presupuesto.", "Servicio recurrente: el mismo equipo y el mismo día en cada visita; se factura por visita o por mes según lo acordado.", "Proyecto de una sola vez: el trabajo se completa en los días indicados, si el clima lo permite.", "Los recortes y escombros del trabajo se limpian y retiran, salvo que se indique lo contrario."],
  },
  terms: {
    en: ["Recurring service can be paused or canceled with 7 days' notice.", "Outdoor work depends on the weather. Rain days move the schedule; they never change the price.", DEPOSIT_EN, "Please keep gates unlocked and pets inside on service days.", "Plants and sod are guaranteed for 30 days with the watering schedule we give you.", GENERIC_TERMS_EN],
    es: ["El servicio recurrente se puede pausar o cancelar con 7 días de aviso.", "El trabajo exterior depende del clima. Los días de lluvia mueven el calendario; nunca cambian el precio.", DEPOSIT_ES, "Por favor deje los portones abiertos y las mascotas adentro los días de servicio.", "Las plantas y el césped tienen garantía de 30 días con el riego que le indicamos.", GENERIC_TERMS_ES],
  },
  jobTypes: [
    {
      id: "land-recurring", en: "Recurring maintenance", es: "Mantenimiento recurrente", hint: ["Weekly, bi-weekly or monthly visits", "Visitas semanales, quincenales o mensuales"], days: 1,
      spec: B("Recurring lawn and yard service", "Servicio recurrente de césped y jardín"), services: B("Recurring lawn maintenance — mowing, edging, blowing", "Mantenimiento recurrente de césped — corte, bordes, soplado"),
      scope: {
        en: ["Scope of work:", "Each visit: mow, edge, trim and blow off walks and driveway.", "Same crew and same day each visit; you're billed per visit or monthly as agreed.", "Extras (hedge trimming, mulch, weeding) are added only with your approval."],
        es: ["Alcance del trabajo:", "En cada visita: cortar, bordear, recortar y soplar aceras y entrada.", "El mismo equipo y el mismo día en cada visita; se factura por visita o por mes según lo acordado.", "Los extras (poda de setos, mulch, deshierbe) se agregan solo con su aprobación."],
      },
      terms: {
        en: ["Recurring service can be paused or canceled with 7 days' notice.", "Visits move to the next day when it rains.", "Please keep gates unlocked and pets inside on service days.", GENERIC_TERMS_EN],
        es: ["El servicio recurrente se puede pausar o cancelar con 7 días de aviso.", "Las visitas pasan al día siguiente cuando llueve.", "Por favor deje los portones abiertos y las mascotas adentro los días de servicio.", GENERIC_TERMS_ES],
      },
    },
    { id: "land-project", en: "One-time project", es: "Proyecto de una sola vez", hint: ["Clean-up, planting, sod, mulch, trees", "Limpieza, siembra, césped, mulch, árboles"], days: 2, spec: B("One-time landscaping project", "Proyecto de jardinería de una sola vez"), services: B("Yard clean-ups, planting, sod, mulch and tree work", "Limpieza de jardín, siembra, césped, mulch y trabajo de árboles") },
    { id: "land-other", en: "Other outdoor job", es: "Otro trabajo exterior", hint: ["Anything else outside", "Cualquier otro trabajo exterior"], days: 1, spec: B("", ""), services: B("", "") },
  ],
  lead: {
    title: B("Tell us about your yard", "Cuéntenos de su jardín"), sub: B("Rough answers are perfectly fine.", "Respuestas aproximadas están perfectas."),
    services: [
      { id: "land-mow", en: "Lawn maintenance", es: "Mantenimiento de césped", subEn: "Mowing, edging, regular visits", subEs: "Corte, bordes, visitas regulares", icon: "leaf", job: "land-recurring" },
      { id: "land-cleanup", en: "Yard clean-up", es: "Limpieza del jardín", subEn: "Leaves, debris, overgrown areas", subEs: "Hojas, escombros, áreas crecidas", icon: "leaf", job: "land-project" },
      { id: "land-plant", en: "Planting, sod & mulch", es: "Siembra, césped y mulch", subEn: "New beds, sod, irrigation", subEs: "Camas nuevas, césped, riego", icon: "leaf", job: "land-project" },
      { id: "land-trees", en: "Trees & hedges", es: "Árboles y setos", subEn: "Trimming and removal", subEs: "Poda y remoción", icon: "leaf", job: "land-project" },
      { id: "other", en: "Something else", es: "Otra cosa", subEn: "Anything else outside", subEs: "Cualquier otro trabajo exterior", icon: "other", job: "land-other" },
    ],
    questions: [
      { id: "lot", kind: "one", en: "Yard size", es: "Tamaño del jardín", options: [one("s", "Small (under 5,000 sq ft)", "Pequeño (menos de 5,000 pies²)"), one("m", "Medium (5,000–10,000 sq ft)", "Mediano (5,000–10,000 pies²)"), one("l", "Large (over 10,000 sq ft)", "Grande (más de 10,000 pies²)"), one("unsure", "Not sure", "No sé")] },
      { id: "freq", kind: "one", en: "How often?", es: "¿Con qué frecuencia?", options: [one("once", "One time", "Una vez"), one("weekly", "Weekly", "Semanal"), one("biweekly", "Every 2 weeks", "Cada 2 semanas"), one("monthly", "Monthly", "Mensual")], only: ["land-mow"] },
      { id: "access", kind: "one", en: "Gate or dogs?", es: "¿Portón o perros?", options: [one("open", "Open access", "Acceso libre"), one("gate", "Gate (locked)", "Portón (con llave)"), one("dogs", "Dogs in the yard", "Perros en el jardín")] },
      { id: "details", kind: "text", en: "Describe what you need", es: "Describa lo que necesita", placeholderEn: "For example: weekly mowing plus trim the hedge along the fence…", placeholderEs: "Por ejemplo: corte semanal y podar el seto junto a la cerca…" },
    ],
    photoTips: [B("One wide photo of the whole yard", "Una foto amplia de todo el jardín"), B("A close-up of the area to work on", "Una de cerca del área a trabajar"), B("Daylight photos show the most", "Las fotos con luz de día muestran más")],
    messagePlaceholder: B("Access details, plants you have in mind, anything we should know…", "Acceso, plantas que tiene en mente, lo que debamos saber…"),
  },
  kpis: ["sales_won", "repeat_share", "revenue_per_hour", "jobs_per_month", "to_collect", "job_margin"],
  kpiMore: ["avg_ticket", "close_rate", "earn_per_hour", "hours_logged", "top_source_rev", "net_profit"],
  cabinetTools: false,
};

const custom: Trade = {
  id: "custom", en: "Custom (my own services)", es: "Personalizado (mis propios servicios)", hint: B("No template — you define your own priced services", "Sin plantilla — tú defines tus servicios con precio"),
  prices: [],
  catalog: [],
  depositPct: 30,
  scope: { en: ["Scope of work:", "The work described in this estimate."], es: ["Alcance del trabajo:", "El trabajo descrito en este presupuesto."] },
  terms: {
    en: [DEPOSIT_EN, "Work not listed in this estimate is quoted separately in writing.", GENERIC_TERMS_EN],
    es: [DEPOSIT_ES, "El trabajo no incluido en este presupuesto se cotiza aparte por escrito.", GENERIC_TERMS_ES],
  },
  jobTypes: [
    { id: "custom-job", en: "Job", es: "Trabajo", hint: ["Your own services and prices", "Tus propios servicios y precios"], days: 1, spec: B("", ""), services: B("", "") },
  ],
  lead: {
    title: B("Tell us about your project", "Cuéntenos de su proyecto"), sub: B("Rough answers are perfectly fine.", "Respuestas aproximadas están perfectas."),
    services: [
      { id: "service", en: "A service", es: "Un servicio", subEn: "Something you offer", subEs: "Algo que ofrecemos", icon: "other", job: "custom-job" },
      { id: "project", en: "A project / quote", es: "Un proyecto / cotización", subEn: "A bigger job that needs a price", subEs: "Un trabajo más grande que necesita precio", icon: "home", job: "custom-job" },
      { id: "other", en: "Something else", es: "Otra cosa", subEn: "Tell us what you need", subEs: "Cuéntenos qué necesita", icon: "other", job: "custom-job" },
    ],
    questions: [
      { id: "details", kind: "text", en: "Describe what you need", es: "Describa lo que necesita", placeholderEn: "Tell us about the job, the size and the place…", placeholderEs: "Cuéntenos del trabajo, el tamaño y el lugar…" },
    ],
    photoTips: PHOTO_TIPS, messagePlaceholder: B("Access details, best time to call, anything we should know…", "Acceso, mejor hora para llamar, lo que debamos saber…"),
  },
  kpis: ["sales_won", "to_collect", "avg_ticket", "close_rate", "profit_after_mat", "earn_per_hour"],
  kpiMore: ["job_margin", "revenue_per_hour", "top_source_rev", "net_profit", "jobs_won", "hours_logged"],
  cabinetTools: false,
};

/** Painting (and cabinet refinishing): the original behavior. Its catalog is services.data.ts, its job types typePresets.data.ts. */
const painting: Trade = {
  id: "painting", en: "Painting & cabinets", es: "Pintura y gabinetes", hint: B("Cabinet refinishing, interior and exterior painting", "Restauración de gabinetes, pintura interior y exterior"),
  prices: [
    { id: "door", en: "Price per door ($)", es: "Precio por puerta ($)", target: { pricing: "doorRate" } },
    { id: "drawer", en: "Price per drawer ($)", es: "Precio por cajón ($)", target: { pricing: "drawerRate" } },
  ],
  catalog: [], // derived from services.data.ts (see paintingCatalog in trades.ts)
  depositPct: 50,
  scope: { en: [], es: [] }, terms: { en: [], es: [] }, // settings.scope / settings.terms and typePresets.data.ts
  jobTypes: [], lead: null,
  kpis: ["job_margin", "net_profit", "sales_won", "backlog"],
  kpiMore: [],
  cabinetTools: true,
};

export const TRADE_LIST: Trade[] = [painting, cleaning, electrical, plumbing, handyman, landscaping, custom];
