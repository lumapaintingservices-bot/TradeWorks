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
  /** Ask for the deposit as soon as the client signs (src/lib/deposit.ts). Unset = the company default (settings.depositAtSign). */
  depositAtSign?: boolean | null;
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
  /** copy = id of the signed copy the server kept (portal/{token}/signed/{copy}); server = signed on the link through the server. */
  signature?: { name: string; img: string; date: string; via: string; at: string; copy?: string; server?: boolean } | null;
  payClaim?: { method: string; at: string };
  sentAt?: string;
  snooze?: Record<string, string>; reviewAsked?: boolean; warrantyChecked?: boolean;
  photos?: PhotoRef[]; showPhotos?: boolean; check?: Record<string, string>; jobTasks?: JobTask[]; colors?: ColorRow[];
  /** The workers on this job (worker ids) and notes for them; their copy of the job is crewjobs/{id} (src/lib/crew.ts). */
  crew?: string[]; crewNote?: string;
  /** The client said yes to showing photos of the finished work (no name or address): needed before "Our recent work" (privacy policy). */
  photoOk?: boolean;
  /** Who does each checklist line (line key -> worker ids); a line nobody has is for the whole crew (src/lib/crew.ts assignees). */
  assign?: Record<string, string[]>;
  createdAt?: unknown; updatedAt?: unknown; companyId?: string;
};
export type ChangeOrder = { id?: string; n: number; desc?: string; descEs?: string; amount: number; hours?: number; status: string; signedName?: string; signedAt?: string; sigId?: string; sigImg?: string; /** the server's signed copy (link signatures) */ sigCopy?: string };
export type Invoice = { id: string; number: string; estId: string; kind: "deposit" | "balance" | "co"; amount: number; date: string; status: "Unpaid" | "Paid"; paidDate?: string; coId?: string; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
/** jobLabel: "EST-1001 · Ana Ruiz", saved with the job so a worker (who cannot read estimates) can name it. */
export type Task = { id: string; title: string; date: string; time?: string; note?: string; estId?: string; jobLabel?: string; workerId?: string; done?: boolean; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
export type MessageTemplates = Partial<Record<string, { en: string; es: string }>>;
/** A profile photo: the image (Storage download URL, or a data URL in demo mode) and its Storage path (to delete it). */
export type PhotoMini = { url: string; path: string };
export type Worker = { id: string; name: string; phone?: string; role?: string; rate: number; active?: boolean; companyId?: string; createdAt?: unknown; updatedAt?: unknown;
  /** E-mail the app invitation went to (Team > worker); their login is the members doc linked to this record. */
  email?: string;
  /** Profile photo (src/data/avatar.ts): set by the owner in Team or by the worker in Settings; null = removed. */
  photo?: PhotoMini | null;
  /** false = no overtime pay (a contractor, or exempt); missing / true = 1.5x past 40 h in a Monday-Sunday week (src/lib/team.ts). */
  overtime?: boolean;
  /** The worker's answer to saving their phone's location while on the clock (company.trackLocation): on = yes, v = notice version. */
  locConsent?: { on: boolean; at: string; v: string } | null };
export type HourEntry = { id: string; workerId: string; date: string; hours: number; rate: number; estId?: string; note?: string; companyId?: string; createdAt?: unknown; updatedAt?: unknown;
  /** The job name saved with the job (see Task.jobLabel), for the worker timesheet. */
  jobLabel?: string;
  /** Clock-in / clock-out time (ISO) of an entry made by the time clock; manual entries have none. */
  start?: string; end?: string;
  /** The task the time clock was running for. */
  taskId?: string; taskTitle?: string;
  /** Where the worker's phone was at clock-in / clock-out (src/lib/geo.ts). */
  inLoc?: Loc; outLoc?: Loc;
  /** Removed by the owner: kept as a record (wage-hour law: keep time records), left out of every total. */
  deleted?: boolean; deletedAt?: string; deletedBy?: string;
  /** Changes the owner made after the entry was saved (newest last, at most HOUR_EDITS_MAX): who, when, what it was before. */
  edits?: HourEdit[] };
export type HourEdit = { at: string; by: string; what: "edit" | "delete" | "restore"; before?: Partial<Pick<HourEntry, "hours" | "date" | "rate" | "estId" | "note" | "workerId">> };
export type Payout = { id: string; workerId: string; date: string; amount: number; method?: string; note?: string; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
export type Expense = { id: string; date: string; vendor: string; amount: number; category: string; source?: string; method?: string; note?: string; estId?: string; receiptUrl?: string; receiptPath?: string; recurId?: string; bankFp?: string; bankDesc?: string; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
/** A running clock. loc = where the worker clocked in; last = latest position while the app was open (src/lib/geo.ts). */
/** Clocked in now (clock/{workerId}): always for one task (taskId / taskTitle), and that task's job. */
export type ClockRec = { id: string; at: string; estId?: string; jobLabel?: string; taskId?: string; taskTitle?: string; companyId?: string; loc?: Loc; last?: Loc };
/**
 * teamId / by / at: a photo a worker took on their phone (jobphotos/{teamId}), copied onto the job by the owner's app (src/lib/jobPhotos.ts).
 * A worker's photo is private: the client sees it only when the owner ticks toClient (clientCanSee).
 */
export type PhotoRef = { id: string; kind: "before" | "after" | "detail" | string; caption: string; inWork?: boolean; url?: string; path?: string; teamId?: string; by?: string; at?: string; toClient?: boolean };
/**
 * companies/{cid}/crewjobs/{estId}: what the crew of a job may see (workers cannot read estimates): dates, address, client
 * name, notes, checklist, colors. No prices. Written by the owner's app; workers only tick the checklist (done / doneBy).
 */
export type CrewJob = {
  id: string; estId: string; jobLabel: string; crew: string[]; crewNames: string[];
  /** Profile photo URL of each crew member ("" = none), same order as crew: coworkers can't read each other's worker records. */
  crewPhotos?: string[]; start: string; days: number;
  address: string; client: string; note: string; checklist: CrewItem[]; titles: Record<string, string>; colors: ColorRow[];
  done?: Record<string, string>; doneBy?: Record<string, string>; companyId?: string; createdAt?: unknown; updatedAt?: unknown;
  /** Who does each line (key -> crew member ids); a line nobody has is for the whole crew. */
  assign?: Record<string, string[]>;
};
export type CrewItem = { key: string; day: number; text: string };
/** companies/{cid}/jobchats/{estId}: the team chat of one job: owners / admins + the workers in `members` (worker ids). */
export type JobChat = { id: string; estId: string; jobLabel: string; members: string[]; closed?: boolean; last?: ChatLast; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
/** The latest message, kept on the chat for the list (preview, unread). */
export type ChatLast = { by: string; name: string; text: string; at: string };
/** companies/{cid}/jobchats/{chatId}/msgs/{id}. by = "u:{uid}" (owner / admin) or "w:{workerId}" (worker). */
export type TeamMsg = { id: string; by: string; name: string; text: string; at: string; photo?: ChatPhoto; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
/** A photo in a chat message (kind = before / after / detail when it came from the worker's job photos). */
export type ChatPhoto = { url: string; path: string; kind?: string };
/** companies/{cid}/jobphotos/{id}: a before / after photo a worker took for a job. The file is at companies/{cid}/jobphotos/{workerId}/{id}.jpg. */
export type JobPhoto = { id: string; workerId: string; estId: string; jobLabel?: string; kind: "before" | "after" | "detail" | ""; caption?: string; url: string; path: string; date: string; at: string; size?: number; companyId?: string; createdAt?: unknown; updatedAt?: unknown };
export type ColorRow = { area: string; brand: string; color: string; sheen: string; code: string };
export type JobTask = { id: string; day: number | string; text: string };
export type ChatMsg = { from: "client" | "owner"; text: string; at: string };

export type Client = {
  id: string; name: string; phone: string; email: string; address: string; source: string; lang: "en" | "es";
  note: string; lead?: boolean; archived?: boolean; archivedAt?: string; snooze?: Record<string, string>; createdAt?: unknown; updatedAt?: unknown; companyId?: string;
  /** The client asked us to stop automatic e-mails (reminders, review requests): the daily worker skips them (src/lib/autoEmail.ts). */
  noAutoEmail?: boolean;
  web?: { id?: string; service?: string; city?: string; message?: string; heard?: string; at?: string; details?: { types?: string[] } & Record<string, unknown> };
  referredBy?: string;
  /** On a referred client: the reward their referrer got for them (see src/lib/referrals.ts). */
  refReward?: { amount: number; paidAt: string; method?: string; expenseId?: string };
  photos?: { id: string; kind: string; caption: string }[];
};
export type Discount = { code: string; type: "percent" | "fixed"; value: number; label: string; labelEs: string; active?: boolean };
export type Supply = { name: string; qty?: number; cost: number; basis: "item" | "door" | "drawer" | "job" };
export type TypePreset = { days: number; services?: string; servicesEs?: string; spec: string; specEs: string; scopeEn: string; scopeEs: string; termsEn: string; termsEs: string };

/** Notes board (owners / admins only): ideas, reminders and to-dos. Column ids come from settings.noteCols (src/lib/notes.ts). */
export type NoteCol = { id: string; name: string };
export type NotePrio = "high" | "med" | "low" | "";
export type Note = {
  id: string; title: string; text: string; col: string; order: number; prio: NotePrio;
  due?: string; estId?: string; jobLabel?: string; workerId?: string; by?: string;
  companyId?: string; createdAt?: unknown; updatedAt?: unknown;
};

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
  /** Measurements per job type (src/lib/measures.ts): catalog service ids counted on the estimate; missing = defaults. */
  measures?: Record<string, string[]>;
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
  /** Company default: ask for a deposit as soon as the client signs the estimate (off: bill with invoices later). */
  depositAtSign?: boolean;
  /** When the company default was switched on: only signatures after it get an automatic deposit invoice. */
  depositAtSignSince?: string;
  /** Notes board columns, left to right (empty name = the built-in name in the app language). Missing = the defaults. */
  noteCols?: NoteCol[];
  /** Language of the job checklist the crew sees (and the Job day tab shows), so both are the same list. Missing = Spanish. */
  crewLang?: "en" | "es";
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
