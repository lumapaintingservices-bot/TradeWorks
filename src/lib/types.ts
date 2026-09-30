/** The four painting job types, plus the job-type ids of the other trades (see lib/trades.ts). Stored as a plain string on the estimate. */
export type JobType = "cabinets" | "interior" | "exterior" | "other" | (string & {});
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
  changeOrders: ChangeOrder[];
  portal?: { token: string; live?: boolean };
  portalViews?: string[]; portalSeen?: { views: number; picks: string; sign: boolean; paid?: string; co?: Record<string, number> };
  activity?: { at: string; text: string }[];
  chat?: ChatMsg[]; chatUnread?: number;
  signature?: { name: string; img: string; date: string; via: string; at: string } | null;
  payClaim?: { method: string; at: string };
  sentAt?: string;
  snooze?: Record<string, string>; reviewAsked?: boolean; warrantyChecked?: boolean;
  photos?: PhotoRef[]; showPhotos?: boolean; check?: Record<string, string>; jobTasks?: JobTask[]; colors?: ColorRow[];
  createdAt?: unknown; updatedAt?: unknown; companyId?: string;
};
export type ChangeOrder = { id?: string; n: number; desc?: string; descEs?: string; amount: number; hours?: number; status: string; signedName?: string; signedAt?: string; sigId?: string; sigImg?: string };
export type Invoice = { id: string; number: string; estId: string; kind: "deposit" | "balance" | "co"; amount: number; date: string; status: "Unpaid" | "Paid"; paidDate?: string; coId?: string; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
export type Task = { id: string; title: string; date: string; time?: string; note?: string; estId?: string; workerId?: string; done?: boolean; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
export type MessageTemplates = Partial<Record<string, { en: string; es: string }>>;
export type Worker = { id: string; name: string; phone?: string; role?: string; rate: number; active?: boolean; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
export type HourEntry = { id: string; workerId: string; date: string; hours: number; rate: number; estId?: string; note?: string; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
export type Payout = { id: string; workerId: string; date: string; amount: number; method?: string; note?: string; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
export type Expense = { id: string; date: string; vendor: string; amount: number; category: string; source?: string; method?: string; note?: string; estId?: string; receiptUrl?: string; receiptPath?: string; recurId?: string; bankFp?: string; bankDesc?: string; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
export type ClockRec = { id: string; at: string; estId?: string; companyId?: string };
export type PhotoRef = { id: string; kind: "before" | "after" | "detail" | string; caption: string; inWork?: boolean; url?: string; path?: string };
export type ColorRow = { area: string; brand: string; color: string; sheen: string; code: string };
export type JobTask = { id: string; day: number | string; text: string };
export type ChatMsg = { from: "client" | "owner"; text: string; at: string };

export type Client = {
  id: string; name: string; phone: string; email: string; address: string; source: string; lang: "en" | "es";
  note: string; lead?: boolean; archived?: boolean; archivedAt?: string; snooze?: Record<string, string>; createdAt?: unknown; updatedAt?: unknown; companyId?: string;
  web?: { id?: string; service?: string; city?: string; message?: string; heard?: string; at?: string; details?: { types?: string[] } & Record<string, unknown> };
  referredBy?: string;
  photos?: { id: string; kind: string; caption: string }[];
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
  typePresets: Partial<Record<string, TypePreset>>;
  services: string; servicesEs: string;
  jobTemplates: { id: string; name: string; data: Partial<Estimate> }[];
  numbering: { nextEst: number; nextInv?: number };
  payZelle: string; payZelleName: string; payNote: string; payMethods?: string[];
  /** App handles shown on the invoice payment link (/pay/:token), stored as typed; see src/lib/paylink.ts payOptionsOf. */
  payHandles?: { venmo?: string; cashapp?: string; paypal?: string; checkTo?: string };
  reviewUrl?: string; websiteUrl?: string; instagramUrl?: string;
  followUpDays?: number; messageTemplates?: MessageTemplates; leadSources?: string[];
  /** An unpaid invoice shows up as "overdue" after this many days (default 7). */
  invoiceDueDays?: number;
  /** Reminders the daily worker e-mails by itself (workers/reminders), once per reminder. See src/lib/autoEmail.ts. */
  autoEmail?: { on?: boolean; kinds?: string[] };
  calOn?: boolean; calToken?: string;
  goal?: { sales: number }; dashCards?: { id: string; p: "month" | "lastmonth" | "ytd" | "lastyear" }[];
  recurring?: { id: string; vendor: string; amount: number; category: string; source?: string; method?: string; note?: string; day: number; from?: string; active: boolean; skip?: string[] }[];
  bankRules?: { match: string; category: string; source?: string; vendor?: string }[];
  expCats?: (string | { id: string; name: string })[];
  showcase?: { id: string; url: string; caption: string }[];
  /** Overrides of the default service-catalog rates (service id -> $ per unit), edited in Settings. */
  serviceRates?: Record<string, number>;
  /** The company's own priced services (any trade). Missing = the trade's starter list (lib/trades.ts catalogOf). */
  catalog?: CatalogItem[];
  /** Always the company's trade (filled from company.trade when settings are read, see useSettings). Missing = painting. */
  trade?: string;
};
/** One priced service the contractor can add to an estimate. `hrs` = your hours per unit (drives hours and "you earn per hour"). */
export type CatalogItem = { id: string; en: string; es: string; unit: string; unitEs: string; rate: number; hrs?: number };
