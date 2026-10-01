import type { Loc } from "./geo";
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
  /** Job site position for the team map (src/lib/geo.ts), looked up once per address (q). No lat/lng = not found. */
  geo?: { q: string; lat?: number; lng?: number };
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
  /** The workers on this job (worker ids) and notes for them; their copy of the job is crewjobs/{id} (src/lib/crew.ts). */
  crew?: string[]; crewNote?: string;
  createdAt?: unknown; updatedAt?: unknown; companyId?: string;
};
export type ChangeOrder = { id?: string; n: number; desc?: string; descEs?: string; amount: number; hours?: number; status: string; signedName?: string; signedAt?: string; sigId?: string; sigImg?: string };
export type Invoice = { id: string; number: string; estId: string; kind: "deposit" | "balance" | "co"; amount: number; date: string; status: "Unpaid" | "Paid"; paidDate?: string; coId?: string; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
/** jobLabel: "EST-1001 · Ana Ruiz", saved with the job so a worker (who cannot read estimates) can name it. */
export type Task = { id: string; title: string; date: string; time?: string; note?: string; estId?: string; jobLabel?: string; workerId?: string; done?: boolean; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
export type MessageTemplates = Partial<Record<string, { en: string; es: string }>>;
export type Worker = { id: string; name: string; phone?: string; role?: string; rate: number; active?: boolean; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
export type HourEntry = { id: string; workerId: string; date: string; hours: number; rate: number; estId?: string; note?: string; companyId?: string; createdAt?: unknown; updatedAt?: unknown;
  /** The job name saved with the job (see Task.jobLabel), for the worker timesheet. */
  jobLabel?: string;
  /** Clock-in / clock-out time (ISO) of an entry made by the time clock; manual entries have none. */
  start?: string; end?: string;
  /** Where the worker's phone was at clock-in / clock-out (src/lib/geo.ts). */
  inLoc?: Loc; outLoc?: Loc };
export type Payout = { id: string; workerId: string; date: string; amount: number; method?: string; note?: string; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
export type Expense = { id: string; date: string; vendor: string; amount: number; category: string; source?: string; method?: string; note?: string; estId?: string; receiptUrl?: string; receiptPath?: string; recurId?: string; bankFp?: string; bankDesc?: string; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
/** A running clock. loc = where the worker clocked in; last = latest position while the app was open (src/lib/geo.ts). */
export type ClockRec = { id: string; at: string; estId?: string; jobLabel?: string; companyId?: string; loc?: Loc; last?: Loc };
/** teamId / by / at: a photo a worker took on their phone (jobphotos/{teamId}), copied onto the job by the owner's app (src/lib/jobPhotos.ts). */
export type PhotoRef = { id: string; kind: "before" | "after" | "detail" | string; caption: string; inWork?: boolean; url?: string; path?: string; teamId?: string; by?: string; at?: string };
/**
 * companies/{cid}/crewjobs/{estId}: what the crew of a job may see (workers cannot read estimates): dates, address, client
 * name, notes, checklist, colors. No prices. Written by the owner's app; workers only tick the checklist (done / doneBy).
 */
export type CrewJob = {
  id: string; estId: string; jobLabel: string; crew: string[]; crewNames: string[]; start: string; days: number;
  address: string; client: string; note: string; checklist: CrewItem[]; titles: Record<string, string>; colors: ColorRow[];
  done?: Record<string, string>; doneBy?: Record<string, string>; companyId?: string; createdAt?: unknown; updatedAt?: unknown;
};
export type CrewItem = { key: string; day: number; text: string };
/** companies/{cid}/jobchats/{estId}: the team chat of one job: owners / admins + the workers in `members` (worker ids). */
export type JobChat = { id: string; estId: string; jobLabel: string; members: string[]; closed?: boolean; last?: ChatLast; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
/** The latest message, kept on the chat for the list (preview, unread). */
export type ChatLast = { by: string; name: string; text: string; at: string };
/** companies/{cid}/jobchats/{chatId}/msgs/{id}. by = "u:{uid}" (owner / admin) or "w:{workerId}" (worker). */
export type TeamMsg = { id: string; by: string; name: string; text: string; at: string; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
/** companies/{cid}/jobphotos/{id}: a before / after photo a worker took for a job. The file is at companies/{cid}/jobphotos/{workerId}/{id}.jpg. */
export type JobPhoto = { id: string; workerId: string; estId: string; jobLabel?: string; kind: "before" | "after" | "detail" | ""; caption?: string; url: string; path: string; date: string; at: string; size?: number; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
export type ColorRow = { area: string; brand: string; color: string; sheen: string; code: string };
export type JobTask = { id: string; day: number | string; text: string };
export type ChatMsg = { from: "client" | "owner"; text: string; at: string };

export type Client = {
  id: string; name: string; phone: string; email: string; address: string; source: string; lang: "en" | "es";
  note: string; lead?: boolean; archived?: boolean; archivedAt?: string; snooze?: Record<string, string>; createdAt?: unknown; updatedAt?: unknown; companyId?: string;
  web?: { id?: string; service?: string; city?: string; message?: string; heard?: string; at?: string; details?: { types?: string[] } & Record<string, unknown> };
  referredBy?: string;
  /** On a referred client: the reward their referrer got for them (see src/lib/referrals.ts). */
  refReward?: { amount: number; paidAt: string; method?: string; expenseId?: string };
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
  /** Referral program: a client whose referred friend pays a job in full earns this reward (src/lib/referrals.ts). */
  referral?: { on?: boolean; amount?: number; rewardEn?: string; rewardEs?: string };
  /** "Pay by card or bank" on invoice payment links, once the company's Stripe account is connected (on unless switched off). */
  cardPay?: { on?: boolean };
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
