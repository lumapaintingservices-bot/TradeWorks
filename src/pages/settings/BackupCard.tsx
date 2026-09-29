import { useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useCollection } from "../../data/hooks";
import { saveRec, type Rec } from "../../data/repo";
import { useT } from "../../i18n";
import { BACKUP_COLLECTIONS, BACKUP_LABELS, backupFileName, buildBackup, parseBackup, type BackupCol, type ParsedBackup } from "../../lib/backup";
import { downloadText } from "../../lib/download";
import { putImage } from "../../lib/storage";
import { useUi } from "../../store/ui";
import { Help, Sub } from "./parts";

const lastKey = (cid: string) => `tw.lastBackup.${cid}`;
const readLast = (cid: string) => { try { return localStorage.getItem(lastKey(cid)) || ""; } catch { return ""; } };

/** Backup (download everything as one file), restore from such a file, and a note about where photos live. */
export default function BackupCard() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const toast = useUi((s) => s.toast);
  const { company } = useAuth();
  const c = {
    clients: useCollection<Rec>("clients"), estimates: useCollection<Rec>("estimates"), invoices: useCollection<Rec>("invoices"), expenses: useCollection<Rec>("expenses"),
    workers: useCollection<Rec>("workers"), hours: useCollection<Rec>("hours"), payouts: useCollection<Rec>("payouts"), tasks: useCollection<Rec>("tasks"), settings: useCollection<Rec>("settings"),
  };
  const loading = BACKUP_COLLECTIONS.some((k) => c[k].loading);
  const [last, setLast] = useState(() => (company ? readLast(company.id) : ""));
  const [parsed, setParsed] = useState<{ name: string; p: ParsedBackup } | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  if (!company) return null;

  function download() {
    const data = Object.fromEntries(BACKUP_COLLECTIONS.map((k) => [k, c[k].rows])) as unknown as Record<BackupCol, Record<string, unknown>[]>;
    const b = buildBackup({ id: company!.id, name: company!.name }, data);
    downloadText(backupFileName(company!.name), JSON.stringify(b, null, 1), "application/json;charset=utf-8");
    const now = new Date().toISOString();
    try { localStorage.setItem(lastKey(company!.id), now); } catch { /* private mode */ }
    setLast(now);
    toast(t("Backup downloaded", "Copia descargada"));
  }
  async function pick(f?: File | null) {
    setError(""); setParsed(null);
    if (!f) return;
    if (f.size > 100 * 1024 * 1024) { setError(t("This file is too big to be a backup.", "Este archivo es demasiado grande para ser una copia.")); return; }
    const r = parseBackup(await f.text());
    if (!r.ok) { setError(t(r.error.en, r.error.es)); return; }
    setParsed({ name: f.name, p: r.backup });
  }
  /** Old-app backups carry photos/receipts as data URLs: put them in Storage and point the record at them. */
  async function withImages(col: BackupCol, rec: Record<string, unknown>): Promise<Rec> {
    const imgs = parsed?.p.images;
    if (!imgs) return rec as unknown as Rec;
    const cid = company!.id;
    if (col === "estimates" && Array.isArray(rec.photos)) {
      const out = [];
      for (const ph of rec.photos as { id: string }[]) {
        if (!imgs[ph.id]) continue;
        try { const { url, path } = await putImage(`companies/${cid}/photos/${rec.id}/${ph.id}.jpg`, imgs[ph.id]); out.push({ ...ph, url, path }); } catch { /* photo skipped */ }
      }
      rec = { ...rec, photos: out };
    }
    if (col === "expenses" && typeof rec.receiptId === "string") {
      const { receiptId, ...rest } = rec;
      rec = rest;
      if (imgs[receiptId]) { try { const { url, path } = await putImage(`companies/${cid}/receipts/${rec.id}.jpg`, imgs[receiptId]); rec = { ...rec, receiptUrl: url, receiptPath: path }; } catch { /* receipt skipped */ } }
    }
    return rec as unknown as Rec;
  }
  async function restore() {
    if (!parsed) return;
    const total = parsed.p.total;
    let done = 0, failed = 0;
    setProgress({ done, total, failed });
    for (const col of BACKUP_COLLECTIONS) {
      for (const rec of parsed.p.records[col]) {
        try { await saveRec(company!.id, col, await withImages(col, rec)); } catch { failed++; }
        done++;
        if (done % 10 === 0 || done === total) setProgress({ done, total, failed });
      }
    }
    setProgress(null); setParsed(null);
    if (file.current) file.current.value = "";
    if (failed) setError(t(`Restored, but ${failed} records could not be saved. Try again.`, `Restaurado, pero ${failed} registros no se pudieron guardar. Inténtalo otra vez.`));
    else toast(t(`Restored ${total} records`, `Se restauraron ${total} registros`));
  }
  const fmt = (iso: string) => { try { return new Date(iso).toLocaleString(lang === "es" ? "es" : "en", { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; } };
  const counts = parsed ? BACKUP_COLLECTIONS.filter((k) => parsed.p.counts[k] > 0) : [];

  return (
    <section className="card st-card" id="backup">
      <div className="card-h"><h2>{t("Backup", "Copia de seguridad")}</h2></div>
      <div className="card-b">
        <Help>{t("Save a copy of everything in your account — clients, estimates, invoices, expenses, team, tasks and settings — as one file on this device. Do it now and then, and before big changes.", "Guarda una copia de todo lo de tu cuenta — clientes, presupuestos, facturas, gastos, equipo, tareas y ajustes — en un archivo en este aparato. Hazlo de vez en cuando y antes de cambios grandes.")}</Help>
        <div className="st-actions">
          <button className="btn pri" disabled={loading} onClick={download}>{t("Download backup", "Descargar copia")}</button>
          {last && <span className="muted st-hint-h">{t("Last backup", "Última copia")}: {fmt(last)}</span>}
        </div>

        <Sub>{t("Restore from a backup", "Restaurar desde una copia")}</Sub>
        <Help>{t("Choose a file you downloaded here before, or the backup file from your old LUMA app (luma-backup-….json). Records with the same ID are replaced by the ones in the file; nothing else is deleted. Photos are not inside the file.", "Elige un archivo que descargaste aquí antes, o el archivo de copia de tu app LUMA anterior (luma-backup-….json). Los registros con el mismo ID se reemplazan por los del archivo; no se borra nada más. Las fotos no van dentro del archivo.")}</Help>
        <input ref={file} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => pick(e.target.files?.[0])} />
        <div className="st-actions"><button className="btn" disabled={!!progress} onClick={() => file.current?.click()}>{t("Choose backup file…", "Elegir archivo de copia…")}</button></div>
        {error && <p className="st-err" role="alert" style={{ margin: "12px 0 0" }}>{error}</p>}
        {parsed && (
          <div className="st-restore">
            <b>{parsed.name}</b>
            <div className="muted" style={{ fontSize: 12.5, margin: "2px 0 8px" }}>
              {parsed.p.company?.name ? parsed.p.company.name + " · " : ""}{parsed.p.createdAt ? fmt(parsed.p.createdAt) : ""}
            </div>
            <div className="pills" style={{ marginBottom: 10 }}>{counts.map((k) => <span className="badge b-blue" key={k}>{t(BACKUP_LABELS[k][0], BACKUP_LABELS[k][1])}: {parsed.p.counts[k]}</span>)}</div>
            {parsed.p.legacy && <p className="muted" style={{ fontSize: 12.5, margin: "0 0 10px" }}>{t("This is a backup from your old LUMA app. Clients, estimates, invoices, expenses, team, tasks and your prices will be brought over. Job photos and receipts are uploaded too (this can take a few minutes). Old client links are not included — create a new link from each estimate.", "Esta es una copia de tu app LUMA anterior. Se traen clientes, presupuestos, facturas, gastos, equipo, tareas y tus precios. También se suben las fotos de los trabajos y los recibos (puede tardar unos minutos). Los links viejos de clientes no van incluidos — crea un link nuevo desde cada presupuesto.")}</p>}
            {parsed.p.skipped > 0 && <p className="muted" style={{ fontSize: 12.5, margin: "0 0 10px" }}>{t(`${parsed.p.skipped} damaged records in the file will be skipped.`, `${parsed.p.skipped} registros dañados del archivo se van a omitir.`)}</p>}
            {progress ? <p style={{ margin: 0 }}>{t("Restoring…", "Restaurando…")} {progress.done} / {progress.total}</p> : (
              <div className="st-actions">
                <button className="btn pri" onClick={() => { if (confirm(t(`Restore ${parsed.p.total} records into ${company.name}? Records with the same ID will be replaced.`, `¿Restaurar ${parsed.p.total} registros en ${company.name}? Los registros con el mismo ID se reemplazarán.`))) restore(); }}>{t("Restore", "Restaurar")}</button>
                <button className="btn" onClick={() => { setParsed(null); if (file.current) file.current.value = ""; }}>{t("Cancel", "Cancelar")}</button>
              </div>
            )}
          </div>
        )}

        <Sub>{t("Storage", "Almacenamiento")}</Sub>
        <Help>{t("Your data (clients, estimates, money) is saved in your Firebase account. Photos and receipts are stored in Firebase Storage, and Google requires its Blaze (pay-as-you-go) plan to turn Storage on — it includes a free monthly allowance. Until Storage is on, photos can't be uploaded. A backup file holds your records, not the photo files.", "Tus datos (clientes, presupuestos, dinero) se guardan en tu cuenta de Firebase. Las fotos y recibos van en Firebase Storage, y Google exige su plan Blaze (pago por uso) para activar Storage — incluye una cuota mensual gratis. Mientras Storage no esté activo, no se pueden subir fotos. Una copia de seguridad guarda tus registros, no los archivos de las fotos.")}</Help>
      </div>
    </section>
  );
}
