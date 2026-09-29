/** Convert a backup file from the old single-file LUMA app (localStorage DB, "luma-backup-*.json") into the TradeWorks backup shape. Pure — no I/O. */
import { defaultSettings } from "./settings";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObj) : []);

/** The old app's export: no `app` marker, top-level `clients` and `estimates` arrays. */
export function isLegacyBackup(raw: unknown): raw is Record<string, unknown> {
  return isObj(raw) && raw.app === undefined && Array.isArray(raw.clients) && Array.isArray(raw.estimates);
}

/** Live records only (the old app marked deletions with `deleted: true`), with things that cannot come along removed. */
function live(rows: unknown, strip: string[] = []): Record<string, unknown>[] {
  return arr(rows)
    .filter((r) => !r.deleted && typeof r.id === "string" && r.id)
    .map((r) => {
      const o: Record<string, unknown> = { ...r };
      delete o.deleted; delete o.companyId; delete o.updatedAt;
      for (const k of strip) delete o[k];
      return o;
    });
}

/** Old settings (top level of the DB) laid over the new defaults; only fields whose shape matches are taken. */
function settingsFrom(db: Record<string, unknown>): Record<string, unknown> {
  const s = defaultSettings() as unknown as Record<string, unknown>;
  for (const k of ["pricing", "materials", "production", "tax"]) if (isObj(db[k])) s[k] = { ...(s[k] as object), ...(db[k] as object) };
  for (const k of ["scope", "terms"]) if (isObj(db[k]) && Array.isArray((db[k] as Record<string, unknown>).en) && Array.isArray((db[k] as Record<string, unknown>).es)) s[k] = db[k];
  if (Array.isArray(db.discounts)) s.discounts = db.discounts;
  if (typeof db.processDays === "number") s.processDays = db.processDays;
  if (typeof db.followUpDays === "number") s.followUpDays = db.followUpDays;
  for (const k of ["leadSources", "recurring", "bankRules", "expCats", "showcase", "dashCards"]) if (Array.isArray(db[k])) s[k] = db[k];
  if (isObj(db.goal)) s.goal = db.goal;
  const biz = isObj(db.business) ? db.business : {};
  if (typeof biz.website === "string" && biz.website) s.websiteUrl = /^https?:\/\//i.test(biz.website) ? biz.website : "https://" + biz.website;
  if (typeof biz.services === "string") s.services = biz.services;
  const pay = isObj(db.payment) ? db.payment : {};
  if (typeof pay.detail === "string") s.payNote = pay.detail;
  // Custom service rates: keep the ones that differ from the catalog (new app stores only the overrides).
  if (Array.isArray(db.services)) {
    const rates: Record<string, number> = {};
    for (const v of arr(db.services)) if (typeof v.id === "string" && typeof v.rate === "number") rates[v.id] = v.rate;
    if (Object.keys(rates).length) s.serviceRates = rates;
  }
  // Numbers already used keep their text ("EST-2026-005"); new ones start at 1001 so they never collide.
  s.numbering = { nextEst: 1001, nextInv: 1001 };
  return s;
}

/** Old file -> new backup object (same shape parseBackup reads). Photos, receipts and old client links are left behind. */
export function convertLegacy(db: Record<string, unknown>): Record<string, unknown> {
  return {
    app: "TradeWorks", version: 1, createdAt: new Date().toISOString(), legacy: true,
    company: { id: "", name: isObj(db.business) && typeof db.business.name === "string" ? db.business.name : "" },
    data: {
      clients: live(db.clients, ["photos"]),
      estimates: live(db.estimates, ["photos", "portal", "portalViews", "portalSeen"]),
      invoices: live(db.invoices),
      expenses: live(db.expenses, ["receiptId", "receiptPath"]),
      workers: live(db.workers),
      hours: live(db.hours),
      payouts: live(db.payouts),
      tasks: live(db.tasks),
      settings: [{ id: "main", ...settingsFrom(db) }],
    },
  };
}
