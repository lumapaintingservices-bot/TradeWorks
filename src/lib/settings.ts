import { SERVICES } from "./services.data";
import { TYPE_PRESET_DEFAULTS } from "./typePresets.data";
import type { Settings, TypePreset } from "./types";

/** Neutral starting settings for a new company (rates are placeholders the contractor edits in Settings). */
export function defaultSettings(): Settings {
  return {
    pricing: {
      doorRate: 80, drawerRate: 55, spec: "", specEs: "",
      doorLabel: "Cabinet doors — refinished (includes frame painting)", doorLabelEs: "Puertas de gabinete — restauradas (incluye pintura del marco)",
      doorLabelNoFrame: "Cabinet doors — refinished (doors only)", doorLabelNoFrameEs: "Puertas de gabinete — restauradas (solo puertas)",
      frameMode: "included", frameRate: 35, frameLabel: "Cabinet frames — cleaned, sanded and sprayed on site", frameLabelEs: "Marcos de gabinete — limpiados, lijados y pintados en sitio",
      boxMode: "included", boxRate: 45, boxLabel: "Cabinet boxes — cleaned, sanded and sprayed on site", boxLabelEs: "Cajas de gabinete — limpiadas, lijadas y pintadas en sitio",
      drawerLabel: "Drawer fronts — refinished", drawerLabelEs: "Frentes de cajón — restaurados", depositPct: 50, validDays: 30,
    },
    materials: {
      sqftPerDoor: 5, frameSqftPerDoor: 2.5, sqftPerDrawer: 2, sqftPerBox: 3, coverageSqftPerGal: 325, primerCoats: 1, paintCoats: 2, wastePct: 15,
      primerName: "Shellac-based primer", primerCostPerGal: 62, paintName: "Cabinet paint", paintCostPerGal: 78,
      wallPaintName: "Wall & ceiling paint", wallPaintCostPerGal: 45, wallCoverageSqftPerGal: 350, wallCoats: 2,
      wallPrimerName: "Wall primer", wallPrimerCostPerGal: 32, wallPrimerCoats: 0,
      supplies: [
        { name: "Painter's tape", qty: 3, cost: 6, basis: "item" }, { name: "Masking plastic / film", qty: 2, cost: 11, basis: "item" },
        { name: "Floor protection", qty: 1, cost: 28, basis: "item" }, { name: "Degreaser", qty: 1, cost: 15, basis: "item" },
        { name: "Tack cloths & rags", qty: 1, cost: 12, basis: "item" }, { name: "Sandpaper & abrasives", qty: 1, cost: 2.5, basis: "door" },
        { name: "Abrasives — drawer fronts", qty: 1, cost: 1.25, basis: "drawer" },
      ],
    },
    production: {
      laborMode: "solo", targetHourly: 50, payBy: "hour", laborRate: 35, doorPay: 25, drawerPay: 12, framePay: 10, boxPay: 15,
      targetMargin: 50, crewSize: 2, hoursPerDay: 8, doorHrs: 1.25, drawerHrs: 0.5, frameHrs: 0.35, boxHrs: 0.5, setupHrs: 6,
      svcHrs: { walls: 0.008, ceiling: 0.01, base: 0.025, crown: 0.04, doors: 1.25, windows: 0.5, closet: 2, accent: 3, drywall: 1, popcorn: 0.02, exterior: 0.007, gutters: 0.03, soffit: 0.04, wash: 0.004, counter: 0 },
    },
    tax: { enabled: false, rate: 7, label: "Sales tax", labelEs: "Impuesto sobre ventas" },
    discounts: [{ code: "CASH3", type: "percent", value: 3, label: "Cash / Zelle payment discount", labelEs: "Descuento por pago en efectivo o Zelle", active: true }],
    processDays: 5,
    scope: {
      en: ["5-day on-site process — all work completed at your home.", "Cabinet boxes, doors and drawer fronts are cleaned, degreased, sanded and sprayed for a factory-quality finish.", "All materials included.", "Work area is masked and protected daily; site left broom-clean each evening."],
      es: ["Proceso de 5 días en sitio — todo el trabajo se realiza en su hogar.", "Los gabinetes, puertas y frentes de cajón se limpian, desengrasan, lijan y se pintan a pistola para un acabado de calidad de fábrica.", "Todos los materiales incluidos.", "El área de trabajo se cubre y protege a diario; se deja limpia cada tarde."],
    },
    terms: {
      en: ["2-year workmanship warranty.", "50% due day 1, 50% due on the final day.", "Prices hold through the validity date shown above.", "Work added after the estimate is approved is quoted separately in writing.", "Final door and drawer counts are confirmed on day 1."],
      es: ["Garantía de mano de obra de 2 años.", "50% el primer día, 50% el último día.", "Los precios se mantienen hasta la fecha de vigencia indicada arriba.", "Cualquier trabajo agregado después de aprobar el presupuesto se cotiza por separado y por escrito.", "El conteo final de puertas y cajones se confirma el primer día."],
    },
    typePresets: JSON.parse(JSON.stringify(TYPE_PRESET_DEFAULTS)) as Record<string, TypePreset>,
    services: "", servicesEs: "",
    jobTemplates: [
      { id: "tpl-std", name: "Standard kitchen", data: { doors: 20, drawers: 10, days: 5 } },
      { id: "tpl-island", name: "Kitchen with island", data: { doors: 28, drawers: 14, days: 5 } },
    ],
    numbering: { nextEst: 1001 },
    payZelle: "", payZelleName: "", payNote: "",
  };
}
export const SERVICE_CATALOG = SERVICES;
