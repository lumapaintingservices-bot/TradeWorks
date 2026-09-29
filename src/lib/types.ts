export type JobType = "cabinets" | "interior" | "exterior" | "other";
export type EstStatus = "Draft" | "Sent" | "Viewed" | "Accepted" | "Deposit Paid" | "Paid in Full" | "Declined";
export const STATUSES: EstStatus[] = ["Draft", "Sent", "Viewed", "Accepted", "Deposit Paid", "Paid in Full", "Declined"];

export type Item = { id: string; desc: string; descEs: string; qty: number; unit: string; rate: number; hidden?: boolean; svc?: string; hrs?: number | "" };
export type Upgrade = { id: string; desc: string; descEs: string; qty: number; rate: number; included?: boolean; byClient?: boolean };
export type PayStep = { label: string; labelEs: string; pct: number };
export type MatRow = { id: string; desc: string; descEs: string; qty: number; unit: string; rate: number };

export type Estimate = {
  id: string; number: string; date: string; validDays: number; status: EstStatus;
  clientId: string; clientName: string; phone: string; email: string; address: string; docLang: "en" | "es";
  jobType: JobType;
  doors: number; drawers: number; frames: number; boxes: number;
  doorRate: number; drawerRate: number; frameRate: number; boxRate: number;
  frameMode: "included" | "separate" | "none"; boxMode: "included" | "separate" | "none";
  spec: string; specEs: string;
  items: Item[]; upgrades: Upgrade[];
  discountMode: "" | "code" | "manual"; discountCode: string;
  manualType: "percent" | "fixed"; manualValue: number; manualLabel: string; manualLabelEs: string;
  taxEnabled: boolean; taxRate: number;
  depositPct: number; payPlanOn: boolean; payPlan: PayStep[];
  days: number; startDate: string; leadSource: string;
  scopeEn: string; scopeEs: string; termsEn: string; termsEs: string; notes: string; crewNotes: string;
  showMaterials: boolean; materialsMode: "included" | "added"; materialsList: MatRow[]; matBuyer: "me" | "paint" | "client";
  laborMode?: "solo" | "crew"; extraHrs: number;
  actualMaterialCost?: number;
  changeOrders: { n: number; status: string; amount: number; hours?: number }[];
  createdAt?: unknown; updatedAt?: unknown; companyId?: string;
};

export type Client = {
  id: string; name: string; phone: string; email: string; address: string; source: string; lang: "en" | "es";
  note: string; lead?: boolean; archived?: boolean; createdAt?: unknown; updatedAt?: unknown; companyId?: string;
  web?: { service?: string; details?: { types?: string[] } };
};
export type Discount = { code: string; type: "percent" | "fixed"; value: number; label: string; labelEs: string; active?: boolean };
export type Supply = { name: string; qty?: number; cost: number; basis: "item" | "door" | "drawer" | "job" };
export type TypePreset = { days: number; services?: string; servicesEs?: string; spec: string; specEs: string; scopeEn: string; scopeEs: string; termsEn: string; termsEs: string };

export type Settings = {
  pricing: {
    doorRate: number; drawerRate: number; spec: string; specEs: string;
    doorLabel: string; doorLabelEs: string; doorLabelNoFrame: string; doorLabelNoFrameEs: string;
    frameMode: "included" | "separate" | "none"; frameRate: number; frameLabel: string; frameLabelEs: string;
    boxMode: "included" | "separate" | "none"; boxRate: number; boxLabel: string; boxLabelEs: string;
    drawerLabel: string; drawerLabelEs: string; depositPct: number; validDays: number;
  };
  materials: {
    sqftPerDoor: number; frameSqftPerDoor: number; sqftPerDrawer: number; sqftPerBox: number;
    coverageSqftPerGal: number; primerCoats: number; paintCoats: number; wastePct: number;
    primerName: string; primerCostPerGal: number; paintName: string; paintCostPerGal: number;
    wallPaintName: string; wallPaintCostPerGal: number; wallCoverageSqftPerGal: number; wallCoats: number;
    wallPrimerName: string; wallPrimerCostPerGal: number; wallPrimerCoats: number; supplies: Supply[];
  };
  production: {
    laborMode: "solo" | "crew"; targetHourly: number; payBy: "hour" | "piece"; laborRate: number;
    doorPay: number; drawerPay: number; framePay: number; boxPay: number; targetMargin: number; crewSize: number; hoursPerDay: number;
    doorHrs: number; drawerHrs: number; frameHrs: number; boxHrs: number; setupHrs: number; svcHrs: Record<string, number>;
  };
  tax: { enabled: boolean; rate: number; label: string; labelEs: string };
  discounts: Discount[];
  processDays: number;
  scope: { en: string[]; es: string[] }; terms: { en: string[]; es: string[] };
  typePresets: Partial<Record<Exclude<JobType, "cabinets">, TypePreset>>;
  services: string; servicesEs: string;
  jobTemplates: { id: string; name: string; data: Partial<Estimate> }[];
  numbering: { nextEst: number };
  payZelle: string; payZelleName: string; payNote: string;
};
