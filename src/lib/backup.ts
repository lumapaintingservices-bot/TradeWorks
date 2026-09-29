import { convertLegacy, isLegacyBackup } from "./legacyImport";
/** Backup file: build (export) and validate/normalise (restore). Pure — no I/O. */
export const BACKUP_COLLECTIONS = ["clients", "estimates", "invoices", "expenses", "workers", "hours", "payouts", "tasks", "settings"] as const;
export type BackupCol = (typeof BACKUP_COLLECTIONS)[number];
export type BackupRec = { id: string } & Record<string, unknown>;
export type BackupFile = { app: "TradeWorks"; version: 1; createdAt: string; company: { id: string; name: string }; data: Record<BackupCol, BackupRec[]> };

export const BACKUP_LABELS: Record<BackupCol, [string, string]> = {
  clients: ["Clients", "Clientes"], estimates: ["Estimates", "Presupuestos"], invoices: ["Invoices", "Facturas"], expenses: ["Expenses", "Gastos"],
  workers: ["Workers", "Trabajadores"], hours: ["Hours", "Horas"], payouts: ["Payments to workers", "Pagos a trabajadores"], tasks: ["Tasks", "Tareas"], settings: ["Settings", "Ajustes"],
};

/** Firestore Timestamp (or its JSON form) / Date / ISO string -> ISO string; anything else -> undefined. */
export function isoOf(v: unknown): string | undefined {
  if (typeof v === "string") return isNaN(Date.parse(v)) ? undefined : v;
  if (v instanceof Date) return isNaN(v.getTime()) ? undefined : v.toISOString();
  if (v && typeof v === "object") {
    const o = v as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof o.toDate === "function") return isoOf(o.toDate());
    const sec = typeof o.seconds === "number" ? o.seconds : typeof o._seconds === "number" ? o._seconds : undefined;
    if (sec !== undefined) return new Date(sec * 1000).toISOString();
  }
  return undefined;
}

/** What goes into the file for one record: no companyId/updatedAt (set again on restore), createdAt as plain text. */
function exportRec(r: Record<string, unknown>): BackupRec {
  const { companyId: _c, updatedAt: _u, createdAt, ...rest } = r;
  const out = JSON.parse(JSON.stringify(rest)) as BackupRec;
  const c = isoOf(createdAt);
  if (c) out.createdAt = c;
  return out;
}

export function buildBackup(company: { id: string; name: string }, data: Partial<Record<BackupCol, Record<string, unknown>[]>>, now = new Date()): BackupFile {
  const out = {} as Record<BackupCol, BackupRec[]>;
  for (const c of BACKUP_COLLECTIONS) out[c] = (data[c] || []).filter((r) => r && typeof r.id === "string").map(exportRec);
  return { app: "TradeWorks", version: 1, createdAt: now.toISOString(), company: { id: company.id, name: company.name }, data: out };
}

/** "TradeWorks-backup-LUMA-Painting-2026-09-29.json" */
export function backupFileName(companyName: string, now = new Date()): string {
  const slug = String(companyName || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "company";
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `TradeWorks-backup-${slug}-${d}.json`;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => typeof v === "string";
const numb = (v: unknown) => typeof v === "number" && isFinite(v);
const SAFE_ID = /^[^/\\\0]{1,200}$/;

/** Minimal shape check per collection: enough to be sure the row is what the app expects. */
const SHAPE: Record<BackupCol, (r: Record<string, unknown>) => boolean> = {
  clients: (r) => str(r.name),
  estimates: (r) => str(r.number) && (r.items === undefined || Array.isArray(r.items)),
  invoices: (r) => str(r.estId) && numb(r.amount),
  expenses: (r) => numb(r.amount) && str(r.date),
  workers: (r) => str(r.name),
  hours: (r) => str(r.workerId) && numb(r.hours),
  payouts: (r) => str(r.workerId) && numb(r.amount),
  tasks: (r) => str(r.title),
  settings: (r) => r.id === "main" && isObj(r.pricing) && isObj(r.production) && isObj(r.materials),
};

export type ParsedBackup = {
  records: Record<BackupCol, BackupRec[]>;
  counts: Record<BackupCol, number>;
  total: number; skipped: number; legacy?: boolean;
  company?: { id?: string; name?: string }; createdAt?: string;
};
export type ParseResult = { ok: true; backup: ParsedBackup } | { ok: false; error: { en: string; es: string } };

export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  let legacy = false;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: { en: "This file is not a backup (it can't be read).", es: "Este archivo no es una copia de seguridad (no se puede leer)." } }; }
  if (isLegacyBackup(raw)) { raw = convertLegacy(raw); legacy = true; }
  if (!isObj(raw) || raw.app !== "TradeWorks" || !isObj(raw.data)) return { ok: false, error: { en: "This file is not a TradeWorks backup.", es: "Este archivo no es una copia de seguridad de TradeWorks." } };
  if (raw.version !== 1) return { ok: false, error: { en: "This backup comes from a different version of TradeWorks.", es: "Esta copia viene de otra versión de TradeWorks." } };
  const records = {} as Record<BackupCol, BackupRec[]>, counts = {} as Record<BackupCol, number>;
  let total = 0, skipped = 0;
  for (const col of BACKUP_COLLECTIONS) {
    records[col] = []; counts[col] = 0;
    const rows = (raw.data as Record<string, unknown>)[col];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) { skipped++; continue; }
    const seen = new Set<string>();
    for (const r of rows) {
      if (!isObj(r) || !str(r.id) || !SAFE_ID.test(r.id) || r.id === "." || r.id === ".." || seen.has(r.id) || !SHAPE[col](r)) { skipped++; continue; }
      seen.add(r.id);
      const { companyId: _c, updatedAt: _u, createdAt, ...rest } = r;
      const rec = rest as BackupRec;
      const c = isoOf(createdAt);
      if (c) rec.createdAt = c;
      records[col].push(rec);
    }
    counts[col] = records[col].length; total += counts[col];
  }
  const co = isObj(raw.company) ? { id: str(raw.company.id) ? (raw.company.id as string) : undefined, name: str(raw.company.name) ? (raw.company.name as string) : undefined } : undefined;
  if (total === 0) return { ok: false, error: { en: "This backup has nothing we can restore.", es: "Esta copia no tiene nada que se pueda restaurar." } };
  return { ok: true, backup: { records, counts, total, skipped, legacy, company: co, createdAt: str(raw.createdAt) ? (raw.createdAt as string) : undefined } };
}
